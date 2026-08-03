import "server-only";

import type { DbClient } from "@/lib/db";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import {
  openBusinessPayloadWithKey,
  sealBusinessPayloadWithKey,
  type BusinessPayloadKind,
} from "@/lib/business-truth/payload-codec";
import {
  assertTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { resolveDurableIdentityActor } from "@/lib/identity/control-authority";
import {
  resolvePhase2Permissions,
  type Phase2Action,
} from "@/lib/identity/permissions";
import type {
  PersonActor,
  TrustedActorContext,
} from "@/lib/identity/trusted-actor";
import {
  FEATURE_KEYS,
  getLicenseAuthorityProjection,
} from "@/lib/license/license-authority";
import type { ShopContext } from "@/lib/shops/context";
import { ConflictError, SahelFlowError, ValidationError } from "@/types/errors";
import {
  AI_ACTION_PROPOSAL_TTL_MS,
  aiActionHash,
  canonicalAiActionJson,
  getAiToolPolicy,
  parseSensitiveAiToolArgs,
  type AiActionProposalProjection,
} from "./contracts";
import {
  mintAiActionExecutionAuthority,
} from "./execution-authority";
import {
  executeApprovedAiAction,
  type ApprovedAiActionResult,
} from "./executor";
import { buildAiActionTargetSnapshot } from "./targets";

interface ProposalRow {
  id: string;
  proposalKey: string;
  sessionId: string;
  requestMessageId: string;
  toolName: string;
  actionClass: string;
  argsJson: string;
  argsHash: string;
  proposalDigest: string;
  summaryJson: string;
  summaryHash: string;
  requestActorKind: string;
  requestActorId: string;
  requestWorkspaceMemberId: string | null;
  requestDeviceId: string | null;
  requestSessionId: string;
  requestRole: string | null;
  requestPolicyVersion: number | bigint;
  requestRevocationEpoch: number | bigint;
  requiredPermissionsJson: string;
  permissionHash: string;
  licenseBindingJson: string;
  licenseBindingHash: string;
  workspaceId: string;
  installationId: string;
  shopId: string;
  shopIncarnationId: string;
  registryRevision: number | bigint;
  databaseFileId: string;
  migrationSetSha256: string;
  targetBindingJson: string;
  targetBindingHash: string;
  status: string;
  expiresAt: Date | string;
  lastErrorCode: string | null;
  approvedAt: Date | string | null;
  executionClaimedAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ApprovalRow {
  id: string;
  proposalId: string;
  decision: string;
  approverActorKind: string;
  approverActorId: string;
  approverWorkspaceMemberId: string | null;
  approverDeviceId: string | null;
  approverSessionId: string;
  approverRole: string | null;
  approverPolicyVersion: number | bigint;
  approverRevocationEpoch: number | bigint;
  approvalDigest: string;
  reasonHash: string | null;
  createdAt: Date | string;
}

interface ExecutionRow {
  id: string;
  proposalId: string;
  executionKey: string;
  state: string;
  businessCommandId: string | null;
  resultJson: string | null;
  resultHash: string | null;
  errorCode: string | null;
  claimedAt: Date | string;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  updatedAt: Date | string;
}

interface DecryptedProposal {
  row: ProposalRow;
  args: Record<string, unknown>;
  summary: Record<string, unknown>;
  licenseBinding: Record<string, unknown>;
  targetBinding: Record<string, unknown>;
  requiredPermissions: Phase2Action[];
}

export interface CreateAiActionProposalInput {
  context: { prisma: DbClient; shop: ShopContext };
  requester: TrustedActorContext;
  sessionId: string;
  requestMessageId: string;
  toolName: string;
  rawArgs: unknown;
}

export interface AiActionProposalHandle {
  proposal: AiActionProposalProjection;
  proposalDigest: string;
}

export interface ApproveAiActionProposalInput {
  context: { prisma: DbClient; shop: ShopContext };
  approver: TrustedActorContext;
  proposalId: string;
  proposalDigest: string;
  reason?: string;
}

export interface AiActionApprovalResult {
  proposal: AiActionProposalProjection;
  result: Record<string, unknown>;
  businessCommandId: string;
  replayed: boolean;
}

interface LicenseBinding {
  status: string;
  licenseId: string | null;
  type: string | null;
  expiresAt: string | null;
  supportEndsAt: string | null;
  shopSlots: number;
  memberLimit: number;
  deviceLimit: number;
  features: string[];
  minimumPermanentRecoveryEpoch: number | null;
}

const CONFLICT_CODES = new Set([
  "AI_ACTION_ARGUMENT_TAMPERED",
  "AI_ACTION_DIGEST_TAMPERED",
  "AI_ACTION_LICENSE_DRIFT",
  "AI_ACTION_POLICY_DRIFT",
  "AI_ACTION_REQUESTER_DRIFT",
  "AI_ACTION_SHOP_DRIFT",
  "AI_ACTION_TARGET_CONFLICT",
  "AI_ACTION_TARGET_TAMPERED",
]);

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new SahelFlowError(
      "AI action persistence contains an invalid timestamp",
      "AI_ACTION_PERSISTENCE_INVALID",
      503,
    );
  }
  return date;
}

function numberValue(value: number | bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new SahelFlowError(
      "AI action persistence contains an invalid integer",
      "AI_ACTION_PERSISTENCE_INVALID",
      503,
    );
  }
  return number;
}

function personActor(
  context: TrustedActorContext,
  purpose: string,
): PersonActor {
  if (context.actor.kind !== "person") {
    throw new SahelFlowError(
      `${purpose} requires a durable person identity`,
      "AI_ACTION_DURABLE_PERSON_REQUIRED",
      403,
    );
  }
  return context.actor;
}

function sortedPermissions(values: readonly Phase2Action[]): Phase2Action[] {
  return [...new Set(values)].sort() as Phase2Action[];
}

function assertPermissions(
  context: TrustedActorContext,
  approvalAction: "approvals.request" | "approvals.approve",
  requiredPermissions: readonly Phase2Action[],
): void {
  assertTrustedAction(context, approvalAction, {
    shopId: context.shop.shopId,
  });
  assertTrustedAction(context, "ai.use", { shopId: context.shop.shopId });
  for (const action of requiredPermissions) {
    assertTrustedAction(context, action, { shopId: context.shop.shopId });
  }
}

function binding(
  kind: BusinessPayloadKind,
  proposalId: string,
  toolName: string,
  field: string,
) {
  return {
    kind,
    recordKey: `${proposalId}:${field}`,
    recordType: `${toolName}:${field}`,
    commandId: proposalId,
  } as const;
}

function proposalDigestInput(input: {
  id: string;
  proposalKey: string;
  sessionId: string;
  requestMessageId: string;
  toolName: string;
  actionClass: string;
  argsHash: string;
  summaryHash: string;
  requestActorKind: string;
  requestActorId: string;
  requestWorkspaceMemberId: string | null;
  requestDeviceId: string | null;
  requestSessionId: string;
  requestRole: string | null;
  requestPolicyVersion: number;
  requestRevocationEpoch: number;
  requiredPermissions: readonly Phase2Action[];
  permissionHash: string;
  licenseBindingHash: string;
  shop: ShopContext;
  targetBindingHash: string;
  expiresAt: Date;
}): Record<string, unknown> {
  return {
    formatVersion: 1,
    id: input.id,
    proposalKey: input.proposalKey,
    sessionId: input.sessionId,
    requestMessageId: input.requestMessageId,
    toolName: input.toolName,
    actionClass: input.actionClass,
    argsHash: input.argsHash,
    summaryHash: input.summaryHash,
    requester: {
      kind: input.requestActorKind,
      actorId: input.requestActorId,
      workspaceMemberId: input.requestWorkspaceMemberId,
      deviceId: input.requestDeviceId,
      sessionId: input.requestSessionId,
      role: input.requestRole,
      policyVersion: input.requestPolicyVersion,
      revocationEpoch: input.requestRevocationEpoch,
    },
    requiredPermissions: input.requiredPermissions,
    permissionHash: input.permissionHash,
    licenseBindingHash: input.licenseBindingHash,
    shop: input.shop,
    targetBindingHash: input.targetBindingHash,
    expiresAt: input.expiresAt.toISOString(),
  };
}

function rowDigestInput(
  row: ProposalRow,
  requiredPermissions: readonly Phase2Action[],
): Record<string, unknown> {
  return proposalDigestInput({
    id: row.id,
    proposalKey: row.proposalKey,
    sessionId: row.sessionId,
    requestMessageId: row.requestMessageId,
    toolName: row.toolName,
    actionClass: row.actionClass,
    argsHash: row.argsHash,
    summaryHash: row.summaryHash,
    requestActorKind: row.requestActorKind,
    requestActorId: row.requestActorId,
    requestWorkspaceMemberId: row.requestWorkspaceMemberId,
    requestDeviceId: row.requestDeviceId,
    requestSessionId: row.requestSessionId,
    requestRole: row.requestRole,
    requestPolicyVersion: numberValue(row.requestPolicyVersion),
    requestRevocationEpoch: numberValue(row.requestRevocationEpoch),
    requiredPermissions,
    permissionHash: row.permissionHash,
    licenseBindingHash: row.licenseBindingHash,
    shop: {
      workspaceId: row.workspaceId,
      installationId: row.installationId,
      shopId: row.shopId,
      shopIncarnationId: row.shopIncarnationId,
      registryRevision: numberValue(row.registryRevision),
      databaseFileId: row.databaseFileId,
      migrationSetSha256: row.migrationSetSha256,
    },
    targetBindingHash: row.targetBindingHash,
    expiresAt: toDate(row.expiresAt),
  });
}

function shopMatches(row: ProposalRow, shop: ShopContext): boolean {
  return (
    row.workspaceId === shop.workspaceId &&
    row.installationId === shop.installationId &&
    row.shopId === shop.shopId &&
    row.shopIncarnationId === shop.shopIncarnationId &&
    numberValue(row.registryRevision) === shop.registryRevision &&
    row.databaseFileId === shop.databaseFileId &&
    row.migrationSetSha256 === shop.migrationSetSha256
  );
}

async function licenseBinding(): Promise<LicenseBinding> {
  const projection = await getLicenseAuthorityProjection();
  const features = [...projection.features].sort();
  if (
    projection.status !== "valid" ||
    (!features.includes(FEATURE_KEYS.AI_CHAT) &&
      !features.includes(FEATURE_KEYS.COMPLETE))
  ) {
    throw new SahelFlowError(
      "The current entitlement does not authorize AI actions",
      "LICENSE_REQUIRED",
      403,
    );
  }
  return {
    status: projection.status,
    licenseId: projection.licenseId,
    type: projection.type,
    expiresAt: projection.expiresAt,
    supportEndsAt: projection.supportEndsAt,
    shopSlots: projection.shopSlots,
    memberLimit: projection.memberLimit,
    deviceLimit: projection.deviceLimit,
    features,
    minimumPermanentRecoveryEpoch:
      projection.minimumPermanentRecoveryEpoch,
  };
}

async function readProposalById(
  db: DbClient,
  proposalId: string,
): Promise<ProposalRow | null> {
  const rows = await db.$queryRaw<ProposalRow[]>`
    SELECT * FROM "AiActionProposal" WHERE "id" = ${proposalId} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function readProposalByKey(
  db: DbClient,
  proposalKey: string,
): Promise<ProposalRow | null> {
  const rows = await db.$queryRaw<ProposalRow[]>`
    SELECT * FROM "AiActionProposal" WHERE "proposalKey" = ${proposalKey} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function readApproval(
  db: DbClient,
  proposalId: string,
): Promise<ApprovalRow | null> {
  const rows = await db.$queryRaw<ApprovalRow[]>`
    SELECT * FROM "AiActionApproval" WHERE "proposalId" = ${proposalId} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function readExecution(
  db: DbClient,
  proposalId: string,
): Promise<ExecutionRow | null> {
  const rows = await db.$queryRaw<ExecutionRow[]>`
    SELECT * FROM "AiActionExecution" WHERE "proposalId" = ${proposalId} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function decryptProposal(
  context: { prisma: DbClient; shop: ShopContext },
  row: ProposalRow,
): Promise<DecryptedProposal> {
  const key = await getBusinessEnvelopeKey(context);
  try {
    const args = openBusinessPayloadWithKey<Record<string, unknown>>(
      row.argsJson,
      binding("ai-action-arguments", row.id, row.toolName, "arguments"),
      key,
    );
    const summary = openBusinessPayloadWithKey<Record<string, unknown>>(
      row.summaryJson,
      binding("ai-action-summary", row.id, row.toolName, "summary"),
      key,
    );
    const storedLicense = openBusinessPayloadWithKey<Record<string, unknown>>(
      row.licenseBindingJson,
      binding(
        "ai-action-license-binding",
        row.id,
        row.toolName,
        "license",
      ),
      key,
    );
    const targetBinding = openBusinessPayloadWithKey<Record<string, unknown>>(
      row.targetBindingJson,
      binding("ai-action-target-binding", row.id, row.toolName, "target"),
      key,
    );
    const parsedPermissions = JSON.parse(row.requiredPermissionsJson) as unknown;
    if (!Array.isArray(parsedPermissions)) {
      throw new Error("permissions are not an array");
    }
    const requiredPermissions = sortedPermissions(
      parsedPermissions as Phase2Action[],
    );

    if (
      aiActionHash(args) !== row.argsHash ||
      aiActionHash(summary) !== row.summaryHash ||
      aiActionHash(storedLicense) !== row.licenseBindingHash ||
      aiActionHash(targetBinding) !== row.targetBindingHash ||
      aiActionHash(requiredPermissions) !== row.permissionHash
    ) {
      throw new SahelFlowError(
        "AI action proposal payload authentication failed",
        "AI_ACTION_ARGUMENT_TAMPERED",
        409,
      );
    }
    const expectedDigest = aiActionHash(
      rowDigestInput(row, requiredPermissions),
    );
    if (expectedDigest !== row.proposalDigest) {
      throw new SahelFlowError(
        "AI action proposal digest authentication failed",
        "AI_ACTION_DIGEST_TAMPERED",
        409,
      );
    }

    return {
      row,
      args: parseSensitiveAiToolArgs(row.toolName, args),
      summary,
      licenseBinding: storedLicense,
      targetBinding,
      requiredPermissions,
    };
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw new SahelFlowError(
      "AI action proposal payload could not be decrypted or validated",
      "AI_ACTION_ARGUMENT_TAMPERED",
      409,
    );
  } finally {
    key.fill(0);
  }
}

async function projection(
  context: { prisma: DbClient; shop: ShopContext },
  proposal: DecryptedProposal,
  execution?: ExecutionRow | null,
): Promise<AiActionProposalProjection> {
  const currentExecution =
    execution === undefined
      ? await readExecution(context.prisma, proposal.row.id)
      : execution;
  return {
    id: proposal.row.id,
    toolName: proposal.row.toolName,
    status: proposal.row.status,
    proposalDigestPrefix: proposal.row.proposalDigest.slice(0, 12),
    summary: proposal.summary,
    expiresAt: toDate(proposal.row.expiresAt).toISOString(),
    createdAt: toDate(proposal.row.createdAt).toISOString(),
    executionState: currentExecution?.state ?? null,
    lastErrorCode:
      currentExecution?.errorCode ?? proposal.row.lastErrorCode ?? null,
  };
}

function currentPolicyPermissions(toolName: string): Phase2Action[] {
  const policy = getAiToolPolicy(toolName);
  if (policy.executionClass !== "sensitive") {
    throw new SahelFlowError(
      `AI action '${toolName}' is no longer executable`,
      policy.blockedReasonCode ?? "AI_ACTION_POLICY_DRIFT",
      409,
    );
  }
  return sortedPermissions(policy.requiredPermissions);
}

async function markProposalConflict(
  db: DbClient,
  proposalId: string,
  code: string,
): Promise<void> {
  await db.$executeRaw`
    UPDATE "AiActionProposal"
    SET "status" = 'conflict',
        "lastErrorCode" = ${code},
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${proposalId}
      AND "status" NOT IN ('succeeded', 'expired', 'rejected')
  `;
}

async function validateApprovalAuthority(
  context: { prisma: DbClient; shop: ShopContext },
  proposal: DecryptedProposal,
): Promise<void> {
  const row = proposal.row;
  if (!shopMatches(row, context.shop)) {
    throw new SahelFlowError(
      "AI action proposal belongs to another exact shop runtime",
      "AI_ACTION_SHOP_DRIFT",
      409,
    );
  }
  if (toDate(row.expiresAt).getTime() <= Date.now()) {
    await context.prisma.$executeRaw`
      UPDATE "AiActionProposal"
      SET "status" = 'expired',
          "lastErrorCode" = 'AI_ACTION_PROPOSAL_EXPIRED',
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${row.id}
        AND "status" NOT IN ('succeeded', 'rejected')
    `;
    throw new SahelFlowError(
      "AI action proposal expired before approval",
      "AI_ACTION_PROPOSAL_EXPIRED",
      409,
    );
  }

  const policyPermissions = currentPolicyPermissions(row.toolName);
  if (
    aiActionHash(policyPermissions) !== row.permissionHash ||
    canonicalAiActionJson(policyPermissions) !==
      canonicalAiActionJson(proposal.requiredPermissions)
  ) {
    throw new SahelFlowError(
      "AI action policy changed after the proposal was created",
      "AI_ACTION_POLICY_DRIFT",
      409,
    );
  }

  let requester;
  try {
    requester = await resolveDurableIdentityActor(
      row.requestSessionId,
      context.shop,
    );
  } catch {
    requester = null;
  }
  if (
    !requester ||
    requester.personId !== row.requestActorId ||
    requester.workspaceMemberId !== row.requestWorkspaceMemberId ||
    requester.deviceId !== row.requestDeviceId ||
    requester.role !== row.requestRole ||
    requester.policyVersion !== numberValue(row.requestPolicyVersion) ||
    requester.revocationEpoch !== numberValue(row.requestRevocationEpoch)
  ) {
    throw new SahelFlowError(
      "The requester identity or session authority changed after proposal creation",
      "AI_ACTION_REQUESTER_DRIFT",
      409,
    );
  }
  const requesterPermissions = resolvePhase2Permissions(requester.role, null);
  if (
    !proposal.requiredPermissions.every((action) =>
      requesterPermissions.includes(action),
    ) ||
    !requesterPermissions.includes("approvals.request") ||
    !requesterPermissions.includes("ai.use")
  ) {
    throw new SahelFlowError(
      "The requester no longer has the proposal permissions",
      "AI_ACTION_REQUESTER_DRIFT",
      409,
    );
  }

  const currentLicense = await licenseBinding();
  if (aiActionHash(currentLicense) !== row.licenseBindingHash) {
    throw new SahelFlowError(
      "The AI entitlement changed after proposal creation",
      "AI_ACTION_LICENSE_DRIFT",
      409,
    );
  }
  const currentTarget = await buildAiActionTargetSnapshot(
    context,
    row.toolName,
    proposal.args,
  );
  if (aiActionHash(currentTarget.targetBinding) !== row.targetBindingHash) {
    throw new SahelFlowError(
      "The proposed business target changed before approval",
      "AI_ACTION_TARGET_CONFLICT",
      409,
    );
  }
}

function approvalDigest(input: {
  proposal: ProposalRow;
  approver: PersonActor;
  reasonHash: string | null;
}): string {
  return aiActionHash({
    formatVersion: 1,
    proposalId: input.proposal.id,
    proposalDigest: input.proposal.proposalDigest,
    decision: "approved",
    approver: {
      kind: input.approver.kind,
      personId: input.approver.personId,
      workspaceMemberId: input.approver.workspaceMemberId,
      deviceId: input.approver.deviceId,
      sessionId: input.approver.sessionId,
      role: input.approver.role,
      policyVersion: input.approver.policyVersion,
      revocationEpoch: input.approver.revocationEpoch,
    },
    reasonHash: input.reasonHash,
  });
}

async function claimApprovalAndExecution(
  input: ApproveAiActionProposalInput,
  proposal: DecryptedProposal,
  approver: PersonActor,
  reasonHash: string | null,
): Promise<{ approval: ApprovalRow; execution: ExecutionRow }> {
  const db = input.context.prisma;
  const approvalId = `aia_${aiActionHash({
    proposalId: proposal.row.id,
    decision: "approved",
  })}`;
  const digest = approvalDigest({
    proposal: proposal.row,
    approver,
    reasonHash,
  });
  const executionKey = `ai-action-execution:v1:${proposal.row.proposalDigest}`;
  const executionId = `aix_${aiActionHash(executionKey)}`;
  const now = new Date();

  await db.$transaction(async (tx) => {
    const liveRows = await tx.$queryRaw<
      Array<{ status: string; proposalDigest: string; expiresAt: Date | string }>
    >`
      SELECT "status", "proposalDigest", "expiresAt"
      FROM "AiActionProposal"
      WHERE "id" = ${proposal.row.id}
      LIMIT 1
    `;
    const live = liveRows[0];
    if (!live || live.proposalDigest !== proposal.row.proposalDigest) {
      throw new SahelFlowError(
        "AI action proposal changed before approval claim",
        "AI_ACTION_DIGEST_TAMPERED",
        409,
      );
    }
    if (toDate(live.expiresAt).getTime() <= now.getTime()) {
      throw new SahelFlowError(
        "AI action proposal expired before approval claim",
        "AI_ACTION_PROPOSAL_EXPIRED",
        409,
      );
    }
    if (["conflict", "expired", "rejected"].includes(live.status)) {
      throw new ConflictError(
        `AI action proposal cannot execute from '${live.status}'`,
      );
    }

    await tx.$executeRaw`
      INSERT OR IGNORE INTO "AiActionApproval" (
        "id", "proposalId", "decision",
        "approverActorKind", "approverActorId", "approverWorkspaceMemberId",
        "approverDeviceId", "approverSessionId", "approverRole",
        "approverPolicyVersion", "approverRevocationEpoch",
        "approvalDigest", "reasonHash", "createdAt"
      ) VALUES (
        ${approvalId}, ${proposal.row.id}, 'approved',
        'person', ${approver.personId}, ${approver.workspaceMemberId},
        ${approver.deviceId}, ${approver.sessionId}, ${approver.role},
        ${approver.policyVersion}, ${approver.revocationEpoch},
        ${digest}, ${reasonHash}, ${now}
      )
    `;
    await tx.$executeRaw`
      INSERT OR IGNORE INTO "AiActionExecution" (
        "id", "proposalId", "executionKey", "state", "claimedAt", "updatedAt"
      ) VALUES (
        ${executionId}, ${proposal.row.id}, ${executionKey}, 'claimed', ${now}, ${now}
      )
    `;
    await tx.$executeRaw`
      UPDATE "AiActionProposal"
      SET "status" = CASE
            WHEN "status" = 'succeeded' THEN 'succeeded'
            ELSE 'approved'
          END,
          "approvedAt" = COALESCE("approvedAt", ${now}),
          "executionClaimedAt" = COALESCE("executionClaimedAt", ${now}),
          "updatedAt" = ${now}
      WHERE "id" = ${proposal.row.id}
    `;
  });

  const approval = await readApproval(db, proposal.row.id);
  const execution = await readExecution(db, proposal.row.id);
  if (!approval || !execution || approval.decision !== "approved") {
    throw new SahelFlowError(
      "AI action approval claim did not produce durable authority",
      "AI_ACTION_APPROVAL_CLAIM_FAILED",
      503,
    );
  }
  return { approval, execution };
}

async function readExecutionResult(
  context: { prisma: DbClient; shop: ShopContext },
  proposal: ProposalRow,
  execution: ExecutionRow,
): Promise<Record<string, unknown>> {
  if (!execution.resultJson || !execution.resultHash) {
    throw new SahelFlowError(
      "AI action execution result is incomplete",
      "AI_ACTION_EXECUTION_RESULT_INCOMPLETE",
      503,
    );
  }
  const key = await getBusinessEnvelopeKey(context);
  try {
    const result = openBusinessPayloadWithKey<Record<string, unknown>>(
      execution.resultJson,
      binding(
        "ai-action-execution-result",
        proposal.id,
        proposal.toolName,
        "result",
      ),
      key,
    );
    if (aiActionHash(result) !== execution.resultHash) {
      throw new SahelFlowError(
        "AI action execution result authentication failed",
        "AI_ACTION_EXECUTION_RESULT_TAMPERED",
        409,
      );
    }
    return result;
  } finally {
    key.fill(0);
  }
}

async function markRunning(
  db: DbClient,
  proposalId: string,
  recoveryReasonHash: string | null,
): Promise<void> {
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "AiActionExecution"
      SET "state" = 'running',
          "startedAt" = COALESCE("startedAt", ${now}),
          "errorCode" = NULL,
          "updatedAt" = ${now}
      WHERE "proposalId" = ${proposalId}
        AND "state" IN ('claimed', 'running', 'failed')
    `;
    await tx.$executeRaw`
      UPDATE "AiActionProposal"
      SET "status" = 'executing',
          "lastErrorCode" = NULL,
          "updatedAt" = ${now}
      WHERE "id" = ${proposalId}
        AND "status" NOT IN ('succeeded', 'conflict', 'expired', 'rejected')
    `;
    if (recoveryReasonHash) {
      await tx.auditLog.create({
        data: {
          action: "ai.action.execution.recovery_requested.v1",
          entity: "ai_action_proposal",
          entityId: proposalId,
          actor: "proposal-bound-ai-recovery",
          metadata: canonicalAiActionJson({
            recoveryReasonHash,
            proposalId,
          }),
        },
      });
    }
  });
}

async function markSucceeded(
  context: { prisma: DbClient; shop: ShopContext },
  proposal: ProposalRow,
  execution: ExecutionRow,
  command: ApprovedAiActionResult,
): Promise<void> {
  const resultHash = aiActionHash(command.result);
  const key = await getBusinessEnvelopeKey(context);
  let resultJson: string;
  try {
    resultJson = sealBusinessPayloadWithKey(
      command.result,
      binding(
        "ai-action-execution-result",
        proposal.id,
        proposal.toolName,
        "result",
      ),
      key,
    );
  } finally {
    key.fill(0);
  }
  const now = new Date();
  await context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "AiActionExecution"
      SET "state" = 'succeeded',
          "businessCommandId" = ${command.commandId},
          "resultJson" = ${resultJson},
          "resultHash" = ${resultHash},
          "errorCode" = NULL,
          "completedAt" = ${now},
          "updatedAt" = ${now}
      WHERE "id" = ${execution.id}
    `;
    await tx.$executeRaw`
      UPDATE "AiActionProposal"
      SET "status" = 'succeeded',
          "lastErrorCode" = NULL,
          "completedAt" = ${now},
          "updatedAt" = ${now}
      WHERE "id" = ${proposal.id}
    `;
  });
}

async function markFailed(
  db: DbClient,
  proposalId: string,
  executionId: string | null,
  error: unknown,
): Promise<void> {
  const code =
    error instanceof SahelFlowError
      ? error.code
      : error instanceof Error
        ? error.name
        : "AI_ACTION_EXECUTION_FAILED";
  const state = CONFLICT_CODES.has(code) ? "conflict" : "failed";
  const now = new Date();
  await db.$transaction(async (tx) => {
    if (executionId) {
      await tx.$executeRaw`
        UPDATE "AiActionExecution"
        SET "state" = ${state},
            "errorCode" = ${code},
            "completedAt" = ${now},
            "updatedAt" = ${now}
        WHERE "id" = ${executionId}
      `;
    }
    await tx.$executeRaw`
      UPDATE "AiActionProposal"
      SET "status" = ${state},
          "lastErrorCode" = ${code},
          "completedAt" = ${now},
          "updatedAt" = ${now}
      WHERE "id" = ${proposalId}
        AND "status" <> 'succeeded'
    `;
  });
}

export async function createAiActionProposal(
  input: CreateAiActionProposalInput,
): Promise<AiActionProposalHandle> {
  const requester = personActor(input.requester, "AI action proposal creation");
  if (
    input.requester.shop.shopIncarnationId !==
    input.context.shop.shopIncarnationId
  ) {
    throw new SahelFlowError(
      "AI action requester belongs to another shop runtime",
      "AI_ACTION_SHOP_DRIFT",
      409,
    );
  }
  const policy = getAiToolPolicy(input.toolName);
  if (policy.executionClass !== "sensitive") {
    throw new SahelFlowError(
      `AI tool '${input.toolName}' cannot create an action proposal`,
      policy.blockedReasonCode ?? "AI_ACTION_NOT_SUPPORTED",
      409,
    );
  }
  const requiredPermissions = sortedPermissions(policy.requiredPermissions);
  assertPermissions(input.requester, "approvals.request", requiredPermissions);
  const args = parseSensitiveAiToolArgs(input.toolName, input.rawArgs);
  const argsHash = aiActionHash(args);

  const message = await input.context.prisma.aiChatMessage.findFirst({
    where: {
      id: input.requestMessageId,
      sessionId: input.sessionId,
      role: "user",
    },
    select: { id: true, createdAt: true },
  });
  if (!message) {
    throw new SahelFlowError(
      "AI action proposal requires the exact persisted user request message",
      "AI_ACTION_REQUEST_MESSAGE_REQUIRED",
      409,
    );
  }
  const expiresAt = new Date(
    message.createdAt.getTime() + AI_ACTION_PROPOSAL_TTL_MS,
  );
  if (expiresAt.getTime() <= Date.now()) {
    throw new SahelFlowError(
      "AI action request is too old to create an approval proposal",
      "AI_ACTION_PROPOSAL_EXPIRED",
      409,
    );
  }

  const target = await buildAiActionTargetSnapshot(
    input.context,
    input.toolName,
    args,
  );
  const currentLicense = await licenseBinding();
  const summaryHash = aiActionHash(target.summary);
  const targetBindingHash = aiActionHash(target.targetBinding);
  const licenseBindingHash = aiActionHash(currentLicense);
  const permissionHash = aiActionHash(requiredPermissions);
  const identityHash = aiActionHash({
    formatVersion: 1,
    sessionId: input.sessionId,
    requestMessageId: input.requestMessageId,
    toolName: input.toolName,
    argsHash,
    shopIncarnationId: input.context.shop.shopIncarnationId,
  });
  const proposalId = `aip_${identityHash}`;
  const proposalKey = `ai-action-proposal:v1:${identityHash}`;
  const digestInput = proposalDigestInput({
    id: proposalId,
    proposalKey,
    sessionId: input.sessionId,
    requestMessageId: input.requestMessageId,
    toolName: input.toolName,
    actionClass: "sensitive",
    argsHash,
    summaryHash,
    requestActorKind: requester.kind,
    requestActorId: requester.personId,
    requestWorkspaceMemberId: requester.workspaceMemberId,
    requestDeviceId: requester.deviceId,
    requestSessionId: requester.sessionId,
    requestRole: requester.role,
    requestPolicyVersion: requester.policyVersion,
    requestRevocationEpoch: requester.revocationEpoch,
    requiredPermissions,
    permissionHash,
    licenseBindingHash,
    shop: input.context.shop,
    targetBindingHash,
    expiresAt,
  });
  const proposalDigest = aiActionHash(digestInput);

  const key = await getBusinessEnvelopeKey(input.context);
  let argsJson: string;
  let summaryJson: string;
  let licenseBindingJson: string;
  let targetBindingJson: string;
  try {
    argsJson = sealBusinessPayloadWithKey(
      args,
      binding("ai-action-arguments", proposalId, input.toolName, "arguments"),
      key,
    );
    summaryJson = sealBusinessPayloadWithKey(
      target.summary,
      binding("ai-action-summary", proposalId, input.toolName, "summary"),
      key,
    );
    licenseBindingJson = sealBusinessPayloadWithKey(
      currentLicense,
      binding(
        "ai-action-license-binding",
        proposalId,
        input.toolName,
        "license",
      ),
      key,
    );
    targetBindingJson = sealBusinessPayloadWithKey(
      target.targetBinding,
      binding(
        "ai-action-target-binding",
        proposalId,
        input.toolName,
        "target",
      ),
      key,
    );
  } finally {
    key.fill(0);
  }

  const now = new Date();
  await input.context.prisma.$executeRaw`
    INSERT OR IGNORE INTO "AiActionProposal" (
      "id", "proposalKey", "sessionId", "requestMessageId", "toolName",
      "actionClass", "argsJson", "argsHash", "proposalDigest",
      "summaryJson", "summaryHash", "requestActorKind", "requestActorId",
      "requestWorkspaceMemberId", "requestDeviceId", "requestSessionId",
      "requestRole", "requestPolicyVersion", "requestRevocationEpoch",
      "requiredPermissionsJson", "permissionHash", "licenseBindingJson",
      "licenseBindingHash", "workspaceId", "installationId", "shopId",
      "shopIncarnationId", "registryRevision", "databaseFileId",
      "migrationSetSha256", "targetBindingJson", "targetBindingHash",
      "status", "expiresAt", "createdAt", "updatedAt"
    ) VALUES (
      ${proposalId}, ${proposalKey}, ${input.sessionId},
      ${input.requestMessageId}, ${input.toolName}, 'sensitive',
      ${argsJson}, ${argsHash}, ${proposalDigest}, ${summaryJson}, ${summaryHash},
      'person', ${requester.personId}, ${requester.workspaceMemberId},
      ${requester.deviceId}, ${requester.sessionId}, ${requester.role},
      ${requester.policyVersion}, ${requester.revocationEpoch},
      ${canonicalAiActionJson(requiredPermissions)}, ${permissionHash},
      ${licenseBindingJson}, ${licenseBindingHash},
      ${input.context.shop.workspaceId}, ${input.context.shop.installationId},
      ${input.context.shop.shopId}, ${input.context.shop.shopIncarnationId},
      ${input.context.shop.registryRevision}, ${input.context.shop.databaseFileId},
      ${input.context.shop.migrationSetSha256}, ${targetBindingJson},
      ${targetBindingHash}, 'pending', ${expiresAt}, ${now}, ${now}
    )
  `;

  const row = await readProposalByKey(input.context.prisma, proposalKey);
  if (!row || row.id !== proposalId || row.proposalDigest !== proposalDigest) {
    throw new ConflictError(
      "The AI request identity is already bound to different proposal content",
    );
  }
  const proposal = await decryptProposal(input.context, row);
  return {
    proposal: await projection(input.context, proposal),
    proposalDigest: row.proposalDigest,
  };
}

export async function approveAiActionProposal(
  input: ApproveAiActionProposalInput,
): Promise<AiActionApprovalResult> {
  const approver = personActor(input.approver, "AI action approval");
  const row = await readProposalById(input.context.prisma, input.proposalId);
  if (!row) {
    throw new SahelFlowError(
      "AI action proposal was not found",
      "AI_ACTION_PROPOSAL_NOT_FOUND",
      404,
    );
  }
  if (row.proposalDigest !== input.proposalDigest) {
    throw new SahelFlowError(
      "AI action approval references the wrong proposal digest",
      "AI_ACTION_DIGEST_TAMPERED",
      409,
    );
  }

  let proposal: DecryptedProposal;
  try {
    proposal = await decryptProposal(input.context, row);
    assertPermissions(
      input.approver,
      "approvals.approve",
      proposal.requiredPermissions,
    );
    await validateApprovalAuthority(input.context, proposal);
  } catch (error) {
    const code =
      error instanceof SahelFlowError
        ? error.code
        : "AI_ACTION_APPROVAL_VALIDATION_FAILED";
    if (CONFLICT_CODES.has(code)) {
      await markProposalConflict(input.context.prisma, row.id, code);
    }
    throw error;
  }

  const reason = input.reason?.trim() || null;
  if (reason && reason.length > 1000) {
    throw new ValidationError("Approval reason is too long", "reason");
  }
  const reasonHash = reason ? aiActionHash(reason) : null;
  const existingExecution = await readExecution(input.context.prisma, row.id);
  if (existingExecution?.state === "conflict") {
    throw new ConflictError(
      "The AI action proposal is stale and must be recreated",
    );
  }
  if (existingExecution?.state === "failed" && !reasonHash) {
    throw new ValidationError(
      "A recovery reason is required to retry a failed AI action",
      "reason",
    );
  }

  const { execution } = await claimApprovalAndExecution(
    input,
    proposal,
    approver,
    reasonHash,
  );
  if (execution.state === "succeeded") {
    const result = await readExecutionResult(input.context, row, execution);
    return {
      proposal: await projection(input.context, proposal, execution),
      result,
      businessCommandId: execution.businessCommandId ?? "",
      replayed: true,
    };
  }

  await markRunning(
    input.context.prisma,
    row.id,
    execution.state === "failed" ? reasonHash : null,
  );
  const authority = mintAiActionExecutionAuthority({
    proposalId: row.id,
    proposalDigest: row.proposalDigest,
    toolName: row.toolName,
    argsHash: row.argsHash,
    executionKey: execution.executionKey,
  });

  try {
    const command = await executeApprovedAiAction({
      context: input.context,
      authority,
      proposalId: row.id,
      proposalDigest: row.proposalDigest,
      executionKey: execution.executionKey,
      toolName: row.toolName,
      args: proposal.args,
      argsHash: row.argsHash,
      targetBindingHash: row.targetBindingHash,
      requesterActorId: row.requestActorId,
      requesterSessionId: row.requestSessionId,
      approver: input.approver,
    });
    await markSucceeded(input.context, row, execution, command);
    const completedRow = await readProposalById(input.context.prisma, row.id);
    const completedExecution = await readExecution(
      input.context.prisma,
      row.id,
    );
    if (!completedRow || !completedExecution) {
      throw new SahelFlowError(
        "AI action completion state is unavailable",
        "AI_ACTION_EXECUTION_RESULT_INCOMPLETE",
        503,
      );
    }
    const completed = await decryptProposal(input.context, completedRow);
    return {
      proposal: await projection(
        input.context,
        completed,
        completedExecution,
      ),
      result: command.result,
      businessCommandId: command.commandId,
      replayed: command.replayed,
    };
  } catch (error) {
    await markFailed(input.context.prisma, row.id, execution.id, error).catch(
      () => undefined,
    );
    throw error;
  }
}

export async function listAiActionProposals(
  context: { prisma: DbClient; shop: ShopContext },
  actor: TrustedActorContext,
  sessionId: string,
): Promise<Array<AiActionProposalHandle>> {
  assertTrustedAction(actor, "ai.use", { shopId: context.shop.shopId });
  const rows = await context.prisma.$queryRaw<ProposalRow[]>`
    SELECT *
    FROM "AiActionProposal"
    WHERE "sessionId" = ${sessionId}
      AND "shopIncarnationId" = ${context.shop.shopIncarnationId}
    ORDER BY "createdAt" DESC
    LIMIT 100
  `;
  const output: Array<AiActionProposalHandle> = [];
  for (const row of rows) {
    const proposal = await decryptProposal(context, row);
    output.push({
      proposal: await projection(context, proposal),
      proposalDigest: row.proposalDigest,
    });
  }
  return output;
}

export async function getAiActionProposal(
  context: { prisma: DbClient; shop: ShopContext },
  actor: TrustedActorContext,
  proposalId: string,
): Promise<AiActionProposalHandle> {
  assertTrustedAction(actor, "ai.use", { shopId: context.shop.shopId });
  const row = await readProposalById(context.prisma, proposalId);
  if (!row || !shopMatches(row, context.shop)) {
    throw new SahelFlowError(
      "AI action proposal was not found",
      "AI_ACTION_PROPOSAL_NOT_FOUND",
      404,
    );
  }
  const proposal = await decryptProposal(context, row);
  return {
    proposal: await projection(context, proposal),
    proposalDigest: row.proposalDigest,
  };
}

export function aiActionApprovalAuditIdentity(
  actor: TrustedActorContext,
): string {
  return trustedActorAuditIdentity(actor.actor);
}

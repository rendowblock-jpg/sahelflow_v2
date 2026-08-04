import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { DbClient } from "@/lib/db";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";

interface ProposalAuthorityRow {
  proposalDigest: string;
  workspaceId: string;
  installationId: string;
  shopId: string;
  shopIncarnationId: string;
  registryRevision: number | bigint;
  databaseFileId: string;
  migrationSetSha256: string;
}

interface ApprovalAuthorityRow {
  decision: string;
  approverActorKind: string;
  approverActorId: string;
  approverWorkspaceMemberId: string | null;
  approverDeviceId: string | null;
  approverSessionId: string;
  approverRole: string | null;
  approverPolicyVersion: number | bigint;
  approverRevocationEpoch: number | bigint;
}

function sameDigest(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) {
    return false;
  }
  const first = Buffer.from(left, "hex");
  const second = Buffer.from(right, "hex");
  return first.length === second.length && timingSafeEqual(first, second);
}

function exactShop(row: ProposalAuthorityRow, shop: ShopContext): boolean {
  return (
    row.workspaceId === shop.workspaceId &&
    row.installationId === shop.installationId &&
    row.shopId === shop.shopId &&
    row.shopIncarnationId === shop.shopIncarnationId &&
    Number(row.registryRevision) === shop.registryRevision &&
    row.databaseFileId === shop.databaseFileId &&
    row.migrationSetSha256 === shop.migrationSetSha256
  );
}

/**
 * Bind recovery and duplicate approval requests to the immutable approver.
 *
 * The initial approval has no row yet and proceeds to the durable service. Once
 * one approval exists, another person/session/device may not inherit it. The
 * service still authenticates the keyed approval digest before execution.
 */
export async function assertAiActionApprovalActor(
  context: { prisma: DbClient; shop: ShopContext },
  current: TrustedActorContext,
  proposalId: string,
  proposalDigest: string,
): Promise<void> {
  if (current.actor.kind !== "person") {
    throw new SahelFlowError(
      "AI action approval requires a durable person identity",
      "AI_ACTION_DURABLE_PERSON_REQUIRED",
      403,
    );
  }

  const proposals = await context.prisma.$queryRaw<ProposalAuthorityRow[]>`
    SELECT
      "proposalDigest", "workspaceId", "installationId", "shopId",
      "shopIncarnationId", "registryRevision", "databaseFileId",
      "migrationSetSha256"
    FROM "AiActionProposal"
    WHERE "id" = ${proposalId}
    LIMIT 1
  `;
  const proposal = proposals[0];
  if (!proposal || !exactShop(proposal, context.shop)) {
    throw new SahelFlowError(
      "AI action proposal was not found",
      "AI_ACTION_PROPOSAL_NOT_FOUND",
      404,
    );
  }
  if (!sameDigest(proposal.proposalDigest, proposalDigest)) {
    throw new SahelFlowError(
      "AI action approval references the wrong proposal digest",
      "AI_ACTION_DIGEST_TAMPERED",
      409,
    );
  }

  const approvals = await context.prisma.$queryRaw<ApprovalAuthorityRow[]>`
    SELECT
      "decision", "approverActorKind", "approverActorId",
      "approverWorkspaceMemberId", "approverDeviceId", "approverSessionId",
      "approverRole", "approverPolicyVersion", "approverRevocationEpoch"
    FROM "AiActionApproval"
    WHERE "proposalId" = ${proposalId}
    LIMIT 1
  `;
  const approval = approvals[0];
  if (!approval) return;

  const actor = current.actor;
  if (
    approval.decision !== "approved" ||
    approval.approverActorKind !== "person" ||
    approval.approverActorId !== actor.personId ||
    approval.approverWorkspaceMemberId !== actor.workspaceMemberId ||
    approval.approverDeviceId !== actor.deviceId ||
    approval.approverSessionId !== actor.sessionId ||
    approval.approverRole !== actor.role ||
    Number(approval.approverPolicyVersion) !== actor.policyVersion ||
    Number(approval.approverRevocationEpoch) !== actor.revocationEpoch
  ) {
    throw new SahelFlowError(
      "This AI action approval belongs to another exact approver authority",
      "AI_ACTION_APPROVER_DRIFT",
      409,
    );
  }
}

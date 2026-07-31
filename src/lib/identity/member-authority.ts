import "server-only";

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";

import { getMasterKey } from "@/lib/crypto/master-key";
import type { ShopContext } from "@/lib/shops/context";
import { dataRoot } from "@/lib/storage/data-root";
import { SahelFlowError } from "@/types/errors";
import {
  PHASE2_ACTIONS,
  resolvePhase2Permissions,
  type Phase2Action,
  type Phase2Role,
} from "./permissions";
import { getIdentityAdministrationSnapshot } from "./control-authority";

const FORMAT_VERSION = 1 as const;
const KEY_ID = "installation-root-member-authority-v1" as const;
const FILE_NAME = "member-authority.json";
const MARKER_FILE_NAME = "member-authority.initialized.json";
const LOCK_FILE_NAME = "member-authority.lock";
const TOKEN_PREFIX = "sf-invite-v1";
const ROOT_KEY_BYTES = 32;
const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 10;
const DEFAULT_EXPIRY_HOURS = 24;
const MAX_EXPIRY_HOURS = 7 * 24;
const MAX_INVITATIONS = 1_000;

const exactIdSchema = z.string().regex(/^[0-9a-f]{32}$/i);
const exactSessionIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value === value.trim(), "Session ID must be exact");
const exactShopIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => value === value.trim(), "Shop ID must be exact");
const roleSchema = z.enum(["manager", "operator", "viewer"]);
const actionSchema = z.enum(PHASE2_ACTIONS);
const isoDateSchema = z.string().datetime({ offset: true });
const requestIdSchema = z.string().uuid();

const invitationSchema = z
  .object({
    id: exactIdSchema,
    requestId: requestIdSchema,
    requestHash: z.string().regex(/^[0-9a-f]{64}$/i),
    secretDigest: z.string().regex(/^[0-9a-f]{64}$/i),
    createdByMemberId: exactIdSchema,
    role: roleSchema,
    permissions: z.array(actionSchema).nullable(),
    shopIds: z.array(exactShopIdSchema).min(1),
    createdAt: isoDateSchema,
    expiresAt: isoDateSchema,
    revokedAt: isoDateSchema.nullable(),
    acceptedAt: isoDateSchema.nullable(),
    acceptedMemberId: exactIdSchema.nullable(),
  })
  .strict();

const payloadSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    revision: z.number().int().positive().safe(),
    workspaceId: exactIdSchema,
    installationId: exactIdSchema,
    invitations: z.array(invitationSchema).max(MAX_INVITATIONS),
  })
  .strict();

const envelopeSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    keyId: z.literal(KEY_ID),
    payload: payloadSchema,
    mac: z.string().regex(/^[0-9a-f]{64}$/i),
  })
  .strict();

const markerPayloadSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    workspaceId: exactIdSchema,
    installationId: exactIdSchema,
    authorityFile: z.literal(FILE_NAME),
  })
  .strict();

const markerEnvelopeSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    keyId: z.literal(KEY_ID),
    payload: markerPayloadSchema,
    mac: z.string().regex(/^[0-9a-f]{64}$/i),
  })
  .strict();

type MemberPayload = z.infer<typeof payloadSchema>;
type MemberEnvelope = z.infer<typeof envelopeSchema>;
type MarkerEnvelope = z.infer<typeof markerEnvelopeSchema>;
type InvitationRecord = z.infer<typeof invitationSchema>;
type InviteRole = z.infer<typeof roleSchema>;
type KeyState = "old" | "new";

export type MemberInvitationState =
  | "pending"
  | "expired"
  | "revoked"
  | "accepted";

export type MemberInvitationView = Readonly<{
  id: string;
  requestId: string;
  role: InviteRole;
  permissions: readonly Phase2Action[] | null;
  shopIds: readonly string[];
  createdByMemberId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  acceptedAt: string | null;
  acceptedMemberId: string | null;
  state: MemberInvitationState;
}>;

export type CreateMemberInvitationInput = Readonly<{
  requestId: string;
  role: Exclude<Phase2Role, "owner">;
  permissions?: readonly Phase2Action[] | null;
  shopIds: readonly string[];
  expiresInHours?: number;
}>;

export type CreateMemberInvitationResult = Readonly<{
  invitation: MemberInvitationView;
  token: string | null;
  replayed: boolean;
  revision: number;
}>;

export type RevokeMemberInvitationResult = Readonly<{
  invitation: MemberInvitationView;
  state: "revoked" | "already-revoked";
  revision: number;
}>;

export type MemberAuthorityRotationResult = Readonly<{
  state: "absent" | "verified" | "reauthenticated" | "already-new";
  authorityKeyState: KeyState | null;
  markerKeyState: KeyState | "missing" | null;
}>;

let processQueue: Promise<void> = Promise.resolve();

function memberError(
  message: string,
  code = "MEMBER_AUTHORITY_UNAVAILABLE",
  statusCode = 503,
): SahelFlowError {
  return new SahelFlowError(message, code, statusCode);
}

function systemDirectory(): string {
  return join(dataRoot(), "system");
}

export function memberAuthorityPath(): string {
  return join(systemDirectory(), FILE_NAME);
}

export function memberAuthorityMarkerPath(): string {
  return join(systemDirectory(), MARKER_FILE_NAME);
}

function memberAuthorityLockPath(): string {
  return join(systemDirectory(), LOCK_FILE_NAME);
}

function assertRootKey(key: Buffer, label: string): void {
  if (!Buffer.isBuffer(key) || key.length !== ROOT_KEY_BYTES) {
    throw memberError(`${label} must be a 256-bit installation root`);
  }
}

function canonicalize(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  throw memberError("Member authority contains unsupported canonical data");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function macFor(
  label: string,
  payload: unknown,
  rootKey: Buffer = getMasterKey(),
): string {
  assertRootKey(rootKey, "Member authority root key");
  const derived = createHmac("sha256", rootKey)
    .update("sahelflow.member-authority.key.v1", "utf8")
    .digest();
  try {
    return createHmac("sha256", derived)
      .update(label, "utf8")
      .update("\0", "utf8")
      .update(canonicalJson(payload), "utf8")
      .digest("hex");
  } finally {
    derived.fill(0);
  }
}

function macMatches(
  label: string,
  payload: unknown,
  supplied: string,
  rootKey: Buffer = getMasterKey(),
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const expected = Buffer.from(macFor(label, payload, rootKey), "hex");
  const actual = Buffer.from(supplied, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function createEnvelope(
  payload: MemberPayload,
  rootKey: Buffer = getMasterKey(),
): MemberEnvelope {
  return {
    formatVersion: FORMAT_VERSION,
    keyId: KEY_ID,
    payload,
    mac: macFor("authority", payload, rootKey),
  };
}

function createMarker(
  workspaceId: string,
  installationId: string,
  rootKey: Buffer = getMasterKey(),
): MarkerEnvelope {
  const payload = {
    formatVersion: FORMAT_VERSION,
    workspaceId,
    installationId,
    authorityFile: FILE_NAME,
  } as const;
  return {
    formatVersion: FORMAT_VERSION,
    keyId: KEY_ID,
    payload,
    mac: macFor("marker", payload, rootKey),
  };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw memberError(`Member authority file '${path}' is unreadable`);
  }
}

function validatePayload(payload: MemberPayload): void {
  if (new Set(payload.invitations.map((item) => item.id)).size !== payload.invitations.length) {
    throw memberError("Member authority contains duplicate invitation IDs");
  }
  if (
    new Set(payload.invitations.map((item) => item.requestId)).size !==
    payload.invitations.length
  ) {
    throw memberError("Member authority contains duplicate invitation requests");
  }
  for (const invitation of payload.invitations) {
    if (new Set(invitation.shopIds).size !== invitation.shopIds.length) {
      throw memberError("Member invitation contains duplicate shop grants");
    }
    if (
      invitation.acceptedAt === null !==
      (invitation.acceptedMemberId === null)
    ) {
      throw memberError("Member invitation acceptance state is inconsistent");
    }
    if (new Date(invitation.expiresAt).getTime() <= new Date(invitation.createdAt).getTime()) {
      throw memberError("Member invitation expiry is invalid");
    }
  }
}

function parseAuthority(): MemberEnvelope | null {
  if (!existsSync(memberAuthorityPath())) return null;
  const envelope = envelopeSchema.parse(readJson(memberAuthorityPath()));
  validatePayload(envelope.payload);
  return envelope;
}

function parseMarker(): MarkerEnvelope | null {
  if (!existsSync(memberAuthorityMarkerPath())) return null;
  return markerEnvelopeSchema.parse(readJson(memberAuthorityMarkerPath()));
}

function readAuthority(rootKey: Buffer = getMasterKey()): MemberEnvelope | null {
  const envelope = parseAuthority();
  if (!envelope) return null;
  if (!macMatches("authority", envelope.payload, envelope.mac, rootKey)) {
    throw memberError("Member authority authentication failed");
  }
  return envelope;
}

function readMarker(rootKey: Buffer = getMasterKey()): MarkerEnvelope | null {
  const marker = parseMarker();
  if (!marker) return null;
  if (!macMatches("marker", marker.payload, marker.mac, rootKey)) {
    throw memberError("Member authority initialization marker is invalid");
  }
  return marker;
}

function assertContext(
  payload: Pick<MemberPayload, "workspaceId" | "installationId">,
  shop: ShopContext,
): void {
  if (
    payload.workspaceId !== shop.workspaceId ||
    payload.installationId !== shop.installationId
  ) {
    throw memberError(
      "Member authority does not match the process workspace or installation",
      "MEMBER_AUTHORITY_CONTEXT_MISMATCH",
      409,
    );
  }
}

function assertMarker(
  marker: MarkerEnvelope | null,
  payload: MemberPayload,
  shop: ShopContext,
): void {
  if (!marker) return;
  if (
    marker.payload.workspaceId !== payload.workspaceId ||
    marker.payload.installationId !== payload.installationId ||
    marker.payload.workspaceId !== shop.workspaceId ||
    marker.payload.installationId !== shop.installationId
  ) {
    throw memberError("Member authority marker belongs to another installation");
  }
}

function atomicWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor: number | null = null;
  try {
    writeFileSync(temporary, `${JSON.stringify(value)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    descriptor = openSync(temporary, "r");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporary, path);
    try {
      const directory = openSync(dirname(path), "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    } catch {
      // Directory fsync is unavailable on some Windows filesystems.
    }
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch {
      // Preserve the original error.
    }
    throw error;
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(): Promise<number> {
  mkdirSync(systemDirectory(), { recursive: true });
  const path = memberAuthorityLockPath();
  const startedAt = Date.now();
  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    try {
      const descriptor = openSync(path, "wx", 0o600);
      writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }),
      );
      fsyncSync(descriptor);
      return descriptor;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw error;
      }
      try {
        if (Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS) {
          unlinkSync(path);
          continue;
        }
      } catch {
        continue;
      }
      await delay(LOCK_RETRY_MS);
    }
  }
  throw memberError("Member authority is busy; retry the operation");
}

async function withLock<T>(work: () => Promise<T> | T): Promise<T> {
  const previous = processQueue;
  let releaseQueue!: () => void;
  processQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await previous;

  let descriptor: number | null = null;
  try {
    descriptor = await acquireLock();
    return await work();
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    try {
      if (existsSync(memberAuthorityLockPath())) unlinkSync(memberAuthorityLockPath());
    } catch {
      // A later operation can recover a stale lock.
    }
    releaseQueue();
  }
}

function initialPayload(shop: ShopContext): MemberPayload {
  return {
    formatVersion: FORMAT_VERSION,
    revision: 1,
    workspaceId: shop.workspaceId,
    installationId: shop.installationId,
    invitations: [],
  };
}

function readRequiredAuthority(shop: ShopContext): {
  envelope: MemberEnvelope;
  marker: MarkerEnvelope | null;
} {
  const marker = readMarker();
  const envelope = readAuthority();
  if (!envelope) {
    if (marker) {
      throw memberError(
        "Member authority is missing after initialization",
        "MEMBER_AUTHORITY_MISSING",
        503,
      );
    }
    throw memberError("Member authority is not initialized", "MEMBER_AUTHORITY_NOT_FOUND", 404);
  }
  assertContext(envelope.payload, shop);
  assertMarker(marker, envelope.payload, shop);
  return { envelope, marker };
}

function invitationState(
  invitation: InvitationRecord,
  nowMs = Date.now(),
): MemberInvitationState {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  if (new Date(invitation.expiresAt).getTime() <= nowMs) return "expired";
  return "pending";
}

function invitationView(invitation: InvitationRecord): MemberInvitationView {
  return Object.freeze({
    id: invitation.id,
    requestId: invitation.requestId,
    role: invitation.role,
    permissions: invitation.permissions
      ? Object.freeze([...invitation.permissions])
      : null,
    shopIds: Object.freeze([...invitation.shopIds]),
    createdByMemberId: invitation.createdByMemberId,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    revokedAt: invitation.revokedAt,
    acceptedAt: invitation.acceptedAt,
    acceptedMemberId: invitation.acceptedMemberId,
    state: invitationState(invitation),
  });
}

function normalizePermissions(
  role: InviteRole,
  permissions: readonly Phase2Action[] | null | undefined,
): readonly Phase2Action[] | null {
  if (permissions == null) return null;
  try {
    return resolvePhase2Permissions(role, JSON.stringify(permissions));
  } catch {
    throw memberError(
      "Invitation permissions exceed the selected role or are invalid",
      "INVITATION_PERMISSION_INVALID",
      400,
    );
  }
}

function normalizeShopIds(
  requested: readonly string[],
  allowed: readonly string[],
): string[] {
  const values = [...new Set(requested.map((value) => exactShopIdSchema.parse(value)))].sort();
  if (values.length === 0) {
    throw memberError("At least one shop grant is required", "INVITATION_SHOP_REQUIRED", 400);
  }
  const allowedSet = new Set(allowed);
  if (values.some((value) => !allowedSet.has(value))) {
    throw memberError(
      "Invitation requests a shop outside the owner grant",
      "INVITATION_SHOP_FORBIDDEN",
      403,
    );
  }
  return values;
}

function requestHash(input: {
  role: InviteRole;
  permissions: readonly Phase2Action[] | null;
  shopIds: readonly string[];
  expiresInHours: number;
}): string {
  return createHash("sha256").update(canonicalJson(input), "utf8").digest("hex");
}

function secretDigest(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function tokenFor(id: string, secret: string): string {
  return `${TOKEN_PREFIX}.${id}.${secret}`;
}

async function requireOwner(
  currentSessionId: string,
  shop: ShopContext,
): Promise<Awaited<ReturnType<typeof getIdentityAdministrationSnapshot>>> {
  exactSessionIdSchema.parse(currentSessionId);
  const authority = await getIdentityAdministrationSnapshot(currentSessionId, shop);
  if (authority.currentActor.role !== "owner") {
    throw memberError(
      "Only the workspace owner may administer invitations",
      "ACTION_FORBIDDEN",
      403,
    );
  }
  return authority;
}

export async function createMemberInvitation(
  currentSessionId: string,
  shop: ShopContext,
  input: CreateMemberInvitationInput,
): Promise<CreateMemberInvitationResult> {
  const owner = await requireOwner(currentSessionId, shop);
  const requestId = requestIdSchema.parse(input.requestId);
  const role = roleSchema.parse(input.role);
  const permissions = normalizePermissions(role, input.permissions);
  const shopIds = normalizeShopIds(input.shopIds, owner.member.shopIds);
  const expiresInHours = input.expiresInHours ?? DEFAULT_EXPIRY_HOURS;
  if (
    !Number.isSafeInteger(expiresInHours) ||
    expiresInHours < 1 ||
    expiresInHours > MAX_EXPIRY_HOURS
  ) {
    throw memberError(
      `Invitation expiry must be between 1 and ${MAX_EXPIRY_HOURS} hours`,
      "INVITATION_EXPIRY_INVALID",
      400,
    );
  }
  const hash = requestHash({ role, permissions, shopIds, expiresInHours });

  return withLock(async () => {
    // Re-resolve owner authority after acquiring the extension lock so a stale or
    // revoked owner cannot commit an invitation after waiting.
    await requireOwner(currentSessionId, shop);
    const marker = readMarker();
    const existingEnvelope = readAuthority();
    const payload = existingEnvelope
      ? (structuredClone(existingEnvelope.payload) as MemberPayload)
      : initialPayload(shop);
    assertContext(payload, shop);
    assertMarker(marker, payload, shop);

    const replay = payload.invitations.find(
      (invitation) => invitation.requestId === requestId,
    );
    if (replay) {
      if (replay.requestHash !== hash) {
        throw memberError(
          "The invitation request ID is already bound to different input",
          "INVITATION_IDEMPOTENCY_CONFLICT",
          409,
        );
      }
      return Object.freeze({
        invitation: invitationView(replay),
        token: null,
        replayed: true,
        revision: payload.revision,
      });
    }

    const secret = randomBytes(32).toString("base64url");
    const now = new Date();
    const invitation: InvitationRecord = {
      id: randomBytes(16).toString("hex"),
      requestId,
      requestHash: hash,
      secretDigest: secretDigest(secret),
      createdByMemberId: owner.currentActor.workspaceMemberId,
      role,
      permissions: permissions ? [...permissions] : null,
      shopIds,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + expiresInHours * 60 * 60 * 1000,
      ).toISOString(),
      revokedAt: null,
      acceptedAt: null,
      acceptedMemberId: null,
    };
    payload.invitations.push(invitation);
    payload.invitations.sort((left, right) =>
      left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0,
    );
    payload.revision += 1;
    atomicWrite(memberAuthorityPath(), createEnvelope(payload));
    if (!marker) {
      atomicWrite(
        memberAuthorityMarkerPath(),
        createMarker(shop.workspaceId, shop.installationId),
      );
    }

    return Object.freeze({
      invitation: invitationView(invitation),
      token: tokenFor(invitation.id, secret),
      replayed: false,
      revision: payload.revision,
    });
  });
}

export async function listMemberInvitations(
  currentSessionId: string,
  shop: ShopContext,
): Promise<Readonly<{ revision: number; invitations: readonly MemberInvitationView[] }>> {
  await requireOwner(currentSessionId, shop);
  const marker = readMarker();
  const envelope = readAuthority();
  if (!envelope) {
    if (marker) {
      throw memberError(
        "Member authority is missing after initialization",
        "MEMBER_AUTHORITY_MISSING",
        503,
      );
    }
    return Object.freeze({ revision: 0, invitations: Object.freeze([]) });
  }
  assertContext(envelope.payload, shop);
  assertMarker(marker, envelope.payload, shop);
  return Object.freeze({
    revision: envelope.payload.revision,
    invitations: Object.freeze(
      envelope.payload.invitations
        .map(invitationView)
        .sort((left, right) =>
          left.createdAt > right.createdAt ? -1 : left.createdAt < right.createdAt ? 1 : 0,
        ),
    ),
  });
}

export async function revokeMemberInvitation(
  currentSessionId: string,
  invitationId: string,
  shop: ShopContext,
): Promise<RevokeMemberInvitationResult> {
  exactIdSchema.parse(invitationId);
  await requireOwner(currentSessionId, shop);

  return withLock(async () => {
    await requireOwner(currentSessionId, shop);
    const { envelope, marker } = readRequiredAuthority(shop);
    const payload = structuredClone(envelope.payload) as MemberPayload;
    const invitation = payload.invitations.find((item) => item.id === invitationId);
    if (!invitation) {
      throw memberError("Invitation not found", "INVITATION_NOT_FOUND", 404);
    }
    if (invitation.acceptedAt) {
      throw memberError(
        "An accepted invitation cannot be revoked; revoke the member instead",
        "INVITATION_ALREADY_ACCEPTED",
        409,
      );
    }
    if (invitation.revokedAt) {
      return Object.freeze({
        invitation: invitationView(invitation),
        state: "already-revoked" as const,
        revision: payload.revision,
      });
    }

    invitation.revokedAt = new Date().toISOString();
    payload.revision += 1;
    atomicWrite(memberAuthorityPath(), createEnvelope(payload));
    if (!marker) {
      atomicWrite(
        memberAuthorityMarkerPath(),
        createMarker(shop.workspaceId, shop.installationId),
      );
    }
    return Object.freeze({
      invitation: invitationView(invitation),
      state: "revoked" as const,
      revision: payload.revision,
    });
  });
}

function keyStateForMac(
  label: string,
  payload: unknown,
  supplied: string,
  oldKey: Buffer,
  newKey: Buffer,
): KeyState {
  if (macMatches(label, payload, supplied, newKey)) return "new";
  if (macMatches(label, payload, supplied, oldKey)) return "old";
  throw memberError(
    `Member ${label} authentication failed under both rotation roots`,
  );
}

export function rotateMemberAuthorityAuthentication(
  oldKey: Buffer,
  newKey: Buffer,
  dryRun = false,
): MemberAuthorityRotationResult {
  assertRootKey(oldKey, "Current member authority root key");
  assertRootKey(newKey, "Candidate member authority root key");
  if (timingSafeEqual(oldKey, newKey)) {
    throw memberError("Member authority rotation roots must be different");
  }

  const authority = parseAuthority();
  const marker = parseMarker();
  if (!authority && !marker) {
    return {
      state: "absent",
      authorityKeyState: null,
      markerKeyState: null,
    };
  }
  if (!authority && marker) {
    throw memberError(
      "Member authority marker exists without its authority file",
      "MEMBER_AUTHORITY_MISSING",
      503,
    );
  }

  const required = authority!;
  const authorityKeyState = keyStateForMac(
    "authority",
    required.payload,
    required.mac,
    oldKey,
    newKey,
  );
  let markerKeyState: KeyState | "missing" = "missing";
  if (marker) {
    if (
      marker.payload.workspaceId !== required.payload.workspaceId ||
      marker.payload.installationId !== required.payload.installationId
    ) {
      throw memberError("Member authority marker does not match its payload");
    }
    markerKeyState = keyStateForMac(
      "marker",
      marker.payload,
      marker.mac,
      oldKey,
      newKey,
    );
  }

  if (dryRun) {
    return { state: "verified", authorityKeyState, markerKeyState };
  }

  let rewritten = false;
  if (authorityKeyState === "old") {
    atomicWrite(memberAuthorityPath(), createEnvelope(required.payload, newKey));
    rewritten = true;
  }
  if (markerKeyState !== "new") {
    atomicWrite(
      memberAuthorityMarkerPath(),
      createMarker(
        required.payload.workspaceId,
        required.payload.installationId,
        newKey,
      ),
    );
    rewritten = true;
  }

  return {
    state: rewritten ? "reauthenticated" : "already-new",
    authorityKeyState,
    markerKeyState,
  };
}

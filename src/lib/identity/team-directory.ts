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

import {
  CURRENT_PBKDF2_ITERATIONS,
  hashPin,
  verifyPin,
  verifyPinDetailed,
} from "@/lib/auth/crypto";
import { getMasterKey } from "@/lib/crypto/master-key";
import type { ShopContext } from "@/lib/shops/context";
import { dataRoot } from "@/lib/storage/data-root";
import { SahelFlowError } from "@/types/errors";
import {
  PHASE2_ACTIONS,
  resolvePhase2Permissions,
  type Phase2Action,
} from "./permissions";
import { memberAuthorityPath } from "./member-authority";

const FORMAT_VERSION = 1 as const;
const KEY_ID = "installation-root-team-directory-v1" as const;
const FILE_NAME = "team-directory.json";
const MARKER_FILE_NAME = "team-directory.initialized.json";
const LOCK_FILE_NAME = "team-directory.lock";
const TOKEN_PREFIX = "sf-invite-v1";
const ROOT_KEY_BYTES = 32;
const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 10;
const MAX_MEMBERS = 10;
const MAX_SESSIONS = 2_000;

const exactIdSchema = z.string().regex(/^[0-9a-f]{32}$/i);
const sessionIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value === value.trim(), "Session ID must be exact");
const shopIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => value === value.trim(), "Shop ID must be exact");
const roleSchema = z.enum(["manager", "operator", "viewer"]);
const actionSchema = z.enum(PHASE2_ACTIONS);
const requestIdSchema = z.string().uuid();
const isoDateSchema = z.string().datetime({ offset: true });
const displayNameSchema = z.string().trim().min(1).max(80);
const loginIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,31}$/);
const pinSchema = z.string().min(8).max(32);

const invitationSchema = z
  .object({
    id: exactIdSchema,
    requestId: requestIdSchema,
    requestHash: z.string().regex(/^[0-9a-f]{64}$/i),
    secretDigest: z.string().regex(/^[0-9a-f]{64}$/i),
    createdByMemberId: exactIdSchema,
    role: roleSchema,
    permissions: z.array(actionSchema).nullable(),
    shopIds: z.array(shopIdSchema).min(1),
    createdAt: isoDateSchema,
    expiresAt: isoDateSchema,
    revokedAt: isoDateSchema.nullable(),
    acceptedAt: isoDateSchema.nullable(),
    acceptedMemberId: exactIdSchema.nullable(),
  })
  .strict();

const invitationEnvelopeSchema = z
  .object({
    formatVersion: z.literal(1),
    keyId: z.literal("installation-root-member-authority-v1"),
    payload: z
      .object({
        formatVersion: z.literal(1),
        revision: z.number().int().positive().safe(),
        workspaceId: exactIdSchema,
        installationId: exactIdSchema,
        invitations: z.array(invitationSchema),
      })
      .strict(),
    mac: z.string().regex(/^[0-9a-f]{64}$/i),
  })
  .strict();

const teamMemberSchema = z
  .object({
    personId: exactIdSchema,
    memberId: exactIdSchema,
    deviceId: exactIdSchema,
    invitationId: exactIdSchema,
    acceptanceRequestId: requestIdSchema,
    displayName: displayNameSchema,
    loginId: loginIdSchema,
    pinHash: z.string().min(1).max(2_048),
    role: roleSchema,
    permissions: z.array(actionSchema).nullable(),
    shopIds: z.array(shopIdSchema).min(1),
    policyVersion: z.number().int().positive().safe(),
    revocationEpoch: z.number().int().nonnegative().safe(),
    createdAt: isoDateSchema,
    revokedAt: isoDateSchema.nullable(),
  })
  .strict();

const teamSessionSchema = z
  .object({
    sessionId: sessionIdSchema,
    memberId: exactIdSchema,
    deviceId: exactIdSchema,
    policyVersion: z.number().int().positive().safe(),
    memberRevocationEpoch: z.number().int().nonnegative().safe(),
    issuedAt: isoDateSchema,
    revokedAt: isoDateSchema.nullable(),
  })
  .strict();

const payloadSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    revision: z.number().int().positive().safe(),
    workspaceId: exactIdSchema,
    installationId: exactIdSchema,
    policyVersion: z.number().int().positive().safe(),
    members: z.array(teamMemberSchema).max(MAX_MEMBERS),
    sessions: z.array(teamSessionSchema).max(MAX_SESSIONS),
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

type TeamPayload = z.infer<typeof payloadSchema>;
type TeamEnvelope = z.infer<typeof envelopeSchema>;
type TeamMemberRecord = z.infer<typeof teamMemberSchema>;
type TeamSessionRecord = z.infer<typeof teamSessionSchema>;
type InvitationRecord = z.infer<typeof invitationSchema>;
type KeyState = "old" | "new";

export type TeamIdentityActor = Readonly<{
  personId: string;
  workspaceMemberId: string;
  deviceId: string;
  role: z.infer<typeof roleSchema>;
  permissions: readonly Phase2Action[] | null;
  policyVersion: number;
  revocationEpoch: number;
}>;

export type AcceptTeamInvitationInput = Readonly<{
  token: string;
  requestId: string;
  displayName: string;
  loginId: string;
  pin: string;
}>;

export type TeamSessionGrant = Readonly<{
  sessionId: string;
  actor: TeamIdentityActor;
  displayName: string;
  loginId: string;
  invitationId: string;
  replayed: boolean;
}>;

export type TeamDirectoryMemberView = Readonly<{
  personId: string;
  memberId: string;
  deviceId: string;
  invitationId: string;
  displayName: string;
  loginId: string;
  role: z.infer<typeof roleSchema>;
  permissions: readonly Phase2Action[] | null;
  shopIds: readonly string[];
  policyVersion: number;
  revocationEpoch: number;
  createdAt: string;
  revokedAt: string | null;
}>;

export type TeamDirectoryRotationResult = Readonly<{
  state: "absent" | "verified" | "reauthenticated" | "already-new";
  authorityKeyState: KeyState | null;
  markerKeyState: KeyState | "missing" | null;
}>;

let processQueue: Promise<void> = Promise.resolve();

function teamError(
  message: string,
  code = "TEAM_DIRECTORY_UNAVAILABLE",
  statusCode = 503,
): SahelFlowError {
  return new SahelFlowError(message, code, statusCode);
}

function systemDirectory(): string {
  return join(dataRoot(), "system");
}

export function teamDirectoryPath(): string {
  return join(systemDirectory(), FILE_NAME);
}

export function teamDirectoryMarkerPath(): string {
  return join(systemDirectory(), MARKER_FILE_NAME);
}

function teamDirectoryLockPath(): string {
  return join(systemDirectory(), LOCK_FILE_NAME);
}

function randomId(): string {
  return randomBytes(16).toString("hex");
}

function randomSessionId(): string {
  return randomBytes(24).toString("base64url");
}

function assertRootKey(key: Buffer, label: string): void {
  if (!Buffer.isBuffer(key) || key.length !== ROOT_KEY_BYTES) {
    throw teamError(`${label} must be a 256-bit installation root`);
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
  throw teamError("Team directory contains unsupported canonical data");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function deriveMacKey(context: string, rootKey: Buffer): Buffer {
  assertRootKey(rootKey, "Authority root key");
  return createHmac("sha256", rootKey).update(context, "utf8").digest();
}

function macFor(
  context: string,
  label: string,
  payload: unknown,
  rootKey: Buffer = getMasterKey(),
): string {
  const derived = deriveMacKey(context, rootKey);
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
  context: string,
  label: string,
  payload: unknown,
  supplied: string,
  rootKey: Buffer = getMasterKey(),
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const expected = Buffer.from(macFor(context, label, payload, rootKey), "hex");
  const actual = Buffer.from(supplied, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function createEnvelope(
  payload: TeamPayload,
  rootKey: Buffer = getMasterKey(),
): TeamEnvelope {
  return {
    formatVersion: FORMAT_VERSION,
    keyId: KEY_ID,
    payload,
    mac: macFor("sahelflow.team-directory.key.v1", "authority", payload, rootKey),
  };
}

function createMarker(
  workspaceId: string,
  installationId: string,
  rootKey: Buffer = getMasterKey(),
): z.infer<typeof markerEnvelopeSchema> {
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
    mac: macFor("sahelflow.team-directory.key.v1", "marker", payload, rootKey),
  };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw teamError(`Authority file '${path}' is unreadable`);
  }
}

function validatePayload(payload: TeamPayload): void {
  const unique = (values: readonly string[], label: string): void => {
    if (new Set(values).size !== values.length) {
      throw teamError(`Team directory contains duplicate ${label}`);
    }
  };
  unique(payload.members.map((member) => member.personId), "person IDs");
  unique(payload.members.map((member) => member.memberId), "member IDs");
  unique(payload.members.map((member) => member.deviceId), "device IDs");
  unique(payload.members.map((member) => member.invitationId), "invitation IDs");
  unique(payload.members.map((member) => member.loginId), "login IDs");
  unique(payload.sessions.map((session) => session.sessionId), "session IDs");

  const memberIds = new Set(payload.members.map((member) => member.memberId));
  const deviceIds = new Set(payload.members.map((member) => member.deviceId));
  for (const session of payload.sessions) {
    if (!memberIds.has(session.memberId) || !deviceIds.has(session.deviceId)) {
      throw teamError("Team session references missing member authority");
    }
  }
}

function parseTeamEnvelope(): TeamEnvelope | null {
  if (!existsSync(teamDirectoryPath())) return null;
  const envelope = envelopeSchema.parse(readJson(teamDirectoryPath()));
  validatePayload(envelope.payload);
  return envelope;
}

function parseTeamMarker(): z.infer<typeof markerEnvelopeSchema> | null {
  if (!existsSync(teamDirectoryMarkerPath())) return null;
  return markerEnvelopeSchema.parse(readJson(teamDirectoryMarkerPath()));
}

function readTeam(rootKey: Buffer = getMasterKey()): TeamEnvelope | null {
  const envelope = parseTeamEnvelope();
  if (!envelope) return null;
  if (
    !macMatches(
      "sahelflow.team-directory.key.v1",
      "authority",
      envelope.payload,
      envelope.mac,
      rootKey,
    )
  ) {
    throw teamError("Team directory authentication failed");
  }
  return envelope;
}

function readTeamMarker(rootKey: Buffer = getMasterKey()) {
  const marker = parseTeamMarker();
  if (!marker) return null;
  if (
    !macMatches(
      "sahelflow.team-directory.key.v1",
      "marker",
      marker.payload,
      marker.mac,
      rootKey,
    )
  ) {
    throw teamError("Team directory marker authentication failed");
  }
  return marker;
}

function assertContext(
  payload: Pick<TeamPayload, "workspaceId" | "installationId">,
  shop: ShopContext,
): void {
  if (
    payload.workspaceId !== shop.workspaceId ||
    payload.installationId !== shop.installationId
  ) {
    throw teamError(
      "Team directory does not match the process authority",
      "TEAM_DIRECTORY_CONTEXT_MISMATCH",
      409,
    );
  }
}

function assertMarker(
  marker: ReturnType<typeof readTeamMarker>,
  payload: TeamPayload,
  shop: ShopContext,
): void {
  if (
    marker &&
    (marker.payload.workspaceId !== payload.workspaceId ||
      marker.payload.installationId !== payload.installationId ||
      marker.payload.workspaceId !== shop.workspaceId ||
      marker.payload.installationId !== shop.installationId)
  ) {
    throw teamError("Team directory marker belongs to another installation");
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
  const path = teamDirectoryLockPath();
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
  throw teamError("Team directory is busy; retry the operation");
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
      if (existsSync(teamDirectoryLockPath())) unlinkSync(teamDirectoryLockPath());
    } catch {
      // A later operation can recover a stale lock.
    }
    releaseQueue();
  }
}

function initialPayload(shop: ShopContext): TeamPayload {
  return {
    formatVersion: FORMAT_VERSION,
    revision: 1,
    workspaceId: shop.workspaceId,
    installationId: shop.installationId,
    policyVersion: 1,
    members: [],
    sessions: [],
  };
}

function memberActor(
  payload: TeamPayload,
  member: TeamMemberRecord,
): TeamIdentityActor {
  return Object.freeze({
    personId: member.personId,
    workspaceMemberId: member.memberId,
    deviceId: member.deviceId,
    role: member.role,
    permissions: member.permissions
      ? Object.freeze([...member.permissions])
      : null,
    policyVersion: payload.policyVersion,
    revocationEpoch: member.revocationEpoch,
  });
}

function memberView(member: TeamMemberRecord): TeamDirectoryMemberView {
  return Object.freeze({
    personId: member.personId,
    memberId: member.memberId,
    deviceId: member.deviceId,
    invitationId: member.invitationId,
    displayName: member.displayName,
    loginId: member.loginId,
    role: member.role,
    permissions: member.permissions
      ? Object.freeze([...member.permissions])
      : null,
    shopIds: Object.freeze([...member.shopIds]),
    policyVersion: member.policyVersion,
    revocationEpoch: member.revocationEpoch,
    createdAt: member.createdAt,
    revokedAt: member.revokedAt,
  });
}

function parseInvitationToken(token: string): {
  invitationId: string;
  secret: string;
} {
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== TOKEN_PREFIX ||
    !/^[0-9a-f]{32}$/i.test(parts[1] ?? "") ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[2] ?? "")
  ) {
    throw teamError("Invitation is invalid or unavailable", "INVITATION_INVALID", 400);
  }
  return { invitationId: parts[1]!, secret: parts[2]! };
}

function secretMatches(secret: string, digest: string): boolean {
  const expected = Buffer.from(digest, "hex");
  const actual = Buffer.from(
    createHash("sha256").update(secret, "utf8").digest("hex"),
    "hex",
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function readInvitation(
  token: string,
  shop: ShopContext,
  rootKey: Buffer = getMasterKey(),
): InvitationRecord {
  const { invitationId, secret } = parseInvitationToken(token);
  if (!existsSync(memberAuthorityPath())) {
    throw teamError("Invitation is invalid or unavailable", "INVITATION_INVALID", 400);
  }
  const envelope = invitationEnvelopeSchema.parse(readJson(memberAuthorityPath()));
  if (
    !macMatches(
      "sahelflow.member-authority.key.v1",
      "authority",
      envelope.payload,
      envelope.mac,
      rootKey,
    ) ||
    envelope.payload.workspaceId !== shop.workspaceId ||
    envelope.payload.installationId !== shop.installationId
  ) {
    throw teamError("Invitation authority is unavailable");
  }
  const invitation = envelope.payload.invitations.find(
    (candidate) => candidate.id === invitationId,
  );
  if (
    !invitation ||
    !secretMatches(secret, invitation.secretDigest) ||
    invitation.revokedAt ||
    invitation.acceptedAt ||
    new Date(invitation.expiresAt).getTime() <= Date.now()
  ) {
    throw teamError("Invitation is invalid or unavailable", "INVITATION_INVALID", 400);
  }
  return invitation;
}

function normalizePermissions(
  role: z.infer<typeof roleSchema>,
  permissions: readonly Phase2Action[] | null,
): readonly Phase2Action[] | null {
  if (permissions === null) return null;
  return resolvePhase2Permissions(role, JSON.stringify(permissions));
}

export async function acceptTeamInvitation(
  input: AcceptTeamInvitationInput,
  shop: ShopContext,
): Promise<TeamSessionGrant> {
  const requestId = requestIdSchema.parse(input.requestId);
  const displayName = displayNameSchema.parse(input.displayName);
  const loginId = loginIdSchema.parse(input.loginId);
  const pin = pinSchema.parse(input.pin);
  const invitation = readInvitation(input.token, shop);
  const permissions = normalizePermissions(invitation.role, invitation.permissions);
  const shopIds = [...new Set(invitation.shopIds)].sort();

  return withLock(async () => {
    // Re-verify the invitation after waiting for the directory lock.
    readInvitation(input.token, shop);
    const marker = readTeamMarker();
    const existingEnvelope = readTeam();
    const payload = existingEnvelope
      ? (structuredClone(existingEnvelope.payload) as TeamPayload)
      : initialPayload(shop);
    assertContext(payload, shop);
    assertMarker(marker, payload, shop);

    const existing = payload.members.find(
      (member) => member.invitationId === invitation.id,
    );
    if (existing) {
      const sameRequest = existing.acceptanceRequestId === requestId;
      const sameProfile =
        existing.displayName === displayName && existing.loginId === loginId;
      const samePin = await verifyPin(pin, existing.pinHash);
      if (!sameRequest || !sameProfile || !samePin) {
        throw teamError(
          "Invitation acceptance is already bound to different input",
          "INVITATION_ACCEPTANCE_CONFLICT",
          409,
        );
      }
      const session = payload.sessions.find(
        (candidate) => candidate.memberId === existing.memberId,
      );
      if (!session || session.revokedAt) {
        throw teamError(
          "The accepted member session requires recovery",
          "MEMBER_SESSION_RECOVERY_REQUIRED",
          409,
        );
      }
      return Object.freeze({
        sessionId: session.sessionId,
        actor: memberActor(payload, existing),
        displayName: existing.displayName,
        loginId: existing.loginId,
        invitationId: existing.invitationId,
        replayed: true,
      });
    }

    if (payload.members.length >= MAX_MEMBERS) {
      throw teamError(
        "The installation member limit has been reached",
        "MEMBER_LIMIT_REACHED",
        409,
      );
    }
    if (payload.members.some((member) => member.loginId === loginId)) {
      throw teamError("This login ID is already in use", "MEMBER_LOGIN_CONFLICT", 409);
    }

    const now = new Date().toISOString();
    const member: TeamMemberRecord = {
      personId: randomId(),
      memberId: randomId(),
      deviceId: randomId(),
      invitationId: invitation.id,
      acceptanceRequestId: requestId,
      displayName,
      loginId,
      pinHash: await hashPin(pin),
      role: invitation.role,
      permissions: permissions ? [...permissions] : null,
      shopIds,
      policyVersion: payload.policyVersion,
      revocationEpoch: 0,
      createdAt: now,
      revokedAt: null,
    };
    const session: TeamSessionRecord = {
      sessionId: randomSessionId(),
      memberId: member.memberId,
      deviceId: member.deviceId,
      policyVersion: payload.policyVersion,
      memberRevocationEpoch: member.revocationEpoch,
      issuedAt: now,
      revokedAt: null,
    };
    payload.members.push(member);
    payload.sessions.push(session);
    payload.revision += 1;
    atomicWrite(teamDirectoryPath(), createEnvelope(payload));
    if (!marker) {
      atomicWrite(
        teamDirectoryMarkerPath(),
        createMarker(shop.workspaceId, shop.installationId),
      );
    }
    return Object.freeze({
      sessionId: session.sessionId,
      actor: memberActor(payload, member),
      displayName,
      loginId,
      invitationId: invitation.id,
      replayed: false,
    });
  });
}

export async function createTeamLoginSession(
  loginIdInput: string,
  pinInput: string,
  shop: ShopContext,
): Promise<TeamSessionGrant | null> {
  const loginId = loginIdSchema.parse(loginIdInput);
  const pin = pinSchema.parse(pinInput);
  return withLock(async () => {
    const marker = readTeamMarker();
    const envelope = readTeam();
    if (!envelope) {
      if (marker) throw teamError("Team directory is missing after initialization");
      return null;
    }
    const payload = structuredClone(envelope.payload) as TeamPayload;
    assertContext(payload, shop);
    assertMarker(marker, payload, shop);
    const member = payload.members.find(
      (candidate) => candidate.loginId === loginId && candidate.revokedAt === null,
    );
    if (!member) return null;
    const result = await verifyPinDetailed(pin, member.pinHash);
    if (!result.valid) return null;
    if (result.needsRehash) {
      member.pinHash = await hashPin(pin, CURRENT_PBKDF2_ITERATIONS);
    }
    const now = new Date().toISOString();
    const session: TeamSessionRecord = {
      sessionId: randomSessionId(),
      memberId: member.memberId,
      deviceId: member.deviceId,
      policyVersion: payload.policyVersion,
      memberRevocationEpoch: member.revocationEpoch,
      issuedAt: now,
      revokedAt: null,
    };
    payload.sessions.push(session);
    if (payload.sessions.length > MAX_SESSIONS) {
      payload.sessions = payload.sessions.slice(-MAX_SESSIONS);
    }
    payload.revision += 1;
    atomicWrite(teamDirectoryPath(), createEnvelope(payload));
    return Object.freeze({
      sessionId: session.sessionId,
      actor: memberActor(payload, member),
      displayName: member.displayName,
      loginId: member.loginId,
      invitationId: member.invitationId,
      replayed: false,
    });
  });
}

export async function resolveTeamIdentityActor(
  sessionId: string,
  shop: ShopContext,
): Promise<TeamIdentityActor | null> {
  sessionIdSchema.parse(sessionId);
  const marker = readTeamMarker();
  const envelope = readTeam();
  if (!envelope) {
    if (marker) throw teamError("Team directory is missing after initialization");
    return null;
  }
  const payload = envelope.payload;
  assertContext(payload, shop);
  assertMarker(marker, payload, shop);
  const session = payload.sessions.find(
    (candidate) => candidate.sessionId === sessionId && candidate.revokedAt === null,
  );
  if (!session) return null;
  const member = payload.members.find(
    (candidate) => candidate.memberId === session.memberId,
  );
  if (!member || member.revokedAt) return null;
  if (!member.shopIds.includes(shop.shopId)) {
    throw teamError(
      "The current member is not authorized for this shop",
      "IDENTITY_SHOP_FORBIDDEN",
      403,
    );
  }
  if (
    session.policyVersion !== payload.policyVersion ||
    session.policyVersion !== member.policyVersion ||
    session.memberRevocationEpoch !== member.revocationEpoch
  ) {
    throw teamError(
      "The team session is stale and must be reauthenticated",
      "IDENTITY_POLICY_STALE",
      403,
    );
  }
  return memberActor(payload, member);
}

export async function listTeamMembers(
  shop: ShopContext,
): Promise<readonly TeamDirectoryMemberView[]> {
  const marker = readTeamMarker();
  const envelope = readTeam();
  if (!envelope) {
    if (marker) throw teamError("Team directory is missing after initialization");
    return Object.freeze([]);
  }
  assertContext(envelope.payload, shop);
  assertMarker(marker, envelope.payload, shop);
  return Object.freeze(envelope.payload.members.map(memberView));
}

export async function acceptedInvitationIds(
  shop: ShopContext,
): Promise<ReadonlySet<string>> {
  const members = await listTeamMembers(shop);
  return new Set(members.map((member) => member.invitationId));
}

function keyStateForMac(
  context: string,
  label: string,
  payload: unknown,
  supplied: string,
  oldKey: Buffer,
  newKey: Buffer,
): KeyState {
  if (macMatches(context, label, payload, supplied, newKey)) return "new";
  if (macMatches(context, label, payload, supplied, oldKey)) return "old";
  throw teamError(`Team ${label} authentication failed under both rotation roots`);
}

export function rotateTeamDirectoryAuthentication(
  oldKey: Buffer,
  newKey: Buffer,
  dryRun = false,
): TeamDirectoryRotationResult {
  assertRootKey(oldKey, "Current team directory root key");
  assertRootKey(newKey, "Candidate team directory root key");
  if (timingSafeEqual(oldKey, newKey)) {
    throw teamError("Team directory rotation roots must differ");
  }
  const authority = parseTeamEnvelope();
  const marker = parseTeamMarker();
  if (!authority && !marker) {
    return { state: "absent", authorityKeyState: null, markerKeyState: null };
  }
  if (!authority && marker) {
    throw teamError("Team directory marker exists without authority");
  }
  const required = authority!;
  const authorityKeyState = keyStateForMac(
    "sahelflow.team-directory.key.v1",
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
      throw teamError("Team directory marker does not match its payload");
    }
    markerKeyState = keyStateForMac(
      "sahelflow.team-directory.key.v1",
      "marker",
      marker.payload,
      marker.mac,
      oldKey,
      newKey,
    );
  }
  if (dryRun) return { state: "verified", authorityKeyState, markerKeyState };

  let rewritten = false;
  if (authorityKeyState === "old") {
    atomicWrite(teamDirectoryPath(), createEnvelope(required.payload, newKey));
    rewritten = true;
  }
  if (markerKeyState !== "new") {
    atomicWrite(
      teamDirectoryMarkerPath(),
      createMarker(required.payload.workspaceId, required.payload.installationId, newKey),
    );
    rewritten = true;
  }
  return {
    state: rewritten ? "reauthenticated" : "already-new",
    authorityKeyState,
    markerKeyState,
  };
}

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
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";

import { getMasterKey } from "@/lib/crypto/master-key";
import type { ShopContext } from "@/lib/shops/context";
import { dataRoot } from "@/lib/storage/data-root";
import { SahelFlowError } from "@/types/errors";
import { getIdentityAdministrationSnapshot } from "./control-authority";
import {
  listTeamMembers,
  type TeamIdentityActor,
} from "./team-directory";

const FORMAT_VERSION = 1 as const;
const KEY_ID = "installation-root-team-revocation-v1" as const;
const FILE_NAME = "team-revocation.json";
const MARKER_FILE_NAME = "team-revocation.initialized.json";
const LOCK_FILE_NAME = "team-revocation.lock";
const ROOT_KEY_BYTES = 32;
const MAX_SESSION_RECORDS = 4_000;
const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 10;

const exactIdSchema = z.string().regex(/^[0-9a-f]{32}$/i);
const sessionIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value === value.trim(), "Session ID must be exact");
const isoDateSchema = z.string().datetime({ offset: true });

const sessionRecordSchema = z
  .object({
    sessionId: sessionIdSchema,
    memberId: exactIdSchema,
    personId: exactIdSchema,
    deviceId: exactIdSchema,
    registeredAt: isoDateSchema,
    revokedAt: isoDateSchema.nullable(),
  })
  .strict();

const memberRevocationSchema = z
  .object({
    memberId: exactIdSchema,
    personId: exactIdSchema,
    deviceId: exactIdSchema,
    revokedAt: isoDateSchema,
    revokedByMemberId: exactIdSchema,
  })
  .strict();

const payloadSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    revision: z.number().int().positive().safe(),
    workspaceId: exactIdSchema,
    installationId: exactIdSchema,
    sessions: z.array(sessionRecordSchema).max(MAX_SESSION_RECORDS),
    memberRevocations: z.array(memberRevocationSchema),
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

type Payload = z.infer<typeof payloadSchema>;
type Envelope = z.infer<typeof envelopeSchema>;
type SessionRecord = z.infer<typeof sessionRecordSchema>;
type MemberRevocation = z.infer<typeof memberRevocationSchema>;
type KeyState = "old" | "new";

export type TeamRevocationSnapshot = Readonly<{
  revision: number;
  sessions: readonly Readonly<SessionRecord>[];
  memberRevocations: readonly Readonly<MemberRevocation>[];
}>;

export type RevokeTeamMemberAuthorityResult = Readonly<{
  state: "revoked" | "already-revoked";
  memberId: string;
  personId: string;
  deviceId: string;
  revokedAt: string;
  revision: number;
  sessionIds: readonly string[];
}>;

export type TeamRevocationRotationResult = Readonly<{
  state: "absent" | "verified" | "reauthenticated" | "already-new";
  authorityKeyState: KeyState | null;
  markerKeyState: KeyState | "missing" | null;
}>;

let processQueue: Promise<void> = Promise.resolve();

function revocationError(
  message: string,
  code = "TEAM_REVOCATION_AUTHORITY_UNAVAILABLE",
  statusCode = 503,
): SahelFlowError {
  return new SahelFlowError(message, code, statusCode);
}

function systemDirectory(): string {
  return join(dataRoot(), "system");
}

export function teamRevocationAuthorityPath(): string {
  return join(systemDirectory(), FILE_NAME);
}

export function teamRevocationMarkerPath(): string {
  return join(systemDirectory(), MARKER_FILE_NAME);
}

function lockPath(): string {
  return join(systemDirectory(), LOCK_FILE_NAME);
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
  throw revocationError("Revocation authority contains unsupported data");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function assertRootKey(key: Buffer, label: string): void {
  if (!Buffer.isBuffer(key) || key.length !== ROOT_KEY_BYTES) {
    throw revocationError(`${label} must be a 256-bit installation root`);
  }
}

function macFor(
  label: "authority" | "marker",
  payload: unknown,
  rootKey: Buffer = getMasterKey(),
): string {
  assertRootKey(rootKey, "Revocation authority root key");
  const derived = createHmac("sha256", rootKey)
    .update("sahelflow.team-revocation.key.v1", "utf8")
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
  label: "authority" | "marker",
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
  payload: Payload,
  rootKey: Buffer = getMasterKey(),
): Envelope {
  return {
    formatVersion: FORMAT_VERSION,
    keyId: KEY_ID,
    payload,
    mac: macFor("authority", payload, rootKey),
  };
}

function createMarker(
  shop: ShopContext,
  rootKey: Buffer = getMasterKey(),
): z.infer<typeof markerEnvelopeSchema> {
  const payload = {
    formatVersion: FORMAT_VERSION,
    workspaceId: shop.workspaceId,
    installationId: shop.installationId,
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
    throw revocationError(`Authority file '${path}' is unreadable`);
  }
}

function validatePayload(payload: Payload): void {
  const sessionIds = payload.sessions.map((session) => session.sessionId);
  if (new Set(sessionIds).size !== sessionIds.length) {
    throw revocationError("Revocation authority contains duplicate sessions");
  }
  const memberIds = payload.memberRevocations.map((entry) => entry.memberId);
  if (new Set(memberIds).size !== memberIds.length) {
    throw revocationError("Revocation authority contains duplicate members");
  }
}

function parseEnvelope(): Envelope | null {
  if (!existsSync(teamRevocationAuthorityPath())) return null;
  const envelope = envelopeSchema.parse(readJson(teamRevocationAuthorityPath()));
  validatePayload(envelope.payload);
  return envelope;
}

function parseMarker(): z.infer<typeof markerEnvelopeSchema> | null {
  if (!existsSync(teamRevocationMarkerPath())) return null;
  return markerEnvelopeSchema.parse(readJson(teamRevocationMarkerPath()));
}

function readEnvelope(rootKey: Buffer = getMasterKey()): Envelope | null {
  const envelope = parseEnvelope();
  if (!envelope) return null;
  if (!macMatches("authority", envelope.payload, envelope.mac, rootKey)) {
    throw revocationError("Team revocation authority authentication failed");
  }
  return envelope;
}

function readMarker(rootKey: Buffer = getMasterKey()) {
  const marker = parseMarker();
  if (!marker) return null;
  if (!macMatches("marker", marker.payload, marker.mac, rootKey)) {
    throw revocationError("Team revocation marker authentication failed");
  }
  return marker;
}

function assertContext(
  payload: Pick<Payload, "workspaceId" | "installationId">,
  shop: ShopContext,
): void {
  if (
    payload.workspaceId !== shop.workspaceId ||
    payload.installationId !== shop.installationId
  ) {
    throw revocationError(
      "Team revocation authority does not match the process installation",
      "TEAM_REVOCATION_CONTEXT_MISMATCH",
      409,
    );
  }
}

function assertMarker(
  marker: ReturnType<typeof readMarker>,
  payload: Payload,
  shop: ShopContext,
): void {
  if (
    marker &&
    (marker.payload.workspaceId !== payload.workspaceId ||
      marker.payload.installationId !== payload.installationId ||
      marker.payload.workspaceId !== shop.workspaceId ||
      marker.payload.installationId !== shop.installationId)
  ) {
    throw revocationError("Team revocation marker belongs to another installation");
  }
}

function initialPayload(shop: ShopContext): Payload {
  return {
    formatVersion: FORMAT_VERSION,
    revision: 1,
    workspaceId: shop.workspaceId,
    installationId: shop.installationId,
    sessions: [],
    memberRevocations: [],
  };
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
  const startedAt = Date.now();
  while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
    try {
      const descriptor = openSync(lockPath(), "wx", 0o600);
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
        if (Date.now() - statSync(lockPath()).mtimeMs > LOCK_STALE_MS) {
          unlinkSync(lockPath());
          continue;
        }
      } catch {
        continue;
      }
      await delay(LOCK_RETRY_MS);
    }
  }
  throw revocationError("Team revocation authority is busy; retry the operation");
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
      if (existsSync(lockPath())) unlinkSync(lockPath());
    } catch {
      // A later operation can recover a stale lock.
    }
    releaseQueue();
  }
}

function snapshot(payload: Payload): TeamRevocationSnapshot {
  return Object.freeze({
    revision: payload.revision,
    sessions: Object.freeze(payload.sessions.map((entry) => Object.freeze({ ...entry }))),
    memberRevocations: Object.freeze(
      payload.memberRevocations.map((entry) => Object.freeze({ ...entry })),
    ),
  });
}

export async function getTeamRevocationSnapshot(
  shop: ShopContext,
): Promise<TeamRevocationSnapshot> {
  const marker = readMarker();
  const envelope = readEnvelope();
  if (!envelope) {
    if (marker) {
      throw revocationError("Team revocation authority is missing after initialization");
    }
    return snapshot(initialPayload(shop));
  }
  assertContext(envelope.payload, shop);
  assertMarker(marker, envelope.payload, shop);
  return snapshot(envelope.payload);
}

export async function assertTeamMemberActive(
  memberId: string,
  shop: ShopContext,
): Promise<void> {
  exactIdSchema.parse(memberId);
  const authority = await getTeamRevocationSnapshot(shop);
  if (authority.memberRevocations.some((entry) => entry.memberId === memberId)) {
    throw revocationError(
      "This member has been revoked",
      "IDENTITY_MEMBER_REVOKED",
      401,
    );
  }
}

export async function registerTeamSessionAuthority(input: {
  sessionId: string;
  actor: TeamIdentityActor;
  shop: ShopContext;
}): Promise<Readonly<SessionRecord>> {
  sessionIdSchema.parse(input.sessionId);
  exactIdSchema.parse(input.actor.workspaceMemberId);
  return withLock(async () => {
    const marker = readMarker();
    const envelope = readEnvelope();
    const payload = envelope
      ? (structuredClone(envelope.payload) as Payload)
      : initialPayload(input.shop);
    assertContext(payload, input.shop);
    assertMarker(marker, payload, input.shop);

    if (
      payload.memberRevocations.some(
        (entry) => entry.memberId === input.actor.workspaceMemberId,
      )
    ) {
      throw revocationError(
        "This member has been revoked",
        "IDENTITY_MEMBER_REVOKED",
        401,
      );
    }

    const existing = payload.sessions.find(
      (session) => session.sessionId === input.sessionId,
    );
    if (existing) {
      if (
        existing.memberId !== input.actor.workspaceMemberId ||
        existing.personId !== input.actor.personId ||
        existing.deviceId !== input.actor.deviceId
      ) {
        throw revocationError(
          "Team session identity conflicts with existing authority",
          "TEAM_SESSION_IDENTITY_CONFLICT",
          409,
        );
      }
      return Object.freeze({ ...existing });
    }

    const record: SessionRecord = {
      sessionId: input.sessionId,
      memberId: input.actor.workspaceMemberId,
      personId: input.actor.personId,
      deviceId: input.actor.deviceId,
      registeredAt: new Date().toISOString(),
      revokedAt: null,
    };
    payload.sessions.push(record);
    if (payload.sessions.length > MAX_SESSION_RECORDS) {
      payload.sessions = payload.sessions.slice(-MAX_SESSION_RECORDS);
    }
    payload.revision += 1;
    atomicWrite(teamRevocationAuthorityPath(), createEnvelope(payload));
    if (!marker) atomicWrite(teamRevocationMarkerPath(), createMarker(input.shop));
    return Object.freeze({ ...record });
  });
}

export async function revokeTeamMemberAuthority(input: {
  currentOwnerSessionId: string;
  targetMemberId: string;
  shop: ShopContext;
}): Promise<RevokeTeamMemberAuthorityResult> {
  exactIdSchema.parse(input.targetMemberId);
  const owner = await getIdentityAdministrationSnapshot(
    input.currentOwnerSessionId,
    input.shop,
  );
  if (owner.currentActor.role !== "owner") {
    throw revocationError(
      "Only the workspace owner may revoke a member",
      "ACTION_FORBIDDEN",
      403,
    );
  }

  const target = (await listTeamMembers(input.shop)).find(
    (member) => member.memberId === input.targetMemberId,
  );
  if (!target) {
    throw revocationError("Team member not found", "TEAM_MEMBER_NOT_FOUND", 404);
  }

  return withLock(async () => {
    const marker = readMarker();
    const envelope = readEnvelope();
    const payload = envelope
      ? (structuredClone(envelope.payload) as Payload)
      : initialPayload(input.shop);
    assertContext(payload, input.shop);
    assertMarker(marker, payload, input.shop);

    const existing = payload.memberRevocations.find(
      (entry) => entry.memberId === target.memberId,
    );
    if (existing) {
      return Object.freeze({
        state: "already-revoked" as const,
        memberId: existing.memberId,
        personId: existing.personId,
        deviceId: existing.deviceId,
        revokedAt: existing.revokedAt,
        revision: payload.revision,
        sessionIds: Object.freeze(
          payload.sessions
            .filter((session) => session.memberId === existing.memberId)
            .map((session) => session.sessionId),
        ),
      });
    }

    const revokedAt = new Date().toISOString();
    payload.memberRevocations.push({
      memberId: target.memberId,
      personId: target.personId,
      deviceId: target.deviceId,
      revokedAt,
      revokedByMemberId: owner.currentActor.workspaceMemberId,
    });
    const sessionIds: string[] = [];
    for (const session of payload.sessions) {
      if (session.memberId !== target.memberId) continue;
      sessionIds.push(session.sessionId);
      if (!session.revokedAt) session.revokedAt = revokedAt;
    }
    payload.revision += 1;
    atomicWrite(teamRevocationAuthorityPath(), createEnvelope(payload));
    if (!marker) atomicWrite(teamRevocationMarkerPath(), createMarker(input.shop));

    return Object.freeze({
      state: "revoked" as const,
      memberId: target.memberId,
      personId: target.personId,
      deviceId: target.deviceId,
      revokedAt,
      revision: payload.revision,
      sessionIds: Object.freeze(sessionIds),
    });
  });
}

function keyStateForMac(
  label: "authority" | "marker",
  payload: unknown,
  supplied: string,
  oldKey: Buffer,
  newKey: Buffer,
): KeyState {
  if (macMatches(label, payload, supplied, newKey)) return "new";
  if (macMatches(label, payload, supplied, oldKey)) return "old";
  throw revocationError(`Team revocation ${label} failed under both rotation roots`);
}

export function rotateTeamRevocationAuthentication(
  oldKey: Buffer,
  newKey: Buffer,
  dryRun = false,
): TeamRevocationRotationResult {
  assertRootKey(oldKey, "Current team revocation root key");
  assertRootKey(newKey, "Candidate team revocation root key");
  if (timingSafeEqual(oldKey, newKey)) {
    throw revocationError("Team revocation rotation roots must differ");
  }

  const authority = parseEnvelope();
  const marker = parseMarker();
  if (!authority && !marker) {
    return { state: "absent", authorityKeyState: null, markerKeyState: null };
  }
  if (!authority && marker) {
    throw revocationError("Team revocation marker exists without authority");
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
      throw revocationError("Team revocation marker does not match its payload");
    }
    markerKeyState = keyStateForMac(
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
    atomicWrite(teamRevocationAuthorityPath(), createEnvelope(required.payload, newKey));
    rewritten = true;
  }
  if (markerKeyState !== "new") {
    atomicWrite(
      teamRevocationMarkerPath(),
      createMarker(
        {
          workspaceId: required.payload.workspaceId,
          installationId: required.payload.installationId,
          shopId: "rotation",
          shopIncarnationId: "0".repeat(32),
          registryRevision: 0,
          databaseFileId: "rotation.db",
          migrationSetSha256: "0".repeat(64),
        },
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

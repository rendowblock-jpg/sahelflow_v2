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

const AUTHORITY_FORMAT_VERSION = 1 as const;
const AUTHORITY_KEY_ID = "installation-root-hmac-v1" as const;
const AUTHORITY_FILE_NAME = "identity-authority.json";
const MARKER_FILE_NAME = "identity-authority.initialized.json";
const LOCK_FILE_NAME = "identity-authority.lock";
const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 10;
const MAX_SESSION_BINDINGS = 1_000;
const ROOT_KEY_BYTES = 32;

const exactIdSchema = z.string().regex(/^[0-9a-f]{32}$/i);
const exactSessionIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value === value.trim(), "Session ID must be exact");
const isoDateSchema = z.string().datetime({ offset: true });
const roleSchema = z.enum(["owner", "manager", "operator", "viewer"]);
const activeStatusSchema = z.literal("active");

const workspaceSchema = z
  .object({
    id: exactIdSchema,
    status: activeStatusSchema,
    policyVersion: z.number().int().positive().safe(),
    revocationEpoch: z.number().int().nonnegative().safe(),
  })
  .strict();

const installationSchema = z
  .object({
    id: exactIdSchema,
    workspaceId: exactIdSchema,
    status: activeStatusSchema,
    revocationEpoch: z.number().int().nonnegative().safe(),
    enrolledAt: isoDateSchema,
  })
  .strict();

const personSchema = z
  .object({
    id: exactIdSchema,
    status: activeStatusSchema,
    revocationEpoch: z.number().int().nonnegative().safe(),
    createdAt: isoDateSchema,
  })
  .strict();

const memberSchema = z
  .object({
    id: exactIdSchema,
    personId: exactIdSchema,
    workspaceId: exactIdSchema,
    role: roleSchema,
    status: activeStatusSchema,
    policyVersion: z.number().int().positive().safe(),
    revocationEpoch: z.number().int().nonnegative().safe(),
    shopIds: z.array(z.string().trim().min(1).max(200)).min(1),
    createdAt: isoDateSchema,
  })
  .strict();

const deviceSchema = z
  .object({
    id: exactIdSchema,
    installationId: exactIdSchema,
    workspaceId: exactIdSchema,
    status: activeStatusSchema,
    revocationEpoch: z.number().int().nonnegative().safe(),
    enrolledAt: isoDateSchema,
    lastSeenAt: isoDateSchema,
  })
  .strict();

const sessionBindingSchema = z
  .object({
    sessionId: exactSessionIdSchema,
    personId: exactIdSchema,
    workspaceMemberId: exactIdSchema,
    deviceId: exactIdSchema,
    workspaceId: exactIdSchema,
    installationId: exactIdSchema,
    policyVersion: z.number().int().positive().safe(),
    workspaceRevocationEpoch: z.number().int().nonnegative().safe(),
    personRevocationEpoch: z.number().int().nonnegative().safe(),
    memberRevocationEpoch: z.number().int().nonnegative().safe(),
    deviceRevocationEpoch: z.number().int().nonnegative().safe(),
    boundAt: isoDateSchema,
    revokedAt: isoDateSchema.nullable(),
  })
  .strict();

const payloadSchema = z
  .object({
    formatVersion: z.literal(AUTHORITY_FORMAT_VERSION),
    revision: z.number().int().positive().safe(),
    workspace: workspaceSchema,
    installation: installationSchema,
    people: z.array(personSchema).min(1),
    members: z.array(memberSchema).min(1),
    devices: z.array(deviceSchema).min(1),
    sessionBindings: z.array(sessionBindingSchema).max(MAX_SESSION_BINDINGS),
  })
  .strict();

const envelopeSchema = z
  .object({
    formatVersion: z.literal(AUTHORITY_FORMAT_VERSION),
    keyId: z.literal(AUTHORITY_KEY_ID),
    payload: payloadSchema,
    mac: z.string().regex(/^[0-9a-f]{64}$/i),
  })
  .strict();

const markerPayloadSchema = z
  .object({
    formatVersion: z.literal(AUTHORITY_FORMAT_VERSION),
    workspaceId: exactIdSchema,
    installationId: exactIdSchema,
    authorityFile: z.literal(AUTHORITY_FILE_NAME),
  })
  .strict();

const markerEnvelopeSchema = z
  .object({
    formatVersion: z.literal(AUTHORITY_FORMAT_VERSION),
    keyId: z.literal(AUTHORITY_KEY_ID),
    payload: markerPayloadSchema,
    mac: z.string().regex(/^[0-9a-f]{64}$/i),
  })
  .strict();

type IdentityPayload = z.infer<typeof payloadSchema>;
type IdentityEnvelope = z.infer<typeof envelopeSchema>;
type MarkerPayload = z.infer<typeof markerPayloadSchema>;
type MarkerEnvelope = z.infer<typeof markerEnvelopeSchema>;
type AuthenticationKeyState = "old" | "new";

export type DurableIdentityActor = Readonly<{
  personId: string;
  workspaceMemberId: string;
  deviceId: string;
  role: z.infer<typeof roleSchema>;
  policyVersion: number;
  revocationEpoch: number;
}>;

export type BindOwnerIdentityOptions = Readonly<{
  revokeSessionIds?: readonly string[];
  revokeAllOtherSessions?: boolean;
}>;

export type IdentityAuthorityRotationResult = Readonly<{
  state: "absent" | "verified" | "reauthenticated" | "already-new";
  authorityKeyState: AuthenticationKeyState | null;
  markerKeyState: AuthenticationKeyState | "missing" | null;
}>;

export type IdentityAdministrationSnapshot = Readonly<{
  revision: number;
  workspace: Readonly<{
    id: string;
    policyVersion: number;
    revocationEpoch: number;
  }>;
  installation: Readonly<{
    id: string;
    revocationEpoch: number;
    enrolledAt: string;
  }>;
  currentActor: DurableIdentityActor;
  member: Readonly<{
    id: string;
    personId: string;
    role: z.infer<typeof roleSchema>;
    policyVersion: number;
    revocationEpoch: number;
    shopIds: readonly string[];
  }>;
  devices: readonly Readonly<{
    id: string;
    revocationEpoch: number;
    enrolledAt: string;
    lastSeenAt: string;
    current: boolean;
  }>[];
  sessions: readonly Readonly<{
    sessionId: string;
    personId: string;
    workspaceMemberId: string;
    deviceId: string;
    policyVersion: number;
    boundAt: string;
    revokedAt: string | null;
    current: boolean;
  }>[];
}>;

export type IdentitySessionRevocationResult = Readonly<{
  state: "revoked" | "already-revoked";
  sessionId: string;
  deviceId: string;
  workspaceMemberId: string;
  revokedAt: string;
  revision: number;
}>;

let processQueue: Promise<void> = Promise.resolve();

function identityError(
  message: string,
  code = "IDENTITY_AUTHORITY_UNAVAILABLE",
  statusCode = 503,
): SahelFlowError {
  return new SahelFlowError(message, code, statusCode);
}

function systemDirectory(): string {
  return join(dataRoot(), "system");
}

export function identityAuthorityPath(): string {
  return join(systemDirectory(), AUTHORITY_FILE_NAME);
}

export function identityAuthorityMarkerPath(): string {
  return join(systemDirectory(), MARKER_FILE_NAME);
}

function identityAuthorityLockPath(): string {
  return join(systemDirectory(), LOCK_FILE_NAME);
}

function randomExactId(): string {
  return randomBytes(16).toString("hex");
}

function assertRootKey(key: Buffer, label: string): void {
  if (!Buffer.isBuffer(key) || key.length !== ROOT_KEY_BYTES) {
    throw identityError(`${label} must be a 256-bit installation root`);
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
  throw identityError("Identity authority contains unsupported canonical data");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function macFor(
  label: string,
  payload: unknown,
  rootKey: Buffer = getMasterKey(),
): string {
  assertRootKey(rootKey, "Identity authority root key");
  const derived = createHmac("sha256", rootKey)
    .update("sahelflow.identity-authority.key.v1", "utf8")
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
  payload: IdentityPayload,
  rootKey: Buffer = getMasterKey(),
): IdentityEnvelope {
  return {
    formatVersion: AUTHORITY_FORMAT_VERSION,
    keyId: AUTHORITY_KEY_ID,
    payload,
    mac: macFor("authority", payload, rootKey),
  };
}

function markerPayload(
  workspaceId: string,
  installationId: string,
): MarkerPayload {
  return {
    formatVersion: AUTHORITY_FORMAT_VERSION,
    workspaceId,
    installationId,
    authorityFile: AUTHORITY_FILE_NAME,
  };
}

function createMarkerFromIds(
  workspaceId: string,
  installationId: string,
  rootKey: Buffer = getMasterKey(),
): MarkerEnvelope {
  const payload = markerPayload(workspaceId, installationId);
  return {
    formatVersion: AUTHORITY_FORMAT_VERSION,
    keyId: AUTHORITY_KEY_ID,
    payload,
    mac: macFor("marker", payload, rootKey),
  };
}

function createMarker(
  shop: ShopContext,
  rootKey: Buffer = getMasterKey(),
): MarkerEnvelope {
  return createMarkerFromIds(shop.workspaceId, shop.installationId, rootKey);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw identityError(`Identity authority file '${path}' is unreadable`);
  }
}

function validatePayloadRelations(payload: IdentityPayload): void {
  const unique = (values: readonly string[], label: string): void => {
    if (new Set(values).size !== values.length) {
      throw identityError(`Identity authority contains duplicate ${label}`);
    }
  };

  unique(payload.people.map((person) => person.id), "person IDs");
  unique(payload.members.map((member) => member.id), "member IDs");
  unique(payload.devices.map((device) => device.id), "device IDs");
  unique(
    payload.sessionBindings.map((binding) => binding.sessionId),
    "session bindings",
  );

  if (payload.installation.workspaceId !== payload.workspace.id) {
    throw identityError("Identity installation is bound to another workspace");
  }

  const personIds = new Set(payload.people.map((person) => person.id));
  const memberIds = new Set(payload.members.map((member) => member.id));
  const deviceIds = new Set(payload.devices.map((device) => device.id));

  for (const member of payload.members) {
    if (
      !personIds.has(member.personId) ||
      member.workspaceId !== payload.workspace.id ||
      member.policyVersion !== payload.workspace.policyVersion ||
      new Set(member.shopIds).size !== member.shopIds.length
    ) {
      throw identityError("Identity member authority is internally inconsistent");
    }
  }
  for (const device of payload.devices) {
    if (
      device.installationId !== payload.installation.id ||
      device.workspaceId !== payload.workspace.id
    ) {
      throw identityError("Identity device authority is internally inconsistent");
    }
  }
  for (const binding of payload.sessionBindings) {
    if (
      !personIds.has(binding.personId) ||
      !memberIds.has(binding.workspaceMemberId) ||
      !deviceIds.has(binding.deviceId) ||
      binding.workspaceId !== payload.workspace.id ||
      binding.installationId !== payload.installation.id
    ) {
      throw identityError("Identity session binding is internally inconsistent");
    }
  }
}

function parseAuthorityEnvelope(): IdentityEnvelope | null {
  const path = identityAuthorityPath();
  if (!existsSync(path)) return null;
  const envelope = envelopeSchema.parse(readJson(path));
  validatePayloadRelations(envelope.payload);
  return envelope;
}

function parseMarkerEnvelope(): MarkerEnvelope | null {
  const path = identityAuthorityMarkerPath();
  if (!existsSync(path)) return null;
  return markerEnvelopeSchema.parse(readJson(path));
}

function readAuthority(rootKey: Buffer = getMasterKey()): IdentityEnvelope | null {
  const envelope = parseAuthorityEnvelope();
  if (!envelope) return null;
  if (!macMatches("authority", envelope.payload, envelope.mac, rootKey)) {
    throw identityError("Identity authority authentication failed");
  }
  return envelope;
}

function readMarker(rootKey: Buffer = getMasterKey()): MarkerEnvelope | null {
  const marker = parseMarkerEnvelope();
  if (!marker) return null;
  if (!macMatches("marker", marker.payload, marker.mac, rootKey)) {
    throw identityError("Identity authority initialization marker is invalid");
  }
  return marker;
}

function keyStateForMac(
  label: string,
  payload: unknown,
  supplied: string,
  oldKey: Buffer,
  newKey: Buffer,
): AuthenticationKeyState {
  if (macMatches(label, payload, supplied, newKey)) return "new";
  if (macMatches(label, payload, supplied, oldKey)) return "old";
  throw identityError(
    `Identity ${label} authentication failed under both rotation roots`,
  );
}

function assertContext(payload: IdentityPayload, shop: ShopContext): void {
  if (
    payload.workspace.id !== shop.workspaceId ||
    payload.installation.id !== shop.installationId
  ) {
    throw identityError(
      "Identity authority does not match the process workspace or installation",
      "IDENTITY_AUTHORITY_CONTEXT_MISMATCH",
      409,
    );
  }
}

function assertMarkerContext(
  marker: MarkerEnvelope | null,
  payload: IdentityPayload,
  shop: ShopContext,
): void {
  if (
    marker &&
    (marker.payload.workspaceId !== shop.workspaceId ||
      marker.payload.installationId !== shop.installationId ||
      marker.payload.workspaceId !== payload.workspace.id ||
      marker.payload.installationId !== payload.installation.id)
  ) {
    throw identityError("Identity authority marker belongs to another installation");
  }
}

function readRequiredAuthority(
  shop: ShopContext,
): Readonly<{ envelope: IdentityEnvelope; marker: MarkerEnvelope | null }> {
  const marker = readMarker();
  const envelope = readAuthority();
  if (!envelope) {
    if (marker) {
      throw identityError(
        "Identity authority is missing after initialization",
        "IDENTITY_AUTHORITY_MISSING",
        503,
      );
    }
    throw identityError(
      "The authenticated session has no durable identity authority",
      "IDENTITY_SESSION_BINDING_REQUIRED",
      401,
    );
  }
  assertContext(envelope.payload, shop);
  assertMarkerContext(marker, envelope.payload, shop);
  return { envelope, marker };
}

function atomicWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let fileDescriptor: number | null = null;
  try {
    fileDescriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(fileDescriptor, `${JSON.stringify(value)}\n`, {
      encoding: "utf8",
    });
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = null;
    renameSync(temporary, path);
    try {
      const directoryDescriptor = openSync(dirname(path), "r");
      try {
        fsyncSync(directoryDescriptor);
      } finally {
        closeSync(directoryDescriptor);
      }
    } catch {
      // Directory fsync is unavailable on some Windows filesystems.
    }
  } catch (error) {
    if (fileDescriptor !== null) closeSync(fileDescriptor);
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(): Promise<number> {
  const path = identityAuthorityLockPath();
  mkdirSync(dirname(path), { recursive: true });
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

  throw identityError("Identity authority is busy; retry the operation");
}

async function withAuthorityLock<T>(work: () => Promise<T> | T): Promise<T> {
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
      if (existsSync(identityAuthorityLockPath())) {
        unlinkSync(identityAuthorityLockPath());
      }
    } catch {
      // A later operation will recover a stale lock if necessary.
    }
    releaseQueue();
  }
}

function initialPayload(sessionId: string, shop: ShopContext): IdentityPayload {
  const now = new Date().toISOString();
  const personId = randomExactId();
  const memberId = randomExactId();
  const deviceId = randomExactId();

  return {
    formatVersion: AUTHORITY_FORMAT_VERSION,
    revision: 1,
    workspace: {
      id: shop.workspaceId,
      status: "active",
      policyVersion: 1,
      revocationEpoch: 0,
    },
    installation: {
      id: shop.installationId,
      workspaceId: shop.workspaceId,
      status: "active",
      revocationEpoch: 0,
      enrolledAt: now,
    },
    people: [
      {
        id: personId,
        status: "active",
        revocationEpoch: 0,
        createdAt: now,
      },
    ],
    members: [
      {
        id: memberId,
        personId,
        workspaceId: shop.workspaceId,
        role: "owner",
        status: "active",
        policyVersion: 1,
        revocationEpoch: 0,
        shopIds: [shop.shopId],
        createdAt: now,
      },
    ],
    devices: [
      {
        id: deviceId,
        installationId: shop.installationId,
        workspaceId: shop.workspaceId,
        status: "active",
        revocationEpoch: 0,
        enrolledAt: now,
        lastSeenAt: now,
      },
    ],
    sessionBindings: [
      {
        sessionId,
        personId,
        workspaceMemberId: memberId,
        deviceId,
        workspaceId: shop.workspaceId,
        installationId: shop.installationId,
        policyVersion: 1,
        workspaceRevocationEpoch: 0,
        personRevocationEpoch: 0,
        memberRevocationEpoch: 0,
        deviceRevocationEpoch: 0,
        boundAt: now,
        revokedAt: null,
      },
    ],
  };
}

function actorFromPayload(
  payload: IdentityPayload,
  sessionId: string,
  shop: ShopContext,
): DurableIdentityActor {
  assertContext(payload, shop);
  const binding = payload.sessionBindings.find(
    (candidate) => candidate.sessionId === sessionId && candidate.revokedAt === null,
  );
  if (!binding) {
    throw identityError(
      "The authenticated session has no durable identity binding",
      "IDENTITY_SESSION_BINDING_REQUIRED",
      401,
    );
  }

  const person = payload.people.find((candidate) => candidate.id === binding.personId);
  const member = payload.members.find(
    (candidate) => candidate.id === binding.workspaceMemberId,
  );
  const device = payload.devices.find((candidate) => candidate.id === binding.deviceId);
  if (!person || !member || !device) {
    throw identityError("Durable identity binding references missing authority");
  }
  if (!member.shopIds.includes(shop.shopId)) {
    throw identityError(
      "The current member is not authorized for this shop",
      "IDENTITY_SHOP_FORBIDDEN",
      403,
    );
  }

  if (
    binding.policyVersion !== payload.workspace.policyVersion ||
    binding.policyVersion !== member.policyVersion ||
    binding.workspaceRevocationEpoch !== payload.workspace.revocationEpoch ||
    binding.personRevocationEpoch !== person.revocationEpoch ||
    binding.memberRevocationEpoch !== member.revocationEpoch ||
    binding.deviceRevocationEpoch !== device.revocationEpoch
  ) {
    throw identityError(
      "The durable identity binding is stale and must be reauthenticated",
      "IDENTITY_POLICY_STALE",
      403,
    );
  }

  return Object.freeze({
    personId: person.id,
    workspaceMemberId: member.id,
    deviceId: device.id,
    role: member.role,
    policyVersion: payload.workspace.policyVersion,
    revocationEpoch: Math.max(
      payload.workspace.revocationEpoch,
      person.revocationEpoch,
      member.revocationEpoch,
      device.revocationEpoch,
    ),
  });
}

function assertOwner(actor: DurableIdentityActor): void {
  if (actor.role !== "owner") {
    throw identityError(
      "Only the workspace owner may administer sessions",
      "ACTION_FORBIDDEN",
      403,
    );
  }
}

export async function bindOwnerIdentitySession(
  sessionId: string,
  shop: ShopContext,
  options: BindOwnerIdentityOptions = {},
): Promise<DurableIdentityActor> {
  exactSessionIdSchema.parse(sessionId);
  for (const revokedId of options.revokeSessionIds ?? []) {
    exactSessionIdSchema.parse(revokedId);
  }

  return withAuthorityLock(async () => {
    const marker = readMarker();
    let envelope = readAuthority();

    if (!envelope) {
      if (marker) {
        throw identityError(
          "Identity authority is missing after initialization",
          "IDENTITY_AUTHORITY_MISSING",
          503,
        );
      }
      const payload = initialPayload(sessionId, shop);
      const created = createEnvelope(payload);
      atomicWrite(identityAuthorityPath(), created);
      atomicWrite(identityAuthorityMarkerPath(), createMarker(shop));
      return actorFromPayload(payload, sessionId, shop);
    }

    assertContext(envelope.payload, shop);
    assertMarkerContext(marker, envelope.payload, shop);

    const payload = structuredClone(envelope.payload) as IdentityPayload;
    const owner = payload.members.find(
      (member) => member.role === "owner" && member.status === "active",
    );
    if (!owner) throw identityError("Durable owner membership is missing");
    const person = payload.people.find((candidate) => candidate.id === owner.personId);
    const device = payload.devices.find(
      (candidate) =>
        candidate.installationId === shop.installationId &&
        candidate.status === "active",
    );
    if (!person || !device) {
      throw identityError("Durable owner person or device authority is missing");
    }

    const now = new Date().toISOString();
    let changed = false;
    if (!owner.shopIds.includes(shop.shopId)) {
      owner.shopIds = [...owner.shopIds, shop.shopId].sort();
      changed = true;
    }

    const revokeSet = new Set(options.revokeSessionIds ?? []);
    for (const binding of payload.sessionBindings) {
      const mustRevoke =
        binding.revokedAt === null &&
        binding.sessionId !== sessionId &&
        (options.revokeAllOtherSessions === true || revokeSet.has(binding.sessionId));
      if (mustRevoke) {
        binding.revokedAt = now;
        changed = true;
      }
    }

    const existingIndex = payload.sessionBindings.findIndex(
      (binding) => binding.sessionId === sessionId,
    );
    const nextBinding: z.infer<typeof sessionBindingSchema> = {
      sessionId,
      personId: person.id,
      workspaceMemberId: owner.id,
      deviceId: device.id,
      workspaceId: payload.workspace.id,
      installationId: payload.installation.id,
      policyVersion: payload.workspace.policyVersion,
      workspaceRevocationEpoch: payload.workspace.revocationEpoch,
      personRevocationEpoch: person.revocationEpoch,
      memberRevocationEpoch: owner.revocationEpoch,
      deviceRevocationEpoch: device.revocationEpoch,
      boundAt: now,
      revokedAt: null,
    };

    if (existingIndex === -1) {
      payload.sessionBindings.push(nextBinding);
      changed = true;
    } else {
      const existing = payload.sessionBindings[existingIndex]!;
      if (canonicalJson(existing) !== canonicalJson(nextBinding)) {
        payload.sessionBindings[existingIndex] = nextBinding;
        changed = true;
      }
    }

    if (device.lastSeenAt !== now) {
      device.lastSeenAt = now;
      changed = true;
    }

    payload.sessionBindings.sort((left, right) =>
      left.boundAt < right.boundAt ? -1 : left.boundAt > right.boundAt ? 1 : 0,
    );
    if (payload.sessionBindings.length > MAX_SESSION_BINDINGS) {
      payload.sessionBindings = payload.sessionBindings.slice(-MAX_SESSION_BINDINGS);
      changed = true;
    }

    if (changed) {
      payload.revision += 1;
      envelope = createEnvelope(payload);
      atomicWrite(identityAuthorityPath(), envelope);
    }
    if (!marker) atomicWrite(identityAuthorityMarkerPath(), createMarker(shop));

    return actorFromPayload(payload, sessionId, shop);
  });
}

export async function resolveDurableIdentityActor(
  sessionId: string,
  shop: ShopContext,
): Promise<DurableIdentityActor | null> {
  exactSessionIdSchema.parse(sessionId);
  const marker = readMarker();
  const envelope = readAuthority();
  if (!envelope) {
    if (marker) {
      throw identityError(
        "Identity authority is missing after initialization",
        "IDENTITY_AUTHORITY_MISSING",
        503,
      );
    }
    return null;
  }
  assertContext(envelope.payload, shop);
  assertMarkerContext(marker, envelope.payload, shop);
  return actorFromPayload(envelope.payload, sessionId, shop);
}

/** Resolve current installation-owner authority for a sessionless remote command. */
export async function resolveDurableIdentityMember(
  memberId: string,
  shop: ShopContext,
): Promise<DurableIdentityActor | null> {
  exactIdSchema.parse(memberId);
  const marker = readMarker();
  const envelope = readAuthority();
  if (!envelope) {
    if (marker) {
      throw identityError(
        "Identity authority is missing after initialization",
        "IDENTITY_AUTHORITY_MISSING",
        503,
      );
    }
    return null;
  }
  assertContext(envelope.payload, shop);
  assertMarkerContext(marker, envelope.payload, shop);
  const payload = envelope.payload;
  const member = payload.members.find((candidate) => candidate.id === memberId);
  if (!member || member.status !== "active" || !member.shopIds.includes(shop.shopId)) return null;
  const person = payload.people.find(
    (candidate) => candidate.id === member.personId && candidate.status === "active",
  );
  if (!person) return null;
  return Object.freeze({
    personId: person.id,
    workspaceMemberId: member.id,
    deviceId: payload.installation.id,
    role: member.role,
    policyVersion: payload.workspace.policyVersion,
    revocationEpoch: Math.max(
      payload.workspace.revocationEpoch,
      payload.installation.revocationEpoch,
      person.revocationEpoch,
      member.revocationEpoch,
    ),
  });
}

export async function ensureDurableIdentityActor(
  sessionId: string,
  shop: ShopContext,
): Promise<DurableIdentityActor> {
  return (await resolveDurableIdentityActor(sessionId, shop)) ??
    bindOwnerIdentitySession(sessionId, shop);
}

export async function getIdentityAdministrationSnapshot(
  currentSessionId: string,
  shop: ShopContext,
): Promise<IdentityAdministrationSnapshot> {
  exactSessionIdSchema.parse(currentSessionId);
  const { envelope } = readRequiredAuthority(shop);
  const payload = envelope.payload;
  const currentActor = actorFromPayload(payload, currentSessionId, shop);
  const member = payload.members.find(
    (candidate) => candidate.id === currentActor.workspaceMemberId,
  );
  if (!member) throw identityError("Current durable member authority is missing");

  return Object.freeze({
    revision: payload.revision,
    workspace: Object.freeze({
      id: payload.workspace.id,
      policyVersion: payload.workspace.policyVersion,
      revocationEpoch: payload.workspace.revocationEpoch,
    }),
    installation: Object.freeze({
      id: payload.installation.id,
      revocationEpoch: payload.installation.revocationEpoch,
      enrolledAt: payload.installation.enrolledAt,
    }),
    currentActor,
    member: Object.freeze({
      id: member.id,
      personId: member.personId,
      role: member.role,
      policyVersion: member.policyVersion,
      revocationEpoch: member.revocationEpoch,
      shopIds: Object.freeze([...member.shopIds]),
    }),
    devices: Object.freeze(
      payload.devices.map((device) =>
        Object.freeze({
          id: device.id,
          revocationEpoch: device.revocationEpoch,
          enrolledAt: device.enrolledAt,
          lastSeenAt: device.lastSeenAt,
          current: device.id === currentActor.deviceId,
        }),
      ),
    ),
    sessions: Object.freeze(
      payload.sessionBindings.map((binding) =>
        Object.freeze({
          sessionId: binding.sessionId,
          personId: binding.personId,
          workspaceMemberId: binding.workspaceMemberId,
          deviceId: binding.deviceId,
          policyVersion: binding.policyVersion,
          boundAt: binding.boundAt,
          revokedAt: binding.revokedAt,
          current: binding.sessionId === currentSessionId,
        }),
      ),
    ),
  });
}

export async function revokeIdentitySessionBinding(
  currentSessionId: string,
  targetSessionId: string,
  shop: ShopContext,
): Promise<IdentitySessionRevocationResult> {
  exactSessionIdSchema.parse(currentSessionId);
  exactSessionIdSchema.parse(targetSessionId);
  if (currentSessionId === targetSessionId) {
    throw identityError(
      "Use logout to revoke the current session",
      "CURRENT_SESSION_REVOCATION_REQUIRES_LOGOUT",
      409,
    );
  }

  return withAuthorityLock(async () => {
    const { envelope, marker } = readRequiredAuthority(shop);
    const payload = structuredClone(envelope.payload) as IdentityPayload;
    const actor = actorFromPayload(payload, currentSessionId, shop);
    assertOwner(actor);

    const target = payload.sessionBindings.find(
      (binding) => binding.sessionId === targetSessionId,
    );
    if (!target) {
      throw identityError(
        "The requested session is not part of this installation authority",
        "IDENTITY_SESSION_NOT_FOUND",
        404,
      );
    }

    if (target.revokedAt) {
      return Object.freeze({
        state: "already-revoked" as const,
        sessionId: target.sessionId,
        deviceId: target.deviceId,
        workspaceMemberId: target.workspaceMemberId,
        revokedAt: target.revokedAt,
        revision: payload.revision,
      });
    }

    const revokedAt = new Date().toISOString();
    target.revokedAt = revokedAt;
    payload.revision += 1;
    atomicWrite(identityAuthorityPath(), createEnvelope(payload));
    if (!marker) atomicWrite(identityAuthorityMarkerPath(), createMarker(shop));

    return Object.freeze({
      state: "revoked" as const,
      sessionId: target.sessionId,
      deviceId: target.deviceId,
      workspaceMemberId: target.workspaceMemberId,
      revokedAt,
      revision: payload.revision,
    });
  });
}

/**
 * Re-authenticate installation identity files during master-key rotation.
 *
 * The global maintenance lease already proves the app is stopped. Each file is
 * accepted under either the current or candidate key so an interrupted rotation
 * can resume safely after one file was already rewritten. A marker without the
 * authority remains a hard failure; an authority without a marker is repaired
 * from its authenticated workspace/installation payload.
 */
export function rotateIdentityAuthorityAuthentication(
  oldKey: Buffer,
  newKey: Buffer,
  dryRun = false,
): IdentityAuthorityRotationResult {
  assertRootKey(oldKey, "Current identity authority root key");
  assertRootKey(newKey, "Candidate identity authority root key");
  if (timingSafeEqual(oldKey, newKey)) {
    throw identityError("Identity authority rotation roots must be different");
  }

  const authority = parseAuthorityEnvelope();
  const marker = parseMarkerEnvelope();
  if (!authority && !marker) {
    return {
      state: "absent",
      authorityKeyState: null,
      markerKeyState: null,
    };
  }
  if (!authority && marker) {
    throw identityError(
      "Identity authority marker exists without its authority file",
      "IDENTITY_AUTHORITY_MISSING",
      503,
    );
  }

  const requiredAuthority = authority!;
  const authorityKeyState = keyStateForMac(
    "authority",
    requiredAuthority.payload,
    requiredAuthority.mac,
    oldKey,
    newKey,
  );

  let markerKeyState: AuthenticationKeyState | "missing" = "missing";
  if (marker) {
    if (
      marker.payload.workspaceId !== requiredAuthority.payload.workspace.id ||
      marker.payload.installationId !== requiredAuthority.payload.installation.id
    ) {
      throw identityError(
        "Identity authority marker does not match its authority payload",
      );
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
    return {
      state: "verified",
      authorityKeyState,
      markerKeyState,
    };
  }

  let rewritten = false;
  if (authorityKeyState === "old") {
    atomicWrite(
      identityAuthorityPath(),
      createEnvelope(requiredAuthority.payload, newKey),
    );
    rewritten = true;
  }
  if (markerKeyState !== "new") {
    atomicWrite(
      identityAuthorityMarkerPath(),
      createMarkerFromIds(
        requiredAuthority.payload.workspace.id,
        requiredAuthority.payload.installation.id,
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

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
import { shopContext } from "@/lib/db";
import { dataRoot } from "@/lib/storage/data-root";
import { SahelFlowError } from "@/types/errors";
import {
  signedEntitlementSchema,
  validateSignedEntitlement,
  type EntitlementValidationResult,
  type LicenseVerificationKeyring,
  type SignedEntitlement,
} from "./entitlement";
import { advanceNativeRevocationFloor } from "./native-commercial-authority";

const AUTHORITY_FORMAT = 1 as const;
const AUTHORITY_KEY_ID = "installation-root-license-hmac-v1" as const;
const AUTHORITY_FILE = "license-authority.json";
const LOCK_FILE = "license-authority.lock";
const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 5_000;
const CLOCK_PERSIST_INTERVAL_MS = 5 * 60 * 1000;
const isoDate = z.string().datetime({ offset: true });

const authorityStateSchema = z
  .object({
    formatVersion: z.literal(AUTHORITY_FORMAT),
    revision: z.number().int().positive().safe(),
    entitlement: signedEntitlementSchema,
    activatedAt: isoDate,
    lastObservedAt: isoDate,
    minimumRevocationEpoch: z.number().int().nonnegative().safe(),
  })
  .strict();

const authorityEnvelopeSchema = z
  .object({
    formatVersion: z.literal(AUTHORITY_FORMAT),
    keyId: z.literal(AUTHORITY_KEY_ID),
    state: authorityStateSchema,
    mac: z.string().regex(/^[0-9a-f]{64}$/i),
  })
  .strict();

type LicenseAuthorityState = z.infer<typeof authorityStateSchema>;
type LicenseAuthorityEnvelope = z.infer<typeof authorityEnvelopeSchema>;

export type LicenseAuthorityProjection = Readonly<{
  status: EntitlementValidationResult["status"] | "missing" | "unavailable";
  message: string;
  licenseId: string | null;
  type: SignedEntitlement["claims"]["type"] | null;
  expiresAt: string | null;
  supportEndsAt: string | null;
  shopSlots: number;
  memberLimit: number;
  deviceLimit: number;
  features: readonly string[];
  minimumPermanentRecoveryEpoch: number | null;
}>;

let processQueue: Promise<void> = Promise.resolve();

function authorityError(message: string, code = "LICENSE_AUTHORITY_UNAVAILABLE", status = 503) {
  return new SahelFlowError(message, code, status);
}

function systemDirectory(): string {
  return join(dataRoot(), "system");
}

export function licenseAuthorityPath(): string {
  return join(systemDirectory(), AUTHORITY_FILE);
}

function lockPath(): string {
  return join(systemDirectory(), LOCK_FILE);
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
  throw authorityError("License authority contains unsupported canonical data");
}

function macFor(state: LicenseAuthorityState): string {
  const root = getMasterKey();
  if (root.length !== 32) throw authorityError("Installation root is not 256-bit");
  const derived = createHmac("sha256", root)
    .update("sahelflow.license-authority.key.v1", "utf8")
    .digest();
  try {
    return createHmac("sha256", derived)
      .update("authority\0", "utf8")
      .update(JSON.stringify(canonicalize(state)), "utf8")
      .digest("hex");
  } finally {
    derived.fill(0);
  }
}

function authenticatedEnvelope(state: LicenseAuthorityState): LicenseAuthorityEnvelope {
  return {
    formatVersion: AUTHORITY_FORMAT,
    keyId: AUTHORITY_KEY_ID,
    state,
    mac: macFor(state),
  };
}

function readAuthority(): LicenseAuthorityEnvelope | null {
  const path = licenseAuthorityPath();
  if (!existsSync(path)) return null;
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw authorityError("License authority file is unreadable");
  }
  const parsed = authorityEnvelopeSchema.safeParse(input);
  if (!parsed.success) throw authorityError("License authority file has an invalid format");
  const envelope = parsed.data;
  const expected = Buffer.from(macFor(envelope.state), "hex");
  const supplied = Buffer.from(envelope.mac, "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw authorityError("License authority authentication failed");
  }
  return envelope;
}

function atomicWrite(envelope: LicenseAuthorityEnvelope): void {
  const path = licenseAuthorityPath();
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor: number | null = null;
  try {
    writeFileSync(temporary, `${JSON.stringify(envelope)}\n`, { flag: "wx", mode: 0o600 });
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
      // Directory fsync is not available on every Windows filesystem.
    }
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch {
      // Preserve the original failure.
    }
    throw error;
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(): Promise<number> {
  mkdirSync(systemDirectory(), { recursive: true });
  const started = Date.now();
  while (Date.now() - started < LOCK_TIMEOUT_MS) {
    try {
      const descriptor = openSync(lockPath(), "wx", 0o600);
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
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
      await delay(10);
    }
  }
  throw authorityError("License authority is busy; retry the operation");
}

async function withLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = processQueue;
  let release!: () => void;
  processQueue = new Promise<void>((resolve) => {
    release = resolve;
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
      // Stale-lock recovery handles an interrupted cleanup.
    }
    release();
  }
}

function keyMap(raw: string | undefined, label: string): Readonly<Record<string, string>> {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw authorityError(`${label} public keyring is not valid JSON`);
  }
  const parsed = z.record(z.string().min(8), z.string().min(40).max(256)).safeParse(value);
  if (!parsed.success) throw authorityError(`${label} public keyring is invalid`);
  return Object.freeze(parsed.data);
}

export function licenseVerificationKeyring(): LicenseVerificationKeyring {
  return Object.freeze({
    trial: keyMap(process.env.SF_LICENSE_TRIAL_PUBLIC_KEYS, "Trial"),
    permanent: keyMap(process.env.SF_LICENSE_PERMANENT_PUBLIC_KEYS, "Permanent"),
  });
}

function deviceBinding(): string {
  const value = process.env.SF_DEVICE_BINDING;
  if (!value || !/^sfdb1_[0-9a-f]{64}$/.test(value)) {
    throw authorityError("Native device binding is unavailable");
  }
  return value;
}

function nativeClockAnchor(allowMissing: boolean): string | null {
  const status = process.env.SF_LICENSE_CLOCK_ANCHOR_STATUS;
  const value = process.env.SF_LICENSE_CLOCK_ANCHOR_MS;
  if (status === "missing" && allowMissing) return null;
  if (status === "missing") {
    throw authorityError("Protected license clock authority requires current reconciliation");
  }
  if (status !== "ready" || !value) {
    if (process.env.NODE_ENV === "production") {
      throw authorityError("Native license clock authority is unavailable");
    }
    return null;
  }
  if (!/^\d{13}$/.test(value)) {
    throw authorityError("Native license clock authority is invalid");
  }
  const timestamp = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(timestamp)) {
    throw authorityError("Native license clock authority is out of range");
  }
  return new Date(timestamp).toISOString();
}

function nativeRevocationFloor(allowMissing: boolean): number {
  const status = process.env.SF_LICENSE_CLOCK_ANCHOR_STATUS;
  const value = process.env.SF_LICENSE_REVOCATION_FLOOR;
  if (status === "missing" && allowMissing) return 0;
  if (status === "missing") {
    throw authorityError("Protected commercial revocation authority requires current reconciliation");
  }
  if (status !== "ready" || !value) {
    if (process.env.NODE_ENV === "production") {
      throw authorityError("Native commercial revocation authority is unavailable");
    }
    return 0;
  }
  if (!/^\d{1,16}$/.test(value)) {
    throw authorityError("Native commercial revocation authority is invalid");
  }
  const epoch = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(epoch) || epoch < 0) {
    throw authorityError("Native commercial revocation authority is out of range");
  }
  return epoch;
}

function nativeMinimumPermanentRecoveryEpoch(allowMissing: boolean): number {
  const status = process.env.SF_LICENSE_CLOCK_ANCHOR_STATUS;
  const value = process.env.SF_LICENSE_MINIMUM_PERMANENT_RECOVERY_EPOCH;
  if (status === "missing" && allowMissing) return 0;
  if (status === "missing") {
    throw authorityError("Protected permanent recovery authority requires current reconciliation");
  }
  if (status !== "ready" || !value) {
    if (process.env.NODE_ENV === "production") {
      throw authorityError("Native permanent recovery authority is unavailable");
    }
    return 0;
  }
  if (!/^\d{1,16}$/.test(value)) {
    throw authorityError("Native permanent recovery authority is invalid");
  }
  const epoch = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(epoch) || epoch < 0) {
    throw authorityError("Native permanent recovery authority is out of range");
  }
  return epoch;
}

function permitsMissingNativeAuthority(
  entitlement: SignedEntitlement,
  allowOnlineTrialInitialization = false,
): boolean {
  return (
    allowOnlineTrialInitialization &&
    entitlement.claims.type === "trial" &&
    entitlement.claims.issuer === "trial-service"
  );
}

function effectiveMinimumRevocationEpoch(
  entitlement: SignedEntitlement,
  localMinimumRevocationEpoch: number,
  allowOnlineTrialInitialization = false,
): number {
  return Math.max(
    localMinimumRevocationEpoch,
    nativeRevocationFloor(
      permitsMissingNativeAuthority(entitlement, allowOnlineTrialInitialization),
    ),
  );
}

function highestObservedAt(local: string | null, allowMissing: boolean): string | null {
  const native = nativeClockAnchor(allowMissing);
  if (!local) return native;
  if (!native) return local;
  return new Date(local).getTime() >= new Date(native).getTime() ? local : native;
}

async function validate(
  entitlement: SignedEntitlement,
  shop: ShopContext,
  minimumRevocationEpoch: number,
  lastObservedAt: string | null,
  now: Date,
  allowOnlineTrialInitialization = false,
) {
  const permitsClockRecovery = permitsMissingNativeAuthority(
    entitlement,
    allowOnlineTrialInitialization,
  );
  return validateSignedEntitlement(
    entitlement,
    {
      workspaceId: shop.workspaceId,
      installationId: shop.installationId,
      deviceBinding: deviceBinding(),
      appVersion: process.env.APP_VERSION ?? "1.0.0-internal.13",
      minimumRevocationEpoch: effectiveMinimumRevocationEpoch(
        entitlement,
        minimumRevocationEpoch,
        allowOnlineTrialInitialization,
      ),
      lastObservedAt: highestObservedAt(lastObservedAt, permitsClockRecovery),
      now,
    },
    licenseVerificationKeyring(),
  );
}

function projection(result: EntitlementValidationResult): LicenseAuthorityProjection {
  const claims = result.entitlement?.claims;
  return Object.freeze({
    status: result.status,
    message: result.message,
    licenseId: claims?.licenseId ?? null,
    type: claims?.type ?? null,
    expiresAt: claims?.expiresAt ?? null,
    supportEndsAt: claims?.supportEndsAt ?? null,
    shopSlots: claims?.shopSlots ?? 0,
    memberLimit: claims?.memberLimit ?? 0,
    deviceLimit: claims?.deviceLimit ?? 0,
    features: Object.freeze([...(claims?.features ?? [])]),
    minimumPermanentRecoveryEpoch: nativeMinimumPermanentRecoveryEpoch(false) || null,
  });
}

function isOfflineRevocationClaim(entitlement: SignedEntitlement): boolean {
  const { claims } = entitlement;
  return (
    claims.type === "permanent" &&
    claims.issuer === "founder-offline" &&
    claims.transferState === "revoked" &&
    claims.transferEpoch >= 1 &&
    claims.revocationEpoch >= 1
  );
}

function isPersistableRevocationTombstone(
  entitlement: SignedEntitlement,
  current: LicenseAuthorityEnvelope | null,
  minimumRevocationEpoch: number,
): boolean {
  const { claims } = entitlement;
  if (!isOfflineRevocationClaim(entitlement) || claims.revocationEpoch <= minimumRevocationEpoch) {
    return false;
  }
  if (!current) return true;
  const installed = current.state.entitlement.claims;
  return (
    claims.licenseId === installed.licenseId &&
    claims.transferEpoch > installed.transferEpoch &&
    claims.recoveryEpoch >= installed.recoveryEpoch
  );
}

export async function activateSignedEntitlement(
  input: unknown,
  shop: ShopContext = shopContext,
  now: Date = new Date(),
  options: Readonly<{ allowOnlineTrialInitialization?: boolean }> = {},
): Promise<LicenseAuthorityProjection> {
  const entitlement = signedEntitlementSchema.parse(input);
  return withLock(async () => {
    let current: LicenseAuthorityEnvelope | null = null;
    let unreadable = false;
    try {
      current = readAuthority();
    } catch {
      unreadable = true;
      if (
        !isOfflineRevocationClaim(entitlement) &&
        (entitlement.claims.type !== "permanent" ||
          entitlement.claims.issuer !== "founder-offline" ||
          entitlement.claims.recoveryEpoch < 1)
      ) {
        throw authorityError("License authority recovery requires a signed offline recovery claim");
      }
    }
    const localMinimumEpoch = current?.state.minimumRevocationEpoch ?? 0;
    const allowOnlineTrialInitialization = options.allowOnlineTrialInitialization === true;
    if (
      allowOnlineTrialInitialization &&
      entitlement.claims.type === "trial" &&
      current?.state.entitlement.claims.type === "permanent"
    ) {
      throw authorityError(
        "Online trial initialization cannot replace an installed permanent entitlement",
        "LICENSE_ENTITLEMENT_DOWNGRADE",
        409,
      );
    }
    const minimumEpoch = effectiveMinimumRevocationEpoch(
      entitlement,
      localMinimumEpoch,
      allowOnlineTrialInitialization,
    );
    const result = await validate(
      entitlement,
      shop,
      minimumEpoch,
      current?.state.lastObservedAt ?? null,
      now,
      allowOnlineTrialInitialization,
    );
    const minimumPermanentRecoveryEpoch = nativeMinimumPermanentRecoveryEpoch(
      permitsMissingNativeAuthority(entitlement, allowOnlineTrialInitialization),
    );
    const initializePermanentRecovery =
      process.env.NODE_ENV === "production" &&
      process.env.SF_LICENSE_CLOCK_ANCHOR_STATUS === "missing" &&
      permitsMissingNativeAuthority(entitlement, allowOnlineTrialInitialization);
    const reconcileExpiredOnlineTrial =
      initializePermanentRecovery && result.status === "expired";
    if (
      minimumPermanentRecoveryEpoch > 0 &&
      entitlement.claims.type === "permanent" &&
      entitlement.claims.recoveryEpoch !== minimumPermanentRecoveryEpoch
    ) {
      throw authorityError(
        "Permanent activation requires the current native recovery epoch",
        "LICENSE_RECOVERY_CHALLENGE_REQUIRED",
        409,
      );
    }
    const persistRevocation =
      result.status === "revoked" &&
      isPersistableRevocationTombstone(entitlement, current, minimumEpoch);
    if (result.status === "revoked" && entitlement.claims.transferState === "revoked" && !persistRevocation) {
      throw authorityError(
        "Signed transfer revocation does not advance the installed commercial authority",
        "LICENSE_REVOCATION_ROLLBACK",
        409,
      );
    }
    if (result.status !== "valid" && !persistRevocation && !reconcileExpiredOnlineTrial) {
      throw authorityError(result.message, `LICENSE_${result.status.toUpperCase()}`, 403);
    }
    if (
      current &&
      (entitlement.claims.revocationEpoch < current.state.entitlement.claims.revocationEpoch ||
        entitlement.claims.transferEpoch < current.state.entitlement.claims.transferEpoch ||
        entitlement.claims.recoveryEpoch < current.state.entitlement.claims.recoveryEpoch)
    ) {
      throw authorityError("Entitlement would roll back protected commercial state", "LICENSE_ROLLBACK", 409);
    }
    if (
      entitlement.claims.revocationEpoch > minimumEpoch ||
      initializePermanentRecovery
    ) {
      await advanceNativeRevocationFloor(entitlement.claims.revocationEpoch, {
        initializePermanentRecovery,
      });
    }
    if (unreadable && existsSync(licenseAuthorityPath())) {
      renameSync(
        licenseAuthorityPath(),
        `${licenseAuthorityPath()}.recovered.${now.toISOString().replaceAll(":", "-")}`,
      );
    }
    const state: LicenseAuthorityState = {
      formatVersion: AUTHORITY_FORMAT,
      revision: (current?.state.revision ?? 0) + 1,
      entitlement,
      activatedAt: now.toISOString(),
      lastObservedAt: now.toISOString(),
      minimumRevocationEpoch: Math.max(minimumEpoch, entitlement.claims.revocationEpoch),
    };
    atomicWrite(authenticatedEnvelope(state));
    return projection(result);
  });
}

export async function requiresAuthenticatedEntitlementActivation(input: unknown): Promise<boolean> {
  const candidate = signedEntitlementSchema.parse(input);
  if (
    candidate.claims.type === "permanent" &&
    candidate.claims.issuer === "founder-offline" &&
    (candidate.claims.transferEpoch > 0 || candidate.claims.recoveryEpoch > 0)
  ) {
    return false;
  }
  try {
    return readAuthority() !== null;
  } catch {
    return true;
  }
}

export async function getLicenseAuthorityProjection(
  shop: ShopContext = shopContext,
  now: Date = new Date(),
): Promise<LicenseAuthorityProjection> {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.SF_LICENSE_DEVELOPMENT_BYPASS !== "false"
  ) {
    return Object.freeze({
      status: "valid",
      message: "Development license bypass",
      licenseId: null,
      type: null,
      expiresAt: null,
      supportEndsAt: null,
      shopSlots: 1,
      memberLimit: 25,
      deviceLimit: 1,
      features: Object.freeze(["sahelflow.complete"]),
      minimumPermanentRecoveryEpoch: null,
    });
  }
  const current = readAuthority();
  if (!current) {
    return Object.freeze({
      status: "missing",
      message: "No signed entitlement is installed",
      licenseId: null,
      type: null,
      expiresAt: null,
      supportEndsAt: null,
      shopSlots: 0,
      memberLimit: 0,
      deviceLimit: 0,
      features: Object.freeze([]),
      minimumPermanentRecoveryEpoch: nativeMinimumPermanentRecoveryEpoch(true) || null,
    });
  }
  const result = await validate(
    current.state.entitlement,
    shop,
    current.state.minimumRevocationEpoch,
    current.state.lastObservedAt,
    now,
  );
  if (
    result.status === "valid" &&
    now.getTime() - new Date(current.state.lastObservedAt).getTime() >= CLOCK_PERSIST_INTERVAL_MS
  ) {
    await withLock(async () => {
      const latest = readAuthority();
      if (!latest || latest.state.revision !== current.state.revision) return;
      const next: LicenseAuthorityState = {
        ...latest.state,
        revision: latest.state.revision + 1,
        lastObservedAt: now.toISOString(),
      };
      atomicWrite(authenticatedEnvelope(next));
    });
  }
  return projection(result);
}

export async function requireLicenseEntitlement(
  feature?: string,
  shop: ShopContext = shopContext,
): Promise<LicenseAuthorityProjection> {
  const current = await getLicenseAuthorityProjection(shop);
  if (current.status !== "valid") {
    throw authorityError(current.message, `LICENSE_${current.status.toUpperCase()}`, 403);
  }
  if (feature && !current.features.includes(feature) && !current.features.includes("sahelflow.complete")) {
    throw authorityError("License entitlement does not include this capability", "LICENSE_FEATURE_DENIED", 403);
  }
  return current;
}

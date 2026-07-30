export interface ManualOrderCommandReceipt {
  requestJson: string;
  idempotencyKey: string;
}

export interface CommandStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredManualOrderCommandReceipt {
  version: 3;
  scopeId: string;
  requestFingerprint: string;
  generation: number;
  idempotencyKey: string;
}

interface ActiveManualOrderCommand {
  requestJson: string;
  scopeId: string;
  requestFingerprint: string;
  generation: number;
  idempotencyKey: string;
}

const activeRequests = new WeakMap<object, Map<string, ActiveManualOrderCommand>>();

function activeMap(storage: CommandStorage): Map<string, ActiveManualOrderCommand> {
  let requests = activeRequests.get(storage as object);
  if (!requests) {
    requests = new Map();
    activeRequests.set(storage as object, requests);
  }
  return requests;
}

function hash32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}

export function manualOrderRequestFingerprint(requestJson: string): string {
  return [
    hash32(requestJson, 0x811c9dc5),
    hash32(requestJson, 0x9e3779b9),
    hash32(requestJson, 0x85ebca6b),
    hash32(requestJson, 0xc2b2ae35),
  ]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
}

function scopeStorageKey(storageKey: string): string {
  return `${storageKey}:scope-v1`;
}

function isValidIdentity(value: string | null): value is string {
  return typeof value === "string" && value.trim().length >= 8;
}

function readOrCreateScope(
  storage: CommandStorage,
  storageKey: string,
  createId: () => string,
): string {
  const key = scopeStorageKey(storageKey);
  const existing = storage.getItem(key);
  if (isValidIdentity(existing)) return existing;

  const candidate = createId();
  storage.setItem(key, candidate);
  const winner = storage.getItem(key);
  return isValidIdentity(winner) ? winner : candidate;
}

function generationStorageKey(
  storageKey: string,
  scopeId: string,
  fingerprint: string,
): string {
  return `${storageKey}:${scopeId}:${fingerprint}:generation`;
}

export function manualOrderCommandStorageKey(
  storageKey: string,
  requestJson: string,
  generation = 0,
  scopeId = "legacy-scope",
): string {
  return `${storageKey}:${scopeId}:${manualOrderRequestFingerprint(
    requestJson,
  )}:receipt:${generation}`;
}

function readGeneration(
  storage: CommandStorage,
  storageKey: string,
  scopeId: string,
  fingerprint: string,
): number {
  try {
    const raw = storage.getItem(
      generationStorageKey(storageKey, scopeId, fingerprint),
    );
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function deterministicCommandKey(
  scopeId: string,
  fingerprint: string,
  generation: number,
): string {
  return `manual-create-${scopeId}-${fingerprint}-${generation}`;
}

export function resolveManualOrderCommand(
  storage: CommandStorage,
  storageKey: string,
  requestJson: string,
  createId: () => string,
): ManualOrderCommandReceipt {
  const requests = activeMap(storage);
  const active = requests.get(storageKey);
  if (active) {
    return { requestJson, idempotencyKey: active.idempotencyKey };
  }

  let scopeId: string;
  try {
    scopeId = readOrCreateScope(storage, storageKey, createId);
  } catch {
    scopeId = createId();
  }

  const fingerprint = manualOrderRequestFingerprint(requestJson);
  const generation = readGeneration(storage, storageKey, scopeId, fingerprint);
  const receiptKey = manualOrderCommandStorageKey(
    storageKey,
    requestJson,
    generation,
    scopeId,
  );
  const deterministicKey = deterministicCommandKey(scopeId, fingerprint, generation);
  let idempotencyKey = deterministicKey;

  try {
    const raw = storage.getItem(receiptKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredManualOrderCommandReceipt>;
      const storedIdentity = parsed.idempotencyKey ?? null;
      if (
        parsed.version === 3 &&
        parsed.scopeId === scopeId &&
        parsed.requestFingerprint === fingerprint &&
        parsed.generation === generation &&
        isValidIdentity(storedIdentity)
      ) {
        idempotencyKey = storedIdentity;
      }
    } else {
      const stored: StoredManualOrderCommandReceipt = {
        version: 3,
        scopeId,
        requestFingerprint: fingerprint,
        generation,
        idempotencyKey: deterministicKey,
      };
      storage.setItem(receiptKey, JSON.stringify(stored));
    }
  } catch {
    idempotencyKey = createId();
  }

  requests.set(storageKey, {
    requestJson,
    scopeId,
    requestFingerprint: fingerprint,
    generation,
    idempotencyKey,
  });
  return { requestJson, idempotencyKey };
}

export function clearManualOrderCommand(
  storage: CommandStorage,
  storageKey: string,
): void {
  const requests = activeMap(storage);
  const active = requests.get(storageKey);
  if (!active) return;

  try {
    storage.removeItem(
      manualOrderCommandStorageKey(
        storageKey,
        active.requestJson,
        active.generation,
        active.scopeId,
      ),
    );
    const current = readGeneration(
      storage,
      storageKey,
      active.scopeId,
      active.requestFingerprint,
    );
    storage.setItem(
      generationStorageKey(storageKey, active.scopeId, active.requestFingerprint),
      String(Math.max(current, active.generation + 1)),
    );
  } catch {
    // Clearing remains best-effort when browser storage is unavailable.
  } finally {
    requests.delete(storageKey);
  }
}

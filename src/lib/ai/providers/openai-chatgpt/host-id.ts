/**
 * The stable, opaque ext_agent_host_id of this installation. A random UUIDv4
 * in `urn:uuid:` form, made once and kept in the settings table. Never built
 * from an email, a shop or any user data.
 */
import { randomUUID } from "node:crypto";

export const HOST_ID_SETTING_KEY = "ai_openai_chatgpt_host_id";

export interface HostIdStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

const UUID_URN_V4 = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The formats OpenAI accepts; this app only generates the urn:uuid one. */
export function isValidHostId(value: string): boolean {
  return UUID_URN_V4.test(value)
    || /^urn:ietf:params:oauth:jwk-thumbprint:\S+$/.test(value)
    || /^did:key:\S+$/.test(value);
}

export async function getOrCreateHostId(store: HostIdStore, uuid: () => string = randomUUID): Promise<string> {
  const existing = (await store.read())?.trim();
  if (existing && isValidHostId(existing)) return existing;
  await store.write(`urn:uuid:${uuid()}`);
  // Read back: if two first calls raced, both return the value that was kept.
  const kept = (await store.read())?.trim();
  if (!kept || !isValidHostId(kept)) throw new Error("The ChatGPT host id could not be saved");
  return kept;
}

/** The settings-table store (no migration). Imported late so the pure parts stay light. */
export function createSettingsHostIdStore(context: import("@/lib/data/service-base").ServiceContext): HostIdStore {
  return {
    read: async () => (await import("@/lib/settings")).getSetting(context, HOST_ID_SETTING_KEY),
    write: async (value) => (await import("@/lib/settings")).setSetting(context, HOST_ID_SETTING_KEY, value),
  };
}

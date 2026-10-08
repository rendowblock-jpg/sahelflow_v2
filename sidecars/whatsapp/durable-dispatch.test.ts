import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Boom } from "@hapi/boom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDispatchJournal,
  createDispatchObservingLogger,
  createDurableDispatcher,
  durableSendFailure,
  EffectBindingConflictError,
  PROVIDER_DISPATCH_MARKER_PREFIX,
  SendNotDispatchedError,
  SendOutcomeAmbiguousError,
  SendStillInFlightError,
  type DurableDispatcher,
} from "./durable-dispatch";
import { createDurableSendReceiptJournal } from "./send-receipts";

const EFFECT_KEY = `wa:${"a".repeat(32)}:${"b".repeat(64)}:text:message-1`;
const BINDING = "c".repeat(64);
const MESSAGE_ID = "3EB0DETERMINISTIC01";

let directory: string;

function makeDispatcher(onMarkerUnavailable?: () => void): DurableDispatcher {
  return createDurableDispatcher({
    receipts: createDurableSendReceiptJournal(join(directory, "receipts.json")),
    dispatches: createDispatchJournal(join(directory, "dispatches.json")),
    onMarkerUnavailable,
  });
}

function request(
  dispatcher: DurableDispatcher,
  dispatch: () => Promise<{ id: string; status: string }>,
  overrides: Partial<{ deadline: number; binding: string; onSettled: () => void }> = {},
) {
  return dispatcher.execute({
    effectKey: EFFECT_KEY,
    requestBinding: overrides.binding ?? BINDING,
    providerMessageId: MESSAGE_ID,
    dispatch,
    responseDeadlineMs: overrides.deadline ?? 5_000,
    onSettled: overrides.onSettled,
  });
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "sf-dispatch-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("durable WhatsApp dispatch authority", () => {
  it("retries a failure that happened before anything reached WhatsApp", async () => {
    const dispatcher = makeDispatcher();
    await expect(
      request(dispatcher, async () => {
        throw new Boom("Timed Out", { statusCode: 408 });
      }),
    ).rejects.toBeInstanceOf(SendNotDispatchedError);

    const second = vi.fn(async () => {
      dispatcher.observeProviderDispatch(MESSAGE_ID);
      return { id: MESSAGE_ID, status: "1" };
    });
    await expect(request(dispatcher, second)).resolves.toEqual({
      id: MESSAGE_ID,
      status: "1",
      replayed: false,
    });
    expect(second).toHaveBeenCalledTimes(1);
    // The receipt now answers every later request without dispatching again.
    const third = vi.fn();
    await expect(request(dispatcher, third)).resolves.toMatchObject({ replayed: true });
    expect(third).not.toHaveBeenCalled();
  });

  it("never repeats a dispatch that may have reached WhatsApp", async () => {
    const dispatcher = makeDispatcher();
    await expect(
      request(dispatcher, async () => {
        dispatcher.observeProviderDispatch(MESSAGE_ID);
        throw new Boom("Timed Out", { statusCode: 408 });
      }),
    ).rejects.toBeInstanceOf(SendOutcomeAmbiguousError);

    const again = vi.fn();
    const repeated = makeDispatcher();
    await expect(request(repeated, again)).rejects.toMatchObject({
      name: "SendOutcomeAmbiguousError",
      reason: "timed_out",
    });
    expect(again).not.toHaveBeenCalled();
  });

  it("treats a closed socket after the marker as not sent", async () => {
    const dispatcher = makeDispatcher();
    await expect(
      request(dispatcher, async () => {
        dispatcher.observeProviderDispatch(MESSAGE_ID);
        throw new Boom("Connection Closed", { statusCode: 428 });
      }),
    ).rejects.toMatchObject({ name: "SendNotDispatchedError", reason: "connection_closed" });
    expect(createDispatchJournal(join(directory, "dispatches.json")).find(EFFECT_KEY)).toBeNull();
  });

  it("fails closed when a previous sidecar crashed after the dispatch marker", async () => {
    createDispatchJournal(join(directory, "dispatches.json")).record(EFFECT_KEY, {
      requestBinding: BINDING,
      state: "dispatching",
      reason: "dispatch_started",
      recordedAt: new Date().toISOString(),
    });
    const dispatch = vi.fn();
    await expect(request(makeDispatcher(), dispatch)).rejects.toMatchObject({
      reason: "dispatch_interrupted",
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("answers 'in progress' at the deadline and lets the next request join the same dispatch", async () => {
    vi.useFakeTimers();
    try {
      const dispatcher = makeDispatcher();
      let finish!: (value: { id: string; status: string }) => void;
      const dispatch = vi.fn(
        () =>
          new Promise<{ id: string; status: string }>((resolve) => {
            dispatcher.observeProviderDispatch(MESSAGE_ID);
            finish = resolve;
          }),
      );
      const onSettled = vi.fn();
      const first = request(dispatcher, dispatch, { deadline: 1_000, onSettled });
      const firstOutcome = expect(first).rejects.toBeInstanceOf(SendStillInFlightError);
      await vi.advanceTimersByTimeAsync(1_000);
      await firstOutcome;
      expect(onSettled).not.toHaveBeenCalled();
      expect(dispatcher.inFlight(EFFECT_KEY)).toBe(true);

      const joined = request(dispatcher, vi.fn(), { deadline: 1_000 });
      finish({ id: MESSAGE_ID, status: "1" });
      await expect(joined).resolves.toMatchObject({ id: MESSAGE_ID, replayed: false });
      expect(dispatch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(onSettled).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a different payload under the same effect key", async () => {
    const dispatcher = makeDispatcher();
    await request(dispatcher, async () => {
      dispatcher.observeProviderDispatch(MESSAGE_ID);
      return { id: MESSAGE_ID, status: "1" };
    });
    await expect(
      request(dispatcher, vi.fn(), { binding: "d".repeat(64) }),
    ).rejects.toBeInstanceOf(EffectBindingConflictError);
  });

  it("fails closed for every later failure once the provider stops emitting the marker", async () => {
    const onMarkerUnavailable = vi.fn();
    const dispatcher = makeDispatcher(onMarkerUnavailable);
    await request(dispatcher, async () => ({ id: MESSAGE_ID, status: "1" }));
    expect(onMarkerUnavailable).toHaveBeenCalledTimes(1);

    await expect(
      dispatcher.execute({
        effectKey: `${EFFECT_KEY}-2`,
        requestBinding: BINDING,
        providerMessageId: "OTHER",
        dispatch: async () => {
          throw new Error("Not connected (status=connecting)");
        },
        responseDeadlineMs: 1_000,
      }),
    ).rejects.toBeInstanceOf(SendOutcomeAmbiguousError);
  });

  it("maps every outcome to the app's retry contract", () => {
    expect(durableSendFailure(new SendNotDispatchedError("not_connected"))).toMatchObject({
      status: 503,
      body: { code: "WHATSAPP_SEND_NOT_DISPATCHED", retryable: true, ambiguous: false },
    });
    expect(durableSendFailure(new SendStillInFlightError())).toMatchObject({
      status: 503,
      body: { code: "WHATSAPP_SEND_IN_PROGRESS", retryable: true, ambiguous: false },
    });
    expect(durableSendFailure(new SendOutcomeAmbiguousError("timed_out"))).toMatchObject({
      status: 502,
      body: { code: "WHATSAPP_SEND_AMBIGUOUS", retryable: false, ambiguous: true },
    });
    expect(durableSendFailure(new EffectBindingConflictError())).toMatchObject({
      status: 409,
      body: { code: "EFFECT_KEY_CONFLICT", retryable: false, ambiguous: false },
    });
  });
});

describe("dispatch-observing provider logger", () => {
  it("forwards every call and reports only the dispatch marker", () => {
    const base = {
      level: "warn",
      child: vi.fn(() => ({})),
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const seen: string[] = [];
    const logger = createDispatchObservingLogger(base, (id) => seen.push(id));

    logger.debug({ msgId: "A1" }, `${PROVIDER_DISPATCH_MARKER_PREFIX}3 devices`);
    logger.debug({ msgId: "B2" }, "fetched media conn");
    logger.warn({ x: 1 }, "w");
    expect(seen).toEqual(["A1"]);
    expect(base.debug).toHaveBeenCalledTimes(2);
    expect(base.warn).toHaveBeenCalledWith({ x: 1 }, "w");
    expect(logger.level).toBe("warn");
  });
});

describe("installed Baileys dispatch contract", () => {
  it("logs the dispatch marker immediately before writing the message node", () => {
    const sidecarDirectory = dirname(fileURLToPath(import.meta.url));
    const require = createRequire(join(sidecarDirectory, "package.json"));
    const packageJson = require.resolve("@whiskeysockets/baileys/package.json");
    const source = readFileSync(
      join(dirname(packageJson), "lib/Socket/messages-send.js"),
      "utf8",
    );
    const marker = source.indexOf(
      "logger.debug({ msgId }, `sending message to ${participants.length} devices`);",
    );
    expect(marker).toBeGreaterThan(0);
    const next = source.slice(marker).split("\n")[1]?.trim();
    expect(next).toBe("await sendNode(stanza);");
    // relayMessage takes the logger straight from the socket config, so the
    // observing adapter sees this exact call.
    expect(source).toMatch(/const \{ logger, [^}]*\} = config;/);
  });
});

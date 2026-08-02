import "server-only";

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";

import { getMasterKey } from "@/lib/crypto/master-key";
import { dataRoot } from "@/lib/storage/data-root";
import { SahelFlowError } from "@/types/errors";

const FORMAT_VERSION = 1 as const;
const REQUEST_MAC_DOMAIN = "sahelflow.license-native-revocation.request.v1";
const ACK_MAC_DOMAIN = "sahelflow.license-native-revocation.ack.v1";
const COMMAND_KEY_DOMAIN = "sahelflow.license-native-command.key.v1";
const REQUEST_TIMEOUT_MS = 5_000;

const acknowledgementSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    requestId: z.string().regex(/^[0-9a-f]{32}$/),
    minimumRevocationEpoch: z.number().int().nonnegative().safe(),
    highWaterMs: z.number().int().nonnegative().safe(),
    mac: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

function commandDirectory(): string {
  return join(dataRoot(), "system", "license-native-requests");
}

function commandKey(): Buffer {
  const root = getMasterKey();
  return createHmac("sha256", root).update(COMMAND_KEY_DOMAIN, "utf8").digest();
}

function requestMacFor(
  key: Buffer,
  requestId: string,
  minimumRevocationEpoch: number,
): string {
  return createHmac("sha256", key)
    .update(REQUEST_MAC_DOMAIN, "utf8")
    .update("\0", "utf8")
    .update(requestId, "utf8")
    .update("\0", "utf8")
    .update(String(minimumRevocationEpoch), "utf8")
    .digest("hex");
}

function acknowledgementMacFor(
  key: Buffer,
  requestId: string,
  minimumRevocationEpoch: number,
  highWaterMs: number,
): string {
  return createHmac("sha256", key)
    .update(ACK_MAC_DOMAIN, "utf8")
    .update("\0", "utf8")
    .update(requestId, "utf8")
    .update("\0", "utf8")
    .update(String(minimumRevocationEpoch), "utf8")
    .update("\0", "utf8")
    .update(String(highWaterMs), "utf8")
    .digest("hex");
}

function atomicWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // Preserve the publication failure.
    }
    throw error;
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function removeIfPresent(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // The request ID is one-use; stale authenticated files are safe to retry.
  }
}

export async function advanceNativeRevocationFloor(
  minimumRevocationEpoch: number,
): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (!Number.isSafeInteger(minimumRevocationEpoch) || minimumRevocationEpoch < 0) {
    throw new TypeError("Native revocation floor must be a non-negative safe integer");
  }

  const requestId = randomUUID().replaceAll("-", "");
  const directory = commandDirectory();
  const requestPath = join(directory, `${requestId}.request.json`);
  const acknowledgementPath = join(directory, `${requestId}.ack.json`);
  const key = commandKey();
  try {
    atomicWrite(requestPath, {
      formatVersion: FORMAT_VERSION,
      requestId,
      minimumRevocationEpoch,
      mac: requestMacFor(key, requestId, minimumRevocationEpoch),
    });

    const deadline = Date.now() + REQUEST_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!existsSync(acknowledgementPath)) {
        await delay(25);
        continue;
      }
      let parsed: z.infer<typeof acknowledgementSchema>;
      try {
        parsed = acknowledgementSchema.parse(
          JSON.parse(readFileSync(acknowledgementPath, "utf8")),
        );
      } catch {
        removeIfPresent(acknowledgementPath);
        await delay(25);
        continue;
      }
      const expected = Buffer.from(
        acknowledgementMacFor(
          key,
          parsed.requestId,
          parsed.minimumRevocationEpoch,
          parsed.highWaterMs,
        ),
        "hex",
      );
      const supplied = Buffer.from(parsed.mac, "hex");
      if (
        parsed.requestId !== requestId ||
        parsed.minimumRevocationEpoch < minimumRevocationEpoch ||
        expected.length !== supplied.length ||
        !timingSafeEqual(expected, supplied)
      ) {
        removeIfPresent(acknowledgementPath);
        await delay(25);
        continue;
      }
      process.env.SF_LICENSE_CLOCK_ANCHOR_STATUS = "ready";
      process.env.SF_LICENSE_CLOCK_ANCHOR_MS = String(parsed.highWaterMs);
      process.env.SF_LICENSE_REVOCATION_FLOOR = String(parsed.minimumRevocationEpoch);
      removeIfPresent(requestPath);
      removeIfPresent(acknowledgementPath);
      return;
    }
  } finally {
    key.fill(0);
  }
  throw new SahelFlowError(
    "Native commercial authority did not commit the revocation floor",
    "LICENSE_NATIVE_AUTHORITY_TIMEOUT",
    503,
  );
}

/**
 * Phone reputation registry.
 *
 * Phone numbers are never stored as plaintext. Runtime writes and lookups use
 * the Phase 4 purpose-separated per-shop blind-index authority. Legacy
 * installation-root hashes are rewritten by the mandatory protected-data
 * migration before the runtime becomes authoritative.
 */
import "server-only";
import type { ServiceContext } from "@/lib/data/service-base";
import {
  deriveExistingShopBlindIndex,
  deriveShopBlindIndex,
} from "@/lib/crypto/protected-record";

type BlindIndexClient = Parameters<typeof deriveShopBlindIndex>[0];

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "");
}

async function phoneHashForWrite(
  context: ServiceContext,
  phone: string,
): Promise<string> {
  return deriveShopBlindIndex(
    context.prisma as unknown as BlindIndexClient,
    normalizePhone(phone),
    { recordType: "PhoneReputation", field: "phone" },
    context.shop ? { shopContext: context.shop } : {},
  );
}

async function phoneHashForRead(
  context: ServiceContext,
  phone: string,
): Promise<string | null> {
  return deriveExistingShopBlindIndex(
    context.prisma as unknown as BlindIndexClient,
    normalizePhone(phone),
    { recordType: "PhoneReputation", field: "phone" },
    context.shop ? { shopContext: context.shop } : {},
  );
}

export async function reportBadPhone(
  context: ServiceContext,
  phone: string,
  reason: string,
  orderId?: string,
): Promise<{ success: true; total: number }> {
  const db = context.prisma;
  const phoneHash = await phoneHashForWrite(context, phone);
  const normalized = normalizePhone(phone);
  const last4 = normalized.length >= 4 ? normalized.slice(-4) : normalized;
  const now = new Date();
  const noteEntry = orderId ? `[${orderId}] ${reason}` : reason;

  await db.phoneReputation.upsert({
    where: { phoneHash },
    create: {
      phoneHash,
      last4,
      severity: "bad",
      notes: noteEntry,
      reportCount: 1,
      lastSeenAt: now,
    },
    update: {
      last4,
      reportCount: { increment: 1 },
      lastSeenAt: now,
      notes: noteEntry,
    },
  });

  let total = 1;
  try {
    total = await db.phoneReputation.count();
  } catch {
    // Best-effort count only; the authoritative upsert has committed.
  }
  return { success: true, total };
}

export async function checkPhoneReputation(
  context: ServiceContext,
  phone: string,
): Promise<{
  isBad: boolean;
  reason?: string;
  reportedAt?: string;
}> {
  const phoneHash = await phoneHashForRead(context, phone);
  if (!phoneHash) return { isBad: false };

  const entry = await context.prisma.phoneReputation.findUnique({
    where: { phoneHash },
    select: { notes: true, lastSeenAt: true },
  });
  if (!entry) return { isBad: false };
  return {
    isBad: true,
    reason: entry.notes ?? "(no reason recorded)",
    reportedAt: entry.lastSeenAt.toISOString(),
  };
}

export async function getBadPhoneList(context: ServiceContext): Promise<
  Array<{ phoneHash: string; phoneTail?: string; reason: string; at: string }>
> {
  const rows = await context.prisma.phoneReputation.findMany({
    orderBy: { lastSeenAt: "desc" },
    select: { phoneHash: true, last4: true, notes: true, lastSeenAt: true },
  });
  return rows.map((row) => ({
    phoneHash: row.phoneHash,
    phoneTail: row.last4 ?? undefined,
    reason: row.notes ?? "(no reason recorded)",
    at: row.lastSeenAt.toISOString(),
  }));
}

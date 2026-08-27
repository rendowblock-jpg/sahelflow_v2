import "server-only";

import { db, shopContext } from "@/lib/db";
import {
  commitWhatsAppMediaErase,
  rollbackWhatsAppMediaErase,
  stageWhatsAppMediaErase,
  type WhatsAppMediaEraseStage,
} from "@/lib/whatsapp/media-erase-lifecycle";
import { withWhatsAppMediaLifecycleLease } from "@/lib/whatsapp/media-lifecycle-authority";
import { whatsAppMediaRoot } from "@/lib/whatsapp/media-object-store";
import {
  executeShopErase,
  type PrivacyEraseMode,
  type PrivacyLifecycleReceipt,
} from "./lifecycle";

const context = { prisma: db, shop: shopContext } as const;
type MediaEraseContext = Parameters<typeof whatsAppMediaRoot>[0];

/**
 * Shared local lifecycle coordinator for destructive DB + WhatsApp media work.
 *
 * Production passes the governed `executeShopErase` operation below. Focused
 * integration tests may pass a test-scoped DB deletion while still exercising
 * this exact lease/tombstone/commit boundary; this avoids running an all-shop
 * destructive erase inside Vitest's shared canonical database.
 */
export async function coordinateShopEraseWithMedia<T>(
  eraseContext: MediaEraseContext,
  eraseDatabase: () => Promise<T>,
): Promise<T> {
  const mediaRoot = whatsAppMediaRoot(eraseContext);
  return withWhatsAppMediaLifecycleLease(mediaRoot, async () => {
    const stage = stageWhatsAppMediaErase(mediaRoot);
    let receipt: T;
    try {
      receipt = await eraseDatabase();
    } catch (error) {
      rollbackWhatsAppMediaErase(stage);
      throw error;
    }
    finalizeWhatsAppMediaErase(stage);
    return receipt;
  });
}

/**
 * Destructive privacy authority across SQLite + filesystem media.
 *
 * The exact shop lifecycle lease serializes this destructive sequence with
 * outbound media staging + durable Message/outbox commit in the same process.
 * Crash-left safety still belongs to the tombstone/epoch protocol below.
 *
 * The media tree is hidden first. If the transactional DB erase fails, only a
 * tombstone created by this request is restored. Once the DB transaction has
 * committed, media deletion is final: a filesystem failure leaves the encrypted
 * tree hidden in its deterministic tombstone for a safe retry rather than
 * re-exposing data whose canonical rows were already erased.
 */
export async function executeShopEraseWithMedia(
  mode: PrivacyEraseMode,
): Promise<PrivacyLifecycleReceipt> {
  return coordinateShopEraseWithMedia(context, async () => {
    let receipt: PrivacyLifecycleReceipt | null = null;
    receipt = await executeShopErase(mode);
    return receipt;
  });
}

/**
 * Keep the established destructive-erase source ordering explicit while the
 * generic coordinator remains reusable by focused race tests.
 */
function finalizeWhatsAppMediaErase(stage: WhatsAppMediaEraseStage): void {
  commitWhatsAppMediaErase(stage);
}

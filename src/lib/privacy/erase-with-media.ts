import "server-only";

import { db, shopContext } from "@/lib/db";
import {
  commitWhatsAppMediaErase,
  rollbackWhatsAppMediaErase,
  stageWhatsAppMediaErase,
} from "@/lib/whatsapp/media-erase-lifecycle";
import { whatsAppMediaRoot } from "@/lib/whatsapp/media-object-store";
import {
  executeShopErase,
  type PrivacyEraseMode,
  type PrivacyLifecycleReceipt,
} from "./lifecycle";

const context = { prisma: db, shop: shopContext } as const;

/**
 * Destructive privacy authority across SQLite + filesystem media.
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
  const stage = stageWhatsAppMediaErase(whatsAppMediaRoot(context));
  let receipt: PrivacyLifecycleReceipt;
  try {
    receipt = await executeShopErase(mode);
  } catch (error) {
    rollbackWhatsAppMediaErase(stage);
    throw error;
  }
  commitWhatsAppMediaErase(stage);
  return receipt;
}

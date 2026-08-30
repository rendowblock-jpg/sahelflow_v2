import "server-only";

import {
  constants,
  createDecipheriv,
  createHash,
  createPrivateKey,
  privateDecrypt,
} from "node:crypto";
import { z } from "zod";
import {
  parseStorefrontCustomerCiphertext,
  storefrontReceiptAadValue,
} from "../../../control-plane/storefront/receipt-protocol";
import { dispatchTrigger, type TriggerEvent } from "@/lib/automations/engine";
import { sourceBusinessPrincipal } from "@/lib/business-truth/principal";
import type { ServiceContext } from "@/lib/data/service-base";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { parseStorefrontReleaseItemKey } from "@/lib/storefront/release-artifact";
import { NotFoundError, ValidationError } from "@/types/errors";
import { logger } from "@/lib/logger";
import type { ConnectedPlatformClient, StorefrontReceipt } from "./client";
import { releaseRejectedStorefrontReceiptDelegation } from "./storefront-receipt-delegation";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const ITEM_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const receiptSchema = z.object({
  relaySequence: z.number().int().positive(),
  receiptId: z.string().regex(ID),
  storefrontId: z.string().regex(ID),
  storefrontSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/),
  shopId: z.string().regex(ID),
  releaseId: z.string().regex(ID),
  idempotencyKey: z.string().regex(ID),
  requestDigest: z.string().regex(/^[0-9a-f]{64}$/),
  encryptedCustomer: z.string().regex(BASE64).max(64 * 1024),
  wrappedCustomerKey: z.string().regex(BASE64).max(4_096),
  wilayaCode: z.string().regex(/^(0[1-9]|[1-5][0-9]|6[0-9])$/),
  deliveryMode: z.enum(["home", "desk"]),
  subtotalDzd: z.number().int().nonnegative(),
  shippingDzd: z.number().int().nonnegative(),
  totalDzd: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  lines: z.array(z.object({
    itemKey: z.string().regex(ITEM_KEY),
    quantity: z.number().int().min(1).max(100),
    unitPriceDzd: z.number().int().nonnegative(),
  }).strict()).min(1).max(50),
}).strict();

const customerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40),
  wilayaCode: z.string().regex(/^(0[1-9]|[1-5][0-9]|6[0-9])$/),
  commune: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(500).nullable().optional(),
}).strict();

function receiptDigest(receipt: StorefrontReceipt, orderId: string): string {
  return createHash("sha256")
    .update(`${receipt.receiptId}\n${receipt.requestDigest}\n${orderId}`, "utf8")
    .digest("hex");
}

function rejectionDigest(
  receiptId: string,
  requestDigest: string | null,
  code: string,
): string {
  return createHash("sha256")
    .update(`${receiptId}\n${requestDigest ?? "unknown"}\nrejected\n${code}`, "utf8")
    .digest("hex");
}

function validateReceiptTotals(receipt: z.infer<typeof receiptSchema>): void {
  const itemKeys = new Set<string>();
  let subtotal = 0;
  for (const line of receipt.lines) {
    if (itemKeys.has(line.itemKey)) throw new Error("Storefront receipt contains duplicate lines");
    itemKeys.add(line.itemKey);
    const total = line.unitPriceDzd * line.quantity;
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(subtotal + total)) {
      throw new Error("Storefront receipt amount exceeds the safe integer range");
    }
    subtotal += total;
  }
  if (subtotal !== receipt.subtotalDzd || subtotal + receipt.shippingDzd !== receipt.totalDzd) {
    throw new Error("Storefront receipt totals are inconsistent");
  }
}

export function decryptStorefrontReceiptCustomer(
  rawReceipt: StorefrontReceipt,
  encryptionPrivateKeyPkcs8: string,
): z.infer<typeof customerSchema> {
  const receipt = receiptSchema.parse(rawReceipt);
  validateReceiptTotals(receipt);
  const sealed = parseStorefrontCustomerCiphertext(receipt.encryptedCustomer);
  if (!sealed) throw new Error("Storefront customer ciphertext is invalid");
  const aadValue = storefrontReceiptAadValue({
    storefrontId: receipt.storefrontId,
    releaseId: receipt.releaseId,
    idempotencyKey: receipt.idempotencyKey,
    wilayaCode: receipt.wilayaCode,
    deliveryMode: receipt.deliveryMode,
  });
  const expectedAadDigest = createHash("sha256").update(aadValue, "utf8").digest("hex");
  if (sealed.aadDigest !== expectedAadDigest) {
    throw new Error("Storefront customer binding is invalid");
  }
  const privateKey = createPrivateKey({
    key: Buffer.from(encryptionPrivateKeyPkcs8, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const contentKey = privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(receipt.wrappedCustomerKey, "base64"),
  );
  let plaintext: Buffer | null = null;
  try {
    if (contentKey.byteLength !== 32) throw new Error("Storefront customer key is invalid");
    const payload = Buffer.from(sealed.ciphertext, "base64");
    const tag = payload.subarray(payload.byteLength - 16);
    const ciphertext = payload.subarray(0, payload.byteLength - 16);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      contentKey,
      Buffer.from(sealed.iv, "base64"),
      { authTagLength: 16 },
    );
    decipher.setAAD(Buffer.from(aadValue, "utf8"));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const customer = customerSchema.parse(JSON.parse(plaintext.toString("utf8")) as unknown);
    if (customer.wilayaCode !== receipt.wilayaCode) {
      throw new Error("Storefront customer wilaya binding is invalid");
    }
    return customer;
  } finally {
    contentKey.fill(0);
    plaintext?.fill(0);
  }
}

/**
 * C1 poison-receipt classification. A receipt that fails any intake check is
 * receipt-scoped corruption: it must be marked rejected on the relay and the
 * page must continue — the legacy loop threw past the governed rejection
 * handler, so one malformed hosted receipt aborted the whole page, the
 * silent worker catch hid the failure, and the cursor never advanced again
 * (permanent silent stall of storefront ingestion).
 *
 * Customer-decryption failures are the one exception: they can also mean the
 * desktop enrollment key is broken (systemic). The page-level heuristic in
 * importHostedStorefrontReceipts rejects isolated decrypt failures but
 * refuses a page where EVERY receipt failed decryption, preserving the
 * durable retry instead of poison-rejecting importable orders.
 */
type PoisonReceiptCode =
  | "malformed_receipt"
  | "shop_authority_mismatch"
  | "receipt_integrity"
  | "customer_payload"
  | "item_authority";

interface ParsedReceiptLine {
  productId: string;
  productVariantId: string | null;
  quantity: number;
  unitPrice: number;
}

type ReceiptIntake = Readonly<
  | {
      ok: true;
      receipt: z.infer<typeof receiptSchema>;
      customer: z.infer<typeof customerSchema>;
      items: ParsedReceiptLine[];
    }
  | {
      ok: false;
      code: PoisonReceiptCode;
      receipt: z.infer<typeof receiptSchema> | null;
      items: ParsedReceiptLine[] | null;
    }
>;

function intakeStorefrontReceipt(
  rawReceipt: StorefrontReceipt,
  shopId: string,
  encryptionPrivateKeyPkcs8: string,
): ReceiptIntake {
  const parsed = receiptSchema.safeParse(rawReceipt);
  if (!parsed.success) {
    return Object.freeze({ ok: false, code: "malformed_receipt", receipt: null, items: null });
  }
  const receipt = parsed.data;
  if (receipt.shopId !== shopId) {
    return Object.freeze({ ok: false, code: "shop_authority_mismatch", receipt, items: null });
  }
  const items: ParsedReceiptLine[] = [];
  for (const line of receipt.lines) {
    const authority = parseStorefrontReleaseItemKey(line.itemKey);
    if (!authority) {
      return Object.freeze({ ok: false, code: "item_authority", receipt, items: null });
    }
    items.push({
      productId: authority.productId,
      productVariantId: authority.variantId,
      quantity: line.quantity,
      unitPrice: line.unitPriceDzd,
    });
  }
  try {
    validateReceiptTotals(receipt);
  } catch {
    return Object.freeze({ ok: false, code: "receipt_integrity", receipt, items });
  }
  try {
    const customer = decryptStorefrontReceiptCustomer(receipt, encryptionPrivateKeyPkcs8);
    return Object.freeze({ ok: true, receipt, customer, items });
  } catch {
    return Object.freeze({ ok: false, code: "customer_payload", receipt, items });
  }
}

/**
 * Best-effort rejection marking for a poison receipt. A receipt whose shape
 * is too broken to yield an addressable id, or one the relay refuses (e.g.
 * delivered under another shop's authority), is warn-logged and skipped —
 * the page cursor still advances past it, so ingestion can never stall.
 */
async function rejectPoisonStorefrontReceipt(
  client: ConnectedPlatformClient,
  workspaceId: string,
  shopId: string,
  receipt: z.infer<typeof receiptSchema> | null,
  code: PoisonReceiptCode,
  fallbackReceiptId?: unknown,
  fallbackRequestDigest?: unknown,
): Promise<void> {
  const receiptId = typeof receipt?.receiptId === "string"
    ? receipt.receiptId
    : typeof fallbackReceiptId === "string"
      ? fallbackReceiptId
      : null;
  const requestDigest = typeof receipt?.requestDigest === "string"
    ? receipt.requestDigest
    : typeof fallbackRequestDigest === "string"
      ? fallbackRequestDigest
      : null;
  if (receiptId === null || !ID.test(receiptId)) {
    logger.warn("storefront.receipt.poison_unaddressable", { code });
    return;
  }
  try {
    await client.completeStorefrontReceipt(receiptId, {
      workspaceId,
      shopId,
      state: "rejected",
      resultDigest: rejectionDigest(receiptId, requestDigest, code),
    });
  } catch (error) {
    logger.warn("storefront.receipt.poison_reject_refused", {
      receiptId,
      code,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function importHostedStorefrontReceipts(input: Readonly<{
  client: ConnectedPlatformClient;
  context: ServiceContext;
  workspaceId: string;
  encryptionPrivateKeyPkcs8: string;
  after: number;
  limit?: number;
}>): Promise<Readonly<{ imported: number; replayed: number; nextCursor: number }>> {
  const shop = input.context.shop;
  if (!shop) {
    throw new Error("Storefront receipt import requires an active shop authority");
  }
  if (input.workspaceId !== shop.workspaceId) {
    throw new Error("Storefront receipt workspace authority does not match the active shop");
  }
  const page = await input.client.pollStorefrontReceipts(
    input.workspaceId,
    shop.shopId,
    input.after,
    input.limit ?? 50,
  );
  if (!Number.isSafeInteger(page.nextCursor) || page.nextCursor < input.after) {
    throw new Error("Storefront receipt cursor is invalid");
  }
  // Fail fast on an unusable enrollment key: a broken key is a systemic
  // authority failure, never a receipt-scoped poison signal.
  createPrivateKey({
    key: Buffer.from(input.encryptionPrivateKeyPkcs8, "base64"),
    format: "der",
    type: "pkcs8",
  });

  // Classify every receipt in the page before importing anything, so the
  // decryption-authority heuristic can distinguish isolated corruption from
  // a broken enrollment key.
  const intakes = page.receipts.map((rawReceipt) => ({
    rawReceipt,
    intake: intakeStorefrontReceipt(rawReceipt, shop.shopId, input.encryptionPrivateKeyPkcs8),
  }));
  const decryptFailures = intakes.filter(
    (entry) => !entry.intake.ok && entry.intake.code === "customer_payload",
  );
  if (decryptFailures.length > 0 && decryptFailures.length === intakes.length) {
    throw new Error(
      `Storefront receipt decryption failed for all ${decryptFailures.length} receipts in the page — enrollment key or storefront binding authority is broken`,
    );
  }

  let imported = 0;
  let replayed = 0;
  for (const entry of intakes) {
    if (!entry.intake.ok) {
      const { code, receipt, items } = entry.intake;
      // Release the checkout delegation only when the full item list parsed
      // and the receipt is under this shop's authority. Release failure is
      // warn-logged and never blocks the rejection marking: the relay-side
      // delegation expiry covers what we cannot release here.
      if (receipt && items) {
        const businessContext = {
          ...input.context,
          businessPrincipal: sourceBusinessPrincipal("storefront", receipt.storefrontSlug),
        };
        try {
          await releaseRejectedStorefrontReceiptDelegation(businessContext, {
            receiptId: receipt.receiptId,
            releaseId: receipt.releaseId,
            items: items.map((item) => ({
              productId: item.productId,
              productVariantId: item.productVariantId,
              quantity: item.quantity,
            })),
          });
        } catch (releaseError) {
          logger.warn(
            "storefront.receipt.poison_release_failed",
            {
              receiptId: receipt.receiptId,
              code,
              reason: releaseError instanceof Error ? releaseError.message : String(releaseError),
            },
          );
        }
      }
      await rejectPoisonStorefrontReceipt(
        input.client,
        input.workspaceId,
        shop.shopId,
        receipt,
        code,
        entry.rawReceipt.receiptId,
        entry.rawReceipt.requestDigest,
      );
      continue;
    }
    const { receipt, customer, items } = entry.intake;
    const businessContext = {
      ...input.context,
      businessPrincipal: sourceBusinessPrincipal("storefront", receipt.storefrontSlug),
    };
    let command;
    try {
      command = await createCanonicalSourceOrder(
        businessContext,
        {
          idempotencyKey: `storefront-hosted:${receipt.receiptId}`,
          correlationId: `storefront-hosted:${receipt.receiptId}`,
          source: "storefront",
          sourceIdentity: `hosted:${receipt.storefrontId}`,
          sourceOrderId: receipt.receiptId,
          sourceRevision: receipt.requestDigest,
          sourceDetails: {
            hostedDelegationAuthority: "v1",
            hostedStorefrontId: receipt.storefrontId,
            hostedReleaseId: receipt.releaseId,
            hostedDeliveryMode: receipt.deliveryMode,
            hostedTotalDzd: receipt.totalDzd,
          },
          newCustomer: {
            name: customer.name,
            phone: customer.phone,
            wilaya: customer.wilayaCode,
            commune: customer.commune,
            address: customer.address,
          },
          items,
          wilaya: customer.wilayaCode,
          commune: customer.commune,
          address: customer.address,
          phone: customer.phone,
          deliveryCost: receipt.shippingDzd,
          notes: customer.notes,
        },
      );
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        await releaseRejectedStorefrontReceiptDelegation(businessContext, {
          receiptId: receipt.receiptId,
          releaseId: receipt.releaseId,
          items: items.map((item) => ({
            productId: item.productId,
            productVariantId: item.productVariantId,
            quantity: item.quantity,
          })),
        });
        await input.client.completeStorefrontReceipt(receipt.receiptId, {
          workspaceId: input.workspaceId,
          shopId: shop.shopId,
          state: "rejected",
          resultDigest: rejectionDigest(receipt.receiptId, receipt.requestDigest, "catalog_conflict"),
        });
        continue;
      }
      throw error;
    }
    await dispatchTrigger(
      input.context,
      "order.created" as TriggerEvent,
      command.result.automation,
      {
        triggerKey: `order.created:${command.result.order.id}`,
        occurredAt: command.result.order.createdAt,
      },
    );
    await input.client.completeStorefrontReceipt(receipt.receiptId, {
      workspaceId: input.workspaceId,
      shopId: shop.shopId,
      state: "imported",
      canonicalOrderRef: command.result.order.id,
      resultDigest: receiptDigest(receipt, command.result.order.id),
    });
    if (command.replayed) replayed += 1;
    else imported += 1;
  }
  return Object.freeze({ imported, replayed, nextCursor: page.nextCursor });
}

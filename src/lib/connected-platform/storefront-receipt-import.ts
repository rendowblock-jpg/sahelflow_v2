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
import type { ConnectedPlatformClient, StorefrontReceipt } from "./client";

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

function rejectionDigest(receipt: StorefrontReceipt, code: string): string {
  return createHash("sha256")
    .update(`${receipt.receiptId}\n${receipt.requestDigest}\nrejected\n${code}`, "utf8")
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
  let imported = 0;
  let replayed = 0;
  for (const rawReceipt of page.receipts) {
    const receipt = receiptSchema.parse(rawReceipt);
    if (receipt.shopId !== shop.shopId) {
      throw new Error("Storefront receipt targets another shop authority");
    }
    validateReceiptTotals(receipt);
    const customer = decryptStorefrontReceiptCustomer(receipt, input.encryptionPrivateKeyPkcs8);
    const items = receipt.lines.map((line) => {
      const authority = parseStorefrontReleaseItemKey(line.itemKey);
      if (!authority) throw new Error("Storefront receipt item authority is invalid");
      return {
        productId: authority.productId,
        productVariantId: authority.variantId,
        quantity: line.quantity,
        unitPrice: line.unitPriceDzd,
      };
    });
    let command;
    try {
      command = await createCanonicalSourceOrder(
        {
          ...input.context,
          businessPrincipal: sourceBusinessPrincipal("storefront", receipt.storefrontSlug),
        },
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
        await input.client.completeStorefrontReceipt(receipt.receiptId, {
          workspaceId: input.workspaceId,
          shopId: shop.shopId,
          state: "rejected",
          resultDigest: rejectionDigest(receipt, "catalog_conflict"),
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

import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import {
  decryptString,
  isEncryptedPayload,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";
import { ProtectedDataCorruptionError } from "@/lib/crypto/protected-data-error";
import { resolveShopProtectedKey } from "@/lib/crypto/protected-key-authority";
import { classifyProtectedValue } from "@/lib/crypto/protected-value-classification";
import {
  openProtectedString,
  sealProtectedString,
  type ShopRecordProtectedValueBinding,
} from "@/lib/crypto/protected-value";
import type { ShopContext } from "@/lib/shops/context";

const BLIND_INDEX_DOMAIN = Buffer.from(
  "sahelflow.shop-blind-index.v1\0",
  "utf8",
);

export const CUSTOMER_PROTECTED_FIELDS = [
  "name",
  "phone2",
  "address",
  "notes",
] as const;
export const ORDER_PROTECTED_FIELDS = ["phone", "address", "notes"] as const;
export const CONVERSATION_PROTECTED_FIELDS = [
  "contactName",
  "contactPhone",
] as const;
export const MESSAGE_PROTECTED_FIELDS = ["body"] as const;

type ProtectedPiiClient = Pick<PrismaClient, "protectedKeyAuthority">;
type ProtectedModel = "Customer" | "Order" | "Conversation" | "Message";

type KeyAuthority = Awaited<ReturnType<typeof resolveShopProtectedKey>>;

interface FieldReference {
  recordType: ProtectedModel;
  recordId: string;
  field: string;
}

interface BlindReference {
  recordType: ProtectedModel;
  field: "name" | "phone";
}

interface SelectionArgs {
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
}

export interface ProtectedSelectionPlan {
  removeId: boolean;
  relations: Record<string, ProtectedSelectionPlan>;
}

const MODEL_FIELDS: Record<ProtectedModel, readonly string[]> = {
  Customer: CUSTOMER_PROTECTED_FIELDS,
  Order: ORDER_PROTECTED_FIELDS,
  Conversation: CONVERSATION_PROTECTED_FIELDS,
  Message: MESSAGE_PROTECTED_FIELDS,
};

const RELATION_MODEL: Record<string, ProtectedModel | undefined> = {
  customer: "Customer",
  order: "Order",
  orders: "Order",
  conversation: "Conversation",
  conversations: "Conversation",
  message: "Message",
  messages: "Message",
};

function parseLegacyPayload(value: string): EncryptedPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    throw new ProtectedDataCorruptionError(
      "format",
      "Legacy PII protected value is malformed",
      cause,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProtectedDataCorruptionError(
      "format",
      "Legacy PII protected value is not an object",
    );
  }
  const payload = parsed as Partial<EncryptedPayload>;
  if (
    typeof payload.iv !== "string" ||
    typeof payload.ciphertext !== "string" ||
    typeof payload.tag !== "string"
  ) {
    throw new ProtectedDataCorruptionError(
      "format",
      "Legacy PII protected value has missing fields",
    );
  }
  return {
    iv: payload.iv,
    ciphertext: payload.ciphertext,
    tag: payload.tag,
  };
}

function assertRecordId(value: unknown, model: ProtectedModel): string {
  if (typeof value !== "string" || !value || value.length > 256) {
    throw new ProtectedDataCorruptionError(
      "context",
      `${model} protected data is missing its record identity`,
    );
  }
  return value;
}

function newRecordId(): string {
  return `c${randomUUID().replaceAll("-", "")}`;
}

function fieldBinding(
  context: ShopContext,
  reference: FieldReference,
): ShopRecordProtectedValueBinding {
  return {
    scope: "shop-record",
    workspaceId: context.workspaceId,
    shopId: context.shopId,
    shopIncarnationId: context.shopIncarnationId,
    ...reference,
  };
}

function blindContext(
  context: ShopContext,
  reference: BlindReference,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      formatVersion: 1,
      workspaceId: context.workspaceId.toLowerCase(),
      shopId: context.shopId,
      shopIncarnationId: context.shopIncarnationId.toLowerCase(),
      recordType: reference.recordType,
      field: reference.field,
    }),
    "utf8",
  );
}

function selectedProtectedField(
  select: Record<string, unknown>,
  model: ProtectedModel,
): boolean {
  if (model === "Customer" && select.phone === true) return true;
  return MODEL_FIELDS[model].some((field) => select[field] === true);
}

function prepareSelectionNode(
  node: SelectionArgs,
  model?: ProtectedModel,
): ProtectedSelectionPlan {
  const plan: ProtectedSelectionPlan = { removeId: false, relations: {} };
  if (node.select && model && selectedProtectedField(node.select, model)) {
    if (node.select.id !== true) {
      node.select.id = true;
      plan.removeId = true;
    }
    if (model === "Customer" && node.select.phone === true) {
      node.select.phoneEnc = true;
    }
  }

  for (const container of [node.select, node.include]) {
    if (!container) continue;
    for (const [key, value] of Object.entries(container)) {
      const relationModel = RELATION_MODEL[key];
      if (!relationModel || !value || typeof value !== "object") continue;
      plan.relations[key] = prepareSelectionNode(
        value as SelectionArgs,
        relationModel,
      );
    }
  }
  return plan;
}

export function prepareProtectedSelection(
  args: SelectionArgs,
  model?: ProtectedModel,
): ProtectedSelectionPlan {
  return prepareSelectionNode(args, model);
}

export function applyProtectedSelectionPlan(
  value: unknown,
  plan: ProtectedSelectionPlan,
): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((entry) => applyProtectedSelectionPlan(entry, plan));
  }
  if (typeof value !== "object") return value;
  const output = value as Record<string, unknown>;
  if (plan.removeId) delete output.id;
  for (const [relation, relationPlan] of Object.entries(plan.relations)) {
    if (relation in output) {
      output[relation] = applyProtectedSelectionPlan(
        output[relation],
        relationPlan,
      );
    }
  }
  return output;
}

export interface ProtectedPiiCodec {
  ensureRecordId(data: Record<string, unknown>): string;
  encryptCustomerData(
    data: Record<string, unknown>,
    recordId: string,
  ): Promise<Record<string, unknown>>;
  decryptCustomerRow(
    row: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  encryptFields(
    data: Record<string, unknown>,
    fields: readonly string[],
    model: Exclude<ProtectedModel, "Customer">,
    recordId: string,
    blindIndex?: { sourceField: "phone"; indexField: string },
  ): Promise<Record<string, unknown>>;
  decryptFields(
    row: Record<string, unknown>,
    fields: readonly string[],
    model: Exclude<ProtectedModel, "Customer">,
  ): Promise<Record<string, unknown>>;
  customerPhoneIndexes(value: string): Promise<string[]>;
  decryptNested(value: unknown): Promise<unknown>;
}

export function createProtectedPiiCodec(
  prisma: ProtectedPiiClient,
  context: ShopContext,
): ProtectedPiiCodec {
  const legacyRoot = getMasterKey();
  let dataWriteAuthority: Promise<KeyAuthority> | undefined;
  let dataReadAuthority: Promise<KeyAuthority> | undefined;
  let blindWriteAuthority: Promise<KeyAuthority> | undefined;
  let existingBlindAuthority: Promise<KeyAuthority | null> | undefined;

  const dataKeyForWrite = () =>
    (dataWriteAuthority ??= resolveShopProtectedKey(prisma, "shop-data", {
      shopContext: context,
    }));
  const dataKeyForRead = () =>
    (dataReadAuthority ??= resolveShopProtectedKey(prisma, "shop-data", {
      shopContext: context,
      createIfMissing: false,
    }));
  const blindKeyForWrite = () =>
    (blindWriteAuthority ??= resolveShopProtectedKey(
      prisma,
      "shop-blind-index",
      { shopContext: context },
    ));
  const blindKeyIfPresent = () =>
    (existingBlindAuthority ??= (async () => {
      const row = await prisma.protectedKeyAuthority.findUnique({
        where: { purpose: "shop-blind-index" },
        select: { purpose: true },
      });
      if (!row) return null;
      return resolveShopProtectedKey(prisma, "shop-blind-index", {
        shopContext: context,
        createIfMissing: false,
      });
    })());

  async function openCompatible(
    value: string,
    reference: FieldReference,
  ): Promise<string> {
    if (classifyProtectedValue(value) === "canonical") {
      const authority = await dataKeyForRead();
      return openProtectedString(
        value,
        authority.key,
        authority.descriptor,
        fieldBinding(context, reference),
      );
    }
    if (isEncryptedPayload(value)) {
      return decryptString(parseLegacyPayload(value), legacyRoot);
    }
    return value;
  }

  async function sealCanonical(
    value: string,
    reference: FieldReference,
  ): Promise<string> {
    if (classifyProtectedValue(value) === "canonical") {
      await openCompatible(value, reference);
      return value;
    }
    const plaintext = await openCompatible(value, reference);
    const authority = await dataKeyForWrite();
    return sealProtectedString(
      plaintext,
      authority.key,
      authority.descriptor,
      fieldBinding(context, reference),
    );
  }

  async function indexWithAuthority(
    value: string,
    reference: BlindReference,
    authority: KeyAuthority,
  ): Promise<string> {
    return createHmac("sha256", authority.key)
      .update(BLIND_INDEX_DOMAIN)
      .update(blindContext(context, reference))
      .update(Buffer.from([0]))
      .update(value.trim().toLowerCase(), "utf8")
      .digest("hex");
  }

  async function canonicalBlindIndex(
    value: string,
    reference: BlindReference,
  ): Promise<string> {
    return indexWithAuthority(value, reference, await blindKeyForWrite());
  }

  async function encryptFields(
    data: Record<string, unknown>,
    fields: readonly string[],
    model: Exclude<ProtectedModel, "Customer">,
    recordId: string,
    blindIndex?: { sourceField: "phone"; indexField: string },
  ): Promise<Record<string, unknown>> {
    const output: Record<string, unknown> = { ...data };
    for (const field of fields) {
      if (!(field in output)) continue;
      const value = output[field];
      if (value === null || value === undefined) continue;
      if (typeof value !== "string") {
        throw new TypeError(`${model}.${field} must be a string`);
      }
      const plaintext = await openCompatible(value, {
        recordType: model,
        recordId,
        field,
      });
      output[field] = await sealCanonical(value, {
        recordType: model,
        recordId,
        field,
      });
      if (blindIndex && field === blindIndex.sourceField) {
        output[blindIndex.indexField] = await canonicalBlindIndex(plaintext, {
          recordType: model,
          field: "phone",
        });
      }
    }
    return output;
  }

  async function decryptFields(
    row: Record<string, unknown>,
    fields: readonly string[],
    model: Exclude<ProtectedModel, "Customer">,
  ): Promise<Record<string, unknown>> {
    const output: Record<string, unknown> = { ...row };
    const selected = fields.filter((field) => {
      const value = output[field];
      return value !== null && value !== undefined;
    });
    if (selected.length === 0) return output;

    const recordId = assertRecordId(output.id, model);
    for (const field of selected) {
      const value = output[field];
      if (typeof value !== "string") {
        throw new ProtectedDataCorruptionError(
          "format",
          `${model}.${field} protected value is not a string`,
        );
      }
      output[field] = await openCompatible(value, {
        recordType: model,
        recordId,
        field,
      });
    }
    return output;
  }

  async function encryptCustomerData(
    data: Record<string, unknown>,
    recordId: string,
  ): Promise<Record<string, unknown>> {
    const output: Record<string, unknown> = { ...data, id: recordId };
    for (const field of CUSTOMER_PROTECTED_FIELDS) {
      if (!(field in output)) continue;
      const value = output[field];
      if (value === null || value === undefined) continue;
      if (typeof value !== "string") {
        throw new TypeError(`Customer.${field} must be a string`);
      }
      const plaintext = await openCompatible(value, {
        recordType: "Customer",
        recordId,
        field,
      });
      output[field] = await sealCanonical(value, {
        recordType: "Customer",
        recordId,
        field,
      });
      if (field === "name") {
        output.nameBlindIndex = await canonicalBlindIndex(plaintext, {
          recordType: "Customer",
          field: "name",
        });
      }
    }

    if ("phone" in output) {
      const value = output.phone;
      if (typeof value !== "string" || !value) {
        throw new TypeError("Customer.phone must be a non-empty string");
      }
      let plaintext = value;
      if (/^[0-9a-f]{64}$/.test(value)) {
        const encrypted = output.phoneEnc;
        if (typeof encrypted !== "string") {
          throw new ProtectedDataCorruptionError(
            "format",
            "Customer phone blind index has no recoverable ciphertext",
          );
        }
        plaintext = await openCompatible(encrypted, {
          recordType: "Customer",
          recordId,
          field: "phone",
        });
      }
      output.phone = await canonicalBlindIndex(plaintext, {
        recordType: "Customer",
        field: "phone",
      });
      output.phoneEnc = await sealCanonical(
        typeof output.phoneEnc === "string" ? output.phoneEnc : plaintext,
        { recordType: "Customer", recordId, field: "phone" },
      );
    }

    return output;
  }

  async function decryptCustomerRow(
    row: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const output: Record<string, unknown> = { ...row };
    const selectedFields = CUSTOMER_PROTECTED_FIELDS.filter((field) => {
      const value = output[field];
      return value !== null && value !== undefined;
    });
    const hasPhoneCiphertext =
      output.phoneEnc !== null && output.phoneEnc !== undefined;
    if (selectedFields.length === 0 && !hasPhoneCiphertext) return output;

    const recordId = assertRecordId(output.id, "Customer");
    for (const field of selectedFields) {
      const value = output[field];
      if (typeof value !== "string") {
        throw new ProtectedDataCorruptionError(
          "format",
          `Customer.${field} protected value is not a string`,
        );
      }
      output[field] = await openCompatible(value, {
        recordType: "Customer",
        recordId,
        field,
      });
    }

    if ("phoneEnc" in output) {
      const encrypted = output.phoneEnc;
      if (encrypted !== null && encrypted !== undefined) {
        if (typeof encrypted !== "string") {
          throw new ProtectedDataCorruptionError(
            "format",
            "Customer.phoneEnc protected value is not a string",
          );
        }
        output.phone = await openCompatible(encrypted, {
          recordType: "Customer",
          recordId,
          field: "phone",
        });
      } else if (
        typeof output.phone === "string" &&
        /^[0-9a-f]{64}$/.test(output.phone)
      ) {
        throw new ProtectedDataCorruptionError(
          "format",
          "Customer phone ciphertext is missing while a blind index is present",
        );
      }
      delete output.phoneEnc;
    }
    return output;
  }

  async function customerPhoneIndexes(value: string): Promise<string[]> {
    const current = await blindKeyIfPresent();
    if (!current) return [];
    return [
      await indexWithAuthority(
        value,
        { recordType: "Customer", field: "phone" },
        current,
      ),
    ];
  }

  async function decryptNested(value: unknown): Promise<unknown> {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return Promise.all(value.map(decryptNested));
    if (typeof value !== "object") return value;
    const output = { ...(value as Record<string, unknown>) };

    if (output.customer && typeof output.customer === "object") {
      output.customer = await decryptCustomerRow(
        output.customer as Record<string, unknown>,
      );
      output.customer = await decryptNested(output.customer);
    }
    if (output.order && typeof output.order === "object") {
      output.order = await decryptFields(
        output.order as Record<string, unknown>,
        ORDER_PROTECTED_FIELDS,
        "Order",
      );
      output.order = await decryptNested(output.order);
    }
    if (output.conversation && typeof output.conversation === "object") {
      output.conversation = await decryptFields(
        output.conversation as Record<string, unknown>,
        CONVERSATION_PROTECTED_FIELDS,
        "Conversation",
      );
      output.conversation = await decryptNested(output.conversation);
    }
    if (Array.isArray(output.orders)) {
      output.orders = await Promise.all(
        output.orders.map(async (entry) =>
          decryptNested(
            await decryptFields(
              entry as Record<string, unknown>,
              ORDER_PROTECTED_FIELDS,
              "Order",
            ),
          ),
        ),
      );
    }
    if (Array.isArray(output.conversations)) {
      output.conversations = await Promise.all(
        output.conversations.map(async (entry) =>
          decryptNested(
            await decryptFields(
              entry as Record<string, unknown>,
              CONVERSATION_PROTECTED_FIELDS,
              "Conversation",
            ),
          ),
        ),
      );
    }
    if (Array.isArray(output.messages)) {
      output.messages = await Promise.all(
        output.messages.map(async (entry) =>
          decryptNested(
            await decryptFields(
              entry as Record<string, unknown>,
              MESSAGE_PROTECTED_FIELDS,
              "Message",
            ),
          ),
        ),
      );
    }
    return output;
  }

  return {
    ensureRecordId(data) {
      const existing = data.id;
      if (existing === undefined) {
        const generated = newRecordId();
        data.id = generated;
        return generated;
      }
      if (typeof existing !== "string" || !existing || existing.length > 256) {
        throw new ProtectedDataCorruptionError(
          "context",
          "Protected record identity is invalid",
        );
      }
      return existing;
    },
    encryptCustomerData,
    decryptCustomerRow,
    encryptFields,
    decryptFields,
    customerPhoneIndexes,
    decryptNested,
  };
}

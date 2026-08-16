/**
 * Standalone Prisma client for scripts (seed, migrations, etc.).
 *
 * Uses a raw PrismaClient (NOT the protected client from src/lib/db.ts, which
 * imports `server-only` and cannot be loaded from standalone seed scripts).
 * Script writes therefore mirror the application's legacy-compatible protected
 * field shape explicitly, and wrapper return values are decrypted again so
 * later seed stages consume the same logical plaintext values application code
 * would see. This is especially important when a seeded Customer feeds a
 * Conversation: a customer phone blind index must never become display data.
 */
import { PrismaClient } from "@prisma/client";
import {
  decryptCustomerRow,
  encryptCustomerData,
} from "@/lib/crypto/customer-encryption";
import {
  CONVERSATION_PII_FIELDS,
  decryptPiiRow,
  encryptPiiFields,
  MESSAGE_PII_FIELDS,
  ORDER_PII_FIELDS,
} from "@/lib/crypto/pii-fields";
import { assertTestSandbox } from "./test-sandbox";

assertTestSandbox("seed script");

const client = new PrismaClient({
  log: ["warn", "error"],
});

type ScriptRow = Record<string, unknown>;
type ScriptDelegate = {
  create: (args: { data: ScriptRow }) => Promise<unknown>;
  update: (args: { where: unknown; data: ScriptRow }) => Promise<unknown>;
};

const original = client as unknown as {
  customer: ScriptDelegate;
  order: ScriptDelegate;
  conversation: ScriptDelegate;
  message: ScriptDelegate;
};

const wrappedCustomerCreate = original.customer.create;
(original as any).customer.create = async (args: { data: ScriptRow }) => {
  args.data = encryptCustomerData(args.data);
  const row = (await wrappedCustomerCreate(args)) as ScriptRow;
  return decryptCustomerRow(row);
};

const wrappedCustomerUpdate = original.customer.update;
(original as any).customer.update = async (args: {
  where: unknown;
  data: ScriptRow;
}) => {
  args.data = encryptCustomerData(args.data);
  const row = (await wrappedCustomerUpdate(args)) as ScriptRow;
  return decryptCustomerRow(row);
};

const wrappedOrderCreate = original.order.create;
(original as any).order.create = async (args: { data: ScriptRow }) => {
  args.data = encryptPiiFields(args.data, ORDER_PII_FIELDS);
  const row = (await wrappedOrderCreate(args)) as ScriptRow;
  return decryptPiiRow(row, ORDER_PII_FIELDS);
};

const wrappedOrderUpdate = original.order.update;
(original as any).order.update = async (args: {
  where: unknown;
  data: ScriptRow;
}) => {
  args.data = encryptPiiFields(args.data, ORDER_PII_FIELDS);
  const row = (await wrappedOrderUpdate(args)) as ScriptRow;
  return decryptPiiRow(row, ORDER_PII_FIELDS);
};

const wrappedConversationCreate = original.conversation.create;
(original as any).conversation.create = async (args: { data: ScriptRow }) => {
  args.data = encryptPiiFields(args.data, CONVERSATION_PII_FIELDS);
  const row = (await wrappedConversationCreate(args)) as ScriptRow;
  return decryptPiiRow(row, CONVERSATION_PII_FIELDS);
};

const wrappedConversationUpdate = original.conversation.update;
(original as any).conversation.update = async (args: {
  where: unknown;
  data: ScriptRow;
}) => {
  args.data = encryptPiiFields(args.data, CONVERSATION_PII_FIELDS);
  const row = (await wrappedConversationUpdate(args)) as ScriptRow;
  return decryptPiiRow(row, CONVERSATION_PII_FIELDS);
};

const wrappedMessageCreate = original.message.create;
(original as any).message.create = async (args: { data: ScriptRow }) => {
  args.data = encryptPiiFields(args.data, MESSAGE_PII_FIELDS);
  const row = (await wrappedMessageCreate(args)) as ScriptRow;
  return decryptPiiRow(row, MESSAGE_PII_FIELDS);
};

const wrappedMessageUpdate = original.message.update;
(original as any).message.update = async (args: {
  where: unknown;
  data: ScriptRow;
}) => {
  args.data = encryptPiiFields(args.data, MESSAGE_PII_FIELDS);
  const row = (await wrappedMessageUpdate(args)) as ScriptRow;
  return decryptPiiRow(row, MESSAGE_PII_FIELDS);
};

export const db = client;

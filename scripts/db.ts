/**
 * Standalone Prisma client for scripts (seed, migrations, etc.).
 *
 * Uses a raw PrismaClient (NOT the PII-extended one from src/lib/db.ts,
 * which imports `server-only` and throws outside Next.js). Customer data
 * is manually encrypted via encryptCustomerData() before create — so the
 * seeded data is encrypted at rest, identical to how the app would store it.
 */
import { PrismaClient } from "@prisma/client";
import { encryptCustomerData } from "@/lib/crypto/customer-encryption";
import { encryptPiiFields, ORDER_PII_FIELDS } from "@/lib/crypto/pii-fields";
import { assertTestSandbox } from "./test-sandbox";

assertTestSandbox("seed script");

const client = new PrismaClient({
  log: ["warn", "error"],
});

// Wrap customer.create/createMany/update to auto-encrypt PII
// (matches the behavior of the app's PII-extended client)
const original = client as unknown as {
  customer: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    update: (args: { where: unknown; data: Record<string, unknown> }) => Promise<unknown>;
  };
  order: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    update: (args: { where: unknown; data: Record<string, unknown> }) => Promise<unknown>;
  };
};

const wrappedCustomerCreate = original.customer.create;
(original as any).customer.create = async (args: { data: Record<string, unknown> }) => {
  args.data = encryptCustomerData(args.data);
  return wrappedCustomerCreate(args);
};

const wrappedCustomerUpdate = original.customer.update;
(original as any).customer.update = async (args: { where: unknown; data: Record<string, unknown> }) => {
  args.data = encryptCustomerData(args.data);
  return wrappedCustomerUpdate(args);
};

const wrappedOrderCreate = original.order.create;
(original as any).order.create = async (args: { data: Record<string, unknown> }) => {
  args.data = encryptPiiFields(args.data, ORDER_PII_FIELDS);
  return wrappedOrderCreate(args);
};

const wrappedOrderUpdate = original.order.update;
(original as any).order.update = async (args: { where: unknown; data: Record<string, unknown> }) => {
  args.data = encryptPiiFields(args.data, ORDER_PII_FIELDS);
  return wrappedOrderUpdate(args);
};

export const db = client;

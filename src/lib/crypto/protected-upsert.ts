import "server-only";

import type { PrismaClient } from "@prisma/client";

export type ProtectedUpsertDelegateName =
  | "customer"
  | "order"
  | "conversation"
  | "message";

interface RawUpsertDelegate {
  create(args: unknown): Promise<Record<string, unknown>>;
  findUnique(args: unknown): Promise<{ id: string } | null>;
  update(args: unknown): Promise<Record<string, unknown>>;
}

type RawTransactionClient = PrismaClient &
  Record<ProtectedUpsertDelegateName, RawUpsertDelegate>;

export interface RecordBoundUpsertOptions {
  delegate: ProtectedUpsertDelegateName;
  args: Record<string, unknown>;
  encryptedCreate: Record<string, unknown>;
  update: Record<string, unknown>;
  encryptUpdate: (
    data: Record<string, unknown>,
    recordId: string,
  ) => Promise<Record<string, unknown>>;
  resolveWinnerId?: (
    transaction: RawTransactionClient,
  ) => Promise<string | null>;
}

function projectionOf(args: Record<string, unknown>): Record<string, unknown> {
  const projection: Record<string, unknown> = {};
  for (const key of ["select", "include", "omit"] as const) {
    if (args[key] !== undefined) projection[key] = args[key];
  }
  return projection;
}

function withoutRecordId(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const output = { ...data };
  delete output.id;
  return output;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

/**
 * Execute Prisma upsert semantics without ever binding update ciphertext to a
 * speculative create ID.
 *
 * The create branch is attempted first with its final contextual ciphertext.
 * A unique winner returns immediately. On a unique race, a new transaction
 * resolves the row that actually won, encrypts the update branch against that
 * exact ID, and applies the whole update once. A conflict on an unrelated
 * unique field is rethrown when the requested winner cannot be resolved.
 */
export async function executeRecordBoundUpsert(
  client: PrismaClient,
  options: RecordBoundUpsertOptions,
): Promise<Record<string, unknown>> {
  const delegate = (client as RawTransactionClient)[options.delegate];
  const projection = projectionOf(options.args);

  try {
    return await delegate.create({
      data: options.encryptedCreate,
      ...projection,
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    return client.$transaction(async (transaction) => {
      const tx = transaction as unknown as RawTransactionClient;
      const txDelegate = tx[options.delegate];
      const winnerId = options.resolveWinnerId
        ? await options.resolveWinnerId(tx)
        : (
            await txDelegate.findUnique({
              where: options.args.where,
              select: { id: true },
            })
          )?.id ?? null;

      if (!winnerId) throw error;
      const encryptedUpdate = withoutRecordId(
        await options.encryptUpdate(options.update, winnerId),
      );
      return txDelegate.update({
        where: { id: winnerId },
        data: encryptedUpdate,
        ...projection,
      });
    });
  }
}

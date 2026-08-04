import "server-only";

import type { PrismaClient } from "@prisma/client";

export type ProtectedUpsertDelegateName =
  | "customer"
  | "order"
  | "conversation"
  | "message";

interface RawUpsertDelegate {
  upsert(args: unknown): Promise<{ id: string }>;
  update(args: unknown): Promise<unknown>;
  findUniqueOrThrow(args: unknown): Promise<Record<string, unknown>>;
}

type RawTransactionDelegates = Record<
  ProtectedUpsertDelegateName,
  RawUpsertDelegate
>;

export interface RecordBoundUpsertOptions {
  delegate: ProtectedUpsertDelegateName;
  args: Record<string, unknown>;
  createId: string;
  encryptedCreate: Record<string, unknown>;
  protectedUpdate: Record<string, unknown>;
  unprotectedUpdate: Record<string, unknown>;
  encryptProtectedUpdate: (
    data: Record<string, unknown>,
    recordId: string,
  ) => Promise<Record<string, unknown>>;
}

export function partitionProtectedUpdate(
  data: Record<string, unknown>,
  protectedFields: readonly string[],
): {
  protectedUpdate: Record<string, unknown>;
  unprotectedUpdate: Record<string, unknown>;
} {
  const protectedNames = new Set(protectedFields);
  const protectedUpdate: Record<string, unknown> = {};
  const unprotectedUpdate: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    (protectedNames.has(key) ? protectedUpdate : unprotectedUpdate)[key] = value;
  }
  return { protectedUpdate, unprotectedUpdate };
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

/**
 * Execute a record-bound protected upsert without guessing which create ID won.
 *
 * The database first performs one atomic upsert with only unprotected update
 * fields and returns the actual row ID. If another concurrent creator won, the
 * protected update is then encrypted against that winning ID inside the same
 * transaction. Numeric increments and other unprotected operations are applied
 * exactly once, and no mismatched ciphertext becomes externally visible.
 */
export async function executeRecordBoundUpsert(
  client: PrismaClient,
  options: RecordBoundUpsertOptions,
): Promise<Record<string, unknown>> {
  const hasProtectedUpdate = Object.keys(options.protectedUpdate).length > 0;

  // Preserve validation behavior on the create path and warm the purpose keys
  // before opening the SQLite write transaction. This ciphertext is never
  // persisted because its record ID is only a candidate.
  if (hasProtectedUpdate) {
    await options.encryptProtectedUpdate(
      options.protectedUpdate,
      options.createId,
    );
  }

  return client.$transaction(async (transaction) => {
    const delegate = (transaction as unknown as RawTransactionDelegates)[
      options.delegate
    ];
    const winner = await delegate.upsert({
      where: options.args.where,
      create: options.encryptedCreate,
      update: options.unprotectedUpdate,
      select: { id: true },
    });

    if (winner.id !== options.createId && hasProtectedUpdate) {
      const encryptedUpdate = withoutRecordId(
        await options.encryptProtectedUpdate(
          options.protectedUpdate,
          winner.id,
        ),
      );
      await delegate.update({
        where: { id: winner.id },
        data: encryptedUpdate,
      });
    }

    return delegate.findUniqueOrThrow({
      where: { id: winner.id },
      ...projectionOf(options.args),
    });
  });
}

import "server-only";

/**
 * The desktop server owns one immutable Prisma client per process-selected shop.
 * Serialize equal idempotency keys on that exact client so a follower cannot race
 * the leader's aggregate claim or unique insert. Once the leader releases the
 * queue, the follower executes the normal database lookup, request-hash check,
 * principal authorization and encrypted replay path.
 */
const queuesByClient = new WeakMap<object, Map<string, Promise<void>>>();

export async function withBusinessCommandKeyQueue<TResult>(
  client: object,
  idempotencyKey: string,
  operation: () => Promise<TResult>,
): Promise<TResult> {
  let queues = queuesByClient.get(client);
  if (queues === undefined) {
    queues = new Map();
    queuesByClient.set(client, queues);
  }

  const predecessor = queues.get(idempotencyKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = predecessor.then(() => gate);
  queues.set(idempotencyKey, tail);

  await predecessor;
  try {
    return await operation();
  } finally {
    release();
    if (queues.get(idempotencyKey) === tail) {
      queues.delete(idempotencyKey);
      if (queues.size === 0) queuesByClient.delete(client);
    }
  }
}

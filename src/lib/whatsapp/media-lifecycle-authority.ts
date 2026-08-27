import "server-only";

const MEDIA_LIFECYCLE_QUEUE_KEY = Symbol.for(
  "sahelflow.whatsapp.media-lifecycle-queue.v1",
);

type MediaLifecycleGlobal = typeof globalThis & {
  [MEDIA_LIFECYCLE_QUEUE_KEY]?: Map<string, Promise<void>>;
};

function mediaLifecycleQueues(): Map<string, Promise<void>> {
  const lifecycleGlobal = globalThis as MediaLifecycleGlobal;
  lifecycleGlobal[MEDIA_LIFECYCLE_QUEUE_KEY] ??= new Map<string, Promise<void>>();
  return lifecycleGlobal[MEDIA_LIFECYCLE_QUEUE_KEY];
}

/**
 * Same-process, shop-scoped serialization across multi-authority media changes.
 *
 * Crash durability remains the responsibility of the existing DB transaction,
 * outbox and media erase tombstone/epoch protocols. This queue only closes the
 * live-process interleaving window where filesystem media and canonical DB truth
 * could otherwise cross one another between awaits.
 */
export async function withWhatsAppMediaLifecycleLease<T>(
  scopeRoot: string,
  operation: () => Promise<T>,
): Promise<T> {
  const queues = mediaLifecycleQueues();
  const previous = queues.get(scopeRoot) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  queues.set(scopeRoot, tail);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (queues.get(scopeRoot) === tail) queues.delete(scopeRoot);
  }
}

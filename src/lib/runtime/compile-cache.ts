import "server-only";

type CompileCacheProcess = NodeJS.Process & {
  getBuiltinModule?: (specifier: string) => unknown;
};

type CompileCacheModule = {
  flushCompileCache?: () => void;
};

/**
 * Persist Node's built-in module compile cache during authenticated desktop
 * shutdown.
 *
 * The desktop terminates the contained Node process tree on close, so relying on
 * normal process exit can lose the cache accumulated during startup. This helper
 * must never run in runtime or UI readiness: cache persistence may improve later
 * launches but can never decide, delay, or temporarily freeze application
 * readiness.
 */
export function flushPackagedCompileCache(): boolean {
  if (!process.env.NODE_COMPILE_CACHE) return false;

  try {
    const moduleApi = (process as CompileCacheProcess).getBuiltinModule?.(
      "node:module",
    ) as CompileCacheModule | undefined;
    if (!moduleApi?.flushCompileCache) return false;
    moduleApi.flushCompileCache();
    return true;
  } catch {
    return false;
  }
}

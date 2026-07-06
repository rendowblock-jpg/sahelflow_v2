/**
 * Platform helpers for runtime bundling (T-S5).
 *
 * Centralizes the mapping from host platform → Bun asset triple + Prisma
 * engine filename so `prepare-runtime.ts` stays readable.
 */

/** Bun executable name for the host platform (bun.exe on Windows). */
export function bunExe(): string {
  return process.platform === "win32" ? "bun.exe" : "bun";
}

/**
 * LLVM-style target triple matching Bun + Prisma release asset naming.
 *   darwin-arm64, darwin-x64, linux-arm64, linux-x64,
 *   windows-x64 (Bun) / windows (Prisma engine baseline)
 */
export function platformTargetTriple(): string {
  const platform = process.platform;
  const arch = process.arch;
  switch (platform) {
    case "darwin":
      return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
    case "linux":
      return arch === "arm64" ? "linux-arm64" : "linux-x64";
    case "win32":
      return "windows-x64";
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/** Prisma query-engine binary filename for the host platform. */
export function prismaEngineName(): string {
  switch (process.platform) {
    case "darwin":
      return "libquery_engine-darwin.dylib.node";
    case "linux":
      return "libquery_engine-linux-musl-openssl-3.0.x.so.node";
    case "win32":
      return "query_engine-windows.dll.node";
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export type BuildResult = { outDir: string; version: string; precache: string[]; assets: Record<string, string> };
export function buildPwa(options?: { outDir?: string; relayUrl?: string; entry?: string }): Promise<BuildResult>;

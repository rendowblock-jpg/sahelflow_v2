// Command ids are UUID v4 (the desktop refuses anything else for a reply). crypto.randomUUID when the browser has it,
// otherwise the same v4 built from getRandomValues. Never Math.random.
export type RandomSource = Readonly<{ randomUUID?: () => string; getRandomValues<T extends ArrayBufferView | null>(array: T): T }>;
const HEX: readonly string[] = Array.from({ length: 256 }, (_v, i) => (i + 256).toString(16).slice(1));

export function uuidV4FromRandom(fill: (bytes: Uint8Array) => Uint8Array): string {
  const b = fill(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40; b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = (i: number): string => HEX[b[i] ?? 0] ?? "00";
  return `${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}`;
}
export function newCommandId(source: RandomSource = globalThis.crypto): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  return uuidV4FromRandom((bytes) => source.getRandomValues(bytes));
}

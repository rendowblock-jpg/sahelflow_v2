export const LOOKS: readonly ["sahel", "atlas", "oasis", "dune"];
export const MODES: readonly ["light", "dark"];
export type LookTokens = Record<string, string>;
export function contrast(a: string, b: string): number;
export function over(fg: string, a: number, bg: string): string;
export function toHexAlpha(src: string): { hex: string; a: number };
export function buildLooks(files: readonly string[]): Record<string, LookTokens>;
export function generateLooksCss(files: readonly string[]): string;

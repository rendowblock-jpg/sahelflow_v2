"use client";

/**
 * The command field is a lazy chunk so the shell can paint first. Keystrokes
 * that land on the placeholder before that chunk arrives are kept here and
 * read on the first real render. The seed is cleared only after that render
 * has committed, so React's double-invoked initializers cannot drop it.
 */
export interface CommandPaletteSeed {
  query: string;
  open: boolean;
}

let seed: CommandPaletteSeed = { query: "", open: false };

export function seedCommandPalette(next: Partial<CommandPaletteSeed>): void {
  seed = { ...seed, ...next };
}

export function peekCommandPaletteSeed(): CommandPaletteSeed {
  return seed;
}

export function clearCommandPaletteSeed(): void {
  seed = { query: "", open: false };
}

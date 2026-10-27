/**
 * Tiny seeded generator for property-style tests (no dependency).
 *
 * Every property runs many generated cases. A failure message carries the
 * property name, the run seed, the case number, the per-case seed and the
 * generated input, so a failing case can be replayed on its own:
 *
 *   SF_PROP_CASE_SEED=<caseSeed> bunx vitest run <file>
 *
 * mulberry32 is a 32-bit generator: fast, tiny, and the same sequence on
 * every machine for the same seed.
 */

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRandom {
  private readonly nextFloat: () => number;

  constructor(readonly seed: number) {
    this.nextFloat = mulberry32(seed);
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextFloat();
  }

  /** Integer in [min, max], both included. */
  int(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
      throw new Error(`SeededRandom.int: bad range ${min}..${max}`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(values: readonly T[]): T {
    const value = values[this.int(0, values.length - 1)];
    if (value === undefined) throw new Error("SeededRandom.pick: empty list");
    return value;
  }

  /** New array in random order (Fisher-Yates); the input is not changed. */
  shuffle<T>(values: readonly T[]): T[] {
    const out = [...values];
    for (let index = out.length - 1; index > 0; index -= 1) {
      const other = this.int(0, index);
      const left = out[index];
      const right = out[other];
      if (left === undefined || right === undefined) continue;
      out[index] = right;
      out[other] = left;
    }
    return out;
  }
}

export const MIN_PROPERTY_RUNS = 300;

export interface PropertyOptions {
  /** Run seed. A fixed number keeps the suite deterministic. */
  seed: number;
  /** Number of generated cases. */
  runs?: number;
  /** Lower bound a test must meet; 300 for pure code, lower only for database-backed cases. */
  minRuns?: number;
}

function show(input: unknown): string {
  try {
    const text = JSON.stringify(input, (_key, value: unknown) =>
      typeof value === "bigint" ? `${value}n` : value,
    );
    return text.length > 1500 ? `${text.slice(0, 1500)}...` : text;
  } catch {
    return String(input);
  }
}

function caseSeeds(seed: number, runs: number): number[] {
  const replay = process.env.SF_PROP_CASE_SEED;
  if (replay !== undefined && replay !== "") {
    const only = Number(replay);
    if (Number.isInteger(only)) return [only >>> 0];
  }
  const derive = mulberry32(seed);
  return Array.from({ length: runs }, () => Math.floor(derive() * 4294967296) >>> 0);
}

function describeFailure(
  name: string,
  options: PropertyOptions,
  index: number,
  caseSeed: number,
  input: unknown,
  error: unknown,
): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(
    `property "${name}" failed: seed=${options.seed} case=${index} caseSeed=${caseSeed}\n` +
      `input=${show(input)}\n${reason}\n` +
      `replay: SF_PROP_CASE_SEED=${caseSeed}`,
    { cause: error },
  );
}

function requiredRuns(name: string, options: PropertyOptions): number {
  const runs = options.runs ?? MIN_PROPERTY_RUNS;
  const floor = options.minRuns ?? MIN_PROPERTY_RUNS;
  if (runs < floor) {
    throw new Error(`property "${name}" asks for ${runs} runs, fewer than the ${floor} required`);
  }
  return runs;
}

/** Run `check` on `runs` generated inputs. Returns how many cases ran. */
export function forAll<T>(
  name: string,
  options: PropertyOptions,
  generate: (rng: SeededRandom) => T,
  check: (input: T, rng: SeededRandom) => void,
): number {
  const seeds = caseSeeds(options.seed, requiredRuns(name, options));
  seeds.forEach((caseSeed, index) => {
    const rng = new SeededRandom(caseSeed);
    const input = generate(rng);
    try {
      check(input, rng);
    } catch (error) {
      throw describeFailure(name, options, index, caseSeed, input, error);
    }
  });
  return seeds.length;
}

/** Same as forAll for checks that await (database or fake D1). */
export async function forAllAsync<T>(
  name: string,
  options: PropertyOptions,
  generate: (rng: SeededRandom) => T,
  check: (input: T, rng: SeededRandom) => Promise<void>,
): Promise<number> {
  const seeds = caseSeeds(options.seed, requiredRuns(name, options));
  for (const [index, caseSeed] of seeds.entries()) {
    const rng = new SeededRandom(caseSeed);
    const input = generate(rng);
    try {
      await check(input, rng);
    } catch (error) {
      throw describeFailure(name, options, index, caseSeed, input, error);
    }
  }
  return seeds.length;
}

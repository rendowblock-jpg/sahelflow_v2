#!/usr/bin/env bun
/**
 * sf-audit — SahelFlow documentation drift detector
 *
 * "The docs lie. The code doesn't." — this tool catches the gap.
 *
 * Compares claims in documentation against the actual repo state and reports
 * any drift. Run this at the END of every session (before declaring "done")
 * to catch stale PROJECT_STATE.md / NEXT_SESSION_PREP.md before they mislead
 * the next agent.
 *
 * Checks performed:
 *   1. PROJECT_STATE.md "Main HEAD" vs `git rev-parse --short HEAD`
 *   2. PROJECT_STATE.md test count vs `bunx vitest run | grep "Tests "`
 *   3. PROJECT_STATE.md coverage % vs `bunx vitest run --coverage` actual
 *      (skipped with --fast — adds ~30-60s)
 *   4. NEXT_SESSION_PREP.md references to HEADs that aren't in the last 50
 *      commits (= stale, references an old session)
 *
 * Exit 0 = no drift. Exit 1 = drift found.
 *
 * Usage:
 *   sf-audit            # full audit (HEAD + tests + coverage + stale prep)
 *   sf-audit --fast     # skip coverage (HEAD + tests + stale prep only)
 *   sf-audit --no-vitest  # skip running vitest (only HEAD + stale prep checks)
 *
 * Environment:
 *   SF_REPO_DIR — repo path (default /tmp/sahelflow_v2)
 */
import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// ── Config ─────────────────────────────────────────────────────────────────
const REPO_DIR = process.env.SF_REPO_DIR || "/tmp/sahelflow_v2";

// ANSI colors
const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m",
      BOLD = "\x1b[1m", DIM = "\x1b[2m", NC = "\x1b[0m";

// ── Types ──────────────────────────────────────────────────────────────────

interface Drift {
  category: string;
  file: string;
  description: string;
  expected: string;
  actual: string;
}

// ── Git helpers ────────────────────────────────────────────────────────────

function gitShortHead(): string {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: REPO_DIR,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return r.stdout.trim();
}

function gitRecentHeads(count: number): Set<string> {
  const r = spawnSync("git", ["log", `-${count}`, "--pretty=format:%h"], {
    cwd: REPO_DIR,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0) return new Set();
  return new Set(r.stdout.trim().split("\n").map((s) => s.trim()));
}

// ── Doc readers ────────────────────────────────────────────────────────────

function readDoc(rel: string): string | null {
  const p = resolve(REPO_DIR, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

function extractHeadFromProjectState(content: string): string | null {
  // Match: **Main HEAD:** `8228176`
  const m = content.match(/\*\*Main HEAD:\*\*\s*`?([a-f0-9]{7,40})`?/i);
  return m ? m[1].slice(0, 7) : null;
}

function extractVersionFromProjectState(content: string): string | null {
  const m = content.match(/\*\*Version:\*\*\s*`?(\d+\.\d+\.\d+)`?/i);
  return m ? m[1] : null;
}

function extractTestCountFromProjectState(content: string): number | null {
  // Try the table row first: | Tests | 457 |
  const tableM = content.match(/\|\s*Tests\s*\|\s*(\d+)\s*\|/i);
  if (tableM) return parseInt(tableM[1], 10);
  // Fallback: "457 tests green" / "457/457 tests"
  const inlineM = content.match(/(\d+)\s*\/\s*\d+\s*tests?\s*green/i)
               || content.match(/(\d+)\s*tests?\s*green/i);
  if (inlineM) return parseInt(inlineM[1], 10);
  return null;
}

function extractCoverageFromProjectState(content: string): number | null {
  // Try: "88.8% statements" / "coverage: 88.8%" / "coverage: 34.5% → 88.8%"
  // We want the LAST (current) number.
  const arrows = content.match(/coverage:?\s*\d+(?:\.\d+)?%?\s*(?:→|->)\s*(\d+(?:\.\d+)?)\s*%/i);
  if (arrows) return parseFloat(arrows[1]);
  const m = content.match(/(\d+(?:\.\d+)?)\s*%\s*statements/i)
         || content.match(/coverage:?\s*(\d+(?:\.\d+)?)\s*%/i)
         || content.match(/statements:?\s*(\d+(?:\.\d+)?)\s*%/i);
  return m ? parseFloat(m[1]) : null;
}

function extractHeadsFromNextSessionPrep(content: string): string[] {
  const heads: string[] = [];
  const re = /`([a-f0-9]{7,40})`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    // filter out things that look like SHAs but are too short or too long
    if (m[1].length >= 7 && m[1].length <= 40) {
      heads.push(m[1].slice(0, 7));
    }
  }
  return [...new Set(heads)];
}

// ── Test/coverage runners ──────────────────────────────────────────────────

function runVitest(): { count: number | null; passed: number | null; failed: number | null; output: string } {
  const r = spawnSync("bunx", ["vitest", "run"], {
    cwd: REPO_DIR,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 240_000,
  });
  const out = (r.stdout || "") + (r.stderr || "");
  // vitest reporters print: "Tests  457 passed (457)" | "Tests  N failed | M passed | K skipped"
  const passedM = out.match(/Tests\s+(\d+)\s+passed/i);
  const failedM = out.match(/Tests\s+\d+\s+failed/i);
  const totalM = out.match(/Tests\s+\d+\s+(?:passed|failed)\s*\((\d+)\)/i);
  const count = totalM ? parseInt(totalM[1], 10) : passedM ? parseInt(passedM[1], 10) : null;
  return {
    count,
    passed: passedM ? parseInt(passedM[1], 10) : null,
    failed: failedM ? 1 : 0,
    output: out,
  };
}

function runCoverage(): { percent: number | null; output: string } {
  const r = spawnSync("bunx", ["vitest", "run", "--coverage"], {
    cwd: REPO_DIR,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 360_000,
  });
  const out = (r.stdout || "") + (r.stderr || "");
  // vitest coverage text reporter prints:
  //   "Statements   : 88.8% ( 400/450 )"
  // or in the table:
  //   "All files | 80 | 60 | 70 | 88.8 |"
  const stmtM = out.match(/Statements?\s*:?\s*(\d+(?:\.\d+)?)\s*%/i);
  if (stmtM) return { percent: parseFloat(stmtM[1]), output: out };
  const tableM = out.match(/All files?\s*\|[^|]*\|[^|]*\|[^|]*\|\s*(\d+(?:\.\d+)?)\s*\|/i);
  if (tableM) return { percent: parseFloat(tableM[1]), output: out };
  return { percent: null, output: out };
}

// ── Drift reporting ────────────────────────────────────────────────────────

const drifts: Drift[] = [];

function recordDrift(d: Drift): void {
  drifts.push(d);
  console.log(`  ${RED}❌ ${d.category}: ${d.description}${NC}`);
  console.log(`     ${DIM}file:${NC} ${d.file}`);
  console.log(`     ${DIM}expected:${NC} ${d.expected}   ${DIM}actual:${NC} ${d.actual}`);
}

// ── Audit steps ────────────────────────────────────────────────────────────

function checkHeadDrift(psContent: string): void {
  console.log(`${BOLD}── 1/4 Checking PROJECT_STATE.md HEAD ──${NC}`);
  const actualHead = gitShortHead();
  if (!actualHead) {
    console.log(`  ${YELLOW}⚠️  Could not read git HEAD (not a git repo?)${NC}`);
    return;
  }
  const docHead = extractHeadFromProjectState(psContent);
  if (!docHead) {
    console.log(`  ${YELLOW}⚠️  Could not extract Main HEAD from PROJECT_STATE.md${NC}`);
    console.log(`     ${DIM}Expected a line like: **Main HEAD:** \`8228176\`${NC}`);
    return;
  }
  if (docHead === actualHead) {
    console.log(`  ${GREEN}✅ HEAD matches: ${actualHead}${NC}`);
  } else {
    recordDrift({
      category: "HEAD drift",
      file: "documentation/PROJECT_STATE.md",
      description: "PROJECT_STATE.md HEAD doesn't match actual git HEAD — docs are stale",
      expected: docHead,
      actual: actualHead,
    });
  }
}

function checkTestCount(psContent: string, skipVitest: boolean): void {
  console.log(`\n${BOLD}── 2/4 Checking test count ──${NC}`);
  const docTests = extractTestCountFromProjectState(psContent);
  if (docTests === null) {
    console.log(`  ${YELLOW}⚠️  Could not extract test count from PROJECT_STATE.md${NC}`);
    console.log(`     ${DIM}Expected a row like: | Tests | 457 |${NC}`);
    return;
  }
  if (skipVitest) {
    console.log(`  ${YELLOW}⚠️  --no-vitest: skipping actual test run${NC}`);
    console.log(`     ${DIM}PROJECT_STATE.md claims ${docTests} tests (unverified)${NC}`);
    return;
  }
  process.stdout.write(`  Running vitest (this takes ~30-60s) ... `);
  const { count: actual, failed, output } = runVitest();
  if (actual === null) {
    console.log(`${YELLOW}⚠️  could not parse test count${NC}`);
    const lines = output.trim().split("\n").slice(-6);
    for (const l of lines) console.log(`     ${DIM}${l}${NC}`);
    return;
  }
  console.log(`actual=${actual}`);
  if (failed && failed > 0) {
    recordDrift({
      category: "Tests failing",
      file: "documentation/PROJECT_STATE.md",
      description: "Some tests are failing — docs claim all green",
      expected: `${docTests} passing`,
      actual: `${actual} total, some failing`,
    });
    return;
  }
  // Allow ±2 slack for tests added/removed since last doc update
  if (Math.abs(docTests - actual) <= 2) {
    console.log(`  ${GREEN}✅ Test count matches: docs=${docTests}, actual=${actual}${NC}`);
  } else {
    recordDrift({
      category: "Test count drift",
      file: "documentation/PROJECT_STATE.md",
      description: "Test count in PROJECT_STATE.md doesn't match actual",
      expected: `${docTests}`,
      actual: `${actual}`,
    });
  }
}

function checkCoverage(psContent: string, skipVitest: boolean, fast: boolean): void {
  console.log(`\n${BOLD}── 3/4 Checking coverage ──${NC}`);
  if (fast || skipVitest) {
    console.log(`  ${YELLOW}⚠️  Skipping coverage (--fast or --no-vitest)${NC}`);
    return;
  }
  const docCov = extractCoverageFromProjectState(psContent);
  if (docCov === null) {
    console.log(`  ${YELLOW}⚠️  Could not extract coverage % from PROJECT_STATE.md${NC}`);
    return;
  }
  process.stdout.write(`  Running vitest --coverage (this takes ~60-120s) ... `);
  const { percent: actual, output } = runCoverage();
  if (actual === null) {
    console.log(`${YELLOW}⚠️  could not parse coverage${NC}`);
    const lines = output.trim().split("\n").slice(-6);
    for (const l of lines) console.log(`     ${DIM}${l}${NC}`);
    return;
  }
  console.log(`actual=${actual.toFixed(1)}%`);
  // Allow ±3pp slack
  if (Math.abs(docCov - actual) <= 3) {
    console.log(`  ${GREEN}✅ Coverage matches: docs=${docCov}%, actual=${actual.toFixed(1)}%${NC}`);
  } else {
    recordDrift({
      category: "Coverage drift",
      file: "documentation/PROJECT_STATE.md",
      description: "Coverage % in PROJECT_STATE.md doesn't match actual",
      expected: `${docCov}%`,
      actual: `${actual.toFixed(1)}%`,
    });
  }
}

function checkStaleNextSessionPrep(): void {
  console.log(`\n${BOLD}── 4/4 Checking NEXT_SESSION_PREP.md ──${NC}`);
  const nspContent = readDoc("documentation/NEXT_SESSION_PREP.md");
  if (!nspContent) {
    console.log(`  ${GREEN}✅ No NEXT_SESSION_PREP.md — nothing to be stale${NC}`);
    return;
  }
  const recentHeads = gitRecentHeads(50);
  if (recentHeads.size === 0) {
    console.log(`  ${YELLOW}⚠️  Could not read recent git history${NC}`);
    return;
  }
  const referencedHeads = extractHeadsFromNextSessionPrep(nspContent);
  if (referencedHeads.length === 0) {
    console.log(`  ${GREEN}✅ NEXT_SESSION_PREP.md references no commit SHAs${NC}`);
    return;
  }
  const staleHeads = referencedHeads.filter((h) => !recentHeads.has(h));
  if (staleHeads.length === 0) {
    console.log(`  ${GREEN}✅ All ${referencedHeads.length} referenced HEADs are recent (<50 commits)${NC}`);
  } else {
    console.log(`  ${YELLOW}⚠️  NEXT_SESSION_PREP.md references ${staleHeads.length} HEAD(s) not in last 50 commits:${NC}`);
    for (const h of staleHeads) console.log(`     ${YELLOW}${h}${NC}`);
    recordDrift({
      category: "Stale prep doc",
      file: "documentation/NEXT_SESSION_PREP.md",
      description:
        "NEXT_SESSION_PREP.md references HEADs not in the last 50 commits — " +
        "this doc is from an old session and should be regenerated or removed",
      expected: "HEADs within last 50 commits",
      actual: staleHeads.join(", "),
    });
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const argv = process.argv.slice(2);
  const fast = argv.includes("--fast");
  const noVitest = argv.includes("--no-vitest");

  console.log(`${BOLD}═══════════════════════════════════════════════════`);
  console.log(`  sf-audit — documentation drift detector`);
  console.log(`═══════════════════════════════════════════════════${NC}`);
  console.log(`  repo: ${REPO_DIR}`);
  console.log(`  mode: ${fast ? "fast (HEAD + tests + stale prep)" :
                       noVitest ? "no-vitest (HEAD + stale prep)" :
                                  "full (HEAD + tests + coverage + stale prep)"}`);
  console.log("");

  // Load PROJECT_STATE.md (required for checks 1-3)
  const psContent = readDoc("documentation/PROJECT_STATE.md");
  if (!psContent) {
    console.log(`${RED}❌ documentation/PROJECT_STATE.md not found${NC}`);
    console.log(`    Cannot audit drift without it.`);
    process.exit(1);
  }

  checkHeadDrift(psContent);
  checkTestCount(psContent, noVitest);
  checkCoverage(psContent, noVitest, fast);
  checkStaleNextSessionPrep();

  // Summary
  console.log(`\n${BOLD}═══════════════════════════════════════════════════`);
  if (drifts.length === 0) {
    console.log(`  ${GREEN}${BOLD}✅ NO DRIFT DETECTED — docs match reality${NC}`);
  } else {
    console.log(`  ${RED}${BOLD}❌ ${drifts.length} DRIFT(S) DETECTED${NC}`);
    console.log(`  ${DIM}─── summary ───${NC}`);
    for (const d of drifts) {
      console.log(`  ${RED}•${NC} [${d.category}] ${d.file}`);
      console.log(`    expected: ${d.expected}  |  actual: ${d.actual}`);
    }
    console.log(`\n  ${YELLOW}Fix:${NC} update the documentation OR the code so they agree.`);
    console.log(`  ${YELLOW}Then re-run:${NC} sf-audit`);
  }
  console.log(`${BOLD}═══════════════════════════════════════════════════${NC}`);

  process.exit(drifts.length === 0 ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.error(`${RED}Fatal: ${(e as Error).message}${NC}`);
  process.exit(1);
}

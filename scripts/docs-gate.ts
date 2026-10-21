import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

/**
 * Documentation drift gate. Pure: reads the tree under `root`, returns findings.
 * The manifest (documentation/MANIFEST.json) is the single list of documents
 * allowed in the repository, with a byte ceiling each, plus three allow-lists
 * that may only shrink (an entry that is no longer needed is itself a finding).
 */
export interface DocFinding {
  rule: string;
  file: string;
  detail: string;
}

interface Manifest {
  formatVersion: 1;
  files: Record<string, { maxBytes: number }>;
  releaseNameFiles: string[];
  undefinedFdAllowed: string[];
  deadPathAllowed: Record<string, string[]>;
}

const MANIFEST_PATH = "documentation/MANIFEST.json";
const DECISIONS_PATH = "documentation/product/DECISIONS.md";
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "target", "dist", ".superpowers"]);
const PATH_EXTENSION = /\.(?:ts|tsx|rs|md|json|jsonc|yml|yaml|sql|prisma|css|ps1|sh|toml|mjs|cjs|js|html)$/;
const FENCE_START = "<!-- docs-gate:ignore-start -->";
const FENCE_END = "<!-- docs-gate:ignore-end -->";

function listFiles(root: string, directory = ""): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) output.push(...listFiles(root, relative));
    else if (entry.isFile()) output.push(relative);
  }
  return output;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseManifest(root: string): Manifest | string {
  const path = join(root, MANIFEST_PATH);
  if (!existsSync(path)) return `${MANIFEST_PATH} is missing`;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return `${MANIFEST_PATH} is not valid JSON: ${String(error)}`;
  }
  const value = raw as Partial<Manifest> | null;
  if (!value || value.formatVersion !== 1) return "formatVersion must be 1";
  if (!value.files || typeof value.files !== "object") return "files must be an object";
  for (const [file, entry] of Object.entries(value.files)) {
    if (!entry || typeof entry.maxBytes !== "number") return `files.${file}.maxBytes must be a number`;
  }
  if (!isStringArray(value.releaseNameFiles)) return "releaseNameFiles must be a string array";
  if (!isStringArray(value.undefinedFdAllowed)) return "undefinedFdAllowed must be a string array";
  if (!value.deadPathAllowed || typeof value.deadPathAllowed !== "object") {
    return "deadPathAllowed must be an object";
  }
  for (const [file, tokens] of Object.entries(value.deadPathAllowed)) {
    if (!isStringArray(tokens)) return `deadPathAllowed.${file} must be a string array`;
  }
  return value as Manifest;
}

function withoutFences(text: string): string {
  const kept: string[] = [];
  let inside = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.includes(FENCE_START)) inside = true;
    else if (line.includes(FENCE_END)) inside = false;
    else if (!inside) kept.push(line);
  }
  return kept.join("\n");
}

/** Backticked repo paths: contain a slash, end in a known extension, are not placeholders, absolute or vendored. */
function citedPaths(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    let token = (match[1] ?? "").trim();
    if (/[\s<>*{}$|…]/.test(token) || token.includes("://")) continue;
    if (token.startsWith("/") || token.startsWith("~") || token.includes("node_modules/")) continue;
    token = token.replace(/#.*$/, "").replace(/:\d+(?:-\d+)?$/, "");
    if (!token.includes("/") || !PATH_EXTENSION.test(token)) continue;
    found.add(token.replace(/^\.\//, ""));
  }
  return [...found];
}

export function checkDocs(root: string): DocFinding[] {
  const parsed = parseManifest(root);
  if (typeof parsed === "string") {
    return [{ rule: "bad-manifest", file: MANIFEST_PATH, detail: parsed }];
  }
  const manifest = parsed;
  const findings: DocFinding[] = [];
  const report = (rule: string, file: string, detail: string) => findings.push({ rule, file, detail });

  const files = listFiles(root);
  const fileSet = new Set(files);
  for (const file of files) {
    if (file.startsWith("documentation/") && file.endsWith(".md") && !manifest.files[file]) {
      report("unlisted-doc", file, "not listed in documentation/MANIFEST.json");
    }
  }

  const defined = new Set<string>();
  const decisionsPath = join(root, DECISIONS_PATH);
  if (existsSync(decisionsPath)) {
    const decisions = readFileSync(decisionsPath, "utf8");
    for (const match of decisions.matchAll(/^(?:#{2,4}\s+|\|\s*)FD-(\d{3})\b/gm)) defined.add(match[1] ?? "");
  }
  const referencedFd = new Set<string>();
  const usedDeadAllowance = new Set<string>();
  const resolveCache = new Map<string, boolean>();

  const resolves = (token: string, doc: string): boolean => {
    const key = `${posix.dirname(doc)}\u0000${token}`;
    const cached = resolveCache.get(key);
    if (cached !== undefined) return cached;
    const fromDoc = posix.normalize(posix.join(posix.dirname(doc), token));
    const ok =
      fileSet.has(token) ||
      fileSet.has(fromDoc) ||
      files.some((candidate) => candidate.endsWith(`/${token}`));
    resolveCache.set(key, ok);
    return ok;
  };

  for (const [doc, { maxBytes }] of Object.entries(manifest.files)) {
    const path = join(root, doc);
    if (!existsSync(path)) {
      report("missing-doc", doc, "listed in documentation/MANIFEST.json but not in the repository");
      continue;
    }
    const raw = readFileSync(path, "utf8");
    // Ceilings are measured on LF text: a Windows checkout with CRLF must not trip them.
    const bytes = Buffer.byteLength(raw.replace(/\r\n/g, "\n"), "utf8");
    if (bytes > maxBytes) report("too-big", doc, `${bytes} bytes, ceiling ${maxBytes}`);
    const text = withoutFences(raw);

    for (const id of new Set([...text.matchAll(/\bFD-(\d{3})\b/g)].map((m) => m[1] ?? ""))) {
      referencedFd.add(id);
      if (!defined.has(id) && !manifest.undefinedFdAllowed.includes(id)) {
        report("undefined-fd", doc, `FD-${id} is referenced but no heading or table row in ${DECISIONS_PATH} defines it`);
      }
    }

    const allowedDead = manifest.deadPathAllowed[doc] ?? [];
    for (const token of citedPaths(text)) {
      if (resolves(token, doc)) continue;
      if (allowedDead.includes(token)) {
        usedDeadAllowance.add(`${doc}\u0000${token}`);
        continue;
      }
      report("dead-path", doc, `\`${token}\` does not exist in the repository`);
    }

    const release = /\bInternal\.\d+\b/.exec(text);
    if (release && !manifest.releaseNameFiles.includes(doc)) {
      report("release-name", doc, `mentions ${release[0]}; release names live only in ${manifest.releaseNameFiles.join(", ")}`);
    }
  }

  for (const id of manifest.undefinedFdAllowed) {
    if (defined.has(id) || !referencedFd.has(id)) {
      report("stale-allowance", MANIFEST_PATH, `undefinedFdAllowed FD-${id} is no longer needed`);
    }
  }
  for (const [doc, tokens] of Object.entries(manifest.deadPathAllowed)) {
    for (const token of tokens) {
      if (!usedDeadAllowance.has(`${doc}\u0000${token}`)) {
        report("stale-allowance", MANIFEST_PATH, `deadPathAllowed ${doc} \`${token}\` is no longer needed`);
      }
    }
  }
  return findings;
}

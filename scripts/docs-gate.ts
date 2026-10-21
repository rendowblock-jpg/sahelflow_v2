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
const RELEASE_NAME = /\binternal\.\d+\b/i;

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

/** Removes ignore-fenced lines. A malformed fence is reported, never trusted: it could hide the rest of a document. */
function stripFences(text: string): { kept: string; problem: string | null } {
  const kept: string[] = [];
  let inside = false;
  let problem: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const starts = line.includes(FENCE_START);
    const ends = line.includes(FENCE_END);
    if (starts && ends) {
      problem ??= "start and end markers on one line";
      kept.push(line);
    } else if (starts) {
      if (inside) problem ??= "start marker inside an open fence";
      inside = true;
    } else if (ends) {
      if (!inside) problem ??= "end marker without a start";
      inside = false;
    } else if (!inside) {
      kept.push(line);
    }
  }
  if (inside) problem ??= "start marker is never closed";
  return { kept: kept.join("\n"), problem };
}

/** Backticked repo paths: contain a slash, end in a known extension, are not placeholders, absolute or vendored. */
function citedPaths(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    let token = (match[1] ?? "").trim();
    if (/[\s<>*{}$|…]/.test(token) || token.includes("://")) continue;
    if (token.startsWith("/") || token.startsWith("~") || token.includes("node_modules/")) continue;
    token = token.replace(/#.*$/, "").replace(/(?::\d+)+(?:-\d+)?$/, "");
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
  const rootDirs = new Set(files.filter((file) => file.includes("/")).map((file) => file.slice(0, file.indexOf("/"))));
  for (const file of files) {
    if (file.startsWith("documentation/") && file.endsWith(".md") && !manifest.files[file]) {
      report("unlisted-doc", file, "not listed in documentation/MANIFEST.json: add it there with a maxBytes ceiling, or delete it");
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
  const releaseNameSeen = new Set<string>();
  const resolveCache = new Map<string, boolean>();

  const resolves = (token: string, doc: string): boolean => {
    const key = `${posix.dirname(doc)}\u0000${token}`;
    const cached = resolveCache.get(key);
    if (cached !== undefined) return cached;
    const fromDoc = posix.normalize(posix.join(posix.dirname(doc), token));
    // A path anchored at a real top-level directory must resolve exactly; only other paths may match by suffix.
    const anchored = rootDirs.has(token.slice(0, token.indexOf("/")));
    const ok =
      fileSet.has(token) ||
      fileSet.has(fromDoc) ||
      (!anchored && files.some((candidate) => candidate.endsWith(`/${token}`)));
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
    if (bytes > maxBytes) {
      report("too-big", doc, `${bytes} bytes, ceiling ${maxBytes}: shrink the document, or raise its maxBytes in documentation/MANIFEST.json with a reason in the PR`);
    }
    const { kept: text, problem } = stripFences(raw);
    if (problem) report("bad-fence", doc, `${problem}; fix the docs-gate:ignore markers (a bad fence would hide the rest of the document)`);

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

    const release = RELEASE_NAME.exec(text);
    if (release) {
      releaseNameSeen.add(doc);
      if (!manifest.releaseNameFiles.includes(doc)) {
        report("release-name", doc, `mentions ${release[0]}; release names live only in ${manifest.releaseNameFiles.join(", ")}`);
      }
    }
  }

  for (const id of manifest.undefinedFdAllowed) {
    if (defined.has(id) || !referencedFd.has(id)) {
      report("stale-allowance", MANIFEST_PATH, `undefinedFdAllowed FD-${id} is no longer needed`);
    }
  }
  for (const file of manifest.releaseNameFiles) {
    if (!manifest.files[file]) {
      report("stale-allowance", MANIFEST_PATH, `releaseNameFiles ${file} is not a listed document`);
    } else if (existsSync(join(root, file)) && !releaseNameSeen.has(file)) {
      report("stale-allowance", MANIFEST_PATH, `releaseNameFiles ${file} no longer mentions a release name`);
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

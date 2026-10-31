// W3b PWA lab: the three tiny HTTP servers of the lab (relay bridge, built phone app, control endpoint). Not a test.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { extname, join, normalize } from "node:path";

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };
const SKIP = new Set(["host", "connection", "content-length", "accept-encoding", "transfer-encoding"]);

async function bodyOf(req: IncomingMessage): Promise<Uint8Array | undefined> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c as Uint8Array));
  return chunks.length > 0 ? new Uint8Array(Buffer.concat(chunks)) : undefined;
}
export function listen(server: Server, port: number): Promise<Server> {
  return new Promise((ok, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", () => ok(server)); });
}
export async function closeAll(servers: Server[]): Promise<void> {
  await Promise.all(servers.map((s) => new Promise<void>((ok) => { s.closeAllConnections(); s.close(() => ok()); })));
}
/** Node http -> a fetch-style handler (the relay worker): CORS is the worker's own business. */
export function bridge(base: string, handle: (r: Request) => Promise<Response>): Server {
  return createServer(async (req, res) => {
    try {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (!SKIP.has(k) && v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await bodyOf(req);
      const out = await handle(new Request(`${base}${req.url ?? "/"}`, { method: req.method ?? "GET", headers, ...(body ? { body: body as unknown as BodyInit } : {}) }));
      const h: Record<string, string> = {};
      out.headers.forEach((v, k) => { h[k] = v; });
      res.writeHead(out.status, h); res.end(Buffer.from(await out.arrayBuffer()));
    } catch (e) { res.writeHead(500, { "Content-Type": "text/plain" }); res.end(String(e)); }
  });
}
/** The built phone app: files as they are, any other path falls back to index.html (a missing asset is a plain 404). */
export function staticApp(dir: string): Server {
  return createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    let file = join(dir, normalize(path));
    const hit = file.startsWith(dir) && existsSync(file) && statSync(file).isFile();
    if (!hit && /^\/(assets|icons)\//.test(path)) { res.writeHead(404); res.end("missing"); return; }
    if (!hit) file = join(dir, "index.html");
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(readFileSync(file));
  });
}
export type Ctl = (path: string, query: URLSearchParams) => Promise<unknown>;
export function control(handle: Ctl): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const head = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
    try { const out = await handle(url.pathname, url.searchParams); res.writeHead(200, head); res.end(JSON.stringify(out)); }
    catch (e) { res.writeHead(500, head); res.end(JSON.stringify({ error: String(e) })); }
  });
}

#!/usr/bin/env node
// Serves a built site like Cloudflare would (headers from _headers, redirects, 404 page). Usage: node marketing/scripts/serve-dist.mjs [distDir] [port]
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./lib/dist.mjs";
const dist = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "dist"));
const s = await startServer(dist, Number(process.argv[3] ?? 4483));
console.log(`serving ${dist} at ${s.url}`);

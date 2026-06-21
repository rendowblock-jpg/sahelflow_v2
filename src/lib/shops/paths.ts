/**
 * Filesystem paths used by the shop registry.
 *
 * Centralized here so the shop module + API routes agree on locations.
 *
 *   data/app-meta.json   — shop registry + active shop ID
 *   data/shops/*.db      — per-shop SQLite files
 */

import { join } from "path";

/** Directory containing per-shop SQLite files. */
export const shopsDir = join(process.cwd(), "data", "shops");

/** Path to the app-meta.json registry file. */
export const appMetaPath = join(process.cwd(), "data", "app-meta.json");

/** Path to the Prisma schema (used by createShop to init a new shop DB). */
export const prismaSchemaPath = join(process.cwd(), "prisma", "schema.prisma");

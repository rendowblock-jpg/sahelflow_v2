import { join, resolve } from "node:path";
import { dataRoot } from "@/lib/storage/data-root";

export const shopsDir = join(dataRoot(), "shops");
export const registryPath = join(dataRoot(), "shop-registry.json");
export const legacyAppMetaPath = join(dataRoot(), "app-meta.json");
export const appMetaPath = registryPath;
export const quarantineDir = join(dataRoot(), "quarantine", "shops");
export const shopTemplatePath = join(dataRoot(), "system", "shop-template.db");
export const prismaSchemaPath = resolve(process.cwd(), "prisma", "schema.prisma");

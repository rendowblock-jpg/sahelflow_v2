import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

// Cache the parsed communes data in-process (avoids re-reading the 197KB
// file on every request). The file never changes at runtime.
let communesCache: ReadonlyArray<{ code: number; name: string; wilayaCode: number; wilayaName: string }> | null = null;

function getCommunes() {
  if (communesCache) return communesCache;
  const path = resolve(process.cwd(), "data/communes.json");
  const raw = readFileSync(path, "utf-8");
  communesCache = JSON.parse(raw);
  return communesCache;
}

/**
 * GET /api/communes?wilaya=16 — returns communes for the given wilaya code.
 * GET /api/communes — returns all communes (197KB, avoid in production).
 *
 * Used by the order form dialog to populate the commune dropdown without
 * bundling the full 197KB communes.json into the client JS (T-019).
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const wilayaCode = req.nextUrl.searchParams.get("wilaya");

  const all = getCommunes();
  if (!all) {
    return NextResponse.json({ error: "Failed to load communes" }, { status: 500 });
  }
  if (wilayaCode) {
    const code = parseInt(wilayaCode, 10);
    if (Number.isNaN(code)) {
      return NextResponse.json({ error: "Invalid wilaya code" }, { status: 400 });
    }
    const filtered = all.filter((c) => c.wilayaCode === code);
    return NextResponse.json({ communes: filtered });
  }
  return NextResponse.json({ communes: all });
}, "GET /api/communes");

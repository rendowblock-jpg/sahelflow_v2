import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { z } from "zod";

const schema = z.object({
  url: z.string().url(),
});

export const POST = withAuthAndRateLimit(
  async (_req, { body }) => {
    const { url } = body!; // L10 fix: removed redundant cast (body already typed by wrapper)

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    const ALLOWED_HOSTS = ["docs.google.com", "spreadsheets.google.com"];
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return NextResponse.json(
        { error: "URL must be a Google Sheets export URL" },
        { status: 400 },
      );
    }

    const csvUrl = url.replace(/\/edit.*$/, "/export?format=csv");

    try {
      const res = await fetch(csvUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok)
        return NextResponse.json(
          { error: "Failed to fetch sheet" },
          { status: 502 },
        );
      const text = await res.text();
      return NextResponse.json({ csv: text });
    } catch {
      return NextResponse.json(
        {
          error:
            "Could not reach Google Sheets. Make sure the sheet is published as CSV.",
        },
        { status: 502 },
      );
    }
  },
  { requirePermission: "products:manage", schema, rateLimitConfig: { maxRequests: 10, windowMs: 60000 } },
);

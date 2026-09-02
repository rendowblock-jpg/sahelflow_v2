import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getLinkPreview } from "@/lib/inbox/link-preview";

export const dynamic = "force-dynamic";

// Bounded request body — Audit S2-6 discipline: reject oversized payloads at
// the door. The URL itself is re-validated inside getLinkPreview.
const previewSchema = z.object({
  url: z.string().min(1).max(2048),
});

/** POST /api/inbox/link-preview — server-side OpenGraph metadata for inbox
 *  link cards (ledger INB-16). The webview runs a loopback-only CSP, so the
 *  fetch happens here with full SSRF discipline. Honest absence: failures
 *  answer `{ preview: null }` and the bubble stays a plain text message. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireTrustedAction("conversations.read");

  const body = await req.json();
  const input = previewSchema.parse(body);
  const preview = await getLinkPreview(input.url);
  return NextResponse.json({ preview });
}, "POST /api/inbox/link-preview");

/**
 * GET /api/conversations/search?q=<query>
 *
 * Searches canonical conversations plus recent decrypted message bodies. The
 * local shop database remains authoritative; this endpoint is deliberately
 * permission-filtered and returns enough workflow/provider identity to open a
 * result as a fully operational Inbox conversation instead of a read-only row.
 */
import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import { searchConversationsIndexed } from "@/lib/search/conversation-search-runtime";
import { normalizeSearchText } from "@/lib/search/universal-search";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.read");
  const canReadContact = trustedActionAllowed(
    actorContext,
    "customers.contact.read",
    { shopId: actorContext.shop.shopId },
  );
  const query = normalizeSearchText(req.nextUrl.searchParams.get("q") ?? "");
  if (!query) return NextResponse.json({ results: [] });

  // Local-first shops search deeper than the 100-row live queue without moving plaintext message search into a
  // remote index: the newest 500 conversations, each with its 50 newest messages. The persisted index only narrows
  // which of them are opened; the answer is the one the full scan gives.
  const results = await searchConversationsIndexed({ query, canReadContact });

  return NextResponse.json({ results });
}, "GET /api/conversations/search");

import "server-only";
import { db } from "@/lib/db";

export async function listCannedResponses() {
  return db.cannedResponse.findMany({ orderBy: { shortCode: "asc" } });
}

export async function createCannedResponse(data: { shortCode: string; content: string; description?: string }) {
  return db.cannedResponse.create({ data });
}

export async function updateCannedResponse(id: string, data: Partial<{ shortCode: string; content: string; description: string }>) {
  return db.cannedResponse.update({ where: { id }, data });
}

export async function deleteCannedResponse(id: string) {
  return db.cannedResponse.delete({ where: { id } });
}

/**
 * Search canned responses by shortCode, content, or description (for the
 * /short_code trigger).
 *
 * SV-L8: previously loaded ALL rows then filtered in-memory — fine for ~50
 * canned responses, but O(n) per query and linearly slow as the catalog
 * grows. Now uses Prisma `where` with `contains` (case-insensitive via
 * SQLite's default Unicode collation) + `take: limit` so the DB does the
 * filtering and we never load more rows than we'll return.
 *
 * Note: SQLite's `contains` is case-insensitive for ASCII by default; for
 * the in-app /short_code trigger the user types lowercase, and shortCodes
 * are conventionally lowercase, so this matches the old behavior. If
 * future canned-response content uses mixed-case search, add a
 * case-insensitive collation or pre-lowercase at write time.
 */
export async function searchCannedResponses(query: string, limit = 5) {
  const q = query.toLowerCase();
  return db.cannedResponse.findMany({
    where: {
      OR: [
        { shortCode: { contains: q } },
        { content: { contains: q } },
        { description: { contains: q } },
      ],
    },
    orderBy: { shortCode: "asc" },
    take: limit,
  });
}

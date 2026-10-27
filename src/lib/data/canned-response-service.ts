import "server-only";
import type { ServiceContext } from "@/lib/data/service-base";
import { foldedRowIds, rowSignature } from "@/lib/search/list-search-candidates";

export async function listCannedResponses(context: ServiceContext) {
  // Audit S3-14: bounded list — only the search path was capped before.
  // 200 covers any sane catalog while keeping the response bounded.
  return context.prisma.cannedResponse.findMany({
    orderBy: { shortCode: "asc" },
    take: 200,
  });
}

export async function createCannedResponse(context: ServiceContext, data: { shortCode: string; content: string; description?: string }) {
  return context.prisma.cannedResponse.create({ data });
}

export async function updateCannedResponse(context: ServiceContext, id: string, data: Partial<{ shortCode: string; content: string; description: string }>) {
  return context.prisma.cannedResponse.update({ where: { id }, data });
}

export async function deleteCannedResponse(context: ServiceContext, id: string) {
  return context.prisma.cannedResponse.delete({ where: { id } });
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
export async function searchCannedResponses(context: ServiceContext, query: string, limit = 5) {
  const q = query.toLowerCase();
  // Folded in memory (Arabic letters, accents, digits) over at most
  // LIST_SEARCH_ROW_CAP rows; a larger table keeps the SQL contains only.
  const foldedIds = await foldedRowIds(
    (take) =>
      context.prisma.cannedResponse.findMany({
        select: { id: true, shortCode: true, content: true, description: true },
        take,
      }),
    query,
    (row) => [row.shortCode, row.content, row.description],
    {
      key: "canned",
      signature: async () => {
        const stats = await context.prisma.cannedResponse.aggregate({
          _count: { _all: true },
          _max: { updatedAt: true },
        });
        return rowSignature(stats._count._all, stats._max.updatedAt);
      },
    },
  );
  return context.prisma.cannedResponse.findMany({
    where: {
      OR: [
        { shortCode: { contains: q } },
        { content: { contains: q } },
        { description: { contains: q } },
        ...(foldedIds ? [{ id: { in: foldedIds } }] : []),
      ],
    },
    orderBy: { shortCode: "asc" },
    take: limit,
  });
}

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

/** Search canned responses by shortCode or content (for the /short_code trigger). */
export async function searchCannedResponses(query: string, limit = 5) {
  const q = query.toLowerCase();
  const all = await db.cannedResponse.findMany({ orderBy: { shortCode: "asc" } });
  return all
    .filter((r) =>
      r.shortCode.toLowerCase().includes(q) ||
      r.content.toLowerCase().includes(q) ||
      (r.description ?? "").toLowerCase().includes(q)
    )
    .slice(0, limit);
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/ai/sessions — list chat sessions. */
export async function GET() {
  try {
    const sessions = await db.aiChatSession.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 1, // just the first message for a preview
        },
      },
    });
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[GET /api/ai/sessions]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const createSchema = z.object({
  title: z.string().optional(),
});

/** POST /api/ai/sessions — create a new chat session. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const input = createSchema.parse(body);
    const session = await db.aiChatSession.create({
      data: { title: input.title ?? "Nouvelle conversation" },
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.issues }, { status: 400 });
    }
    console.error("[POST /api/ai/sessions]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isAuthSetup, isAuthenticated } from "@/lib/auth/server";

export async function GET() {
  try {
    const setup = await isAuthSetup();
    const authenticated = setup ? await isAuthenticated() : false;
    return NextResponse.json(
      { setup, authenticated, authorityAvailable: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        setup: null,
        authenticated: false,
        authorityAvailable: false,
        code: "SESSION_AUTHORITY_UNAVAILABLE",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

import { NextResponse } from "next/server";
import { isAuthSetup, isAuthenticated } from "@/lib/auth/server";

export async function GET() {
  try {
    const setup = await isAuthSetup();
    const authenticated = setup ? await isAuthenticated() : false;
    return NextResponse.json({ setup, authenticated });
  } catch {
    return NextResponse.json({ setup: false, authenticated: false });
  }
}

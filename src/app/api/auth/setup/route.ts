import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthSetup, setupAuth, createSession, auditLog } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { seedWilayaRiskProfiles } from "@/lib/wilaya-risk/engine";
import { db, shopContext } from "@/lib/db";
import { AUTH_MODE_CONFIGURED, AUTH_MODE_ENV } from "@/lib/runtime-auth";

const SetupSchema = z.object({
  pin: z.string().min(8, "PIN must be at least 8 characters").max(32, "PIN too long"),
});

export const POST = withErrorHandler(async (req: Request) => {
  const body = await req.json();
  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid PIN" },
      { status: 400 },
    );
  }

  const alreadySetup = await isAuthSetup();
  if (alreadySetup) {
    return NextResponse.json(
      { error: "Auth is already set up. Use the settings page to change your PIN." },
      { status: 409 },
    );
  }

  const { secret } = await setupAuth(parsed.data.pin);
  process.env.AUTH_SECRET = secret;
  process.env[AUTH_MODE_ENV] = AUTH_MODE_CONFIGURED;

  const persistDevelopmentSecret =
    process.env.NODE_ENV === "development" &&
    process.env.VITEST !== "true" &&
    !process.env.SF_TEST_ROOT;
  if (persistDevelopmentSecret) {
    try {
      const { writeFile, readFile } = await import("node:fs/promises");
      const { existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      const envPath = join(process.cwd(), ".env.local");
      const existing = existsSync(envPath) ? await readFile(envPath, "utf-8") : "";
      const cleaned = existing.replace(/^AUTH_SECRET=.*$/gm, "").trim();
      const newContent = (cleaned ? cleaned + "\n" : "") + `AUTH_SECRET=${secret}\n`;
      await writeFile(envPath, newContent, { encoding: "utf-8" });
    } catch {
      // The database remains canonical if the development convenience file cannot be written.
    }
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await createSession(ip);
  void auditLog("auth.setup", {}, ip);

  // Auto-seed WilayaRiskProfile so the risk engine's wilaya factor works
  // immediately on a fresh install (was: silently disabled until manual
  // ?seed=true was called from the risk page).
  try {
    const result = await seedWilayaRiskProfiles({ prisma: db, shop: shopContext });
    void auditLog("risk.wilaya.seeded", { seeded: result.seeded, skipped: result.skipped }, ip);
  } catch {
    // Non-critical — the risk engine works without wilaya profiles (just
    // skips the wilaya factor). The seller can seed manually later.
  }

  return NextResponse.json({ success: true });
});

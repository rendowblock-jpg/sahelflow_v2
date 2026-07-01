import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthSetup, setupAuth, createSession, auditLog } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";

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

  try {
    const { writeFile, readFile, mkdir } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const envPath = join(process.cwd(), ".env.local");
    const existing = existsSync(envPath) ? await readFile(envPath, "utf-8") : "";
    const cleaned = existing.replace(/^AUTH_SECRET=.*$/gm, "").trim();
    const newContent = (cleaned ? cleaned + "\n" : "") + `AUTH_SECRET=${secret}\n`;
    await writeFile(envPath, newContent, { encoding: "utf-8" });
    const dataDir = join(process.cwd(), "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "auth-secret"), secret, { mode: 0o600, encoding: "utf-8" });
  } catch { /* non-critical */ }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await createSession(ip);
  void auditLog("auth.setup", {}, ip);

  return NextResponse.json({ success: true });
});

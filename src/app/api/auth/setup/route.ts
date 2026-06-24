import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthSetup, setupAuth, createSession } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";

const SetupSchema = z.object({
  pin: z.string().min(4, "PIN must be at least 4 characters").max(32, "PIN too long"),
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

  // If auth is already set up, refuse (must reset via authenticated flow)
  const alreadySetup = await isAuthSetup();
  if (alreadySetup) {
    return NextResponse.json(
      { error: "Auth is already set up. Use the settings page to change your PIN." },
      { status: 409 },
    );
  }

  const { secret } = await setupAuth(parsed.data.pin);

  // Set the secret in process.env for the current process (so this session
  // works immediately without restart). On next restart, it's loaded from
  // .env.local (written below).
  process.env.AUTH_SECRET = secret;

  // Write to .env.local for dev mode (so the secret survives restart)
  // In production (Tauri), the Rust shell reads data/auth-secret instead.
  try {
    const { writeFile, readFile, mkdir } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");

    const envPath = join(process.cwd(), ".env.local");
    const existing = existsSync(envPath) ? await readFile(envPath, "utf-8") : "";
    // Remove any existing AUTH_SECRET line and append the new one
    const cleaned = existing.replace(/^AUTH_SECRET=.*$/gm, "").trim();
    const newContent = (cleaned ? cleaned + "\n" : "") + `AUTH_SECRET=${secret}\n`;
    await writeFile(envPath, newContent, { encoding: "utf-8" });

    // Also write to data/auth-secret for Tauri production
    const dataDir = join(process.cwd(), "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "auth-secret"), secret, { mode: 0o600, encoding: "utf-8" });
  } catch {
    // Non-critical — the secret is in the DB + process.env for this session
  }

  // Create a session immediately (user is now logged in)
  await createSession();

  return NextResponse.json({ success: true });
});

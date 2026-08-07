import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthSetup,
  setupAuth,
  createSession,
  auditLog,
  getAuthSecret,
} from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { seedWilayaRiskProfiles } from "@/lib/wilaya-risk/engine";
import { db, shopContext } from "@/lib/db";
import {
  identityAuthorityMarkerPath,
  identityAuthorityPath,
} from "@/lib/identity/control-authority";
import { AUTH_MODE_CONFIGURED, AUTH_MODE_ENV } from "@/lib/runtime-auth";
import { SahelFlowError } from "@/types/errors";

const SetupSchema = z.object({
  pin: z.string().min(8, "PIN must be at least 8 characters").max(32, "PIN too long"),
});

const IDENTITY_AUTHORITY_FOOTPRINT_KEY = "identity_authority_initialized_v1";

type SetupDiagnosticStage =
  | "setup-precheck"
  | "auth-persist"
  | "auth-secret-resolve"
  | "owner-session"
  | "complete";

function safeErrorCode(error: unknown): string | null {
  if (error instanceof SahelFlowError) return error.code;
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const candidate = String((error as { code?: unknown }).code ?? "");
  return /^(?:P\d{4}|[A-Z0-9_]{3,80})$/.test(candidate) ? candidate : null;
}

function safeErrorName(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  return /^[A-Za-z0-9_.-]{1,80}$/.test(error.name) ? error.name : "Error";
}

async function writePhase4SetupDiagnostic(
  stage: SetupDiagnosticStage,
  error?: unknown,
  facts: Record<string, boolean | number | string | null> = {},
): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  const runnerTemp = process.env.RUNNER_TEMP;
  if (!runnerTemp) return;

  try {
    const evidenceRoot = join(runnerTemp, "sahelflow-installed-e2e");
    await mkdir(evidenceRoot, { recursive: true });
    await writeFile(
      join(evidenceRoot, "auth-setup-diagnostic.json"),
      `${JSON.stringify(
        {
          formatVersion: 1,
          stage,
          capturedAt: new Date().toISOString(),
          errorCode: safeErrorCode(error),
          errorName: safeErrorName(error),
          facts,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8" },
    );
  } catch {
    // CI diagnostics must never change seller authentication behavior.
  }
}

async function collectOwnerSessionFailureFacts(
  startedAt: Date,
): Promise<Record<string, boolean | number | string | null>> {
  let sessionState = "unknown";
  let footprintPresent = false;

  try {
    const session = await db.session.findFirst({
      where: { issuedAt: { gte: startedAt } },
      orderBy: { issuedAt: "desc" },
      select: { revokedAt: true },
    });
    sessionState = !session
      ? "not-created"
      : session.revokedAt
        ? "created-revoked"
        : "created-active";
  } catch {
    sessionState = "inspection-failed";
  }

  try {
    footprintPresent = Boolean(
      await db.setting.findUnique({
        where: { key: IDENTITY_AUTHORITY_FOOTPRINT_KEY },
        select: { key: true },
      }),
    );
  } catch {
    // Keep the default false value; the separate session state records DB trouble.
  }

  const authorityPresent = existsSync(identityAuthorityPath());
  const markerPresent = existsSync(identityAuthorityMarkerPath());

  return {
    sessionState,
    identityAuthorityPresent: authorityPresent,
    identityMarkerPresent: markerPresent,
    identityFootprintPresent: footprintPresent,
  };
}

export const POST = withErrorHandler(async (req: Request) => {
  const body = await req.json();
  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid PIN" },
      { status: 400 },
    );
  }

  let alreadySetup: boolean;
  try {
    alreadySetup = await isAuthSetup();
  } catch (error) {
    await writePhase4SetupDiagnostic("setup-precheck", error);
    throw error;
  }
  if (alreadySetup) {
    return NextResponse.json(
      { error: "Auth is already set up. Use the settings page to change your PIN." },
      { status: 409 },
    );
  }

  let secret: string;
  try {
    ({ secret } = await setupAuth(parsed.data.pin));
  } catch (error) {
    await writePhase4SetupDiagnostic("auth-persist", error);
    throw error;
  }

  process.env.AUTH_SECRET = secret;
  process.env[AUTH_MODE_ENV] = AUTH_MODE_CONFIGURED;

  let persistedSecretMatches = false;
  try {
    const persisted = await db.authSecret.findUnique({
      where: { id: "default" },
      select: { secret: true, pinHash: true },
    });
    persistedSecretMatches =
      Boolean(persisted?.pinHash) && persisted?.secret === secret;
    const resolvedSecret = await getAuthSecret();
    if (!resolvedSecret || resolvedSecret !== secret) {
      await writePhase4SetupDiagnostic("auth-secret-resolve", undefined, {
        persistedSecretMatches,
        runtimeSecretPresent: Boolean(process.env.AUTH_SECRET),
        resolvedSecretMatches: false,
      });
      throw new SahelFlowError(
        "Authentication authority did not converge after setup",
        "AUTH_SECRET_UNAVAILABLE",
        503,
      );
    }
  } catch (error) {
    if (
      error instanceof SahelFlowError &&
      error.code === "AUTH_SECRET_UNAVAILABLE"
    ) {
      throw error;
    }
    await writePhase4SetupDiagnostic("auth-secret-resolve", error, {
      persistedSecretMatches,
      runtimeSecretPresent: Boolean(process.env.AUTH_SECRET),
    });
    throw error;
  }

  const persistDevelopmentSecret =
    process.env.NODE_ENV === "development" &&
    process.env.VITEST !== "true" &&
    !process.env.SF_TEST_ROOT;
  if (persistDevelopmentSecret) {
    try {
      const { writeFile: writeDevelopmentFile, readFile } = await import("node:fs/promises");
      const { existsSync: developmentFileExists } = await import("node:fs");
      const { join: joinDevelopmentPath } = await import("node:path");
      const envPath = joinDevelopmentPath(process.cwd(), ".env.local");
      const existing = developmentFileExists(envPath)
        ? await readFile(envPath, "utf-8")
        : "";
      const cleaned = existing.replace(/^AUTH_SECRET=.*$/gm, "").trim();
      const newContent =
        (cleaned ? cleaned + "\n" : "") + `AUTH_SECRET=${secret}\n`;
      await writeDevelopmentFile(envPath, newContent, { encoding: "utf-8" });
    } catch {
      // The database remains canonical if the development convenience file cannot be written.
    }
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const sessionStartedAt = new Date();
  try {
    await createSession(ip);
  } catch (error) {
    await writePhase4SetupDiagnostic(
      "owner-session",
      error,
      await collectOwnerSessionFailureFacts(sessionStartedAt),
    );
    throw error;
  }
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

  await writePhase4SetupDiagnostic("complete", undefined, {
    persistedSecretMatches,
  });
  return NextResponse.json({ success: true });
});

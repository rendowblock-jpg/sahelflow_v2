import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { requireAuth } from "@/lib/auth/server";
import { shopContext } from "@/lib/db";

/**
 * File upload endpoint — accepts multipart/form-data, stores the file
 * locally in public/uploads/<shopId>/, returns the public URL.
 *
 * Accepted types: images only (jpeg, png, webp, gif).
 * Max size: 5MB.
 *
 * Security (audit 7-a F12):
 *   - Magic-byte sniffing replaces client MIME trust: the Content-Type header
 *     is attacker-controlled, so the type decision and the stored extension
 *     derive from the file's leading bytes. A payload that sniffs as none of
 *     the allowed images is rejected (415) regardless of its declared type.
 *   - Uploads are scoped per shop: files live under
 *     public/uploads/<shopId>/<uuid>.<ext> so storage (and any future
 *     cleanup/export) never crosses the process shop boundary. shopId is
 *     server-resolved, but it is still normalized to a safe path segment.
 *
 * For simplicity in local-first mode, we write under public/ so Next.js
 * serves the files directly. In production (Tauri), the standalone server
 * serves the public/ directory.
 */

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

type SniffedImageType = "jpeg" | "png" | "webp" | "gif";

const EXT_BY_TYPE: Record<SniffedImageType, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
};

const ACCEPTED_LABEL = "JPEG, PNG, WebP, GIF";

/**
 * Identify the real image type from the file's leading bytes.
 *   JPEG: FF D8 FF
 *   PNG:  89 50 4E 47 0D 0A 1A 0A
 *   WebP: "RIFF" ???? "WEBP"
 *   GIF:  "GIF87a" / "GIF89a"
 */
function sniffImageType(buffer: Buffer): SniffedImageType | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("latin1", 0, 4) === "RIFF" &&
    buffer.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (buffer.length >= 6) {
    const gif = buffer.toString("latin1", 0, 6);
    if (gif === "GIF87a" || gif === "GIF89a") return "gif";
  }
  return null;
}

export const POST = withErrorHandler(async (req: Request) => {
  await requireAuth("products.manage");
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 },
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large. Max size: 5MB" },
      { status: 413 },
    );
  }

  // SEC-011 → audit 7-a F12: derive the stored extension from the sniffed
  // content, not from the client-controlled MIME or filename.
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const sniffed = sniffImageType(buffer);
  if (!sniffed) {
    return NextResponse.json(
      {
        error: `File content does not match an accepted image. Upload a real ${ACCEPTED_LABEL} file`,
        code: "UPLOAD_TYPE_MISMATCH",
      },
      { status: 415 },
    );
  }
  const filename = `${randomUUID()}.${EXT_BY_TYPE[sniffed]}`;

  // Per-shop scoping (audit 7-a F12): one directory per process shop.
  const shopSegment = shopContext.shopId.replace(/[^A-Za-z0-9._-]/g, "_");
  const uploadDir = join(process.cwd(), "public", "uploads", shopSegment);
  await mkdir(uploadDir, { recursive: true });

  // SEC-011: path traversal protection — verify resolved path is inside uploadDir
  const resolvedPath = join(uploadDir, filename);
  const resolvedUploadDir = resolve(uploadDir);
  if (!resolve(resolvedPath).startsWith(resolvedUploadDir + sep) && resolve(resolvedPath) !== resolvedUploadDir) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }
  await writeFile(resolvedPath, buffer);

  // Return the public URL
  const url = `/uploads/${shopSegment}/${filename}`;

  return NextResponse.json({ url, filename, size: file.size });
}, "POST /api/upload");

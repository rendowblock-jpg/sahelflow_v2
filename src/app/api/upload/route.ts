import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { requireAuth } from "@/lib/auth/server";

/**
 * File upload endpoint — accepts multipart/form-data, stores the file
 * locally in data/uploads/, returns the public URL.
 *
 * Accepted types: images only (jpeg, png, webp, gif).
 * Max size: 5MB.
 *
 * Files are stored at: data/uploads/<uuid>.<ext>
 * Served from: /api/uploads/<uuid>.<ext> (via a static file route or Next.js public dir)
 *
 * For simplicity in local-first mode, we copy to public/uploads/ so Next.js
 * serves them directly. In production (Tauri), the standalone server serves
 * the public/ directory.
 */
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

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

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `File type ${file.type} not allowed. Accepted: JPEG, PNG, WebP, GIF` },
      { status: 415 },
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large. Max size: 5MB" },
      { status: 413 },
    );
  }

  // Generate a unique filename
  // SEC-011: strict extension allowlist + derive from MIME (not user filename)
  const ALLOWED_MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const ext = ALLOWED_MIME_TO_EXT[file.type] ?? "jpg"; // default to jpg, ignore user filename
  const filename = `${randomUUID()}.${ext}`;

  // Ensure the public/uploads directory exists
  const uploadDir = join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  // Write the file
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  // SEC-011: path traversal protection — verify resolved path is inside uploadDir
  const resolvedPath = join(uploadDir, filename);
  const resolvedUploadDir = resolve(uploadDir);
  if (!resolve(resolvedPath).startsWith(resolvedUploadDir + sep) && resolve(resolvedPath) !== resolvedUploadDir) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }
  await writeFile(resolvedPath, buffer);

  // Return the public URL
  const url = `/uploads/${filename}`;

  return NextResponse.json({ url, filename, size: file.size });
}, "POST /api/upload");

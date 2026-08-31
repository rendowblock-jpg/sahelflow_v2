/**
 * Declared outbound media mimetype resolution (campaign row B3).
 *
 * The app server (pinned Node runtime) dispatches staged media to the
 * Bun-compiled sidecar as multipart forms. The media type that crosses this
 * boundary is the sniffed classification from the app's encrypted storage
 * authority, carried as an explicit `mimeType` form field — NOT the parsed
 * `File.type` of the media part: sidecar runtimes have demonstrated that
 * multipart parsing can drop the file-part Content-Type, which would make an
 * allowlist check on `File.type` reject every legitimate send with
 * `INVALID_*_SEND_REQUEST`.
 */
export function declaredOutboundMimeType(
  value: FormDataEntryValue | null | undefined,
  allowed: ReadonlySet<string>,
): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  return allowed.has(candidate) ? candidate : null;
}

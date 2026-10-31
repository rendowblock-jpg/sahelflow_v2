"use client";

import { Clock, Cloud, HardDrive, ImageOff } from "lucide-react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import { useI18n } from "@/hooks/use-i18n";
import type { PhotoState } from "@/lib/storefront/media-host";

type Translate = (key: string, params?: Record<string, string | number>) => string;
export type PhotoProgress = Readonly<{ done: number; total: number }>;
export type PhotoStatusData = Readonly<{
  products: Readonly<Record<string, ReadonlyArray<Readonly<{ ref: string; state: PhotoState }>>>>;
  progress: PhotoProgress | null;
}>;

const PRECEDENCE: readonly PhotoState[] = ["missing", "local-only", "waiting", "hosted"];

/** One chip per product: the state of its worst photo (a link the seller pasted needs no chip). */
export function summarizePhotoStates(states: readonly PhotoState[]): PhotoState | null {
  for (const state of PRECEDENCE) if (states.includes(state)) return state;
  return null;
}

const FAILURE_CODES = [
  "HOSTING_BUSY", "HOSTING_QUOTA", "HOSTING_REFUSED", "PHOTO_TOO_DETAILED", "PHOTO_UNREADABLE", "MEDIA_CONTRACT_CHANGED",
] as const;

/** The plain sentence for a publish that stopped on a photo, or null when the code is not a photo code. */
export function photoFailureText(code: string | null | undefined, t: Translate): string | null {
  return code && (FAILURE_CODES as readonly string[]).includes(code) ? t(`storefront.photos.fail.${code}`) : null;
}

/** Added to the success line when some photos stayed on this PC. */
export function photoPublishNote(summary: Readonly<{ onlyHere: number; missing?: number }> | null | undefined, t: Translate): string | null {
  if (!summary) return null;
  const notes: string[] = [];
  if (summary.onlyHere > 0) notes.push(t("storefront.photos.publishedOnlyHere", { count: summary.onlyHere }));
  const missing = summary.missing ?? 0;
  // A photo whose file is gone is a photo the buyer will not see: the line says so too.
  if (missing > 0) notes.push(t("storefront.photos.publishedMissing", { count: missing }));
  return notes.length > 0 ? notes.join(" ") : null;
}

export const ANNOUNCE_GAP_MS = 2000;
/** At most one spoken update per 2 seconds, and never the same words twice in a row. */
export function shouldAnnounce(last: Readonly<{ at: number; text: string }> | null, now: number, text: string): boolean {
  return !last || (text !== last.text && now - last.at >= ANNOUNCE_GAP_MS);
}

let lastAnnouncement: { at: number; text: string } | null = null;
export function announcePhotoProgress(text: string, now: number = Date.now()): void {
  if (typeof document === "undefined" || !shouldAnnounce(lastAnnouncement, now, text)) return;
  lastAnnouncement = { at: now, text };
  let region = document.querySelector<HTMLElement>("[data-photo-announcer]");
  if (!region) {
    region = document.createElement("div");
    region.setAttribute("data-photo-announcer", "");
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    region.className = "sr-only";
    document.body.appendChild(region);
  }
  region.textContent = text;
}
export function resetPhotoAnnouncements(): void {
  lastAnnouncement = null;
  document.querySelector("[data-photo-announcer]")?.remove();
}

/* One shared fetch for every row of the list. */
type Store = Readonly<{ storefrontId: string | null; status: "idle" | "loading" | "ready" | "error"; data: PhotoStatusData | null }>;
const IDLE: Store = { storefrontId: null, status: "idle", data: null };
let store: Store = IDLE;
let inflight: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function publish(next: Store): void {
  store = next;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function resetPhotoStatusStore(): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  inflight = null;
  store = IDLE;
}

export function loadPhotoStatus(storefrontId: string, force = false): Promise<void> {
  const same = store.storefrontId === storefrontId;
  if (!force && same && (store.status === "loading" || store.status === "ready")) return inflight ?? Promise.resolve();
  if (pollTimer) clearTimeout(pollTimer);
  publish({ storefrontId, status: "loading", data: same ? store.data : null });
  inflight = (async () => {
    try {
      const response = await fetch(`/api/storefront/media/status?storefrontId=${encodeURIComponent(storefrontId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("status");
      const data = (await response.json()) as PhotoStatusData;
      publish({ storefrontId, status: "ready", data });
      // While photos are going up, look again every 2 seconds.
      if (data.progress) pollTimer = setTimeout(() => void loadPhotoStatus(storefrontId, true), ANNOUNCE_GAP_MS);
    } catch {
      // Keep the last answer on screen; the row says it could not check.
      publish({ storefrontId, status: "error", data: store.storefrontId === storefrontId ? store.data : null });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

const subscribeNever = (): (() => void) => () => {};

const VIEW: Readonly<Record<Exclude<PhotoState, "link">, { key: string; Icon: typeof Cloud }>> = {
  hosted: { key: "storefront.photos.hosted", Icon: Cloud },
  waiting: { key: "storefront.photos.waiting", Icon: Clock },
  "local-only": { key: "storefront.photos.localOnly", Icon: HardDrive },
  missing: { key: "storefront.photos.missing", Icon: ImageOff },
};

/**
 * The honest state of a product's photo(s) in the online store. Text and icon,
 * never colour alone. Renders nothing for a product without a photo.
 */
export function PhotoStateChip({
  productId,
  hasImage,
  storefrontId,
}: {
  productId: string;
  hasImage: boolean;
  storefrontId?: string;
}) {
  const { t } = useI18n();
  // The Studio lives at /storefronts/<id>/studio. The server snapshot is empty so the first paint matches the server's.
  const pathname = useSyncExternalStore(subscribeNever, () => window.location.pathname, () => "");
  const routeId = /^\/storefronts\/([A-Za-z0-9_-]+)\/studio(?:\/|$)/.exec(pathname)?.[1] ?? null;
  const id = storefrontId ?? routeId;
  const view = useSyncExternalStore(subscribe, () => store, () => store);
  const progress = view.data?.progress ?? null;
  const progressText = progress ? t("storefront.photos.sending", { done: progress.done, total: progress.total }) : null;

  useEffect(() => {
    if (id && hasImage) void loadPhotoStatus(id);
  }, [id, hasImage]);
  useEffect(() => {
    if (progressText) announcePhotoProgress(progressText);
  }, [progressText]);

  if (!id || !hasImage) return null;
  const rows = view.storefrontId === id ? view.data?.products[productId] : undefined;
  const state = rows ? summarizePhotoStates(rows.map((row) => row.state)) : null;
  const failed = view.status === "error" && view.storefrontId === id;

  let chip: ReactNode = null;
  if (!view.data || view.storefrontId !== id) {
    if (!failed) {
      chip = (
        <span
          data-testid="photo-chip-loading"
          aria-hidden="true"
          className="mt-0.5 block h-5 w-32 animate-pulse rounded-control bg-muted"
        />
      );
    }
  } else if (state && state !== "link") {
    const { key, Icon } = VIEW[state];
    const waitingText = state === "waiting" && progressText ? progressText : t(key);
    chip = (
      <span
        data-testid="photo-chip"
        data-state={state}
        className="mt-0.5 flex items-start gap-1 text-caption leading-snug text-muted-foreground"
      >
        <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span dir="auto">{waitingText}</span>
      </span>
    );
  }
  return (
    <>
      {chip}
      {failed ? (
        <span data-testid="photo-chip-error" className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
          <span>{t("storefront.photos.checkFailed")}</span>
          <button
            type="button"
            className="inline-flex min-h-11 items-center px-2 text-primary underline underline-offset-2"
            onClick={(event) => { event.preventDefault(); void loadPhotoStatus(id, true); }}
          >
            {t("storefront.photos.retry")}
          </button>
        </span>
      ) : null}
    </>
  );
}

export const INBOX_QUEUE_DEFAULT_WIDTH = 324;
export const INBOX_QUEUE_MIN_WIDTH = 280;
export const INBOX_QUEUE_MAX_WIDTH = 480;
export const INBOX_THREAD_MIN_WIDTH = 400;
export const INBOX_DIVIDER_WIDTH = 8;
export const INBOX_QUEUE_WIDTH_STORAGE_KEY = "sf_inbox_queue_width_v1";

export type InboxDirection = "ltr" | "rtl";

export function inboxQueueWidthBounds(containerWidth: number): {
  min: number;
  max: number;
} {
  const available = Math.floor(
    containerWidth - INBOX_THREAD_MIN_WIDTH - INBOX_DIVIDER_WIDTH,
  );
  return {
    min: INBOX_QUEUE_MIN_WIDTH,
    max: Math.max(
      INBOX_QUEUE_MIN_WIDTH,
      Math.min(INBOX_QUEUE_MAX_WIDTH, available),
    ),
  };
}

export function clampInboxQueueWidth(
  width: number,
  containerWidth: number,
): number {
  const bounds = inboxQueueWidthBounds(containerWidth);
  if (!Number.isFinite(width)) return INBOX_QUEUE_DEFAULT_WIDTH;
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, width)));
}

export function inboxQueueWidthFromPointer(
  clientX: number,
  containerLeft: number,
  containerRight: number,
  direction: InboxDirection,
): number {
  return direction === "rtl"
    ? containerRight - clientX
    : clientX - containerLeft;
}

export function inboxQueueWidthFromKey(
  currentWidth: number,
  key: "ArrowLeft" | "ArrowRight" | "Home" | "End",
  direction: InboxDirection,
  containerWidth: number,
  step = 16,
): number {
  const bounds = inboxQueueWidthBounds(containerWidth);
  if (key === "Home") return bounds.min;
  if (key === "End") return bounds.max;
  const physicalDirection = key === "ArrowRight" ? 1 : -1;
  const queueDirection =
    direction === "rtl" ? -physicalDirection : physicalDirection;
  return clampInboxQueueWidth(
    currentWidth + queueDirection * step,
    containerWidth,
  );
}

function persistedWidthValue(): string | null {
  if (typeof document === "undefined") return null;
  const cookiePrefix = `${INBOX_QUEUE_WIDTH_STORAGE_KEY}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookiePrefix));
  if (cookie) return decodeURIComponent(cookie.slice(cookiePrefix.length));

  try {
    return window.localStorage.getItem(INBOX_QUEUE_WIDTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readPersistedInboxQueueWidth(): number | null {
  const value = persistedWidthValue();
  if (!value || !/^\d{3}$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed >= INBOX_QUEUE_MIN_WIDTH && parsed <= INBOX_QUEUE_MAX_WIDTH
    ? parsed
    : null;
}

export function persistInboxQueueWidth(width: number): void {
  if (typeof document === "undefined") return;
  const value = String(Math.round(width));
  document.cookie = `${INBOX_QUEUE_WIDTH_STORAGE_KEY}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Strict`;
  try {
    window.localStorage.setItem(INBOX_QUEUE_WIDTH_STORAGE_KEY, value);
  } catch {
    // The cross-port cookie remains the packaged desktop persistence fallback.
  }
}

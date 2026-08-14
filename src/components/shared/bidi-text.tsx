import type { ReactNode } from "react";

const NUMERIC_RANGE_PATTERN =
  /[0-9٠-٩۰-۹]+(?:[.,،][0-9٠-٩۰-۹]+)?\s*[-–—]\s*[0-9٠-٩۰-۹]+(?:[.,،][0-9٠-٩۰-۹]+)?\s*[%٪]/gu;

export type BidiTextSegment = Readonly<{
  text: string;
  isolate: boolean;
}>;

/**
 * Split directionally fragile numeric percentage ranges out of translated copy.
 *
 * In an RTL paragraph a token such as `25-40%` can be reordered visually as
 * `%40-25`. The surrounding sentence must remain RTL, while the numeric range is
 * an isolated LTR run. This helper keeps the original translated text intact and
 * only marks the fragile run for isolation.
 */
export function segmentBidiNumericRanges(value: string): BidiTextSegment[] {
  const segments: BidiTextSegment[] = [];
  let cursor = 0;

  for (const match of value.matchAll(NUMERIC_RANGE_PATTERN)) {
    const index = match.index;
    if (index > cursor) {
      segments.push({ text: value.slice(cursor, index), isolate: false });
    }
    segments.push({ text: match[0], isolate: true });
    cursor = index + match[0].length;
  }

  if (cursor < value.length) {
    segments.push({ text: value.slice(cursor), isolate: false });
  }
  if (segments.length === 0 && value) {
    segments.push({ text: value, isolate: false });
  }
  return segments;
}

export function BidiText({ children }: { children: string }) {
  const segments = segmentBidiNumericRanges(children);
  return (
    <>
      {segments.map((segment, index) =>
        segment.isolate ? (
          <bdi
            key={`${index}-${segment.text}`}
            dir="ltr"
            className="whitespace-nowrap tabular-nums"
          >
            {segment.text}
          </bdi>
        ) : (
          <span key={`${index}-${segment.text}`}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export function renderBidiText(value: ReactNode): ReactNode {
  return typeof value === "string" ? <BidiText>{value}</BidiText> : value;
}

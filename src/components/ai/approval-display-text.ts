/**
 * Text a person is asked to approve, made safe to read. Invisible and
 * direction-changing characters are written out as [U+XXXX] so they cannot
 * reorder or hide what is shown; nothing else is changed. A long value is cut
 * at a fixed length and the number of characters left out is reported, so a
 * cut is never silent.
 */
export const APPROVAL_TEXT_CUT = 300;

function isHiddenCode(code: number): boolean {
  return (
    code < 9 ||
    (code > 10 && code < 32) ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0xad ||
    code === 0x61c ||
    code === 0x180e ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x206f) ||
    code === 0xfeff ||
    (code >= 0xfff9 && code <= 0xfffb)
  );
}

function mark(code: number): string {
  return `[U+${code.toString(16).toUpperCase().padStart(4, "0")}]`;
}

/** The text with hidden characters written out, and how many were found. */
export function sanitizeApprovalText(value: string): { text: string; marks: number } {
  let marks = 0;
  let text = "";
  for (const char of Array.from(value)) {
    const code = char.codePointAt(0) ?? 0;
    if (isHiddenCode(code)) {
      marks += 1;
      text += mark(code);
    } else {
      text += char;
    }
  }
  return { text, marks };
}

export interface ApprovalTextView {
  /** What to show first (cut when long). */
  shown: string;
  /** The whole value, sanitized. */
  full: string;
  /** Characters left out of `shown`; 0 when nothing was cut. */
  cut: number;
  /** Hidden characters written out in `full`. */
  marks: number;
}

export function describeApprovalText(
  value: string,
  limit: number = APPROVAL_TEXT_CUT,
): ApprovalTextView {
  const chars = Array.from(value);
  const whole = sanitizeApprovalText(value);
  if (chars.length <= limit) {
    return { shown: whole.text, full: whole.text, cut: 0, marks: whole.marks };
  }
  return {
    shown: sanitizeApprovalText(chars.slice(0, limit).join("")).text,
    full: whole.text,
    cut: chars.length - limit,
    marks: whole.marks,
  };
}

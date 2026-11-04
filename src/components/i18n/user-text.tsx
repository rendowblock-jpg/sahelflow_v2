import type { ReactNode } from "react";

import { hasArabic, splitArabicRuns } from "@/lib/inbox/text-language";

/**
 * Text that a seller or a buyer typed (a customer, product, store or automation name),
 * drawn inside a heading or a label whose style letter-spaces its text.
 *
 * Arabic is connected script: any non-zero letter-spacing pulls the joined letters apart.
 * Headings carry `tracking-tight` and the type-ramp tokens carry their own tracking, which
 * is right for Latin and wrong for Arabic data in the English or French UI (the Arabic UI
 * already resets it for dir=rtl). Each run of Arabic script is tagged `lang="ar"`;
 * `[lang|="ar"]` in arabic-system.css gives it `letter-spacing: normal`. The Latin part of
 * a mixed name keeps the heading tracking, and Latin-only text is returned as it came: no
 * wrapper, no cost beyond one regex test.
 *
 * Pure and locale-free on purpose (usable from server components). Arabic digits count as
 * Arabic here: the page sweep flags any character of the Arabic block.
 *
 * Do NOT add a MutationObserver or a DOM scan to do this job: tagging at render is free.
 */
export function UserText({ text }: { text: string }): ReactNode {
  if (!text || !hasArabic(text)) return text;
  return splitArabicRuns(text).map((run, index) =>
    run.arabic || hasArabic(run.text) ? (
      <span key={index} lang="ar">
        {run.text}
      </span>
    ) : (
      run.text
    ),
  );
}

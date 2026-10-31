import { esc } from "../views/view";

export const renderSkeleton = (i: Readonly<{ rows: number; label: string }>): string =>
  `<div class="skeleton" role="status" aria-busy="true"><span class="sr">${esc(i.label)}</span>${"<i></i>".repeat(Math.max(1, Math.min(12, Math.trunc(i.rows))))}</div>`;

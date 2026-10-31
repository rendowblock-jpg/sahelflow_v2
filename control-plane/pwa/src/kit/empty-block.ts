import { esc } from "../views/view";

export const renderEmpty = (i: Readonly<{ title?: string; body: string; action?: string }>): string =>
  `<div class="note" role="status">${i.title ? `<h2>${esc(i.title)}</h2>` : ""}<p>${esc(i.body)}</p>${i.action ?? ""}</div>`;

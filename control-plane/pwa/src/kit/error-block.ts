import { esc } from "../views/view";

export const renderError = (i: Readonly<{ title: string; body: string; retryAct?: string; retryLabel?: string }>): string =>
  `<div class="note alert" role="alert"><h2>${esc(i.title)}</h2><p>${esc(i.body)}</p>${i.retryAct && i.retryLabel ? `<button type="button" class="btn btn-ghost" data-act="${esc(i.retryAct)}">${esc(i.retryLabel)}</button>` : ""}</div>`;

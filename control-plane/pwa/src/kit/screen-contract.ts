import type { ScreenId, View } from "../views/view";

// What every lazily loaded screen file exports (views/{orders,inbox,settings,install}/screen.ts, replaced whole by F4/F5/F6).
export type ScreenCtx = Readonly<{ view: View; go(screen: ScreenId): void }>;
export type ScreenModule = Readonly<{ render(ctx: ScreenCtx): string; bind(root: HTMLElement, ctx: ScreenCtx): () => void }>;

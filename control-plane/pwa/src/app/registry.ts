import type { ScreenModule } from "../kit/screen-contract";
import type { ScreenId } from "../views/view";

export type ScreenGroup = "orders" | "inbox" | "settings" | "install";
// FIXED paths: the screen tracks replace these files, nobody edits this table.
const LOADERS: Readonly<Record<ScreenGroup, () => Promise<Readonly<{ screen: ScreenModule }>>>> = {
  orders: () => import("../views/orders/screen"),
  inbox: () => import("../views/inbox/screen"),
  settings: () => import("../views/settings/screen"),
  install: () => import("../views/install/screen"),
};
export const GROUP_OF: Partial<Record<ScreenId, ScreenGroup>> = { orders: "orders", order: "orders", inbox: "inbox", conversation: "inbox", devices: "settings", install: "install" };
export async function loadScreen(group: ScreenGroup): Promise<ScreenModule> { return (await LOADERS[group]()).screen; }

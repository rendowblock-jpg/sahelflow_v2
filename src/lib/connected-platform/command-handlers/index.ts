import type { ExecutableCommandKind } from "../command-policy";
import { replyHandler } from "./messages";
import { noteHandler } from "./notes";
import { confirmHandler, rejectHandler } from "./orders";
import type { CommandHandler } from "./types";

/** One handler per kind the relay lets through (command-policy.ts lists the same keys). */
export const HANDLERS: Readonly<Record<ExecutableCommandKind, CommandHandler>> = Object.freeze({
  "command.comments.write": noteHandler,
  "command.orders.confirm": confirmHandler,
  "command.orders.reject": rejectHandler,
  "command.messages.reply": replyHandler,
});

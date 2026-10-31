import type { Phase2Action } from "../identity/permissions";
import { commandPermitted, type CommandKind } from "./contracts";

/**
 * The commands a phone may send AND this computer can execute. A kind enters
 * this list in the same commit as its handler (command-handlers/index.ts has
 * the same keys; a test compares them). The relay bundles this file: no
 * database, no node: import.
 */
export const EXECUTABLE_COMMAND_KINDS = Object.freeze([
  "command.comments.write",
  "command.orders.confirm",
  "command.orders.reject",
  "command.messages.reply",
] as const satisfies readonly CommandKind[]);

export type ExecutableCommandKind = (typeof EXECUTABLE_COMMAND_KINDS)[number];
export type RemoteCommandType = ExecutableCommandKind;

/** The member permissions those commands lean on (the exact rule per kind is COMMAND_PERMISSIONS). */
export const REMOTE_COMMAND_ACTIONS = Object.freeze([
  "comments.write",
  "orders.update",
  "conversations.reply",
  "customers.contact.read",
] as const satisfies readonly Phase2Action[]);

export type RemoteCommandAction = (typeof REMOTE_COMMAND_ACTIONS)[number];

const COMMANDS = new Set<string>(EXECUTABLE_COMMAND_KINDS);

export function isRemoteCommandType(value: unknown): value is RemoteCommandType {
  return typeof value === "string" && COMMANDS.has(value);
}

export function remoteCommandTypesForPermissions(
  permissions: readonly Phase2Action[],
): readonly RemoteCommandType[] {
  return Object.freeze(
    EXECUTABLE_COMMAND_KINDS.filter((kind) => commandPermitted(kind, permissions)),
  );
}

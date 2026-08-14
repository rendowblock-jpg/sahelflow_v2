import type { Phase2Action } from "../identity/permissions";

/** Remote PWA commands are deliberately narrower than desktop permissions. */
export const REMOTE_COMMAND_ACTIONS = Object.freeze([
  "comments.write",
] as const satisfies readonly Phase2Action[]);

export type RemoteCommandAction = (typeof REMOTE_COMMAND_ACTIONS)[number];
export type RemoteCommandType = `command.${RemoteCommandAction}`;

const COMMANDS = new Set<string>(
  REMOTE_COMMAND_ACTIONS.map((action) => `command.${action}`),
);

export function isRemoteCommandType(value: unknown): value is RemoteCommandType {
  return typeof value === "string" && COMMANDS.has(value);
}

export function remoteCommandTypesForPermissions(
  permissions: readonly Phase2Action[],
): readonly RemoteCommandType[] {
  const granted = new Set<Phase2Action>(permissions);
  return Object.freeze(
    REMOTE_COMMAND_ACTIONS
      .filter((action) => granted.has(action))
      .map((action) => `command.${action}` as RemoteCommandType),
  );
}

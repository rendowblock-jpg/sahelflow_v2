"use client";

import * as React from "react";

import type { Phase2Action } from "@/lib/identity/permissions";

/**
 * The signed-in member's resolved permissions, read once by the dashboard
 * layout on the server. It only decides what the shell offers; every page and
 * route still enforces its own action. `null` means "unknown": nothing is
 * hidden and the server remains the authority.
 */
const ActorAccessContext = React.createContext<readonly Phase2Action[] | null>(
  null,
);

export function ActorAccessProvider({
  permissions,
  children,
}: {
  permissions: readonly Phase2Action[] | null;
  children: React.ReactNode;
}) {
  return (
    <ActorAccessContext.Provider value={permissions}>
      {children}
    </ActorAccessContext.Provider>
  );
}

export function useActorPermissions(): readonly Phase2Action[] | null {
  return React.useContext(ActorAccessContext);
}

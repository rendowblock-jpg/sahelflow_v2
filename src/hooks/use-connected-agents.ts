"use client";

import * as React from "react";

/**
 * Client state for the Connected agents surface (FD-063, MCP-13).
 *
 * Reads the grant list, the grantable tool catalog and the recent invocation
 * log from the MCP management API, and wraps the two mutations a seller can
 * make: connect an agent (returns its secret exactly once) and revoke one.
 * Activity refreshes quietly while the surface is visible.
 */

export interface ConnectedAgentGrant {
  id: string;
  label: string;
  secretHint: string;
  tools: string[];
  createdAt: string;
  lastUsedAt: string | null;
  lastClientName: string | null;
  lastClientVersion: string | null;
  revokedAt: string | null;
  status: "active" | "revoked";
}

export interface GrantableTool {
  name: string;
  group: string;
  executionClass: string;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

export interface AgentInvocation {
  id: string;
  toolName: string;
  agentActor: string;
  grantId: string | null;
  clientName: string | null;
  outcome: string;
  errorCode: string | null;
  proposalId: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface ControlState {
  grants: ConnectedAgentGrant[];
  catalog: GrantableTool[];
  canManage: boolean;
  invocations: AgentInvocation[];
}

const ACTIVITY_REFRESH_MS = 15_000;

class ConnectedAgentsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { code?: string };
  if (!response.ok) {
    throw new ConnectedAgentsError(body.code ?? `HTTP_${response.status}`, response.status);
  }
  return body;
}

/**
 * @param live refresh activity on an interval (only while the surface is open;
 *             otherwise one load is enough to show the rail count).
 */
export function useConnectedAgents(live: boolean) {
  const [state, setState] = React.useState<ControlState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  // No integrations authority: the surface is not offered at all.
  const [forbidden, setForbidden] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [grants, activity] = await Promise.all([
        fetch("/api/mcp/grants", { cache: "no-store" }).then((response) =>
          readJson<Omit<ControlState, "invocations">>(response),
        ),
        fetch("/api/mcp/invocations", { cache: "no-store" }).then((response) =>
          readJson<{ invocations: AgentInvocation[] }>(response),
        ),
      ]);
      setState({ ...grants, invocations: activity.invocations });
      setFailed(false);
      setForbidden(false);
    } catch (error) {
      if (error instanceof ConnectedAgentsError && (error.status === 401 || error.status === 403)) {
        setForbidden(true);
      }
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate: initial fetch; state only settles after the request resolves
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, ACTIVITY_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [live, load]);

  const connect = React.useCallback(
    async (label: string, tools: string[]) => {
      const response = await fetch("/api/mcp/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, tools }),
      });
      const created = await readJson<{ grant: ConnectedAgentGrant; secret: string }>(
        response,
      );
      setState((current) =>
        current ? { ...current, grants: [created.grant, ...current.grants] } : current,
      );
      return created;
    },
    [],
  );

  const revoke = React.useCallback(async (id: string) => {
    const response = await fetch(`/api/mcp/grants/${encodeURIComponent(id)}/revoke`, {
      method: "POST",
    });
    const { grant } = await readJson<{ grant: ConnectedAgentGrant }>(response);
    setState((current) => {
      if (!current) return current;
      const replaced = current.grants.map((entry) => (entry.id === id ? grant : entry));
      // Active agents stay first; order within each status is preserved.
      const grants = [
        ...replaced.filter((entry) => entry.status === "active"),
        ...replaced.filter((entry) => entry.status === "revoked"),
      ];
      return { ...current, grants };
    });
    return grant;
  }, []);

  return {
    grants: state?.grants ?? [],
    catalog: state?.catalog ?? [],
    canManage: state?.canManage ?? false,
    invocations: state?.invocations ?? [],
    activeCount: state?.grants.filter((grant) => grant.status === "active").length ?? 0,
    loading,
    failed,
    forbidden,
    reload: load,
    connect,
    revoke,
  };
}

export type ConnectedAgentsState = ReturnType<typeof useConnectedAgents>;

export function connectedAgentsErrorCode(error: unknown): string | null {
  return error instanceof ConnectedAgentsError ? error.code : null;
}

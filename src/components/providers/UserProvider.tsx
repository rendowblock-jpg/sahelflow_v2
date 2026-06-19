"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { TeamRole } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/permissions";

interface UserContextValue {
  user: Record<string, unknown> | null;
  sellerId: string | null;
  role: TeamRole | null;
  status: "active" | "suspended" | null;
  loading: boolean;
  hasPermission: (action: string) => boolean;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  sellerId: null,
  role: null,
  status: null,
  loading: true,
  hasPermission: () => false,
  refresh: async () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [role, setRole] = useState<TeamRole | null>(null);
  const [status, setStatus] = useState<"active" | "suspended" | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchContext = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/context");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSellerId(data.sellerId);
        setRole(data.role);
        setStatus(data.status);
      } else {
        setUser(null);
        setSellerId(null);
        setRole(null);
        setStatus(null);
      }
    } catch (error) {
      // L6 fix: was silently swallowed. Now logged so auth failures are visible.
      console.error("Auth context fetch failed:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  const checkPermission = useCallback(
    (action: string) => {
      if (!role) return false;
      return hasPermission(role, action);
    },
    [role]
  );

  return (
    <UserContext.Provider
      value={{
        user,
        sellerId,
        role,
        status,
        loading,
        hasPermission: checkPermission,
        refresh: fetchContext,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

"use client";

import { useUser } from "@/components/providers/UserProvider";
import {
  canViewAccounting as checkAccounting,
  canManageTeam as checkTeam,
  canManageSettings as checkSettings,
  canDeleteData as checkDelete,
} from "@/lib/auth/permissions";

export function usePermissions() {
  const { user, sellerId, role, status, loading, hasPermission, refresh } = useUser();

  return {
    user,
    sellerId,
    role,
    status,
    loading,
    hasPermission,
    canViewAccounting: role ? checkAccounting(role) : false,
    canManageTeam: role ? checkTeam(role) : false,
    canManageSettings: role ? checkSettings(role) : false,
    canDeleteData: role ? checkDelete(role) : false,
    refresh,
  };
}

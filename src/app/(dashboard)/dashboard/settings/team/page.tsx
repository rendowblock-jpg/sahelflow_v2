"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  AlertTriangle,
  Loader2,

  Calendar,
  Clock,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/dashboard/ToastProvider";
import { useI18n } from "@/lib/i18n";
import { PageTransition } from "@/components/ui/motion";
import TeamInviteModal from "@/components/dashboard/TeamInviteModal";
import type { TeamRole } from "@/lib/auth/permissions";

interface TeamMember {
  id: string;
  seller_id: string;
  user_id: string | null;
  email: string;
  role: TeamRole;
  status: "invited" | "active" | "suspended";
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
}

export default function TeamPage() {
  const { role, canManageTeam, loading: authLoading } = usePermissions();
  const { toast } = useToast();
  const { t } = useI18n();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error(t.team.loadError);
      const data = await res.json();
      setMembers(data);
    } catch (err: unknown) {
      toast({ type: "error", title: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, [toast, t.team.loadError]);

  useEffect(() => {
    if (!authLoading) {
      fetchTeam();
    }
  }, [authLoading, fetchTeam]);

  async function handleStatusChange(memberId: string, currentStatus: string) {
    const nextStatus = currentStatus === "suspended" ? "active" : "suspended";
    setUpdatingId(memberId);

    try {
      const res = await fetch(`/api/team/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.team.updateError);

      toast({
        type: "success",
        title: nextStatus === "suspended" ? t.team.suspendSuccess : t.team.activateSuccess,
      });

      fetchTeam();
    } catch (err: unknown) {
      toast({ type: "error", title: err instanceof Error ? err.message : String(err) });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleRoleChange(memberId: string, nextRole: TeamRole) {
    setUpdatingId(memberId);

    try {
      const res = await fetch(`/api/team/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.team.updateError);

      toast({ type: "success", title: t.team.updateRoleSuccess });
      fetchTeam();
    } catch (err: unknown) {
      toast({ type: "error", title: err instanceof Error ? err.message : String(err) });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteMember(memberId: string, email: string) {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm(t.team.removeConfirm.replace("{email}", email))) {
      return;
    }

    setUpdatingId(memberId);

    try {
      const res = await fetch(`/api/team/${memberId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.team.removeError);

      toast({ type: "success", title: t.team.removeSuccess });
      fetchTeam();
    } catch (err: unknown) {
      toast({ type: "error", title: err instanceof Error ? err.message : String(err) });
    } finally {
      setUpdatingId(null);
    }
  }

  const getRoleBadge = (r: TeamRole) => {
    switch (r) {
      case "owner":
        return { label: t.team.roles.owner, class: "sf-badge-gold" };
      case "admin":
        return { label: t.team.roles.admin, class: "sf-badge-purple" };
      case "confirmer":
        return { label: t.team.roles.confirmer, class: "sf-badge-teal" };
      case "packer":
        return { label: t.team.roles.packer, class: "sf-badge-blue" };
      case "viewer":
        return { label: t.team.roles.viewer, class: "sf-badge-gray" };
    }
  };

  const getStatusBadge = (s: "invited" | "active" | "suspended") => {
    switch (s) {
      case "active":
        return { label: t.team.statuses.active, class: "sf-status-active" };
      case "invited":
        return { label: t.team.statuses.invited, class: "sf-status-invited" };
      case "suspended":
        return { label: t.team.statuses.suspended, class: "sf-status-suspended" };
    }
  };

  if (authLoading || (loading && members.length === 0)) {
    return (
      <div className="sf-flex-center sf-text-secondary" style={{ minHeight: 400 }}>
        <Loader2 size={24} className="sf-animate-spin sf-mr-sm" />
        {t.team.loadingMembers}
      </div>
    );
  }

  // Permission Guard
  if (!role || (role !== "owner" && role !== "admin" && members.length === 0)) {
    return (
      <PageTransition className="sf-flex-col sf-align-center sf-justify-center sf-py-xl sf-text-center">
        <AlertTriangle size={64} className="sf-text-warning" />
        <h2 className="sf-heading-md sf-mt-md">{t.team.noPermission}</h2>
        <p className="sf-text-sm-secondary sf-mt-xs">
          {t.team.noPermissionDesc}
        </p>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="sf-flex-col sf-gap-xl">
      <div className="sf-flex sf-align-center sf-justify-between">
        <div>
          <h1 className="sf-page-title">{t.team.title}</h1>
          <p className="sf-page-subtitle">{t.team.subtitle}</p>
        </div>
        {canManageTeam && (
          <button
            onClick={() => setInviteOpen(true)}
            className="sf-btn sf-btn-primary sf-flex sf-align-center sf-gap-xs"
          >
            <UserPlus size={18} />
            <span>{t.team.inviteMember}</span>
          </button>
        )}
      </div>

      {/* Grid of Team Cards */}
      <div className="sf-grid sf-grid-3 sf-gap-lg">
        {members.map((member) => {
          const badge = getRoleBadge(member.role);
          const status = getStatusBadge(member.status);
          const isOwner = member.role === "owner";
          const isSelf = member.user_id === members.find((m) => m.role === role)?.user_id;
          const isPending = member.status === "invited";
          const isUpdating = updatingId === member.id;

          return (
            <div
              key={member.id}
              className="sf-card sf-glassmorphism sf-flex-col sf-gap-md sf-relative sf-animate-fade-in"
              style={{
                border: isSelf ? "1px solid var(--primary-light)" : undefined,
                opacity: isUpdating ? 0.7 : 1,
              }}
            >
              {/* Badge top corner */}
              <div className="sf-flex sf-align-center sf-justify-between">
                <span className={`sf-badge ${badge.class}`}>{badge.label}</span>
                <span className={`sf-status-dot-wrapper ${status.class}`}>
                  <span className="sf-status-dot" />
                  <span className="sf-text-xs-secondary">{status.label}</span>
                </span>
              </div>

              {/* User email & info */}
              <div className="sf-flex sf-align-center sf-gap-md sf-mt-sm">
                <div
                  className="sf-avatar sf-flex-center"
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "var(--surface-light)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <Users size={20} className="sf-text-muted" />
                </div>
                <div className="sf-flex-col">
                  <span className="sf-heading-xs" style={{ wordBreak: "break-all" }}>
                    {member.email}
                  </span>
                  <span className="sf-text-xs-secondary sf-flex sf-align-center sf-gap-xs sf-mt-xs">
                    <Calendar size={12} />
                    <span>
                      {t.team.joined}: {new Date(member.invited_at).toLocaleDateString(t.locale === "ar" ? "ar-DZ" : t.locale === "fr" ? "fr-FR" : "en-US")}
                    </span>
                  </span>
                </div>
              </div>

              {/* If pending invite metadata */}
              {isPending && (
                <div
                  className="sf-flex sf-align-center sf-gap-xs sf-text-xs-secondary sf-py-xs sf-px-sm"
                  style={{ background: "rgba(249, 115, 22, 0.08)", borderRadius: 6 }}
                >
                  <Clock size={12} className="sf-text-warning" />
                  <span>
                    {t.locale === "ar"
                      ? "بانتظار تسجيل العضو للربط التلقائي"
                      : t.locale === "fr"
                      ? "En attente d'inscription"
                      : "Pending registration"}
                  </span>
                </div>
              )}

              {/* Actions section */}
              {canManageTeam && !isOwner && !isSelf && (
                <div
                  className="sf-flex sf-align-center sf-justify-between sf-mt-md sf-pt-md"
                  style={{ borderTop: "1px solid var(--border-color)" }}
                >
                  {/* Role Changer inline */}
                  <div className="sf-flex sf-align-center sf-gap-xs">
                    <Shield size={14} className="sf-text-muted" />
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as TeamRole)}
                      disabled={isUpdating}
                      className="sf-select sf-text-xs sf-py-xs"
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="packer">Packer</option>
                      <option value="confirmer">Confirmer</option>
                      {role === "owner" && <option value="admin">Admin</option>}
                    </select>
                  </div>

                  {/* Actions buttons */}
                  <div className="sf-flex sf-align-center sf-gap-md">
                    {/* Suspend Toggle */}
                    <button
                      onClick={() => handleStatusChange(member.id, member.status)}
                      disabled={isUpdating}
                      title={member.status === "suspended" ? t.team.activate : t.team.suspend}
                      className="sf-btn-action"
                    >
                      {member.status === "suspended" ? (
                        <UserCheck size={16} className="sf-text-success" />
                      ) : (
                        <UserX size={16} className="sf-text-warning" />
                      )}
                    </button>

                    {/* Delete Member */}
                    <button
                      onClick={() => handleDeleteMember(member.id, member.email)}
                      disabled={isUpdating}
                      title={t.team.remove}
                      className="sf-btn-action"
                    >
                      <Trash2 size={16} className="sf-text-danger" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {inviteOpen && role && (
        <TeamInviteModal
          isOpen={inviteOpen}
          onClose={() => setInviteOpen(false)}
          onSuccess={fetchTeam}
          currentUserRole={role}
        />
      )}
    </PageTransition>
  );
}

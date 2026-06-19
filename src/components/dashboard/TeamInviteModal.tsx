"use client";

import { useState } from "react";
import { X, Mail, Shield, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { TeamRole } from "@/lib/auth/permissions";

interface TeamInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUserRole: TeamRole;
}

export default function TeamInviteModal({
  isOpen,
  onClose,
  onSuccess,
  currentUserRole,
}: TeamInviteModalProps) {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t.team.inviteError);
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setEmail("");
        setRole("viewer");
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Define role helper descriptions in Arabic, English, and French
  const getRoleDescription = (r: TeamRole) => {
    const isAr = locale === "ar";
    const isFr = locale === "fr";

    switch (r) {
      case "owner":
        if (isAr) return "تحكم كامل ومطلق في المتجر، الحساب، والفواتير.";
        if (isFr) return "Contrôle total et absolu de la boutique, du compte et de la facturation.";
        return "Complete and absolute control of the store, account, and billing.";
      case "admin":
        if (isAr) return "إدارة كافة العمليات والمنتجات والموظفين (باستثناء المالك الرئيسي).";
        if (isFr) return "Gérer toutes les opérations, produits et employés (sauf le propriétaire principal).";
        return "Manage all operations, products, and staff (excluding the primary owner).";
      case "confirmer":
        if (isAr) return "تأكيد الطلبيات، وإدارة الزبائن، والرد على المحادثات.";
        if (isFr) return "Confirmer les commandes, gérer les clients et répondre aux chats.";
        return "Confirm orders, manage customers, and reply to chats.";
      case "packer":
        if (isAr) return "عرض وتجهيز وتعبئة المنتجات وتحديث مخزونها فقط.";
        if (isFr) return "Afficher, emballer les produits et mettre à jour le stock uniquement.";
        return "View, pack products, and update inventory only.";
      case "viewer":
        if (isAr) return "صلاحية العرض فقط للتحليلات والطلبيات والمنتجات دون أي تعديل.";
        if (isFr) return "Accès en lecture seule aux analyses, commandes et produits sans modification.";
        return "Read-only access to analytics, orders, and products without modifications.";
    }
  };

  return (
    <div className="sf-modal-overlay" style={{ zIndex: 1000 }} onClick={onClose}>
      <div
        className="sf-modal-content sf-glassmorphism sf-animate-fade-in"
        style={{ maxWidth: 480, position: "relative" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label={t.common.closePanel}
          className="sf-btn-close sf-absolute-top-right"
          style={{ top: 16, right: 16 }}
        >
          <X size={20} />
        </button>

        {success ? (
          <div className="sf-flex-col sf-align-center sf-justify-center sf-py-xl sf-text-center">
            <CheckCircle2 size={64} className="sf-text-success sf-animate-bounce" />
            <h3 className="sf-heading-sm sf-mt-md">{t.team.inviteSuccessTitle}</h3>
            <p className="sf-text-sm-secondary sf-mt-xs">
              {t.team.inviteSuccessDesc.replace("{role}", t.team.roles[role])}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="sf-flex-col sf-gap-lg">
            <div>
              <h3 className="sf-heading-sm">{t.team.inviteModalTitle}</h3>
              <p className="sf-text-sm-secondary sf-mt-xs">
                {t.team.inviteModalSubtitle}
              </p>
            </div>

            {error && (
              <div className="sf-alert sf-alert-danger sf-flex sf-align-center sf-gap-sm sf-animate-shake">
                <AlertCircle size={18} className="sf-flex-shrink-0" />
                <span className="sf-text-xs">{error}</span>
              </div>
            )}

            <div className="sf-flex-col sf-gap-xs">
              <label className="sf-label">{t.team.email}</label>
              <div className="sf-input-wrapper sf-flex sf-align-center">
                <Mail size={16} className="sf-text-muted sf-ml-sm" />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="sf-input"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="sf-flex-col sf-gap-xs">
              <label className="sf-label">{t.team.role}</label>
              <div className="sf-input-wrapper sf-flex sf-align-center">
                <Shield size={16} className="sf-text-muted sf-ml-sm" />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as TeamRole)}
                  className="sf-select sf-input"
                  disabled={loading}
                >
                  <option value="viewer">{t.team.roles.viewer}</option>
                  <option value="packer">{t.team.roles.packer}</option>
                  <option value="confirmer">{t.team.roles.confirmer}</option>
                  {currentUserRole === "owner" && (
                    <option value="admin">{t.team.roles.admin}</option>
                  )}
                </select>
              </div>
              <p className="sf-text-xs-secondary sf-mt-xs" style={{ minHeight: 32 }}>
                💡 {getRoleDescription(role)}
              </p>
            </div>

            <div className="sf-flex sf-justify-end sf-gap-md sf-mt-md">
              <button
                type="button"
                onClick={onClose}
                className="sf-btn sf-btn-ghost"
                disabled={loading}
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="sf-btn sf-btn-primary sf-flex sf-align-center sf-gap-xs"
                disabled={loading || !email}
              >
                {loading && <Loader2 size={16} className="sf-animate-spin" />}
                {t.team.sendInvite}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

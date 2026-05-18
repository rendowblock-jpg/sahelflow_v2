"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  X,
  Package,
  AlertTriangle,
  Zap,
  ShoppingCart,
  Info,
  Heart,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/dashboard/ToastProvider";

interface Notification {
  id: string;
  type: "order" | "low_stock" | "risk" | "automation" | "system" | "welcome";
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

const typeIcons: Record<string, typeof Bell> = {
  order: ShoppingCart,
  low_stock: Package,
  risk: AlertTriangle,
  automation: Zap,
  system: Info,
  welcome: Heart,
};

const typeColors: Record<string, string> = {
  order: "#6366f1",
  low_stock: "#f59e0b",
  risk: "#ef4444",
  automation: "#10b981",
  system: "#3b82f6",
  welcome: "#ec4899",
};

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t, formatTimeAgo } = useI18n();
  const { toast } = useToast();

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error(t.common.error);
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {
      toast({
        type: "error",
        title: t.notifications?.loadFailed || t.common.error,
      });
    } finally {
      setLoading(false);
    }
  }, [toast, t.notifications?.loadFailed, t.common.error]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markAllRead() {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    } catch {
      toast({
        type: "error",
        title: t.notifications?.markReadFailed || t.common.error,
      });
    }
  }

  async function markOneRead(id: string) {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, read: true }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
        );
      }
    } catch {
      toast({
        type: "error",
        title: t.notifications?.markReadFailed || t.common.error,
      });
    }
  }

  async function dismiss(id: string) {
    try {
      const res = await fetch(`/api/notifications?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }
    } catch {
      toast({
        type: "error",
        title: t.notifications?.dismissFailed || t.common.error,
      });
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) loadNotifications();
        }}
        style={{
          position: "relative",
          padding: 8,
          borderRadius: "var(--radius-md)",
          background: "transparent",
          border: "none",
          boxShadow: "0 0 0 1px var(--color-line-primary)",
          color: "var(--color-content-secondary)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              insetInlineEnd: -4,
              minWidth: 16,
              height: 16,
              borderRadius: "50%",
              padding: "0 4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--color-danger-500)",
              color: "white",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99,
            }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              insetInlineEnd: 0,
              marginTop: 8,
              width: 360,
              maxHeight: 440,
              background: "var(--color-surface-secondary)",
              border: "none",
              borderRadius: 12,
              boxShadow: "var(--shadow-xl)",
              zIndex: 100,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 16px",
                borderBottom: "1px solid var(--color-line-secondary)",
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: "var(--color-content-primary)",
                }}
              >
                {t.notifications.title}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    style={{
                      fontSize: 11,
                      color: "var(--color-brand-400)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    {t.notifications.markAllRead}
                  </button>
                )}
              </div>
            </div>

            {/* Notification List */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading && notifications.length === 0 ? (
                <div
                  style={{
                    padding: 30,
                    textAlign: "center",
                    color: "var(--color-content-tertiary)",
                    fontSize: 13,
                  }}
                >
                  {t.notifications.loading}
                </div>
              ) : notifications.length === 0 ? (
                <div
                  style={{
                    padding: 30,
                    textAlign: "center",
                    color: "var(--color-content-tertiary)",
                    fontSize: 13,
                  }}
                >
                  <Bell size={24} style={{ marginBottom: 8, opacity: 0.3 }} />
                  <br />
                  {t.notifications.allCaughtUp}
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon = typeIcons[n.type] || Bell;
                  return (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (!n.read) markOneRead(n.id);
                        if (n.link) {
                          setOpen(false);
                          router.push(n.link);
                        }
                      }}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--color-line-secondary)",
                        background: n.read
                          ? "transparent"
                          : "rgba(99, 102, 241, 0.04)",
                        transition: "background 0.15s",
                        cursor: n.link ? "pointer" : "default",
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: `${typeColors[n.type] || "#3b82f6"}15`,
                        }}
                      >
                        <Icon
                          size={16}
                          color={typeColors[n.type] || "#3b82f6"}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: n.read ? 400 : 500,
                            color: "var(--color-content-primary)",
                            marginBottom: 2,
                          }}
                        >
                          {n.title}
                        </p>
                        <p
                          style={{
                            fontSize: 11,
                            color: "var(--color-content-tertiary)",
                            lineHeight: 1.4,
                          }}
                        >
                          {n.message}
                        </p>
                        <p
                          style={{
                            fontSize: 10,
                            color: "var(--color-content-tertiary)",
                            marginTop: 4,
                            opacity: 0.7,
                          }}
                        >
                          {formatTimeAgo(n.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(n.id);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--color-content-tertiary)",
                          padding: 2,
                          flexShrink: 0,
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

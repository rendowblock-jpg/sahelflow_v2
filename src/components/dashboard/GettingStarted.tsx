"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Store,
  Package,
  Smartphone,
  ShoppingCart,
  CheckCircle2,
  Circle,
  ChevronRight,
  X,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

interface ChecklistStep {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: typeof Store;
  done: boolean;
}

function ConfettiPiece({ index }: { index: number }) {
  // Compute random values once on mount to avoid hydration errors
  const [style] = useState(() => ({
    left: `${Math.random() * 100}%`,
    animationDelay: `${Math.random() * 0.5}s`,
    backgroundColor: ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"][
      index % 5
    ],
  }));
  return <div className="sf-confetti__piece" style={style} />;
}

export function GettingStarted() {
  const { t } = useI18n();
  const supabase = useMemo(() => createClient(), []);
  const [steps, setSteps] = useState<ChecklistStep[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const checkProgress = useCallback(async () => {
    const saved = localStorage.getItem("sf-checklist-dismissed");
    if (saved === "true") {
      setDismissed(true);
      return;
    }

    const [
      { data: seller },
      { count: productCount },
      { count: channelCount },
      { count: orderCount },
    ] = await Promise.all([
      supabase
        .from("sellers")
        .select("business_name,onboarding_completed")
        .limit(1)
        .maybeSingle(),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase
        .from("channels")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      supabase.from("orders").select("id", { count: "exact", head: true }),
    ]);

    const checklist: ChecklistStep[] = [
      {
        key: "profile",
        label: t.onboarding.setupProfile,
        description: t.onboarding.setupProfileDesc,
        href: "/dashboard/settings",
        icon: Store,
        done: !!(
          seller?.onboarding_completed ||
          (seller?.business_name && seller.business_name.length > 0)
        ),
      },
      {
        key: "product",
        label: t.onboarding.addProduct,
        description: t.onboarding.addProductDesc,
        href: "/dashboard/products",
        icon: Package,
        done: (productCount || 0) > 0,
      },
      {
        key: "whatsapp",
        label: t.onboarding.connectWhatsApp,
        description: t.onboarding.connectWhatsAppDesc,
        href: "/dashboard/settings",
        icon: Smartphone,
        done: (channelCount || 0) > 0,
      },
      {
        key: "order",
        label: t.onboarding.createOrder,
        description: t.onboarding.createOrderDesc,
        href: "/dashboard/orders",
        icon: ShoppingCart,
        done: (orderCount || 0) > 0,
      },
    ];

    setSteps(checklist);

    if (checklist.every((s) => s.done)) {
      setShowConfetti(true);
      setTimeout(() => {
        setDismissed(true);
        localStorage.setItem("sf-checklist-dismissed", "true");
      }, 4000);
    }
  }, [supabase, t]);

  useEffect(() => {
    checkProgress();
  }, [checkProgress]);

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem("sf-checklist-dismissed", "true");
  }

  if (dismissed || !steps) return null;

  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  const progress = Math.round((completed / total) * 100);

  if (completed === total && !showConfetti) return null;

  return (
    <div className="sf-card sf-getting-started">
      {showConfetti && (
        <div className="sf-confetti" aria-hidden="true">
          {Array.from({ length: 40 }).map((_, i) => (
            <ConfettiPiece key={i} index={i} />
          ))}
        </div>
      )}

      <div className="sf-getting-started__header">
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <Sparkles size={16} style={{ color: "var(--color-brand-400)" }} />
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              {showConfetti ? t.onboarding.allDone : t.onboarding.title}
            </h3>
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--color-content-tertiary)",
              margin: 0,
            }}
          >
            {showConfetti ? t.onboarding.allDoneDesc : t.onboarding.subtitle}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="sf-btn sf-btn-ghost"
          style={{ padding: 4, minHeight: "auto" }}
          aria-label={t.common.dismiss}
        >
          <X size={16} />
        </button>
      </div>

      <div className="sf-getting-started__progress">
        <div
          className="sf-getting-started__progress-bar"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p
        style={{
          fontSize: 12,
          color: "var(--color-content-tertiary)",
          marginTop: 4,
        }}
      >
        {completed}/{total} {t.onboarding.completed}
      </p>

      <div className="sf-getting-started__list">
        {steps.map((step) => (
          <Link
            key={step.key}
            href={step.href}
            className={`sf-getting-started__item ${step.done ? "sf-getting-started__item--done" : ""}`}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flex: 1,
              }}
            >
              {step.done ? (
                <CheckCircle2
                  size={18}
                  style={{ color: "var(--color-accent-400)", flexShrink: 0 }}
                />
              ) : (
                <Circle
                  size={18}
                  style={{
                    color: "var(--color-content-tertiary)",
                    flexShrink: 0,
                  }}
                />
              )}
              <div>
                <span
                  style={{
                    fontWeight: 500,
                    fontSize: 13,
                    textDecoration: step.done ? "line-through" : "none",
                    color: step.done
                      ? "var(--color-content-tertiary)"
                      : "var(--color-content-primary)",
                    letterSpacing: "-0.005em",
                  }}
                >
                  {step.label}
                </span>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--color-content-tertiary)",
                    margin: 0,
                  }}
                >
                  {step.description}
                </p>
              </div>
            </div>
            {!step.done && (
              <ChevronRight
                size={14}
                style={{
                  color: "var(--color-content-tertiary)",
                  flexShrink: 0,
                  opacity: 0.6,
                }}
              />
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

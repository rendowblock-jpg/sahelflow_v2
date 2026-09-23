"use client";

/**
 * Agent capabilities panel — shows what the agent can do, derived from the
 * SAME central policy map the registry enforces (never a hand-written
 * marketing sentence that drifts).
 *
 * Design: grouped tool list with execution class badges, annotation chips,
 * and a live count. Fail-closed: a tool registered without a group throws.
 */

import { useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Package,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wrench,
  Eye,
  AlertTriangle,
  Globe,
} from "lucide-react";

import { getAgentCopy, type AgentLocale } from "@/lib/i18n/agent-workspace";

export interface AgentCapabilityTool {
  name: string;
  description: string;
  executionClass: "read" | "external_read" | "sensitive";
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

export interface AgentCapabilityGroup {
  id: string;
  tools: AgentCapabilityTool[];
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  orders: <ShoppingCart className="h-4 w-4" />,
  customers: <Users className="h-4 w-4" />,
  products: <Package className="h-4 w-4" />,
  delivery: <Truck className="h-4 w-4" />,
  insights: <BarChart3 className="h-4 w-4" />,
  conversations: <MessageSquare className="h-4 w-4" />,
};

const GROUP_COLORS: Record<string, string> = {
  orders: "text-[var(--agent-accent-from)] bg-[var(--agent-accent-from)]/10",
  customers: "text-[var(--agent-accent-via)] bg-[var(--agent-accent-via)]/10",
  products: "text-[var(--agent-accent-to)] bg-[var(--agent-accent-to)]/10",
  delivery: "text-[var(--agent-info)] bg-[var(--agent-info)]/10",
  insights: "text-[var(--agent-success)] bg-[var(--agent-success)]/10",
  conversations: "text-[var(--agent-pending)] bg-[var(--agent-pending)]/10",
};

function ExecutionBadge({ cls }: { cls: string }) {
  if (cls === "sensitive") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--agent-warning)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[var(--agent-warning)]">
        <AlertTriangle className="h-2.5 w-2.5" />
        Approval
      </span>
    );
  }
  if (cls === "external_read") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--agent-info)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[var(--agent-info)]">
        <Globe className="h-2.5 w-2.5" />
        External
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--agent-success)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[var(--agent-success)]">
      <Eye className="h-2.5 w-2.5" />
      Read
    </span>
  );
}

export function AgentCapabilitiesPanel({
  groups,
  totalVisible,
  totalRegistered,
  locale = "en",
}: {
  groups: AgentCapabilityGroup[];
  totalVisible: number;
  totalRegistered: number;
  locale?: AgentLocale;
}) {
  const { t } = getAgentCopy(locale);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="agent-fade-in">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--agent-text-accent)]" />
          <span className="text-sm font-semibold text-[var(--agent-text-primary)]">
            Agent Capabilities
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--agent-text-secondary)]">
          {totalVisible} of {totalRegistered} tools available for your role
        </p>
      </div>

      {/* Tool groups */}
      <div className="space-y-1.5">
        {groups.map((group) => {
          const expanded = expandedGroups.has(group.id);
          const icon = GROUP_ICONS[group.id] ?? <Wrench className="h-4 w-4" />;
          const color = GROUP_COLORS[group.id] ?? "text-[var(--agent-text-secondary)] bg-[var(--agent-surface-3)]";

          return (
            <div
              key={group.id}
              className="overflow-hidden rounded-[var(--agent-radius-md)] border border-[var(--agent-border)] bg-[var(--agent-surface-2)]"
            >
              {/* Group header */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--agent-surface-3)]"
              >
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--agent-radius-sm)] ${color}`}>
                  {icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-[var(--agent-text-primary)]">
                    {t(group.id as Parameters<typeof t>[0]) ?? group.id}
                  </div>
                  <div className="text-[10px] text-[var(--agent-text-tertiary)]">
                    {group.tools.length} tools
                  </div>
                </div>
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--agent-text-tertiary)]" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--agent-text-tertiary)]" />
                )}
              </button>

              {/* Tool list */}
              {expanded && (
                <div className="agent-fade-in space-y-1 border-t border-[var(--agent-border)] p-2">
                  {group.tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="flex items-center gap-2 rounded-[var(--agent-radius-sm)] bg-[var(--agent-surface-1)] px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-[11px] font-medium text-[var(--agent-text-primary)]">
                            {tool.name}
                          </span>
                          <ExecutionBadge cls={tool.executionClass} />
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-[var(--agent-text-tertiary)]">
                          {tool.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

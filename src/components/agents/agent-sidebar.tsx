"use client";

/**
 * Agent sidebar — session history with search, grouped by date.
 * Glass panel with hover states and active indicators.
 */

import { useState } from "react";
import { MessageSquarePlus, Search, Trash2 } from "lucide-react";

import { getAgentCopy, type AgentLocale } from "@/lib/i18n/agent-workspace";

export interface AgentSessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export function AgentSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
  locale = "en",
}: {
  sessions: AgentSessionSummary[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  locale?: AgentLocale;
}) {
  const { t } = getAgentCopy(locale);
  const [search, setSearch] = useState("");

  const filtered = sessions.filter(
    (s) =>
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()),
  );

  // Group by date
  const grouped = filtered.reduce<Record<string, AgentSessionSummary[]>>(
    (acc, session) => {
      const date = new Date(session.updatedAt);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let key: string;
      if (date.toDateString() === today.toDateString()) {
        key = "Today";
      } else if (date.toDateString() === yesterday.toDateString()) {
        key = "Yesterday";
      } else {
        key = date.toLocaleDateString([], { month: "short", day: "numeric" });
      }

      if (!acc[key]) acc[key] = [];
      acc[key].push(session);
      return acc;
    },
    {},
  );

  return (
    <div className="flex h-full flex-col bg-[var(--agent-surface-1)]">
      {/* Header */}
      <div className="shrink-0 p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-[var(--agent-radius-md)] bg-gradient-to-r from-[var(--agent-accent-from)] to-[var(--agent-accent-via)] px-3 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
        >
          <MessageSquarePlus className="h-4 w-4" />
          {t("newChat")}
        </button>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--agent-text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchChats")}
            className="w-full rounded-[var(--agent-radius-sm)] bg-[var(--agent-surface-2)] py-2 pl-8 pr-3 text-xs text-[var(--agent-text-primary)] placeholder:text-[var(--agent-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--agent-border-active)]"
          />
        </div>
      </div>

      {/* Session list */}
      <div className="agent-scroll flex-1 overflow-y-auto px-2 pb-2">
        {Object.entries(grouped).map(([date, items]) => (
          <div key={date} className="mb-3">
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--agent-text-tertiary)]">
              {date}
            </div>
            {items.map((session) => (
              <div
                key={session.id}
                className={`group relative flex cursor-pointer items-center gap-2 rounded-[var(--agent-radius-sm)] px-2 py-2 transition-colors ${
                  session.id === activeSessionId
                    ? "bg-[var(--agent-surface-3)]"
                    : "hover:bg-[var(--agent-surface-2)]"
                }`}
                onClick={() => onSelect(session.id)}
              >
                {session.id === activeSessionId && (
                  <div className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-[var(--agent-accent-from)] to-[var(--agent-accent-via)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-[var(--agent-text-primary)]">
                    {session.title || "Untitled"}
                  </div>
                  <div className="text-[10px] text-[var(--agent-text-tertiary)]">
                    {t("messageCount", { count: session.messageCount })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(session.id);
                  }}
                  className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--agent-text-tertiary)] transition-colors hover:bg-[var(--agent-error)]/10 hover:text-[var(--agent-error)] group-hover:flex"
                  title={t("deleteChat")}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-[var(--agent-text-tertiary)]">
            {search ? t("noMatching") : t("noChats")}
          </div>
        )}
      </div>
    </div>
  );
}

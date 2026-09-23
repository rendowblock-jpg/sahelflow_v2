"use client";

/**
 * Agent message bubble — renders user and assistant messages with tool
 * call chains, proposal cards, and streaming text support.
 */

import { Bot, User } from "lucide-react";

import { AgentToolCard, type AgentToolCallView } from "./agent-tool-card";
import { AgentProposalCard, type AgentProposalView } from "./agent-proposal-card";

export interface AgentMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: AgentToolCallView[];
  proposals: AgentProposalView[];
  timestamp: string;
  turnSignal?: {
    model: string;
    promptTokens?: number;
    candidateTokens?: number;
    totalTokens?: number;
  };
  streaming?: boolean;
}

export function AgentMessageBubble({
  message,
  onApproveProposal,
  onRejectProposal,
}: {
  message: AgentMessageView;
  onApproveProposal: (id: string) => Promise<void>;
  onRejectProposal: (id: string) => Promise<void>;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`agent-fade-in flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-[var(--agent-surface-4)]"
            : "bg-gradient-to-br from-[var(--agent-accent-from)] to-[var(--agent-accent-via)]"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-[var(--agent-text-secondary)]" />
        ) : (
          <Bot className="h-4 w-4 text-white" />
        )}
      </div>

      {/* Content */}
      <div className={`min-w-0 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Tool calls chain */}
        {message.toolCalls.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {message.toolCalls.map((call) => (
              <AgentToolCard key={call.id} call={call} />
            ))}
          </div>
        )}

        {/* Proposals */}
        {message.proposals.length > 0 && (
          <div className="mb-2 space-y-2">
            {message.proposals.map((proposal) => (
              <AgentProposalCard
                key={proposal.proposalId}
                proposal={proposal}
                onApprove={onApproveProposal}
                onReject={onRejectProposal}
              />
            ))}
          </div>
        )}

        {/* Text content */}
        {message.content && (
          <div
            className={`rounded-[var(--agent-radius-lg)] px-4 py-3 text-sm leading-relaxed ${
              isUser
                ? "bg-[var(--agent-accent-from)]/15 text-[var(--agent-text-primary)]"
                : "bg-[var(--agent-surface-2)] text-[var(--agent-text-primary)]"
            }`}
          >
            {message.streaming ? (
              <StreamingText text={message.content} />
            ) : (
              <FormattedText text={message.content} />
            )}
          </div>
        )}

        {/* Turn signal (AI-26: truthful provider metadata only) */}
        {message.turnSignal && !isUser && (
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--agent-text-tertiary)]">
            <span>{message.turnSignal.model}</span>
            {message.turnSignal.totalTokens != null && (
              <>
                <span>·</span>
                <span>{message.turnSignal.totalTokens.toLocaleString()} tokens</span>
              </>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`mt-1 text-[10px] text-[var(--agent-text-tertiary)] ${
            isUser ? "text-right" : ""
          }`}
        >
          {formatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

/**
 * Streaming text with typing indicator.
 */
function StreamingText({ text }: { text: string }) {
  return (
    <span>
      {text}
      <span className="agent-typing-dots ml-1 inline-flex">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}

/**
 * Formatted text with basic markdown-like rendering.
 * Supports: **bold**, `code`, line breaks, bullet lists.
 */
function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        // Bullet list
        if (line.startsWith("• ") || line.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-[var(--agent-text-tertiary)]">•</span>
              <span>{formatInline(line.slice(2))}</span>
            </div>
          );
        }
        // Numbered list
        const numbered = line.match(/^(\d+)\.\s(.+)/);
        if (numbered) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-[var(--agent-text-tertiary)]">{numbered[1]}.</span>
              <span>{formatInline(numbered[2])}</span>
            </div>
          );
        }
        // Empty line
        if (line.trim() === "") {
          return <div key={i} className="h-2" />;
        }
        // Normal line
        return <p key={i}>{formatInline(line)}</p>;
      })}
    </div>
  );
}

/**
 * Inline formatting: **bold**, `code`.
 */
function formatInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code
    const codeMatch = remaining.match(/`(.+?)`/);

    const firstMatch = [boldMatch, codeMatch]
      .filter(Boolean)
      .sort((a, b) => (a!.index ?? 0) - (b!.index ?? 0))[0];

    if (!firstMatch) {
      parts.push(remaining);
      break;
    }

    const index = firstMatch.index ?? 0;
    if (index > 0) {
      parts.push(remaining.slice(0, index));
    }

    if (firstMatch === boldMatch && boldMatch) {
      parts.push(
        <strong key={key++} className="font-semibold text-[var(--agent-text-primary)]">
          {boldMatch[1]}
        </strong>,
      );
    } else if (firstMatch === codeMatch && codeMatch) {
      parts.push(
        <code
          key={key++}
          className="rounded bg-[var(--agent-surface-4)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--agent-text-accent)]"
        >
          {codeMatch[1]}
        </code>,
      );
    }

    remaining = remaining.slice(index + firstMatch[0].length);
  }

  return parts;
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

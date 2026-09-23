"use client";

/**
 * Agent error boundary — catches render errors in the agent workspace
 * and shows a recovery UI instead of a white screen.
 */

import React from "react";

interface AgentErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AgentErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  AgentErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): AgentErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Agent workspace error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--agent-error)]/10">
            <span className="text-xl">⚠️</span>
          </div>
          <div className="text-center">
            <h2 className="text-sm font-semibold text-[var(--agent-text-primary)]">
              Something went wrong
            </h2>
            <p className="mt-1 max-w-sm text-xs text-[var(--agent-text-secondary)]">
              The agent workspace encountered an unexpected error. Your data is safe.
            </p>
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-[var(--agent-radius-md)] bg-[var(--agent-surface-3)] px-4 py-2 text-xs font-medium text-[var(--agent-text-primary)] transition-colors hover:bg-[var(--agent-surface-4)]"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

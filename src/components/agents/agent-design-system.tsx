/**
 * Agent design system — tokens, animations, and visual primitives.
 *
 * Design direction: premium AI workspace. Dark-first with subtle depth,
 * gradient accents (indigo → violet → pink), frosted glass panels,
 * smooth micro-animations. Every element communicates state clearly.
 */

"use client";

// ─── Design tokens (CSS custom properties injected via <style>) ──────────────

export const AGENT_DESIGN_TOKENS = `
  :root {
    /* Agent accent gradient */
    --agent-accent-from: #6366f1;
    --agent-accent-via: #a855f7;
    --agent-accent-to: #ec4899;
    --agent-accent: linear-gradient(135deg, var(--agent-accent-from), var(--agent-accent-via), var(--agent-accent-to));

    /* Surface depths */
    --agent-surface-0: hsl(240 10% 3.9%);
    --agent-surface-1: hsl(240 6% 6%);
    --agent-surface-2: hsl(240 5% 8%);
    --agent-surface-3: hsl(240 5% 11%);
    --agent-surface-4: hsl(240 5% 14%);

    /* Borders */
    --agent-border: hsl(240 4% 16%);
    --agent-border-hover: hsl(240 4% 22%);
    --agent-border-active: hsl(260 60% 60% / 0.4);

    /* Text */
    --agent-text-primary: hsl(0 0% 98%);
    --agent-text-secondary: hsl(240 5% 65%);
    --agent-text-tertiary: hsl(240 5% 45%);
    --agent-text-accent: hsl(260 80% 75%);

    /* Status colors */
    --agent-success: #22c55e;
    --agent-warning: #f59e0b;
    --agent-error: #ef4444;
    --agent-info: #3b82f6;
    --agent-pending: #a855f7;

    /* Glow */
    --agent-glow-sm: 0 0 12px hsl(260 80% 60% / 0.15);
    --agent-glow-md: 0 0 24px hsl(260 80% 60% / 0.2);
    --agent-glow-lg: 0 0 48px hsl(260 80% 60% / 0.15);

    /* Glass */
    --agent-glass: hsl(240 6% 8% / 0.8);
    --agent-glass-border: hsl(240 4% 20% / 0.5);
    --agent-glass-blur: 16px;

    /* Radius */
    --agent-radius-sm: 6px;
    --agent-radius-md: 10px;
    --agent-radius-lg: 14px;
    --agent-radius-xl: 20px;
    --agent-radius-full: 9999px;

    /* Transitions */
    --agent-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --agent-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --agent-duration-fast: 150ms;
    --agent-duration-normal: 250ms;
    --agent-duration-slow: 400ms;
  }

  /* ─── Animations ─── */
  @keyframes agent-fade-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes agent-fade-in-scale {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes agent-slide-up {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes agent-pulse-glow {
    0%, 100% { box-shadow: var(--agent-glow-sm); }
    50% { box-shadow: var(--agent-glow-md); }
  }

  @keyframes agent-shimmer {
    from { background-position: -200% 0; }
    to { background-position: 200% 0; }
  }

  @keyframes agent-typing-dot {
    0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
    30% { opacity: 1; transform: translateY(-4px); }
  }

  @keyframes agent-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes agent-gradient-shift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  @keyframes agent-border-flow {
    0% { border-color: hsl(260 80% 60% / 0.3); }
    50% { border-color: hsl(300 80% 60% / 0.5); }
    100% { border-color: hsl(260 80% 60% / 0.3); }
  }

  /* ─── Utility classes ─── */
  .agent-glass {
    background: var(--agent-glass);
    backdrop-filter: blur(var(--agent-glass-blur));
    -webkit-backdrop-filter: blur(var(--agent-glass-blur));
    border: 1px solid var(--agent-glass-border);
  }

  .agent-gradient-text {
    background: var(--agent-accent);
    background-size: 200% 200%;
    animation: agent-gradient-shift 4s ease infinite;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .agent-gradient-border {
    position: relative;
  }
  .agent-gradient-border::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    padding: 1px;
    background: var(--agent-accent);
    background-size: 200% 200%;
    animation: agent-gradient-shift 4s ease infinite;
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }

  .agent-shimmer {
    background: linear-gradient(
      90deg,
      var(--agent-surface-2) 25%,
      var(--agent-surface-3) 50%,
      var(--agent-surface-2) 75%
    );
    background-size: 200% 100%;
    animation: agent-shimmer 1.5s infinite;
  }

  .agent-fade-in {
    animation: agent-fade-in var(--agent-duration-normal) var(--agent-ease-out) both;
  }

  .agent-fade-in-scale {
    animation: agent-fade-in-scale var(--agent-duration-normal) var(--agent-ease-out) both;
  }

  .agent-slide-up {
    animation: agent-slide-up var(--agent-duration-slow) var(--agent-ease-out) both;
  }

  /* Stagger children */
  .agent-stagger > * {
    animation: agent-fade-in var(--agent-duration-normal) var(--agent-ease-out) both;
  }
  .agent-stagger > *:nth-child(1) { animation-delay: 0ms; }
  .agent-stagger > *:nth-child(2) { animation-delay: 50ms; }
  .agent-stagger > *:nth-child(3) { animation-delay: 100ms; }
  .agent-stagger > *:nth-child(4) { animation-delay: 150ms; }
  .agent-stagger > *:nth-child(5) { animation-delay: 200ms; }
  .agent-stagger > *:nth-child(6) { animation-delay: 250ms; }

  /* Typing indicator */
  .agent-typing-dots {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }
  .agent-typing-dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--agent-text-tertiary);
    animation: agent-typing-dot 1.4s ease-in-out infinite;
  }
  .agent-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
  .agent-typing-dots span:nth-child(3) { animation-delay: 0.4s; }

  /* Scrollbar */
  .agent-scroll::-webkit-scrollbar {
    width: 6px;
  }
  .agent-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .agent-scroll::-webkit-scrollbar-thumb {
    background: var(--agent-border);
    border-radius: var(--agent-radius-full);
  }
  .agent-scroll::-webkit-scrollbar-thumb:hover {
    background: var(--agent-border-hover);
  }
`;

// ─── Design token component (injects CSS) ────────────────────────────────────

export function AgentDesignTokens() {
  return <style dangerouslySetInnerHTML={{ __html: AGENT_DESIGN_TOKENS }} />;
}

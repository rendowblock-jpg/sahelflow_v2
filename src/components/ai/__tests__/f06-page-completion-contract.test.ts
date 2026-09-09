import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { AI_CHAT_MESSAGE_MAX_LENGTH } from "@/lib/ai/chat-limits";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/**
 * Ledger F-06 — the AI Agents page-completion wave (Class-AAA pass per
 * EXPERIENCE.md §26-28). Pins the wave's structural truth on top of the
 * existing behavior contracts: the flagship workbench CSS re-bound to the
 * durable composition, honest status signals, structure-matching skeletons,
 * the composer bound/counter unity (AI-17 residual) and the armed-delete
 * announcement (AI-23 residual).
 */
describe("F-06 AI page-completion wave", () => {
  it("binds the flagship workbench layer to the composition that actually renders", () => {
    const workspaceCss = read("src/app/workspace-system.css");

    // The elevation shell, rail/inspector gradients, canvas glow and composer
    // glass must target the durable attributes the decision workspace emits.
    expect(workspaceCss).toContain('[data-ai-decision-workspace="true"]');
    expect(workspaceCss).toContain('[data-ai-work-history="true"]');
    expect(workspaceCss).toContain('[data-ai-review-evidence="true"]');
    expect(workspaceCss).toContain('[data-ai-decision-canvas="true"]');
    expect(workspaceCss).toContain('[data-ai-composer="true"]');
    expect(workspaceCss).toContain('[data-ai-composer-deck="true"]');
    expect(workspaceCss).toContain('[data-ai-status-dot="ready"]');
    expect(workspaceCss).toContain('[data-ai-status-dot="attention"]');
    expect(workspaceCss).toContain('[data-ai-streaming-caret="true"]');
    expect(workspaceCss).toContain('[data-ai-skeleton="true"]');
    expect(workspaceCss).toContain('[data-ai-session][aria-current="page"]::before');

    // No dead legacy selectors may remain for the AI surfaces.
    for (const dead of [
      '[data-ai-workspace="v2"]',
      '[data-ai-sessions="true"]',
      '[data-ai-thread="true"]',
      '[data-ai-context="true"]',
    ]) {
      expect(workspaceCss, dead).not.toContain(dead);
    }
    expect(read("src/app/experience-system.css")).not.toContain(
      '[data-ai-workspace="v2"] {',
    );
  });

  it("keeps the flagship-settle motion on the current workspace root", () => {
    const motion = read("src/app/motion-system.css");
    expect(motion).toContain("[data-ai-workspace]");
    expect(motion).toContain("[data-ai-decision-workspace]");
  });

  it("keeps the composer bound and counter on one shared server authority (AI-17 residual)", () => {
    const limits = read("src/lib/ai/chat-limits.ts");
    // STR-01 moved the composer deck into its own module; these assertions
    // follow the code they protect rather than being relaxed. The bound is
    // still one shared server authority — only the client file moved.
    const deck = read("src/components/ai/ai-composer-deck.tsx");
    const messages = read("src/app/api/ai/sessions/[id]/messages/route.ts");
    const stream = read("src/app/api/ai/sessions/[id]/messages/stream/route.ts");

    expect(AI_CHAT_MESSAGE_MAX_LENGTH).toBe(4000);
    expect(limits).toContain("AI_CHAT_COUNTER_VISIBLE_SHARE");
    for (const route of [messages, stream]) {
      expect(route).toContain("AI_CHAT_MESSAGE_MAX_LENGTH");
      expect(route).not.toContain("max(4000)");
    }
    expect(deck).toContain("maxLength={AI_CHAT_MESSAGE_MAX_LENGTH}");
    expect(deck).toContain('data-ai-composer-counter="true"');
    expect(deck).toContain('"composerCounter"');
    // Counter appears only near the bound — the visible share, not always on.
    expect(deck).toContain("AI_CHAT_COUNTER_VISIBLE_SHARE");
    // No second bound may reappear in the canvas after the split.
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    expect(canvas).not.toContain("maxLength=");
  });

  it("shows configuration truth, never fabricated provider health (AI-26)", () => {
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");

    // Header avatar dot + config chip both derive from the setup probe only.
    expect(canvas).toContain('data-ai-status-dot={setupReady ? "ready" : "attention"}');
    expect(canvas).toContain('data-ai-config-chip="true"');
    expect(canvas).toContain('getAiDecisionCopy(workspace.locale, "providerReady")');
    // The chip renders only after setup resolved — the checking banner owns loading.
    expect(canvas).toContain("{workspace.setup ? (");
  });

  it("streams with a visible caret and keeps the newest turn actionable", () => {
    // STR-01 moved MessageBubble into its own module and then moved the
    // conversation log out of the canvas; the caret, the newest-turn
    // affordance and the wiring that decides which message is latest all
    // moved with the code. These assertions follow it rather than being
    // relaxed.
    const bubble = read("src/components/ai/ai-message-bubble.tsx");
    const log = read("src/components/ai/ai-message-log.tsx");
    expect(bubble).toContain('data-ai-streaming-caret="true"');
    expect(log).toContain("isLatest={message.id === lastMessageId}");
    expect(bubble).toContain("isLatest ? \"opacity-100\" : \"opacity-0\"");
  });

  it("loads conversations and history with structure-matching skeletons (§26.8)", () => {
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    // STR-01 moved the conversation log into its own module; the hydration
    // skeleton moved with it.
    const log = read("src/components/ai/ai-message-log.tsx");
    const history = read("src/components/ai/ai-work-history.tsx");

    expect(log).toContain('data-ai-conversation-skeleton="true"');
    expect(history).toContain('data-ai-history-skeleton="true"');
    // No bare center-spinners remain as load states on this page — asserted
    // on both halves of the split canvas.
    expect(log).not.toContain("min-h-72 items-center justify-center");
    expect(canvas).not.toContain("min-h-72 items-center justify-center");
    expect(history).not.toContain("min-h-40 items-center justify-center");
  });

  it("announces the armed two-step delete to assistive tech (AI-23 residual)", () => {
    const history = read("src/components/ai/ai-work-history.tsx");

    expect(history).toContain('role="status"');
    expect(history).toContain('aria-live="polite"');
    expect(history).toContain('"deleteArmAnnounce"');
  });

  it("stamps older sessions with dates a clock would lie about", () => {
    const history = read("src/components/ai/ai-work-history.tsx");

    expect(history).toContain("function sessionStamp(");
    expect(history).toContain("sessionStamp(session.updatedAt, locale)");
    expect(history).not.toContain("sessionTime(");
  });

  it("resolves the wave copy in every locale", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      expect(getAiDecisionCopy(locale, "assistantName").length).toBeGreaterThan(0);
      expect(
        getAiDecisionCopy(locale, "messagesMeta", { count: 4 }),
      ).toContain("4");
      expect(getAiDecisionCopy(locale, "startJobsTitle").length).toBeGreaterThan(0);
      expect(
        getAiDecisionCopy(locale, "composerCounter", { count: 3900, max: 4000 }),
      ).toContain("4000");
      const announced = getAiDecisionCopy(locale, "deleteArmAnnounce", {
        title: "S",
      });
      expect(announced).toContain("S");
      expect(announced).not.toContain("{title}");
    }
  });

  // ── F-06 functional completion (founder scope correction: the page's
  // problem was never CSS — it was what is wrong and missing) ──────────────

  it("serves capability truth from the central policy map, fail-closed (F-06)", () => {
    const route = read("src/app/api/ai/capabilities/route.ts");

    // The page surface is gated like the rest of the AI surface.
    expect(route).toContain('requireAuth("ai.use")');
    // Groups come from the capability projector, not a hand-written list.
    expect(route).toContain("aiCapabilityGroups()");
    // Briefing counts come from the shared honest-briefing helper.
    expect(route).toContain("loadShopBriefing");
  });

  it("keeps the honest briefing: every count is independently nullable (F-06)", () => {
    const briefing = read("src/lib/ai/chat/shop-context.ts");

    for (const count of [
      "pendingOrders",
      "ordersToday",
      "lowStockProducts",
      "pendingDeliveries",
      "pendingProposals",
    ]) {
      expect(briefing).toContain(`${count}: number | null`);
    }
    // A count failure degrades to null — never a fabricated zero…
    expect(briefing).toContain("countOrNull");
    // …and a briefing failure can never break a chat turn.
    expect(briefing).toContain("catch {\n    return \"\";");
  });

  it("presents the agents workforce from live capability truth (F-06)", () => {
    // STR-01 moved the start surface into its own module; these
    // assertions follow the code they protect.
    const startSurface = read("src/components/ai/ai-start-surface.tsx");

    expect(startSurface).toContain('data-ai-abilities="true"');
    expect(startSurface).toContain("AbilityGroupCard");
    expect(startSurface).toContain("getAiToolGroupLabel");
    expect(startSurface).toContain("getAiToolLabel");
    // Sensitive abilities are marked as needing approval, visibly.
    expect(startSurface).toContain('data-ai-ability-class={tool.executionClass}');
    expect(startSurface).toContain('"abilityNeedsApproval"');
    // Loading renders a structure-matching skeleton, failure renders honest
    // unavailability — never stale marketing copy as if it were live truth.
    expect(startSurface).toContain('data-ai-abilities-skeleton="true"');
    expect(startSurface).toContain('"abilitiesUnavailable"');
  });

  it("grounds the start surface in the shop's real counts (F-06)", () => {
    // STR-01 moved the start surface into its own module; these
    // assertions follow the code they protect.
    const startSurface = read("src/components/ai/ai-start-surface.tsx");

    expect(startSurface).toContain("starterCount(");
    expect(startSurface).toContain('data-ai-briefing-count={starter.id}');
    // The start surface hosts the workforce panel. STR-01 moved both halves of
    // this ordering check into the same new module, so the relationship it
    // protects — abilities rendered INSIDE the start state, not above it — is
    // asserted there and is unchanged.
    expect(
      startSurface.indexOf("AbilitiesPanel workspace={workspace}"),
    ).toBeGreaterThan(startSurface.indexOf('data-ai-start-state="true"'));
  });

  it("surfaces the shop-wide approval loop where the seller works (F-06)", () => {
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    // STR-01 moved the start surface and then the conversation log into their
    // own modules; these assertions follow the code they protect. The header
    // badge stays canvas-owned.
    const startSurface = read("src/components/ai/ai-start-surface.tsx");
    const log = read("src/components/ai/ai-message-log.tsx");

    // The strip names pending work from ALL sessions and opens the review.
    expect(startSurface).toContain('data-ai-inbox-strip="true"');
    expect(startSurface).toContain('"inboxStripCount"');
    expect(log).toContain('"inboxStripOpen"');
    // Honest absence: no strip while loading or after an inbox failure.
    expect(startSurface).toContain("inboxLoading || inboxError || inbox.length === 0");
    // The header badge is shop-wide, not session-only.
    expect(canvas).toContain("reviewBadgeCount");
  });

  it("gives the model a presentation-only shop snapshot, never a turn dependency (F-06)", () => {
    const agent = read("src/lib/ai/chat/agent.ts");
    const stream = read("src/app/api/ai/sessions/[id]/messages/stream/route.ts");
    const messages = read("src/app/api/ai/sessions/[id]/messages/route.ts");

    // Both agent entry points accept the optional note; the system
    // instruction grows a part only when a note exists.
    expect(agent).toContain("shopContextNote?: string");
    expect(agent).toContain("...(shopContextNote ? [{ text: shopContextNote }] : []),");
    for (const route of [stream, messages]) {
      expect(route).toContain("aiShopContextNote");
    }
    // The snapshot declares itself non-authority inside the prompt text.
    const context = read("src/lib/ai/chat/shop-context.ts");
    expect(context).toContain("never action authority");
  });
});

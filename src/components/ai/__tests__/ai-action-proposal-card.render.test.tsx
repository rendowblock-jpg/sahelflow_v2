/**
 * @vitest-environment happy-dom
 */
/**
 * AI action proposal card — BEHAVIORAL evidence.
 *
 * This card approves irreversible business mutations (order creation and
 * cancellation, price and stock changes). Its previous surface had three
 * defects that no source-text assertion could observe:
 *
 *   1. fields beyond the eighth were truncated behind a bare `+N` with no
 *      control to reveal them, so the operator could not see what was being
 *      approved;
 *   2. the creation timestamp was labelled with `fieldFrom` ("From"), which is
 *      wrong in all three locales;
 *   3. approval committed on a single click, while the same codebase already
 *      required two steps to delete a chat session.
 *
 * These tests exercise the rendered card. `useI18n` is stubbed for locale only:
 * the card resolves copy through `getAiWorkspaceCopy`, so assertions target the
 * real English strings and would catch a copy regression too.
 */
import { describe, expect, it, vi } from "vitest";

import { AiActionProposalCard } from "@/components/ai/ai-action-proposal-card";
import { render, screen, userEvent } from "@/test-utils/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/agents",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

/**
 * Eleven summary fields — three past the eight-field truncation boundary.
 * `proposal.summary` is an OBJECT keyed by field name; the card filters it
 * through SUMMARY_LABELS, so unknown keys are dropped.
 */
const SUMMARY = {
  customerName: "Amina B.",
  productName: "Sneakers",
  orderNumber: "SF-10428",
  wilaya: "Oran",
  itemCount: 3,
  totalQuantity: 6,
  fromStatus: "pending",
  toStatus: "confirmed",
  fromPrice: 4200,
  toPrice: 3900,
  reasonProvided: "yes",
};

function makeProposal() {
  return {
    id: "prop_0001",
    toolName: "update_order_status",
    status: "pending",
    summary: SUMMARY,
    proposalDigestPrefix: "a1b2c3d4",
    createdAt: "2026-09-08T10:00:00.000Z",
    expiresAt: "2026-09-08T10:10:00.000Z",
  };
}

function renderCard(overrides: Record<string, unknown> = {}) {
  const onApprove = vi.fn().mockResolvedValue(true);
  const onReject = vi.fn().mockResolvedValue(true);
  const handle = {
    proposal: makeProposal(),
    proposalDigest: "a1b2c3d4e5f6",
  };
  render(
    <AiActionProposalCard
      handle={handle as never}
      approving={false}
      onApprove={onApprove as never}
      onReject={onReject as never}
      {...overrides}
    />,
  );
  return { onApprove, onReject };
}

describe("AI action proposal card", () => {
  it("exposes a control to reveal fields hidden by truncation", async () => {
    renderCard();

    // The eleventh field is truncated away on first paint.
    expect(screen.queryByText(/reason/i)).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /more details/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);

    // Every approved value is now visible — nothing is committed unseen.
    expect(screen.getByText(/reason/i)).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("does not label the creation time as a range boundary", () => {
    renderCard();
    const card = document.querySelector("[data-ai-proposal-card]");
    expect(card).not.toBeNull();
    // `fieldFrom` is the "From" of a from/to pair. Reusing it for a timestamp
    // reads as a broken sentence in all three locales.
    expect(card?.textContent).toContain("Proposed");
  });

  it("requires two activations before committing an irreversible action", async () => {
    const { onApprove } = renderCard();
    const approve = screen.getByRole("button", { name: /review and approve/i });

    await userEvent.click(approve);

    // First activation arms only. Nothing has been committed.
    expect(onApprove).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-ai-proposal-approve="armed"]'),
    ).not.toBeNull();

    await userEvent.click(
      document.querySelector<HTMLElement>(
        '[data-ai-proposal-approve="armed"]',
      )!,
    );

    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("announces the armed state to assistive technology", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: /review and approve/i }));

    const status = document.querySelector('[role="status"][aria-live="polite"]');
    expect(status?.textContent).toContain("Approval armed");
  });

  it("disarms approval when the operator denies instead", async () => {
    const { onApprove, onReject } = renderCard();

    await userEvent.click(screen.getByRole("button", { name: /review and approve/i }));
    await userEvent.click(screen.getByRole("button", { name: /deny/i }));

    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onApprove).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-ai-proposal-approve="armed"]'),
    ).toBeNull();
  });
});

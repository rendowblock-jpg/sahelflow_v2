// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(),
  promise: vi.fn(),
  dismiss: vi.fn(),
  custom: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: sonner }));

import { toast } from "@/lib/toast";

describe("toast localizes known server errors", () => {
  beforeEach(() => {
    sonner.error.mockReset();
    sonner.warning.mockReset();
  });

  it("maps an English courier-capability error to the seller's language", () => {
    document.documentElement.lang = "ar";
    toast.error(
      "maystro tracking capability is not enabled for the current credentials and endpoint contract.",
    );
    expect(sonner.error.mock.calls[0]?.[0]).toContain("شركة التوصيل هذه غير مربوطة بعد");
  });

  it("passes already-translated and unknown messages through unchanged", () => {
    document.documentElement.lang = "fr";
    toast.error("Coffret Thé Décoré");
    expect(sonner.error.mock.calls[0]?.[0]).toBe("Coffret Thé Décoré");
  });
});

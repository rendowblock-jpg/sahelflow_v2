import { describe, expect, it, vi } from "vitest";

import { logoutAndRedirect } from "../logout-client";

describe("logoutAndRedirect", () => {
  it("redirects only after the server commits logout", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const redirect = vi.fn();
    const onFailure = vi.fn();

    await expect(
      logoutAndRedirect({ request, redirect, onFailure }),
    ).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(redirect).toHaveBeenCalledWith("/login");
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("keeps the seller in place when durable revocation is rejected", async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const redirect = vi.fn();
    const onFailure = vi.fn();

    await expect(
      logoutAndRedirect({ request, redirect, onFailure }),
    ).resolves.toBe(false);

    expect(redirect).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it("keeps the seller in place when the request cannot reach the server", async () => {
    const request = vi.fn().mockRejectedValue(new Error("offline"));
    const redirect = vi.fn();
    const onFailure = vi.fn();

    await expect(
      logoutAndRedirect({ request, redirect, onFailure }),
    ).resolves.toBe(false);

    expect(redirect).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledOnce();
  });
});

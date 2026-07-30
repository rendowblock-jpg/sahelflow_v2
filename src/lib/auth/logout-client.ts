export interface LogoutClientOptions {
  request?: typeof fetch;
  redirect?: (path: string) => void;
  onFailure: () => void;
}

/**
 * Commit logout before leaving the authenticated workspace.
 *
 * A failed revocation response must never look like a successful logout: the
 * server deliberately preserves the retryable cookie until it can durably
 * revoke the session.
 */
export async function logoutAndRedirect({
  request = globalThis.fetch,
  redirect = (path) => window.location.assign(path),
  onFailure,
}: LogoutClientOptions): Promise<boolean> {
  try {
    const response = await request("/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      onFailure();
      return false;
    }
    redirect("/login");
    return true;
  } catch {
    onFailure();
    return false;
  }
}

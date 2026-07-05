import { redirect } from "next/navigation";
import { isAuthSetup, isAuthenticated } from "@/lib/auth/server";

/**
 * Root entry point — routes the user to the right landing page based on
 * auth state:
 *   - Auth NOT set up (fresh install) → /setup (setup wizard)
 *   - Auth set up but not logged in   → /login
 *   - Auth set up and logged in       → /dashboard
 *
 * Previously this redirected to /dashboard unconditionally, which meant a
 * fresh user landed on a broken dashboard (all API calls 401) because the
 * middleware was in setup mode (allow-all) but the API routes still
 * required a session. (CONN-4-BUILD finding)
 */
export default async function HomePage() {
  const setup = await isAuthSetup();
  if (!setup) {
    redirect("/setup");
  }
  const authed = await isAuthenticated();
  if (!authed) {
    redirect("/login");
  }
  redirect("/dashboard");
}

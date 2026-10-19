/**
 * Words that must never become a store address: they are routes of this Worker,
 * names of other SahelFlow hosts, or paths a browser or crawler asks for. A store
 * called "healthz" would shadow the health check, and one called "support" or
 * "admin" would look official.
 */
export const RESERVED_STORE_SLUGS: ReadonlySet<string> = new Set([
  "abuse", "account", "activate", "admin", "api", "app", "assets", "backup", "billing", "blog",
  "cart", "checkout", "connect", "connected", "demo", "docs", "email", "faq", "favicon", "healthz",
  "help", "legal", "license", "licence", "login", "logout", "mail", "manifest", "mcp", "new",
  "null", "order", "orders", "pricing", "privacy", "register", "report", "robots", "sahelflow",
  "security", "shop", "signin", "signup", "sitemap", "staging", "static", "status", "store",
  "stores", "support", "terms", "test", "undefined", "update", "updates", "www",
]);

export function isReservedStoreSlug(slug: string): boolean {
  return RESERVED_STORE_SLUGS.has(slug);
}

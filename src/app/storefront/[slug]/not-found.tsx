import { getI18n } from "@/lib/i18n-server";

/**
 * Storefront not-found page (UX-002).
 * Was: 100% hardcoded English. Now: localized via i18n.
 * The "Go to store" link goes to `/storefronts` (the seller's storefront list)
 * instead of `/` (which redirects to `/dashboard` — a private page customers
 * can't access).
 */
export default async function StorefrontNotFound() {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gray-100">
          <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900">{t("storefront.notFound.title")}</h1>
        <p className="mt-2 text-sm text-gray-500">{t("storefront.notFound.message")}</p>
        <a
          href="/storefronts"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          {t("storefront.notFound.goHome")}
        </a>
      </div>
    </div>
  );
}

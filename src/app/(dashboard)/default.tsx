import { notFound } from "next/navigation";

/**
 * Fallback for the `children` slot of the dashboard layout.
 *
 * The (dashboard) route group has no URL segment, so its `@modal/[...catchAll]`
 * slot claims every URL. Next.js 16.4 matches routes strictly: without a
 * `children` fallback, a URL whose only match is that slot (an unknown path)
 * cannot build a complete route tree and the build fails for the pages that
 * live outside the group (login, setup, join, storefront).
 *
 * An unknown URL answers not-found, which renders the app's 404 page inside
 * the dashboard shell, as it did before.
 */
export default function DashboardChildrenFallback(): never {
  notFound();
}

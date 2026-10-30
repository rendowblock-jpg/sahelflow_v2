# W2-g4b (w108): finish the dashboard / analytics / risk states
Branch wave2/g4b-states from wave2/g4-dashboard-analytics (aba0dc51). Notes at call 15 (first commit).

## Item 1: "Collected today" -> "Delivered today": DONE
The sub-line counts orders delivered today (R2 in W2-g4.md), not courier cash. New key `dashboard.deliveredToday` in src/lib/i18n/dashboard-states-runtime.ts (ar المُسلَّم اليوم, fr Livré aujourd'hui, en Delivered today); dashboard/page.tsx uses it; the tooltip `dashboard.revenueDefinition` uses the same words in all three. The old JSON key `dashboard.realizedRevenue` is now unused (locales/*.json may not be edited; the lead can delete the 3 lines later). Test: src/lib/i18n/__tests__/dashboard-delivered-label.test.ts (3 catalogs + page source).

## Item 2: average order value: NUMBER CHANGE, said plainly
Before: AOV = revenue (cancelled and draft excluded) / ALL orders of the period (cancelled and draft included), so every cancelled order pulled the average down. Same bug in the daily chart buckets. After: one helper `revenueOrderStats` in src/lib/data/analytics.ts (sum, counted orders, rounded average over the SAME orders) used by buildSummary (card + previous period + delta) and buildTimeSeries (chart bucket revenue and aov). Example: 1,000 + 3,000 delivered/confirmed + 2,000 cancelled: card showed 1,333 DZD, now 2,000 DZD. The "orders" count (placed) and the Revenue number do not change. Sellers with cancelled orders see a HIGHER average order value and a changed "vs previous" percentage. The UI never names the old formula. Test: src/lib/__tests__/analytics-aov.test.ts.

## Item 4: page bodies extracted into pure views (call 25 status)
Each async page now keeps only permission checks + data loading and renders a pure view that takes the loaded data as props (no query, no API route changed; the JSX moved verbatim by a script):
- src/components/analytics/analytics-view.tsx  `AnalyticsView({ t, locale, range, report, returnRateByWilaya, skuPnl, skuProjection, showSkuCost, comparison, courier })`
- src/components/dashboard/dashboard-view.tsx  `DashboardView({ t, locale, stats, recentOrders, analytics, fieldAccess, firstRunCounts, riskReport, staleConfirmations })`
- src/components/risk/risk-view.tsx            `RiskView({ t, locale, report, config, blacklisted, rules, canManage, days, activeTab })`
Prop types are `Awaited<ReturnType<typeof loader>>` via `import type`, so the view imports no server module at runtime. 15 existing contract tests read the page files as text; they now read page + view (same assertions, `read(page) + read(view)`), 3 list-style tests point at the view file: phase5-golden-cod-workbench, wave2-analytics-locale, wave2-visible-locale, wave2-metric-hierarchy, wave2-analytical-frame, risk-page-experience, first-run.render (path only, no first-run-* component touched), shop-day-leftovers, sku-pnl-projection, tabs-wrap, founder-operational-polish, page-authority.

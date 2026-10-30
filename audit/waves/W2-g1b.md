# W2-g1b (w112): detail pages + offline writes (notes at call 12; updated at call 25 and at the end)
Branch wave2/g1b-detail-pages (base df0520df). No tsc, no pictures.

## (a)-(i) walk, read from code (call 12)
- orders/[id] (792 lines, server page, untouched body): a generic FormLoading skeleton -> will get a page-shaped one; b n/a (notFound()); c error.tsx = kit PageError with Retry, layout stays, ok; d n/a: server page, no client refetch, so "refresh failed with data on screen" cannot happen here (the offline banner is the only stale state); e none -> OfflineWriteGate + banner; f items are ALREADY a flex list (no table), totals use formatDZD on integers (itemsTotal = sum of integer item.total), there is NO sticky action bar in this page file; g none -> new; h Radix dialogs (refund, delete): focus return to be tested; i new keys in ar/fr/en.
- deliveries/[id] (226 lines): same; the stuck-creating card (DeliveryReconcileCard) is a write -> gated offline.
- returns/[id] (187 lines): read-only page (no write control at all): a skeleton, e banner only.
- Server pages cannot be mounted in a render test (db, async). Tests mount the pieces: skeletons, gate, banner, the lists.
## Plan / decisions
- One mechanism: a `<fieldset disabled class="contents">` gate (native disabled for every button/input inside, 1 reason sentence as title + aria-describedby) for the write clusters on detail pages; Radix dropdown triggers (OrderStatusBadge, DeliveryStatusBadge) get the real `disabled` prop because Radix opens on pointerdown.
- Pure decision `resolveWriteGate({online, allowed})` in src/components/orders/offline-write.ts, mutation-checked on a scratch copy.
- Partial banner clock: list hooks keep no fetch time; see end notes.

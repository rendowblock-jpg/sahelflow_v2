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

## Call 25 update (commit 2)
- DONE + tested: write-gate.ts (pure), OfflineWriteGate / DetailOfflineBanner / useOfflineWrites, 3 detail skeletons (loading.tsx of orders/deliveries/returns [id] now page-shaped), orders-detail-runtime.ts (2 keys ar/fr/en).
- Wired: orders/[id] (banner; gates around delete, the 4 lifecycle/courier/COD/return/recovery actions, the whole edit panel (notes, lines), create shipment, WhatsApp button, refund dialog; the status badge in the header via OrderStatusBadge itself), deliveries/[id] (banner + reconcile card gate), returns/[id] (banner only: the page has no write control).
- Lists: OrderStatusBadge (only when orderId is set, the create-form picker stays usable), DeliveryStatusBadge, DeliveryRowActions sync + cancel (title = reason), the stuck-booking exit in the delivery LIST row (DeliveryStatusCell gate). This REVERSES w97's "kept working offline on purpose" for the list row: the brief says every write control; the exit decides a courier booking and needs the connection. The tests of the stuck exit stay green online.
- FOUND (h) S2, fixed: DeliveryNeedsDecision opens a Radix Dialog from a plain button (no DialogTrigger), so Radix had nothing to give focus back to (RED seen: toHaveFocus failed). Now an explicit ref + onCloseAutoFocus.
- Still open (h): canonical-order-recovery-actions, canonical-customer-return-actions, delivery-reconcile-actions open dialogs with no DialogTrigger (same pattern, not yet checked/fixed).

## Final (call 38)
Commits: 006823a8 (gate, banner, skeletons, runtime keys), 241c5064 (detail pages wired, row writes off offline, focus fix), this one (phone test + notes).
### Per page and letter
| | orders/[id] | deliveries/[id] | returns/[id] |
|---|---|---|---|
| a skeleton | page-shaped (header, 4 stats, items + side) | page-shaped | page-shaped |
| b empty | n/a (notFound) | n/a | n/a |
| c error + Retry | kit PageError via error.tsx (unchanged, layout stays) | same | same |
| d partial | n/a: server page, no client refetch | n/a | n/a |
| e offline | banner + gates (see commit 2) | banner + reconcile card gate | banner (no write control exists) |
| f phone 360 | items already a list; totals formatDZD on integers; no sticky bar in the page; NOT seen by eye | not seen | not seen |
| g render tests | gate/banner/skeleton in ar+en; the 3 page files themselves are server components and cannot be mounted | same | same |
| h focus | stuck-booking dialog fixed (RED seen); refund + delete use DialogTrigger (Radix restores) but NOT test-walked | | |
| i ar/fr/en | 2 keys, parity test | | |
### Lists (leftovers of w97)
- Row writes off offline with the reason: OrderStatusBadge (saved orders only), DeliveryStatusBadge, DeliveryRowActions sync+cancel, stuck-booking exit in the list row. Returns chip was already off.
- Confirmation queue phone test: actionable row = Confirm + Reject in the actions slot and Review as the card's own link (a[href=/orders/:id]); read-only row = Review in the actions slot. Review is NOT a third button on actionable rows (the column is either/or in the code, line ~626).
### Mutation checks (in place on the real file, restored byte-identical, cmp checked; not a separate tree)
- write-gate.ts offline -> disabled:false: write-gate test RED (1 failed); permission/offline order swapped: RED (1 failed); confirmation-queue actions slot renamed: phone test RED (2 failed). The component tests do not catch mutation 1 (the gate component reads reason, not disabled): the pure test does.
### NOT done
1. Partial/offline "last updated" time on the 4 lists: needs a fetch time the list hooks do not expose (src/hooks/swr/* are not in my scope). Next step: add `dataUpdatedAt` (onSuccess stamp in a useState, not an effect) to the 4 hooks, pass `lastUpdated` to ListStatusBanner, which forwards it to StateView.
2. Focus return not fixed/checked for dialogs without DialogTrigger in canonical-order-recovery-actions, canonical-customer-return-actions, delivery-reconcile-actions (AlertDialog open from state).
3. Honesty pass on "queued" wording for WhatsApp/courier outcomes: not done.
4. Phone/dark/RTL by eye, keyboard walk of the three pages: not done. fieldset-disabled Radix triggers inside the gates (e.g. a dropdown inside OrderEditPanel) rely on native disabled; not seen in a browser. A dialog already open when the connection drops stays active (portal): the request fails with the existing error toast.
5. Kit requests: none.
## Re-run
flock /tmp/vt.lock sf vt wt-w2g1b src/components/orders/__tests__/{write-gate.test.ts,detail-offline.render.test.tsx,order-status-badge-offline.render.test.tsx,confirmation-queue-phone.render.test.tsx} src/components/deliveries/__tests__ src/lib/i18n/__tests__/orders-detail-runtime.test.ts

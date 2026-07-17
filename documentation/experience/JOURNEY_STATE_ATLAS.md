# SahelFlow 1.0 — Journey and State Atlas

> **Status:** Active journey coverage baseline  
> **Rule:** Every journey must define happy path, interruption, denial, degraded operation and recovery.

## 1. Universal state vocabulary

Every surface uses consistent operational language.

| State | Meaning |
|---|---|
| Draft | Local work not yet committed as the intended business action |
| Pending | Accepted for review or execution, not complete |
| Queued | Durably stored for later execution |
| Processing | An executor is actively working |
| Committed | Canonical desktop transaction succeeded |
| Rejected | Validation, permission, policy or current state prevented commit |
| Conflict | Current state differs and needs explicit resolution |
| Retrying | Safe automatic retry is scheduled |
| Degraded | Capability remains partly usable with known limitation |
| Offline | Required network unavailable |
| Stale | Displayed projection may not reflect current desktop state |
| Blocked | Human action, approval, entitlement or recovery is required |
| Failed | Attempt ended without success; work is preserved or recovery is stated |
| Reconciled | External and canonical records have been compared and resolved |
| Verified | Required integrity/evidence checks passed |
| Revoked | Identity, session, device, entitlement or key is no longer valid |

“Success” is surface-specific and must identify what succeeded.

## 2. Acquire, install and start trial

### Happy path

1. Seller reaches multilingual marketing/download site.
2. System requirements and supported Windows scope are clear.
3. Signed installer is downloaded and verified.
4. Installation checks required runtime capabilities.
5. App requests or restores the online signed trial.
6. Language and accessibility preferences are selected.
7. Owner creates secure local identity.
8. First shop and recovery kit are created.
9. Onboarding checklist begins.

### Required alternate states

- unsupported/missing WebView/runtime;
- SmartScreen/antivirus warning guidance;
- no internet during first trial issue;
- machine already used a trial;
- clock mismatch;
- licensing service outage;
- installer tampered;
- existing data discovered;
- interrupted installation;
- low disk;
- modified Windows build capability warning.

## 3. Purchase and activate

1. Seller opens the locked or active-trial purchase flow.
2. Current authoritative price and included boundaries are shown.
3. Machine-bound reference is generated.
4. BaridiMob/CCP instructions and receiving account are shown.
5. Seller submits supporting evidence.
6. Request becomes pending founder verification.
7. Founder checks actual receiving-account transaction.
8. Founder approves/rejects with reason.
9. Permanent entitlement is signed offline.
10. Desktop receives/imports and verifies it.
11. Activation receipt and support horizon are shown.

States: awaiting payment, evidence submitted, verification pending, amount mismatch, duplicate evidence, rejected, approved/signing pending, issued, downloaded, verified, activation failed, support recovery.

## 4. Trial expiry

- all operational routes and workers lock;
- data remains untouched;
- only licensing/payment/extension/support/minimal diagnostics remain;
- cached PWA access and direct API bypass fail;
- activation restores access without data migration;
- messaging clearly states preservation and next steps.

## 5. First-shop onboarding

Checklist:

- business identity;
- shop address and locale;
- first product/variant;
- first customer;
- first order;
- provider setup;
- WhatsApp setup;
- AI key setup;
- backup and recovery confirmation;
- team invite;
- storefront preview.

Each item may be skipped, but skipped setup remains visible and contextual.

## 6. Daily owner dashboard

The owner opens SahelFlow and immediately sees:

- current shop;
- license/support state;
- local database and backup health;
- WhatsApp/provider/sync state;
- orders requiring confirmation;
- fulfillment and delivery exceptions;
- COD outstanding and discrepancies;
- low stock;
- team queues/approvals;
- important automation failures;
- storefront import backlog;
- actionable next steps.

The dashboard must not merge gross, realized and collected money into one ambiguous “revenue” value.

## 7. Receive an order

Sources: manual, WhatsApp, storefront, commerce, import or approved automation.

Common sequence:

1. Source event/receipt is durably recorded.
2. Duplicate/idempotency check.
3. Customer is matched or created.
4. Products/variants and authoritative prices are resolved.
5. Address and phone are validated.
6. Risk is assessed.
7. Draft/pending order created atomically with audit/event/outbox.
8. Confirmation queue receives the order.
9. Source receives an appropriate acknowledgement only when allowed.

Failure states preserve the source event and create retry/manual-review work. A checkpoint never skips it.

## 8. WhatsApp message to order

1. Message arrives and is durably persisted.
2. Conversation/customer context is resolved.
3. Privacy-safe extraction pipeline runs.
4. Parsed fields and confidence are shown.
5. Seller corrects or completes missing values.
6. Product/variant and price are resolved.
7. Risk and duplicate warnings appear.
8. Seller confirms creation.
9. Committed order links back to source message.
10. Thread shows a durable activity receipt.

States include no AI key, quota exhausted, model unavailable, low confidence, ambiguous product, invalid phone, multiple customers, duplicate order and permission denied.

## 9. Confirm an order

- queue sorted by policy;
- seller contacts customer;
- notes/result recorded;
- status transition enforced;
- stock reservation occurs according to policy;
- assignment/SLA updates;
- automated follow-up may be scheduled;
- audit records actor and evidence.

Alternate outcomes: confirmed, no answer, rescheduled, cancelled, suspected fraud, duplicate, address correction required, owner approval required.

## 10. Fulfill and ship

1. Order is eligible.
2. Courier capability and service area are checked.
3. Fee/option is selected.
4. Shipment intent commits.
5. Worker executes idempotently.
6. Tracking/label receipt is stored.
7. Order/delivery state updates.
8. Label is printed or shared.

States: credential invalid, provider degraded, timeout/unknown result, retrying, duplicate request, unsupported edit/cancel, service area failure, manual shipment fallback.

## 11. Track delivery

- provider events normalize into a timeline;
- scheduled reconciliation repairs missed events;
- order state updates through valid transitions;
- seller sees last source timestamp and confidence;
- exceptional events enter work queues;
- customer contact action is available.

Outcomes: delivered, refused, unreachable, postponed, returned, lost/damaged, provider discrepancy, stale status.

## 12. Return, exchange and refund

1. Request linked to order/items.
2. Eligibility and reason captured.
3. Approval policy enforced.
4. Returned goods disposition recorded.
5. Stock compensation commits.
6. Refund or exchange facts commit.
7. COD/customer/accounting views update.
8. Timeline and audit remain immutable.

All reversals are explicit compensation, never hidden flag changes.

## 13. Reconcile COD

1. Import or enter courier remittance batch.
2. Match shipments/orders.
3. Calculate expected amount, fees and adjustments.
4. Highlight unmatched/partial/discrepant lines.
5. Operator proposes resolution.
6. Required approval occurs.
7. Reconciliation commits append-only facts.
8. Export/receipt and audit are available.

States: partially matched, missing order, duplicate remittance, amount mismatch, disputed fee, provider correction pending, reversed adjustment.

## 14. Manage stock

- receive/add stock;
- manual correction with reason;
- reservation/release;
- low-stock alert;
- stocktake/reconciliation;
- damaged/returned disposition;
- inter-shop transfer only if explicitly designed with two authoritative shop transactions and evidence.

Every stock value links to ledger facts.

## 15. Team invitation and work assignment

1. Owner chooses shops, role and field policy.
2. Invitation is issued.
3. Member accepts and enrolls device.
4. Session obtains trusted context.
5. Member sees only permitted navigation/data.
6. Work is assigned and handed over.
7. Revocation purges session and sensitive cache.

States: expired invite, limit reached, device limit, policy changed, approval pending, revoked, offline cache purge pending.

## 16. High-risk approval

Used for configured refunds, accounting adjustments, member administration, recovery, secrets, destructive automation or remote commands.

- requester creates typed proposal;
- current state and impact are shown;
- approver re-authenticates;
- proposal is revalidated;
- approval receipt is signed/correlated;
- transaction commits or rejects;
- request and result remain auditable.

Stale or changed proposals cannot execute.

## 17. Create an automation

1. Select trigger.
2. Build conditions.
3. Select scoped actions.
4. Review permissions, rate and affected shops.
5. Test/dry-run.
6. Configure approval if required.
7. Activate version.
8. Monitor execution and failures.
9. Pause, edit as a new version or roll back.

## 18. Connect a provider

1. Select provider.
2. Review certified capabilities and limitations.
3. Enter credentials into protected desktop.
4. Validate scopes/environment.
5. Run connection test.
6. Perform live/sandbox capability tests.
7. Enable only certified capabilities.
8. Monitor health.

States: unsupported capability, experimental, credential expired, rate limited, degraded, policy changed, certification expired.

## 19. Commerce synchronization

- webhook notification durably accepted;
- independent scheduled reconciliation;
- idempotent inbox processing;
- explicit source versions;
- failure queue;
- sync run and checkpoint;
- conflict/manual review;
- status write-back where certified.

The seller can inspect what was fetched, imported, skipped, retried and reconciled.

## 20. Publish a storefront

1. Choose shop and allocated catalog.
2. Select one of three distinct templates.
3. Configure brand/content/domain.
4. Preview privately in AR/FR/EN and mobile.
5. Validate accessibility, stock allocation and checkout.
6. Publish immutable release atomically.
7. Observe release health.
8. Roll back if needed.

States: draft invalid, media upload failed, domain unverified, allocation conflict, publish failed, active, superseded, rolled back.

## 21. Customer storefront checkout

1. Customer browses published catalog.
2. Selects variant and quantity.
3. Cart persists safely.
4. Enters phone/address/wilaya/commune.
5. Server resolves price, allocation and delivery rules.
6. Abuse controls run.
7. Durable tenant/shop-scoped receipt is created.
8. Customer sees receipt/tracking information.
9. Desktop imports and acknowledges later.

If desktop is offline, accepted receipt remains queued. If receipt durability fails, success is not shown.

## 22. Remote PWA command

1. Member sees role-filtered projection.
2. Command is created with current version/context.
3. Cloud accepts it as queued.
4. Desktop receives and rechecks permission/current state.
5. Desktop commits or rejects.
6. PWA receives result.
7. Cache/projection updates.

States: offline, stale, queued, expired, revoked, policy changed, conflict, committed, rejected.

## 23. Backup and restore

### Backup

- consistent snapshot;
- integrity check;
- manifest and hashes;
- local encryption;
- resumable upload;
- remote verification;
- retention update;
- periodic restore certification.

### Restore

- identify valid entitlement and recovery kit;
- download and authenticate;
- decrypt in isolated staging;
- verify application-level health;
- preserve current installation;
- atomic cutover only after success;
- post-restore migration/health;
- failure leaves current data unchanged.

## 24. Machine replacement and transfer

Planned transfer:

- verify current backup;
- pair old/new installations with matching code;
- approve cutover;
- activate new;
- revoke old;
- verify shops/providers/backup.

Emergency recovery:

- identity/business/payment evidence;
- recovery kit;
- founder review where necessary;
- new installation activation;
- old device/session revocation;
- complete audit.

## 25. Update and migration

1. Candidate and compatibility are verified.
2. User sees release notes and impact.
3. Preflight checks disk, versions and every shop.
4. Required verified backups exist.
5. Work pauses under maintenance UI.
6. Migrations run with journal.
7. Application health checks.
8. Update completes or recovery path activates.

No blind down-migration. Tampered/incompatible updates are rejected.

## 26. Support and incident

- user opens contextual support;
- local diagnostics are previewed and redacted;
- consented bundle may upload;
- support case receives correlation;
- founder sees only bounded metadata;
- containment may revoke device/session/provider or hold release;
- resolution and postmortem update evidence/runbook.

## 27. Beta and launch

- recruit representative sellers;
- define parallel-run and data-safety protocol;
- onboard and verify backup;
- daily check-in;
- capture workflow friction and incidents;
- no silent feature improvisation during beta;
- classify fix, limitation or later backlog;
- recovery and replacement drills;
- final founder walkthrough across surfaces/locales;
- Stable only after evidence gates.

# Provider Contract and Certification Registry

**Status:** Active claim authority for external integrations  
**Baseline:** `03f0d48436b42788e463bbd1d74a388b2da22294`

Source files, mocks and unit tests do not make a provider publicly supported. Only a current live certification record can promote a provider/capability to `Certified`.

## Statuses

- **Planned** — founder-approved launch scope, no launch-safe adapter evidence.
- **Candidate** — adapter exists and contract tests pass; live certification incomplete.
- **Certified** — current live certification passed for the listed capabilities.
- **Degraded** — previously certified but provider drift/incident limits capability.
- **Disabled** — blocked by policy, security, outage or unresolved correctness issue.
- **Experimental** — code/research may exist but it is not a public product capability.

## Current registry

| Provider | Domain | Founder scope | Baseline implementation | Registry status | Public capability allowed now | Certification blockers |
|---|---|---:|---|---|---|---|
| WhatsApp via Baileys | Messaging/inbox | Yes | Loopback sidecar, QR, send, events, in-memory store | Candidate | No launch claim | Durable ingress/egress, credential recovery/protection, real session/reconnect/history/duplicate/policy tests |
| Google AI Studio / Gemini | AI extraction/chat | Yes, seller-owned key | Extraction/chat/tools, typed validation, heuristic redaction | Candidate | No launch claim | Approved model registry, privacy corpus, action approval service, quota/outage/live Darija evidence |
| Yalidine | Courier | Yes | Adapter/test code exists | Candidate | No launch claim | Live auth/create/fee/label/status/cancel/idempotency/rate-limit/reconciliation certification |
| ZR Express | Courier | Yes | Adapter/test code exists | Candidate | No launch claim | Same capability certification with provider-specific mappings/limits |
| Maystro | Courier | Yes | Adapter/test code exists | Candidate | No launch claim | Same capability certification with provider-specific mappings/limits |
| Procolis | Courier | Optional after validation | Adapter/config references exist | Experimental | No | Founder go/no-go plus full live certification |
| DHD and other courier code | Courier | No current approval | Historical/experimental code may exist | Experimental | No | Founder scope decision, legal/economic review and certification |
| Shopify | E-commerce | Yes | Polling adapter/sync tests exist | Candidate | No launch claim | Durable inbox, webhook/reconciliation convergence, paging/edit/cancel/rate-limit/live certification |
| WooCommerce | E-commerce | Yes | Polling adapter/sync tests exist | Candidate | No launch claim | Durable inbox, webhook/reconciliation convergence, plugin/API-version matrix and live certification |
| YouCan | E-commerce | Yes | Polling adapter/sync tests exist | Candidate | No launch claim | Durable inbox, provider event/version semantics, reconciliation and live certification |
| Google Sheets | Export | Yes | Export implementation/tests exist | Candidate | No launch claim | OAuth/key scope, privacy schema, idempotency, quota/error and live export evidence |
| Cloudflare | Control plane/relay/backup/storefront | Yes | No implementation at baseline | Planned | No | Architecture milestones M7/M8/M11, cost/security/disaster evidence |
| Sentry | Diagnostics | Optional | Env-gated integration/redaction hooks | Candidate | Internal diagnostics only | Consent, minimization, retention, redaction canary, outage and deletion evidence |
| GitHub Releases/Tauri updater | Distribution | Yes | Updater and release workflows exist | Candidate | Internal only | Windows candidate pipeline, version manifest, signing, staged rollout, rollback and update drill |

## Contract requirements common to every provider

Every adapter declares:

- provider/API/version and environment;
- authentication method and minimum permissions;
- credential scope and secret handle;
- capabilities and unsupported operations;
- normalized request/response/event schemas;
- provider resource/event/version identifiers;
- idempotency behavior and dedup key;
- pagination/cursor/order semantics;
- webhook signature/replay semantics where applicable;
- rate limits, quotas and retry classes;
- timeout/network/5xx/4xx behavior;
- clock/time-zone/currency/locale assumptions;
- status/error mapping;
- PII/data classes transmitted;
- reconciliation strategy and checkpoint rule;
- observability and health state;
- provider kill switch/degradation UX;
- terms/policy/legal review date;
- recertification triggers.

## Courier capability matrix template

| Capability | Supported | Contract method | Idempotency | Evidence |
|---|:---:|---|---|---|
| Authenticate/test credentials |  |  | N/A |  |
| Create home-delivery shipment |  |  |  |  |
| Create desk/office shipment |  |  |  |  |
| Fee lookup |  |  |  |  |
| Wilaya/commune mapping |  |  | N/A |  |
| Label retrieval/format |  |  |  |  |
| Tracking/status polling |  |  |  |  |
| Webhook status |  |  |  |  |
| Edit shipment |  |  |  |  |
| Cancel shipment |  |  |  |  |
| Bulk create |  |  |  |  |
| Reconciliation/list since |  |  |  |  |

## Commerce capability matrix template

| Capability | Supported | Identity/version model | Checkpoint/reconciliation | Evidence |
|---|:---:|---|---|---|
| Credential validation |  |  |  |  |
| List orders incrementally |  |  |  |  |
| Webhook receive/signature |  |  |  |  |
| New order |  |  |  |  |
| Order edit |  |  |  |  |
| Cancellation |  |  |  |  |
| Fulfillment/status change |  |  |  |  |
| Pagination overlap |  |  |  |  |
| Duplicate/replay |  |  |  |  |
| Rate-limit recovery |  |  |  |  |
| Full reconciliation |  |  |  |  |

## Certification record template

```markdown
# <Provider> Certification — <date>

- Status: Certified / Failed / Degraded
- Provider/API/version:
- Environment/account:
- Adapter commit:
- Packaged artifact digest:
- Tester/reviewer:
- Terms/policy review:
- Credentials/scopes used (no secret values):
- Capabilities certified:
- Capabilities unsupported:
- Test dataset and privacy classification:
- Successful cases:
- Failure/adversarial cases:
- Duplicate/idempotency results:
- Paging/checkpoint/reconciliation results:
- Rate-limit/outage/recovery results:
- Redacted evidence locations:
- Known limitations/residual risk:
- Recertification trigger/date:
- Approval:
```

## Certification rules

1. Use a real provider environment/account and a signed packaged candidate where the integration is desktop-bound.
2. Retain sanitized request/response/event IDs sufficient to reproduce the result.
3. Never commit tokens, customer PII or WhatsApp credentials.
4. Test at least one duplicate, timeout-after-provider-success and provider-partial-failure case.
5. For ingress providers, prove no checkpoint advances past an untracked failure.
6. For effects, prove idempotent retry or a safe reconciliation/compensation path.
7. A provider contract/version or material behavior change invalidates affected certification.
8. Incidents can downgrade a provider immediately without waiting for a release.
9. UI, sales and documentation read this registry and cannot imply unsupported capabilities.

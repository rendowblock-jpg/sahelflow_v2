# SahelFlow — Provider Contract and Certification Registry

> **Status:** Active claim authority for external integrations  
> **Source baseline:** `fd9fa97dfcf96e08ffa1273070e74c4bb6db980e`  
> **Rule:** Source files, mocks and unit tests do not make a provider publicly supported. Only a current live certification record can promote a provider capability to `Certified`.

## 1. Statuses

- **Planned** — Founder-approved launch scope; no launch-safe implementation evidence.
- **Candidate** — meaningful adapter/implementation exists; live certification is incomplete.
- **Certified** — current live certification passed for the listed capabilities.
- **Degraded** — previously certified, but provider drift or an incident limits capability.
- **Disabled** — blocked by policy, security, outage or unresolved correctness risk.
- **Experimental** — code or research may exist, but it is not a public product capability.

Certification is capability-specific. A provider can be certified for tracking while edit or cancellation remains unsupported.

## 2. Current registry

| Provider | Domain | Founder scope | Current implementation | Status | Public capability now | Main blockers |
|---|---|:---:|---|---|---|---|
| WhatsApp via Baileys | Messaging/inbox | Yes | Loopback sidecar, QR, chats, send, WS events, delivery updates, volatile store | Candidate | No launch support claim | Durable ingress/egress and history, credential recovery/protection, replay, real reconnect/logout/duplicate/policy tests |
| Google AI Studio / Gemini | AI | Yes; seller-owned key | Regex fallback, extraction/chat/tools, typed schemas, heuristic redaction | Candidate | No launch support claim | Central model registry, allowlisted privacy payloads, bound approvals, quota/outage health, real multilingual privacy evidence |
| Yalidine | Courier | Yes | Adapter, fee/create/tracking/cancel code and tests | Candidate | No launch support claim | Live auth/create/fee/label/status/cancel/idempotency/rate-limit/reconciliation certification |
| ZR Express | Courier | Yes | Adapter and tests | Candidate | No launch support claim | Provider-specific live capability and limitation certification |
| Maystro | Courier | Yes | Adapter and tests | Candidate | No launch support claim | Provider-specific live capability and limitation certification |
| Procolis | Courier | Optional after validation | References/implementation knowledge exist | Experimental | No | Founder go/no-go plus full certification |
| DHD and other courier code | Courier | No current approval | Explicitly guessed/experimental endpoints may exist | Experimental | No | Founder scope decision, terms/economics review and full certification |
| Shopify | E-commerce | Yes | REST polling, pagination, updated-order handling and dedup | Candidate | No launch support claim | Durable inbox, webhook/reconciliation convergence, contiguous checkpoints, live edit/cancel/rate-limit certification |
| WooCommerce | E-commerce | Yes | REST polling, pagination, modified-order handling and URL controls | Candidate | No launch support claim | Durable ingress/checkpoints, host/plugin/version matrix and live certification |
| YouCan | E-commerce | Yes | Full-scan polling, pagination, normalization and dedup | Candidate | No launch support claim | Durable ingress, efficient reconciliation strategy, event/version semantics and live certification |
| Google Sheets | Export | Yes | Service-account export, clear/rewrite and batching | Candidate | No launch support claim | Identity/shop/field scope, privacy policy, idempotency, quota/error and live evidence |
| Cloudflare | Control/relay/backup/storefront | Yes | No bounded platform implementation | Planned | No | Roadmap Phase 4–5 implementation, cost, security, tenant and disaster evidence |
| Sentry | Diagnostics | Optional | Environment-gated integration and redaction hooks | Candidate | Internal diagnostics only | Consent, minimization, retention, canary proof, outage and deletion evidence |
| GitHub Releases/Tauri updater | Distribution | Yes | Signed updater mechanism and release workflows | Candidate | Internal only | Windows-only candidate pipeline, version manifest, staged rollout, update/tamper/hold/recovery drills |

## 3. Common provider contract

Every adapter or provider worker declares:

- provider, API/version and environment;
- authentication method and minimum permissions;
- credential purpose, tenant/shop scope and secret handle;
- supported and unsupported capabilities;
- normalized request, response and event schemas;
- provider resource/event/version identifiers;
- idempotency and deduplication behavior;
- pagination, ordering, overlap and cursor semantics;
- webhook signature/replay behavior where applicable;
- rate limits, quotas, retry classes and backoff;
- timeout, network, 4xx, 5xx and ambiguous-success behavior;
- clock, time-zone, currency and locale assumptions;
- status and error mapping;
- transmitted PII/data classes and retention;
- reconciliation strategy and contiguous-checkpoint rule;
- observability and health state;
- degradation/kill-switch behavior and seller UX;
- terms/policy/legal review date;
- recertification triggers.

Provider code executes through durable inbox/outbox/effect records once Roadmap Phase 3 is available. New integrations must not expand direct request-to-provider coupling.

## 4. Courier capability matrix

| Capability | Supported | Contract method | Idempotency/recovery | Evidence |
|---|:---:|---|---|---|
| Authenticate/test credentials |  |  | N/A |  |
| Create home-delivery shipment |  |  |  |  |
| Create desk/office shipment |  |  |  |  |
| Fee lookup |  |  | N/A |  |
| Wilaya/commune mapping |  |  | N/A |  |
| Label retrieval/format |  |  |  |  |
| Tracking/status polling |  |  |  |  |
| Webhook status |  |  |  |  |
| Edit shipment |  |  |  |  |
| Cancel shipment |  |  |  |  |
| Bulk create |  |  |  |  |
| Reconciliation/list since |  |  |  |  |

## 5. Commerce capability matrix

| Capability | Supported | Identity/version model | Checkpoint/reconciliation | Evidence |
|---|:---:|---|---|---|
| Credential validation |  |  |  |  |
| Incremental listing |  |  |  |  |
| Webhook receive/signature |  |  |  |  |
| New order |  |  |  |  |
| Order edit |  |  |  |  |
| Cancellation |  |  |  |  |
| Fulfillment/status change |  |  |  |  |
| Pagination overlap |  |  |  |  |
| Duplicate/replay |  |  |  |  |
| Rate-limit recovery |  |  |  |  |
| Full reconciliation |  |  |  |  |

## 6. Certification record

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

## 7. Certification rules

1. Use a real provider environment/account and a signed installed candidate when the integration is desktop-bound.
2. Retain sanitized request/response/event identifiers sufficient to reproduce the result.
3. Never commit tokens, customer PII, WhatsApp credentials or private keys.
4. Test invalid credentials, duplicate/replay, timeout-after-provider-success, network loss, rate limit, malformed/partial response and provider outage.
5. Inbound events must be durable before acknowledgement; no checkpoint passes an untracked failure.
6. Outbound effects require provider idempotency or a demonstrated reconciliation/compensation path.
7. Unsupported capabilities remain hidden or return an explicit supported-error.
8. A provider contract/version or material behavior change invalidates the affected certification.
9. Incidents can downgrade or disable a capability immediately.
10. UI, sales and documentation cannot imply more than the certified matrix.

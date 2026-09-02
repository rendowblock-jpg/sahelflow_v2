# UI/UX Triage Ledger — AAA Interaction Surface

> **Purpose.** Single triage ledger for every UI/UX gap on the Inbox and AI Agents
> pages: the full-codebase AAA audit (post-Internal.32), Founder session findings,
> and residuals of the release-freeze AAA quality line (#382/#383/#384/#385).
> This satisfies next-session order item 1 ("merge the findings list + AAA
> residuals into ONE ledger"). The Founder's original pre-freeze findings list
> can still be ingested as additional rows — structure is ready.
>
> **Conversion rule.** Everything here is SOURCE-level on `main`. Nothing is
> "installed" until it ships in an authorized signed release (Internal.33 —
> release train FROZEN per WORKING_MEMORY). Rows move to the capability
> ledgers only after installed conversion.

Status: `OPEN` · `DONE (source, <ref>)` · `BLOCKED (<reason>)`
Priority: `P0` trust-killer / day-one parity · `P1` WhatsApp-parity surface · `P2` depth · `P3` perf/power/quality

---

## F — Founder findings (2025 session, screenshots reviewed)

| ID | Finding | Verdict from code | Status |
|---|---|---|---|
| F-01 | Document messages not AAA like WhatsApp (raw `application/vnd.…` MIME string printed in bubble) | Confirmed: `inbox-media-attachment.tsx` rendered `attachment.mimeType` verbatim; wide text download button; stacked 5-row card | **DONE (source, branch `fix/aaa-inbox-message-surface-polish`)** — `documentKind()` ext+MIME family map (Word/PDF/Excel/PowerPoint/ZIP/…), type-icon tile, one-row identity card, compact download, friendly meta everywhere incl. pending/failed states |
| F-02 | Sender's own messages on the wrong side | Confirmed: bubble row used logical `justify-start/end`; RTL (ar UI) flipped outbound bubbles to the physical left — contradicts the French-WhatsApp mental model of DZ sellers | **DONE (source, same branch)** — thread bubble wrapper pinned `dir="ltr"`: inbound left / outbound right in every locale; text stays `dir="auto"`; tails resolve physically correct |
| F-03 | Select-to-delete mode UI change is jarring | Confirmed: entering selection replaced the whole filter chrome with a text toolbar and inserted a 16px checkbox column (layout shift, vertical jump) | **DONE (source, same branch)** — avatar morphs in place into a `size-9` check circle (zero shift, WhatsApp-style); queue-pills row morphs in place into selection controls (same height); workflow row stays visible; delete error reflows below |

## INB — Inbox gaps

### P0/P1 — WhatsApp-parity surface
| ID | Item | Target | Status |
|---|---|---|---|
| INB-01 | List preview: media-type icon, `You:` prefix, delivery ticks (API already returns `fromMe`) | `inbox-v3-queue.tsx`, chats projection | OPEN |
| INB-02 | Emoji picker in composer | `inbox-v3-thread.tsx` | OPEN |
| INB-03 | Scroll-to-bottom FAB with missed count | `inbox-v3-thread.tsx` | OPEN |
| INB-04 | "New messages" unread divider | `inbox-v3-thread.tsx` | OPEN |
| INB-05 | Image lightbox / zoom | `inbox-media-attachment.tsx` | OPEN |
| INB-06 | Consecutive-bubble grouping (no repeated time chrome) | `inbox-v3-thread.tsx` | OPEN |
| INB-07 | TODAY/YESTERDAY day separators | `inbox-v3-thread.tsx` | OPEN |
| INB-08 | Auto-grow composer textarea | `inbox-v3-thread.tsx` | OPEN |
| INB-09 | Draft indicator in list rows | `inbox-v3-queue.tsx` + drafts hook | OPEN |

### P2 — Depth
| ID | Item | Target | Status |
|---|---|---|---|
| INB-10 | In-thread search with hit navigation | `inbox-v3-thread.tsx` | OPEN |
| INB-11 | History pagination ("load older") + list virtualization | thread + `messages` route | OPEN |
| INB-12 | Pin / mute / archive conversation states | queue + prisma model | OPEN |
| INB-13 | Reactions | thread (+sidecar capability) | BLOCKED (sidecar probe) |
| INB-14 | Message delete-for-everyone | thread (+sidecar) | BLOCKED (sidecar probe) |
| INB-15 | Quote chips clickable → jump + highlight | `inbox-v3-thread.tsx` | OPEN |
| INB-16 | Link previews | media pipeline | OPEN |
| INB-17 | Per-row hover quick actions + context menu | `inbox-v3-queue.tsx` | OPEN |
| INB-18 | Keyboard navigation (`j/k`, `e` resolve, Enter open) | `use-keyboard-shortcuts.ts` | OPEN |
| INB-19 | Real avatars (profile photos) | queue/thread (+sidecar) | BLOCKED (sidecar probe) |
| INB-20 | Assignee display name in rows (not generic word) | `inbox-v3-queue.tsx` | OPEN |
| INB-21 | Label/priority filters in queue + label chips | `inbox-v3-queue.tsx` | OPEN |
| INB-22 | Bulk actions beyond delete (resolve/assign/mark-read) | `inbox-v3-queue.tsx` | OPEN |
| INB-23 | Custom snooze datetime picker | `conversation-controls.tsx` | OPEN |
| INB-24 | Voice recording gestures (lock-to-record, slide-cancel, preview) | `use-voice-recorder.ts` | OPEN |
| INB-25 | Multi-file attachment selection | `inbox-v3-thread.tsx` | OPEN |

### P3 — Perf / code quality (invisible to Founder, visible in feel)
| ID | Item | Target | Status |
|---|---|---|---|
| INB-26 | `React.memo` on `MessageBubble`; replace `JSON.stringify` deep-compare | `inbox-v3-thread.tsx`, `use-inbox-workspace.ts:306` | OPEN |
| INB-27 | Split 2,606-line god hook into chat/messages/drafts/outbox hooks | `use-inbox-workspace.ts` | OPEN |
| INB-28 | Collapse 4 duplicated ~200-line send functions into one factory | `use-inbox-workspace.ts` | OPEN |
| INB-29 | `window.confirm` → `AlertDialog` for ambiguous duplicate retry | `use-inbox-workspace.ts:1415` | OPEN |
| INB-30 | Inline `ASSIGNMENT_COPY` into the central i18n chain | `conversation-controls.tsx:308-805` | OPEN |
| INB-31 | Text-send abort/timeout parity with media sends | `use-inbox-workspace.ts` | OPEN |

### Sidecar engineering (not UI polish — capability work)
| ID | Item | Why it matters | Status |
|---|---|---|---|
| INB-32 | Typing indicator / presence events | The most "alive" WhatsApp signal; liveness contract today explicitly forbids presence (`inbox-liveness-contract.test.ts:136-146`) — requires sidecar frame-type addition + contract revision | OPEN (sidecar) |

## AI — Agents page gaps

### P0 — Trust killers
| ID | Item | Target | Status |
|---|---|---|---|
| AI-01 | Seeded demo conversation renders as real, with FICTIONAL tool names (`get_operational_brief`, `get_order` — not in the 30-tool registry) and a broken-looking 2-field table under the unconfigured banner. Label demo sessions ("مثال") + add seed↔registry drift test | `algerian-demo.ts:830-857`, new drift test | OPEN |
| AI-02 | No copy button on any message (zero clipboard code in `src/components/ai`) | `ai-decision-canvas.tsx` | OPEN |
| AI-03 | Proposals cannot be rejected — approve-or-expire(10min) only; `rejected` status exists in vocabulary with no button/API | `ai-action-proposal-card.tsx`, actions API | OPEN |
| AI-04 | Stop generation discards the partial answer (nothing persisted on abort) | `stream/route.ts:258-277` | OPEN |
| AI-05 | Setup CTA dead-ends at `/settings` root; `?group=intelligence` deep-link exists unused | `ai-decision-canvas.tsx:159` | OPEN |

### P1 — Assistant-UX parity
| ID | Item | Target | Status |
|---|---|---|---|
| AI-06 | Tool cards: collapsible, show args (parsed but never rendered), raw result, timing, per-tool retry | `ai-tool-result-card.tsx` | OPEN |
| AI-07 | Regenerate replaces in place (today: append-only duplicates) | `use-ai-workspace.ts:591-616` | OPEN |
| AI-08 | History beyond silent last-20 cap: cursor pagination + notice (dead `historyRecentOnly` key exists) | `session-history.ts`, messages routes | OPEN |
| AI-09 | Session search + pin (50-session cap, no query) | `sessions/route.ts`, `ai-work-history.tsx` | OPEN |
| AI-10 | Scroll-to-bottom pill during streaming | `ai-decision-canvas.tsx:398-430` | OPEN |
| AI-11 | Per-record citation links (`/orders/[id]`, not list pages) | `ai-tool-result-card.tsx:24-46` | OPEN |
| AI-12 | Message timestamps (`createdAt` in view model, never rendered) | `ai-decision-canvas.tsx` | OPEN |
| AI-13 | Thumbs feedback → extraction-metrics-style quality loop | canvas + API | OPEN |
| AI-14 | Follow-up suggestion chips after answers | canvas | OPEN |
| AI-15 | Edit user message and resend | canvas + hook | OPEN |
| AI-16 | Parallel tool calls: `parts.find` silently drops extra calls; render grouped | `agent.ts:215` | OPEN |
| AI-17 | IME composition guard on Enter (Arabic IME sends prematurely) + char counter | `ai-decision-canvas.tsx:569-574` | OPEN |
| AI-18 | Client stream timeout / reconnect (hung SSE = infinite spinner) | `use-ai-workspace.ts` | OPEN |
| AI-19 | Cross-session proposals inbox (approve pending from anywhere) | review panel | OPEN |

### P2 — Panels / polish
| ID | Item | Target | Status |
|---|---|---|---|
| AI-20 | "Review & evidence" panel is empty-state-most-of-the-time: populate (pending proposals across sessions, last approvals, audit timeline) or rename honestly | `ai-review-evidence.tsx` | OPEN |
| AI-21 | Composer attachments (sellers screenshot orders; extraction stack exists but unreachable from agents composer) | canvas + extraction lib | OPEN |
| AI-22 | Keyboard shortcuts (focus composer, stop, session nav, approve focused proposal) | canvas | OPEN |
| AI-23 | a11y: `aria-busy` on streaming bubble; live announce for two-step delete | canvas, history | OPEN |
| AI-24 | 3-pane skeleton loading (today: bare spinner) | `agents/loading.tsx` | OPEN |
| AI-25 | Unconfigured state: capability explainer (reuse ~25 dead copy keys) + delete dead keys + legacy `ai.*` namespace | `ai-workspace.ts`, locales | OPEN |
| AI-26 | Truthful model/quality signal (contract today forbids usage metadata — revisit deliberately, never fabricate) | contracts + tests | OPEN |

---

## Rules

1. **No row is "closed" until installed conversion** in an authorized signed release (Internal.33). Source-merge ≠ shipped.
2. Sidecar-probe items (INB-13/14/19/32) need a capability probe + contract revision BEFORE UI work is scheduled.
3. Contract tests are design law: adaptation goes code-side (see F-01: media direction-neutrality contract enforced by `voice-note-player.test.ts:72`).
4. New Founder findings get an `F-xx` row with screenshot reference; never fold them silently into INB/AI rows.

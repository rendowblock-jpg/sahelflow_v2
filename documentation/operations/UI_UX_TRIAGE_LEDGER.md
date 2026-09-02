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
| INB-01 ||| **DONE (source, wave 2)** — media glyphs + "You:" + server projects lastMessage.type; ticks deferred (needs per-message status in projection) |
| INB-02 ||| **DONE (source, wave 2)** — dependency-free picker: 8 categories, search, MRU recents |
| INB-03 ||| **DONE (source, wave 1)** — scroll-to-latest FAB with missed-count badge (99+ cap), away-from-bottom gating |
| INB-04 ||| **DONE (source, wave 1)** — divider + open-at-first-unread anchor, click-to-dismiss |
| INB-05 ||| **DONE (source, wave 1)** — portal lightbox: Esc/backdrop, click-zoom, download, scroll-lock |
| INB-06 ||| **DONE (source, wave 1)** — 2-minute same-direction clusters, tail on group-final bubble |
| INB-07 ||| **DONE (source, wave 1)** — localized اليوم/أمس, weekday <7d, dated beyond |
| INB-08 ||| **DONE (source, wave 1)** — JS-normalized auto-grow (128px cap) |
| INB-09 ||| **DONE (source, wave 2)** — session-scoped draft mirror in rows |

### P2 — Depth
| ID | Item | Target | Status |
|---|---|---|---|
| INB-10 ||| **DONE (source, wave 1)** — header search, n/N counter, prev/next, in-bubble highlight |
| INB-11 | History pagination ("load older") + list virtualization | thread + `messages` route | **PARTIAL (source, wave 9-b)** — composite-cursor `before` param (hasMore/olderCursor) + Load-earlier button shipped; list virtualization still open (perf-only) |
| INB-12 | Pin / mute / archive conversation states | queue + prisma model | OPEN |
| INB-13 | Reactions | thread (+sidecar capability) | BLOCKED (sidecar probe) |
| INB-14 | Message delete-for-everyone | thread (+sidecar) | BLOCKED (sidecar probe) |
| INB-15 ||| **DONE (source, wave 1)** — clickable quotes → jump + ring highlight; honest not-loaded hint |
| INB-16 | Link previews | media pipeline | OPEN |
| INB-17 ||| **DONE (source, wave 2)** — hover mark-unread quick action (row-relative, valid DOM) |
| INB-18 ||| **DONE (source, wave 2)** — j/k/Arrows cursor + Enter open |
| INB-19 | Real avatars (profile photos) | queue/thread (+sidecar) | BLOCKED (sidecar probe) |
| INB-20 ||| **DONE (source, wave 9-b)** — chats route projects team-directory assignee display names; unknown ids fall back to honest generic label |
| INB-21 ||| **DONE (source, wave 2)** — filter popover: priority + label slices |
| INB-22 ||| **DONE (source, wave 2)** — bulk mark-read + resolve, allSettled + toasts |
| INB-23 ||| **DONE (source, wave 2)** — datetime-local + future-date validation |
| INB-24 | Voice recording gestures (lock-to-record, slide-cancel, preview) | `use-voice-recorder.ts` | OPEN |
| INB-25 ||| **DONE (source, wave 9-b)** — multi-select file/image pickers walk files sequentially; one declared-or-sniffed type decision per file |

### P3 — Perf / code quality (invisible to Founder, visible in feel)
| ID | Item | Target | Status |
|---|---|---|---|
| INB-26 ||| **DONE (source, wave 9-b)** — `MessageBubble` memoized with narrow attachment comparator + stable per-conversation callbacks |
| INB-27 | Split 2,606-line god hook into chat/messages/drafts/outbox hooks | `use-inbox-workspace.ts` | OPEN |
| INB-28 | Collapse 4 duplicated ~200-line send functions into one factory | `use-inbox-workspace.ts` | OPEN |
| INB-29 ||| **DONE (source, wave 9-b)** — ambiguous duplicate retry resolves via accessible ConfirmDialog; zero `window.confirm` calls remain |
| INB-30 | Inline `ASSIGNMENT_COPY` into the central i18n chain | `conversation-controls.tsx:308-805` | **DONE (source, wave 10)** — 13 assignment labels + 5 activity strings moved verbatim into the three locale JSONs (`inbox.assignment.*` / `inbox.assignmentActivity.*` with `{{target}}` interpolation, parity 2863×3 pre-cleanup); `refresh` reuses the static `common.refresh` key; component + activity renderer resolve through the shared t() chain; copy-authority + assignment-UI contracts pin resolution, Arabic localization, exact pre-migration values and the no-duplicate rule |
| INB-31 ||| **DONE (source, wave 6)** — 30s AbortSignal.timeout on text sends |

### Sidecar engineering (not UI polish — capability work)
| ID | Item | Why it matters | Status |
|---|---|---|---|
| INB-32 | Typing indicator / presence events | The most "alive" WhatsApp signal; liveness contract today explicitly forbids presence (`inbox-liveness-contract.test.ts:136-146`) — requires sidecar frame-type addition + contract revision | OPEN (sidecar) |

## AI — Agents page gaps

### P0 — Trust killers
| ID | Item | Target | Status |
|---|---|---|---|
| AI-01 ||| **DONE (source, wave 5)** — "Démo ·" title + live demo badge + seed remapped to REAL tools + drift contract test |
| AI-02 ||| **DONE (source, wave 5)** — hover copy row on every completed bubble |
| AI-03 ||| **DONE (source, wave 5)** — POST reject route + Deny button (terminal, coded) |
| AI-04 ||| **DONE (source, wave 5)** — abort persists partial tokens |
| AI-05 ||| **DONE (source, wave 5)** — deep-links ?group=intelligence |

### P1 — Assistant-UX parity
| ID | Item | Target | Status |
|---|---|---|---|
| AI-06 ||| **DONE (source, wave 6)** — collapsible, args k/v shown, auto-expand on running/failure; timing + per-tool retry deferred (needs server duration events) |
| AI-07 ||| **DONE (source, wave 9-a)** — server-authoritative truncate-after route; regenerate replaces the trailing exchange in place with optimistic rollback |
| AI-08 ||| **DONE (source, wave 9-a)** — cursor pagination (hasMore/nextCursor + Load earlier button); honest notice supersedes dead historyRecentOnly |
| AI-09 ||| **DONE (source, wave 6)** — history search + no-match state (pin deferred, needs schema) |
| AI-10 ||| **DONE (source, wave 6)** — scroll pill when scrolled up during streaming |
| AI-11 ||| **DONE (source, wave 9-a)** — per-record deep links (/orders/[id], /products/[id], /customers/[id]); list-route fallback when no record identity |
| AI-12 ||| **DONE (source, wave 5)** — per-message clock on the hover row + tooltip |
| AI-13 | Thumbs feedback → extraction-metrics-style quality loop | canvas + API | OPEN (schema) |
| AI-14 ||| **DONE (source, wave 9-a)** — grounded chips derived ONLY from real tool results; prefill composer, anchored dismissal |
| AI-15 ||| **DONE (source, wave 9-a)** — edit user message → composer prefill + editing notice → truncate & re-stream |
| AI-16 ||| **DONE (source, wave 9-a)** — all parallel function calls collected, executed, and returned to the model; every card rendered |
| AI-17 ||| **DONE (source, wave 6)** — isComposing guard (char counter still OPEN) |
| AI-18 ||| **DONE (source, wave 9-a)** — 45s inactivity watchdog aborts via stop path (partial persists); localized recoverable AI_STREAM_TIMEOUT |
| AI-19 ||| **DONE (source, wave 9-a)** — GET /api/ai/actions shop-wide inbox; review panel shows pending-from-other-sessions with session labels |
| AI-20 ||| **DONE (source, wave 9-a)** — panel populated: cross-session pending + recent decisions timeline from real proposal rows; truthful empty states |
| AI-21 | Composer attachments (sellers screenshot orders; extraction stack exists but unreachable from agents composer) | canvas + extraction lib | OPEN |
| AI-22 ||| **DONE (source, wave 9-a)** — / focus composer, Esc stop/cancel-edit, Alt+↑/↓ session nav, Ctrl+Enter approve focused card; desktop hint row |

### P2 — Panels / polish
| ID | Item | Target | Status |
|---|---|---|---|
| AI-23 ||| **DONE (source, wave 6)** — aria-busy on streaming log (two-step delete announce still OPEN) |
| AI-24 ||| **DONE (source, wave 6)** — 3-pane layout skeleton |
| AI-25 | Unconfigured state: capability explainer (reuse ~25 dead copy keys) + delete dead keys + legacy `ai.*` namespace | `ai-workspace.ts`, locales | **DONE (source, wave 10)** — StartSurface renders the capability explainer when setup resolves not-ready (adopted capabilities sentence + 4 tool-anchored chips, truthful seller-owned-key privacy note, `/settings?group=intelligence` CTA; copy adopted into the ai-decision-workspace runtime authority ×3); all 37 dead legacy `ai.*` locale keys deleted ×3 after a zero-reference repo scan (parity 2826×3); launchpad contract pins explainer rendering, per-locale resolution and the namespace retirement |
| AI-26 | Truthful model/quality signal (contract today forbids usage metadata — revisit deliberately, never fabricate) | contracts + tests | OPEN |

---

## Rules

1. **No row is "closed" until installed conversion** in an authorized signed release (Internal.33). Source-merge ≠ shipped.
2. Sidecar-probe items (INB-13/14/19/32) need a capability probe + contract revision BEFORE UI work is scheduled.
3. Contract tests are design law: adaptation goes code-side (see F-01: media direction-neutrality contract enforced by `voice-note-player.test.ts:72`).
4. New Founder findings get an `F-xx` row with screenshot reference; never fold them silently into INB/AI rows.

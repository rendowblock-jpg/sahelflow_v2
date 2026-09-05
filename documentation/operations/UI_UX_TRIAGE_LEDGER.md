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
| F-04 | Chat delete STILL fails on installed Internal.33 — dialog/toast: `INVALID_DELETE_REQUEST — local contract violation — 1 id(s), offending lengths [69] (max 64)` | Confirmed: a legitimate 69-char conversation id in the real store vs the cuid-era 64-char bound in BOTH the server schema (`chats/delete/route.ts` `z.string().max(64)`) and the client pre-flight (`DELETE_CONTRACT_MAX_ID_LENGTH = 64`) — the id could never delete | **DONE (source, branch `fix/internal33-founder-findings-r1` @ `6ac26cf`, PR #391)** — bound follows the projection's id space: 256, matching the sibling provider-shape contracts (assignment `conversationId`, `jid`, `to`, `waMessageId`); tests pin 300-char rejection + 69-char deletion; converts on installed observation |
| F-05 | Gemini key accepted (verify OK) but every AI chat turn dies with "تعذر إنشاء إجابة. أعد صياغة سؤالك" | Confirmed: thinking-enabled flash models spend output on internal reasoning BEFORE visible text; the chat body's `maxOutputTokens: 2048` starved visible answers into empty candidates (`finishReason MAX_TOKENS`) — same failure class the D1 round-3 verify probe fixed at 8 tokens, never applied to chat; the old copy then blamed the user's phrasing | **DONE (source, same branch @ `afb93cb`, PR #391)** — chat budget 2048→8192; stream parser captures PII-free terminal shape; empty-visible-text turns yield a coded error naming the truth (thought-budget exhaustion / policy refusal with blockReason / empty) in AR/FR/EN, stream + non-stream; converts on installed observation |
| F-06 | The AI Agents page is "not top tier class AAA in any shape or form" (installed Internal.33 screenshot) | Scope corrected by the founder: NOT colors/motion/CSS — the page is functionally incomplete. Confirmed by audit: (1) capabilities invisible — the only abilities copy was a stale 5-item sentence shown only while setup is incomplete while the agent has 29 presentable tools; (2) no agents presentation — one unnamed "Assistant" with no workforce view; (3) start surface blind to the shop — canned starter strings, static non-clickable chips; (4) approval loop hidden — shop-wide pending proposals only visible ≥1500px and the header badge counted the current session only; (5) the model got zero shop context (no date, no live counts) | **DONE (source, branch `fix/internal33-founder-findings-r1`, PR #391)** — capability truth: GET `/api/ai/capabilities` projects the SAME central policy map the registry/proposal runtime enforce, fail-closed (`AI_CAPABILITY_GROUP_*` throws on drift), 6 job groups (orders/customers/products/delivery/insights/conversations), blocked tools omitted, sensitive abilities marked "needs approval"; honest briefing: 5 independently-nullable counts (pendingOrders, ordersToday, lowStockProducts, pendingDeliveries, pendingProposals) — failures render nothing, never a fabricated zero; start surface: Abilities workforce panel + real counts on starter cards; approval loop surfaced: shop-wide pending strip + header badge across widths; model context: presentation-only date+counts snapshot in the system instruction (stream + non-stream, non-blocking, declared non-authority); stale capability sentence replaced in AR/FR/EN; 2 pre-existing type errors fixed (`AiDecisionLocale` prop, invalid `workspace.copy("setupAttention")`); 10 new tests (4 capability-group coverage + 6 functional contract pins) — converts on installed observation |
| F-07 | Inbox header chrome above the chat list "doesn't look good at all" (installed screenshot: counts rendering over the icon cluster) | Confirmed: five `flex-1` desk pills crushed against three `size-8` icon buttons in one 430px-class row — localized labels truncate into the counts and collide with the icons | **DONE (source, same branch @ `45a9de0`, PR #391)** — search + unassigned/filter/select share the top row; pills own their full width; all `data-inbox-*`/aria contracts preserved (130/130); converts on installed observation |
| F-08 | Overlap when trying to delete a chat (select-mode chrome collides, installed screenshot) | Confirmed: select-toolbar action buttons had no shrink protection — the destructive delete control could compress into neighboring chrome mid-delete at real widths | **DONE (source, same branch @ `45a9de0`, PR #391)** — toolbar buttons `shrink-0`; select-entry hides while selecting; converts on installed observation |

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
| INB-11 | History pagination ("load older") + list virtualization | thread + `messages` route | **DONE (source, waves 9-b + 13)** — composite-cursor pagination shipped in wave 9-b; render-window virtualization shipped in wave 13 (bottom-anchored 80/60 window, IntersectionObserver growth, scroll-true re-anchoring, unread-divider offset, full materialization on search/quote jumps) |
| INB-12 | Pin / mute / archive conversation states | queue + prisma model | **DONE (source, wave 15)** — additive columns (pinnedAt/mutedUntil/archivedAt + archive index), server-projected state truth with a mute horizon, owner-gated partial PATCH route, archive pill with archive-aware counts, pinned-first stable ordering, per-row badges + state menu with optimistic rollback |
| INB-13 | Reactions | thread (+sidecar capability) | BLOCKED (sidecar probe) |
| INB-14 | Message delete-for-everyone | thread (+sidecar) | BLOCKED (sidecar probe) |
| INB-15 ||| **DONE (source, wave 1)** — clickable quotes → jump + ring highlight; honest not-loaded hint |
| INB-16 | Link previews | media pipeline | **DONE (source, wave 12)** — server-side OpenGraph card with full SSRF discipline (scheme/credential/port allowlist, per-hop DNS re-validation, manual redirects ≤3, 64 KiB/4s bounds, TTL LRU); client card is viewport-gated and renders nothing until real metadata exists |
| INB-17 ||| **DONE (source, wave 2)** — hover mark-unread quick action (row-relative, valid DOM) |
| INB-18 ||| **DONE (source, wave 2)** — j/k/Arrows cursor + Enter open |
| INB-19 | Real avatars (profile photos) | queue/thread (+sidecar) | BLOCKED (sidecar probe) |
| INB-20 ||| **DONE (source, wave 9-b)** — chats route projects team-directory assignee display names; unknown ids fall back to honest generic label |
| INB-21 ||| **DONE (source, wave 2)** — filter popover: priority + label slices |
| INB-22 ||| **DONE (source, wave 2)** — bulk mark-read + resolve, allSettled + toasts |
| INB-23 ||| **DONE (source, wave 2)** — datetime-local + future-date validation |
| INB-24 | Voice recording gestures (lock-to-record, slide-cancel, preview) | `use-voice-recorder.ts` | **DONE (source, wave 11)** — pure gesture decisions (hold-to-record, slide-up-to-lock at 48px, direction-neutral slide-to-cancel at 96px, <500ms tap keeps the persistent take + keyboard path), review-before-send surface through the shared VoiceNotePlayer, remux moved to confirm time; durable path unchanged |
| INB-25 ||| **DONE (source, wave 9-b)** — multi-select file/image pickers walk files sequentially; one declared-or-sniffed type decision per file |

### P3 — Perf / code quality (invisible to Founder, visible in feel)
| ID | Item | Target | Status |
|---|---|---|---|
| INB-26 ||| **DONE (source, wave 9-b)** — `MessageBubble` memoized with narrow attachment comparator + stable per-conversation callbacks |
| INB-27 | Split 2,606-line god hook into chat/messages/drafts/outbox hooks | `use-inbox-workspace.ts` | **DONE (source, 2026-09-03 session)** — the hook family now lives in `src/hooks/inbox/`: `inbox-workspace-shared.ts` (bounded constants, media-send specs, pure projections, delete-rejection summarizer), `use-inbox-shared-refs.ts` (the seven cross-concern refs), `use-inbox-chat-queue.ts` (canonical load + durable fallback + read-state writes + INB-12 state mirror + queue projections), `use-inbox-drafts.ts` (revisioned draft queue, autosave, lifecycle flush), `use-inbox-thread.ts` (generation-guarded loads, additive history paging, selection, WhatsApp-class tail anchoring), `use-inbox-outbox.ts` (shared send gate, INB-28 factory, durable effect monitor, INB-29 retry, truthful uploads) and `use-inbox-transport.ts` (socket handlers, bounded live-recovery poll, connect/logout, QR refresh). `use-inbox-workspace.ts` remains the composition root with the exact historical return shape — zero component-consumer changes; every function body moved verbatim (F-04's 256-char delete bound ported onto the shared layer). The 10 source-pin contract files were re-anchored to their canonical modules with identical invariants. Evidence: targeted suite 203/203 across 26 files in a fresh sandbox, full-project `tsc --noEmit` 0 errors, ESLint 0 errors (one pre-existing verbatim `no-non-null-assertion` warning retained inside the untouched filter body) |
| INB-28 | Collapse 4 duplicated ~200-line send functions into one factory | `use-inbox-workspace.ts` | **DONE (source, wave 13)** — one `createMediaSender` factory + a module-level MEDIA_SEND_SPECS table; behavior byte-identical (bounded files, optimistic message + quoted provenance, progress/cancellation, effect-key reconciliation, pre-effect abort, audio-without-caption truth) |
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
| AI-13 | Thumbs feedback → extraction-metrics-style quality loop | canvas + API | **DONE (source, wave 14)** — additive `AiMessageFeedback` table (unique per message, cascade, value+createdAt index) with migration; gated feedback route (auth, ownership 404s, upsert/clear); truthful thumbs on settled answers with optimistic rollback; durable truth lives in the table for the quality loop |
| AI-14 ||| **DONE (source, wave 9-a)** — grounded chips derived ONLY from real tool results; prefill composer, anchored dismissal |
| AI-15 ||| **DONE (source, wave 9-a)** — edit user message → composer prefill + editing notice → truncate & re-stream |
| AI-16 ||| **DONE (source, wave 9-a)** — all parallel function calls collected, executed, and returned to the model; every card rendered |
| AI-17 ||| **DONE (source, wave 6)** — isComposing guard (char counter still OPEN) |
| AI-18 ||| **DONE (source, wave 9-a)** — 45s inactivity watchdog aborts via stop path (partial persists); localized recoverable AI_STREAM_TIMEOUT |
| AI-19 ||| **DONE (source, wave 9-a)** — GET /api/ai/actions shop-wide inbox; review panel shows pending-from-other-sessions with session labels |
| AI-20 ||| **DONE (source, wave 9-a)** — panel populated: cross-session pending + recent decisions timeline from real proposal rows; truthful empty states |
| AI-21 | Composer attachments (sellers screenshot orders; extraction stack exists but unreachable from agents composer) | canvas + extraction lib | **DONE (source, wave 11)** — visual extraction path sharing the text extractor's bounded schema verbatim (JPEG/PNG/WebP, 10 MiB, sniffed magic numbers, no regex fallback for pixels); bounded multipart `/api/extraction/image` with the identical consent gate + per-user rate limit; composer attach/paste with a review-first summary appended to the DRAFT — extraction never auto-sends |
| AI-22 ||| **DONE (source, wave 9-a)** — / focus composer, Esc stop/cancel-edit, Alt+↑/↓ session nav, Ctrl+Enter approve focused card; desktop hint row |

### P2 — Panels / polish
| ID | Item | Target | Status |
|---|---|---|---|
| AI-23 ||| **DONE (source, wave 6)** — aria-busy on streaming log (two-step delete announce still OPEN) |
| AI-24 ||| **DONE (source, wave 6)** — 3-pane layout skeleton |
| AI-25 | Unconfigured state: capability explainer (reuse ~25 dead copy keys) + delete dead keys + legacy `ai.*` namespace | `ai-workspace.ts`, locales | **DONE (source, wave 10)** — StartSurface renders the capability explainer when setup resolves not-ready (adopted capabilities sentence + 4 tool-anchored chips, truthful seller-owned-key privacy note, `/settings?group=intelligence` CTA; copy adopted into the ai-decision-workspace runtime authority ×3); all 37 dead legacy `ai.*` locale keys deleted ×3 after a zero-reference repo scan (parity 2826×3); launchpad contract pins explainer rendering, per-locale resolution and the namespace retirement |
| AI-26 | Truthful model/quality signal (contract today forbids usage metadata — revisit deliberately, never fabricate) | contracts + tests | **DONE (source, wave 12)** — the done event carries an optional signal built ONLY from the provider's own usageMetadata + the served model id; client parse drops malformed shapes; the line renders only when the provider reported the turn; ephemeral by design (history rows show none); cost estimation stays forbidden; the blanket no-usage contract deliberately superseded with disposition |

---

## Rules

1. **No row is "closed" until installed conversion** in an authorized signed release (Internal.33). Source-merge ≠ shipped.
2. Sidecar-probe items (INB-13/14/19/32) need a capability probe + contract revision BEFORE UI work is scheduled.
3. Contract tests are design law: adaptation goes code-side (see F-01: media direction-neutrality contract enforced by `voice-note-player.test.ts:72`).
4. New Founder findings get an `F-xx` row with screenshot reference; never fold them silently into INB/AI rows.

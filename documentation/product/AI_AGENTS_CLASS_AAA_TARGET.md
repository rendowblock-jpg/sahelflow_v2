# AI Agents — Class-AAA replacement target

> **Status:** PROPOSED — Founder approval required before broad production reconstruction
> **Branch:** `agent/ai-agents-class-aaa-reconstruction`
> **Base authority:** protected `main` `dfbb5c22f393850d4dbbd19538fa3a5fff4371af`
> **Scope:** product/interaction target for the `/agents` workspace only. This proposal does not amend AI, permission, business, provider, release, or data authority.

## 1. Product intent

AI Agents becomes a **seller decision workspace**, not a generic chat application with sidebars.

The north-star job is:

> Ask about the current shop → see evidence-shaped answers → inspect the affected records → review any sensitive proposed change → explicitly approve the exact persisted proposal when appropriate.

The experience must feel like quiet operational intelligence: dense enough for real work, calm enough to trust, and explicit about what is saved, what is live-provider-dependent, and what would change the business.

## 2. Protected authority that presentation must preserve

The reconstruction may change layout and interaction, but must preserve:

- route authorization through `ai.use` and the licensed `ai_chat` feature;
- seller-owned Gemini configuration and consent without exposing/decrypting the key in UI projections;
- durable local AI sessions/messages as history authority;
- abort/generation-safe session loading and stopped-stream behavior;
- SSE text/tool/proposal streaming and typed tool-result presentation;
- explicit `AI_RESPONSE_NOT_PERSISTED` truth when a delivered answer is not durable;
- provider/setup degradation without erasing saved history;
- exact persisted proposal + server-issued digest approval;
- `approvals.approve` plus trusted-actor/current-state revalidation at execution;
- conflict/expired/retry/recovery states and audited result authority;
- no chat phrase such as “yes” becoming execution authority;
- no autonomous owner-authority mutation;
- completed shared RTL/start-end/bidi/accessibility contracts.

## 3. Replacement information architecture

### 3.1 Common desktop (Founder reference 1366×768)

Use a **two-pane full-height work surface** with no nested rounded “app inside the app” frame.

**Logical start — Work history / 17rem–18rem**

- `New analysis` is the primary creation action.
- Durable sessions are grouped/scannable by recency.
- Each row shows a useful title, one readable preview and time; no important 9/10px operational copy.
- A visible `Needs review` count/status may decorate sessions that contain pending/conflicted/failed sensitive proposals.
- Search/filter can be added only when backed by current durable session authority; do not invent unsupported global AI search.

**Primary center — Decision canvas / dominant width**

- Session title + quiet durable/provider state in the header.
- Conversation/evidence stream is the primary surface.
- Assistant prose, typed tool evidence and proposed actions are visually distinct but remain in chronological context.
- Tool results use product-shaped evidence blocks with links to the real SahelFlow surface.
- Sensitive proposals are first-class decision objects near the answer that produced them, not hidden in a generic context rail.
- Composer stays anchored at the bottom and remains the fastest common path.

**Progressive logical end — Review & evidence**

- At 1366px, open from one explicit `Review & evidence` action using shared `SheetContent side="end"`.
- At genuinely wide layouts (target `min-width: 1500px`), the same surface may become a persistent inline-end rail around 19rem–20rem.
- The surface contains pending/failed/conflicted proposals first, then provider/privacy/capability facts as secondary context.
- Healthy provider state is quiet. Missing consent/key, unavailable provider, non-durable answer and action-history failure are prominent only when relevant.

### 3.2 Start state / new analysis

Do **not** keep the current permanent horizontal four-button launchpad above every session.

When no session is selected or a new session is empty, the center canvas becomes a calm start surface:

- concise explanation of what SahelFlow AI can safely do;
- 3–4 representative seller jobs such as pending-order review, revenue explanation, return-risk analysis and product opportunity;
- selecting a job creates/uses a durable session through the same session/message authority;
- normal free-form composer remains available;
- once real work begins, suggestions recede instead of consuming permanent chrome.

### 3.3 Proposal review hierarchy

A sensitive proposal must answer, in this order:

1. **What will change?** Product-shaped summary of affected customer/order/product/state/value.
2. **Why is it proposed?** Context from the assistant/evidence when available, without fabricating rationale.
3. **What is the current decision state?** Awaiting approval / executing / succeeded / failed / conflict / expired / rejected.
4. **What can the operator do now?** Review and approve, retry with recovery reason, or request a fresh proposal.
5. **Technical proof, progressively disclosed:** digest prefix, expiry and other exact-bound metadata.

Approval remains bound to the exact server-issued digest. The UI never offers an approval action when current server state says it is not approvable.

## 4. Interaction model

- Selecting a session cancels incompatible in-flight generation and loads its durable messages + action history without stale-response overwrite.
- Creating a session immediately makes it the active durable workspace.
- Streaming auto-follow occurs only while the operator remains near the tail; manual reading is never fought by forced scroll.
- `Stop` interrupts generation without pretending the incomplete answer is complete.
- Provider/setup errors retain durable history and provide a direct recovery path.
- A non-persisted delivered answer carries a durable-warning treatment attached to that answer and survives visually until the session changes/reloads.
- Proposal approval/retry exposes progress and converges to current server projection after conflicts/failures.
- Product links from tool evidence navigate to the real record-owning workspace; raw JSON is never the seller presentation.
- Motion is short and functional: pane/sheet transitions, streaming/result arrival and status convergence only; reduced-motion remains immediate.

## 5. Mobile / narrow layout

Use a deliberate drill-in model:

1. Work history / new analysis.
2. Decision canvas.
3. Review & evidence as semantic inline-end Sheet.

- Back always returns to the previous product level without losing durable work.
- No three-column compression.
- Composer remains reachable above the software keyboard.
- Proposal approval remains explicit and never collapses into a tiny icon-only action.

## 6. Arabic / RTL target

Arabic receives equal information depth, not a mirrored approximation.

- Work-history pane is logical start → physical right.
- Review/evidence is logical end → physical left.
- Shared semantic `SheetContent side="end"` owns physical placement; locale-coded `left/right` is prohibited.
- Directional arrows/chevrons follow shared directional semantics.
- User/assistant text keeps `dir="auto"` where content is mixed.
- Structurally LTR technical values (proposal digest, identifiers where applicable) are isolated locally, never by forcing an entire panel LTR.
- DZD and dates use locale-aware formatting while preserving unambiguous technical identity.
- Arabic typography uses the shared product type system and readable metadata sizes.

## 7. Density and typography

- No important operational information at 9px or 10px.
- Body/answer text target: 14px+ with comfortable line height.
- Secondary metadata target: 12px minimum unless the shared design system explicitly proves an accessible exception.
- Session rows are compact but readable; one strong title + one preview + timestamp beats icon/card ornament.
- Avoid excessive nested cards. Use borders/background shifts only to clarify evidence, approval, degradation or hierarchy.

## 8. State matrix

The replacement must intentionally cover:

- setup checking;
- consent missing;
- key missing;
- provider unavailable/rate limited;
- no durable sessions;
- new empty session;
- loading session/history;
- populated durable session;
- streaming answer;
- stopped/interrupted answer;
- tool running / succeeded / failed;
- delivered but not persisted answer;
- no sensitive actions;
- action-history unavailable;
- proposal awaiting approval;
- approving/executing;
- succeeded;
- failed + safe retry reason;
- conflict requiring fresh proposal;
- expired/rejected;
- permission/license denial;
- mobile drill-in;
- EN/FR/AR and RTL/mixed-bidi;
- 1366×768 and narrow-window behavior;
- keyboard/focus/reduced-motion paths.

## 9. Explicit removals from the rejected concept

Broad reconstruction should remove these presentation assumptions rather than beautify them:

- permanent top `AiOperationalLaunchpad` strip across every session;
- nested rounded/bordered full-workspace mini-app frame;
- always-visible 20rem generic `Context` rail at ordinary desktop sizes;
- static “capabilities” card as primary permanent chrome;
- proposal review separated from the answer/context that produced it;
- 9/10px operational labels and timestamps as normal hierarchy;
- locale-coded physical Sheet side.

The underlying focused prompts, session APIs, provider setup projection, tool-result routes and proposal authority may be reused behind the replacement interaction model.

## 10. Founder approval gate

Broad production reconstruction begins only after this target is explicitly approved. Approval means the product direction above—not every pixel—is accepted as the implementation authority for the AI Agents wave.

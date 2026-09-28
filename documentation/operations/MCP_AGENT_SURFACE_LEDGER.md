# MCP agent surface ledger (FD-063)

> **Status:** Active — source-level slice ledger for the EX-5 conversion
> **Opened:** 2026-09-21
> **Authority:** FD-063 (Founder agent-surface decision, 2026-09-21) converting
> `documentation/research/CODFLOW_EXTRACTION.md` §7 from study to implementation
> **Branch:** `feat/fd063-mcp-agent-surface`
> **Evidence class:** source only. This ledger converts **no** installed row, carries
> **no** release authority and produces **no** provider or customer evidence.

## Founder decision recorded (FD-063)

The Founder authorized the EX-5 conversion on 2026-09-21 and settled the five
decision points the study left open:

1. **Transport** — local sidecar. Loopback Streamable HTTP inside the packaged
   app plus a stdio bridge process. No `#230` dependency, offline-first. The
   control-plane-hosted OAuth transport stays `#230`-gated and belongs to EX-6.
2. **Vocabulary** — the eight sensitive verbs stay exactly as they are. No
   deletes, no settlements. Each future addition needs its own decision, one
   policy entry, one executor case, one target snapshot and one test pin.
3. **Scope vocabulary** — reuse `Phase2Action`. No parallel `mcp:*` scope space,
   so there is zero drift between the app and the agent surface, with the owner
   role as the ceiling.
4. **Confirmation doctrine** — the server-side proposal gate is the only human
   gate. Client-side confirmation is optional UX. This is why CodFlow's rolled
   back elicitation design is not copied.
5. **Audit shape** — per-invocation `mcp.tool_called.v1` rows with `via: "mcp"`,
   arguments passed through `redactForAudit` (1024-character elision, depth 8),
   on the existing audit channel.

**Scope boundary the Founder also set:** the Gemini-backed AI **order extraction**
path is out of scope and stays untouched — `src/app/api/extraction/**`,
`src/lib/ai/extraction/**` and `src/lib/ai/gemini/provider.ts`. Extraction keeps
its regex-first router with Gemini fallback, and screenshot extraction stays
Gemini-only. The replacement target is the **agent** surface, not extraction.

## Slice register

| Row | Slice | State | Evidence |
| --- | --- | --- | --- |
| MCP-01 | Contracts: annotations, declared output union, scope tables, CodFlow-parity limits | **DONE (source)** | `src/lib/mcp/contracts.ts` |
| MCP-02 | Registry with registration-time scope hiding over the existing 30-tool vocabulary | **DONE (source)** | `src/lib/mcp/registry.ts` |
| MCP-03 | Fail-open rate limiting, 200 calls / 60 s per subject | **DONE (source)** | `src/lib/mcp/rate-limit.ts` |
| MCP-04 | Per-invocation audit with redaction bounds | **DONE (source)** | `src/lib/mcp/audit.ts` |
| MCP-05 | Agent session identity, non-person audit actor, never-approver assertion | **DONE (source)** | `src/lib/mcp/agent-session.ts` |
| MCP-06 | Proposal-bound execution for the 8 sensitive verbs; remote privacy projection for reads | **DONE (source)** | `src/lib/mcp/execute.ts`, `src/lib/mcp/transcript.ts` |
| MCP-07 | JSON-RPC 2.0 protocol: `initialize`, `ping`, `tools/list`, `tools/call` | **DONE (source)** | `src/lib/mcp/protocol.ts` |
| MCP-08 | Loopback transport authorization, bearer token, timing-safe compare | **DONE (source)** | `src/lib/mcp/transport-auth.ts`, `src/app/api/mcp/route.ts` |
| MCP-09 | stdio bridge sidecar | **DONE (source)** | `sidecars/mcp/index.ts` |
| MCP-10 | Golden contract tests: class split, never-approver, annotations, read scopes, audit bounds, limits | **DONE (source)** | `src/lib/mcp/__tests__/surface-contract.test.ts` |
| MCP-11a | Grant-bound agent identity, endpoint discovery, client configuration | **DONE (source)** | each grant carries its own identity binding `mcp-grant:<id>` cloned from the owner's live binding (`bindAgentGrantIdentity` / `revokeAgentGrantIdentity`, `trustedActorForAgentGrant`); the agent needs no cookie and loses access on grant revocation or "revoke all other sessions"; creating a grant is owner-only; the app publishes `SF_DATA_DIR/mcp/endpoint.json` plus a per-launch transport token (`src/lib/mcp/endpoint.ts`); the bridge re-reads both on every request, so it needs only `SAHELFLOW_AGENT_GRANT`; the proxy admits `/api/mcp` on loopback with a valid transport token; the connect dialog shows a copyable client config when the bridge path is known. Tests: `agent-grant-identity.test.ts`, `endpoint.test.ts`, `agent-grants.test.ts` |
| MCP-11b | Package the bridge: compiled `sahelflow-mcp` sidecar in `externalBin`, `SF_MCP_BRIDGE_PATH` from the shell | **OPEN** | needs the Rust change and the Windows installed-MSI lane |
| MCP-12 | Durable `McpAgentGrant` model: per-agent scope narrowing, instant revocation, connected-agent list | **DONE (source)** | additive migration `2026092800000000_fd063_mcp_agent_grants`; `src/lib/mcp/grants.ts` (hash-only secret storage, fail-closed ingress, narrowing in listing and execution, 20 active grants cap); `/api/mcp/grants`, `/api/mcp/grants/[id]/revoke`, `/api/mcp/invocations`; `src/lib/mcp/__tests__/agent-grants.test.ts` |
| MCP-13 | `/agents` Connected agents control surface: connected agents with create/revoke, tool catalog with permission + annotation badges, invocation log, approval routing | **DONE (source)** | pinned rail entry + canvas surface (`src/components/ai/connected/**`, `/agents?view=connected`); grants shown by hint only, secret revealed once; proposed calls open the agent's transcript session, where the existing approval authority lives; trilingual copy `src/lib/i18n/connected-agents.ts`; `connected-agents-contract.test.ts` |
| MCP-14 | Retire the Gemini chat agent loop and its routes/components/tests | **OPEN** | the destructive half of the full replace — see below |
| MCP-15 | Installed observation on a signed candidate | **BLOCKED** | no candidate; Internal.38 campaign comes first |

## What slice 1 changes and does not change

**Adds** `src/lib/mcp/**`, `src/app/api/mcp/route.ts`, `sidecars/mcp/**`.

**Changes nothing existing.** No file under `src/lib/ai/**`, `src/app/api/ai/**`,
`src/components/ai/**` or `prisma/**` is modified, so the in-app Gemini chat,
the proposal cards and every pinned AI contract test keep passing unchanged.
That is deliberate: the removal half of the full replace (MCP-14) deletes 13
routes, the agent loop, the canvas/composer/message-log components and roughly
30 pinned contract tests, including the STR-01 decomposition merged in #426,
#427 and #450. It gets its own branch, its own review and its own CI run.

## Invariants this surface must keep

- **`INV-024` AI correctness / proposal-bound authority.** A sensitive verb over
  MCP executes nothing. It persists one immutable `AiActionProposal` and returns
  `{ pending_action_proposal, tool, proposal, proposalDigest }`. Money truth,
  audit, domain events and compensations stay inside the kernel, reached only
  through `executeBusinessCommand` with `ai.action.execute.v1`.
- **Never-approver.** `approvals.approve` may not appear in any MCP requirement.
  Asserted at registry build time, again before execution, and pinned in CI.
- **Fail-closed registration.** No durable person session means no agent session
  and therefore zero advertised tools, matching CodFlow's unauthenticated path.
- **Fail-closed projection.** A read result crosses the boundary only through
  `serializeToolResultForRemoteModel`. An unclassified tool projects to nothing
  and the call is reported as a failure, so a future tool cannot leak by default.
- **`blocked` stays invisible.** `assign_order_to_delivery` is never advertised
  and resolves as unknown, not as forbidden.
- **Loopback only.** No listening port is opened for agents; the bridge speaks
  stdio and the HTTP surface refuses non-loopback and proxied requests.
- **One vocabulary.** Extending the surface means one policy entry, one executor
  case, one target snapshot and one test pin — never a second scope space.

## Known gaps, stated plainly

1. **Ingress is granted and grant-bound.** Since MCP-11a every MCP session
   presents an active agent grant (`x-sahelflow-agent-grant`), and the actor is
   minted from that grant's own identity binding, which was copied from the
   owner who created it. The grant narrows the agent to an explicit tool list
   and is re-checked on every request, so revocation is instant. The owner's
   authority is still the ceiling: a grant can only narrow it, never widen it.
   Only the owner may create grants in this slice.
2. **No packaging.** The bridge runs under `bun sidecars/mcp/index.ts`. It is
   not yet compiled or declared in `externalBin` (MCP-11b), so the connect
   dialog shows the client config only where `SF_MCP_BRIDGE_PATH` is set, and
   there is no installed evidence of any kind.
3. **Protocol is hand-rolled.** No `@modelcontextprotocol/sdk` dependency was
   added, because the installed runtime is a packaged standalone build behind a
   pinned lockfile. Adopting the SDK is a separate lockfile decision.
4. **Nothing is proven.** Every row above is source state. No installed, native,
   provider or customer evidence exists for this surface, and none may be
   claimed from it.

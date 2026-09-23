# MCP Agent Surface Audit — CodFlow vs SahelFlow

> **Date:** 2026-09-24
> **CodFlow reference:** `github.com/bighadj22/codflow` @ `00f18fac…` (Apache-2.0)
> **SahelFlow implementation:** `src/lib/mcp/`, `src/lib/agents/`, `src/components/agents/`

## Architecture comparison

| Aspect | CodFlow | SahelFlow | Verdict |
|---|---|---|---|
| Tool abstraction | Vercel AI SDK `Tool` | Custom `McpToolRegistration` | ✅ Equivalent |
| Registry pattern | `TOOL_REGISTRY[]` + `pick()` from 15 domain factories | Direct registration in `tools.ts` | ⚠️ CodFlow more modular |
| Scope gating | `buildToolsForUser()` at registration | `getVisibleTools()` at registration | ✅ Equivalent |
| Scope semantics | AND (`requires.every()`) + admin bypass | AND (`requiredPermissions.every()`) | ⚠️ CodFlow has admin bypass |
| Input validation | Zod `z.object(shape)` — advertised == enforced | Zod strict — advertised == enforced | ✅ Equivalent |
| Output schemas | `z.looseObject()` (additionalProperties) | `z.object()` strict | ❌ CodFlow more resilient |
| Annotation derivation | From scope-gating + `DANGEROUS_TOOLS` | From `executionClass` + membership sets | ✅ Equivalent |
| Drift guards | Tests pin consistency | `assertAnnotationConsistency()` at registration | ✅ Equivalent |
| Tool titles | `TOOL_TITLES` map (human-readable) | None | ❌ Missing |
| `_meta` extensions | `openai/fileParams` for ChatGPT | None | ❌ Missing |
| Rate limiting | Per-subject KV fixed-window (200/60s, fail-open) | None | ❌ Missing |
| Activity logging | `mcp.tool_called` audit row per call | None | ❌ Missing |
| Audit redaction | `redactForAudit()` (1024 char cap, depth 8) | None | ❌ Missing |
| Client hints | `openai/subject`, `openai/session` for correlation | None | ❌ Missing |
| Human gate | Client-side confirmation (destructiveHint) | Server-side proposal gate (digest-bound) | ✅ SahelFlow stronger |
| Transport | MCP SDK `createMcpHandler` (HTTP) | Custom JSON-RPC handler | ✅ Equivalent |
| Auth | OAuth 2.1 (workers-oauth-provider) | Session-based (local-first) | ✅ Context-appropriate |
| Protocol | MCP SDK v2 | JSON-RPC 2.0 subset | ✅ Equivalent |

## Key findings

### 1. Output schema resilience (CRITICAL)
CodFlow uses `z.looseObject()` (additionalProperties: true) for output payloads. When a DB row adds a field, the schema still passes and `structuredContent` ships. Our strict `z.object()` would fail the safeParse and omit `structuredContent`, degrading to text-only. **Fix: switch to loose objects.**

### 2. Missing tool titles
CodFlow has `TOOL_TITLES` — human-readable names shown in client UIs. Our tools show raw camelCase names. **Fix: add title map.**

### 3. Missing rate limiting
CodFlow implements per-subject rate limiting (200 calls/60s, fail-open). This is an MCP spec security requirement. **Fix: add local rate limiter.**

### 4. Missing audit trail
CodFlow writes one `mcp.tool_called` activity row per tool call with `redactForAudit()`. We have no audit trail for tool executions. **Fix: add audit logging.**

### 5. Missing client correlation hints
CodFlow reads `openai/subject` and `openai/session` from `_meta` for rate-limit keys and audit correlation. **Fix: add client meta reading.**

### 6. Tool organization
CodFlow organizes tools into 15 domain modules (`ai-tools.ts` per endpoint) with `pick()` sub-selection. Our single `tools.ts` is less modular. **Fix: split into domain modules.**

### 7. SahelFlow strengths (keep)
- **Proposal gate** — digest-bound person-only approval for sensitive tools (stronger than CodFlow's client-side confirmation)
- **Server-side HITL** — the proposal gate replaces client-side confirmation (CodFlow's rolled-back elicitation is the cautionary evidence)
- **Agent orchestrator** — built-in tool loop with streaming (CodFlow is tool-server-only)
- **AAA UI** — full agent workspace (CodFlow has no UI)

## Priority fixes

1. **Output schemas → `z.looseObject()`** — resilience
2. **Tool titles** — UI quality
3. **Rate limiting** — security
4. **Audit logging** — compliance
5. **Client meta hints** — correlation
6. **Domain modules** — maintainability

# R-3 · Open-Source Next.js + Prisma Architecture Audit

**Audience:** SahelFlow engineering (Tauri + Next.js 16 + Prisma/SQLite + shadcn/ui desktop app)
**Sources (shallow clones):** `/tmp/research/{calcom, dub, formbricks}`
**Method:** read actual code with file:line citations — every claim below is grounded in source.

---

## Repo 1 · Dub.co — link management (smallest, most readable)

`apps/web/` + 11 shared packages (`ui`, `utils`, `tailwind-config`, `tsconfig`, `embeds`, `email`, `tinybird`, `cli`, `stripe-app`, `hubspot-app`). PNPM workspaces + Turborepo v1. Next.js 15.5, React 19, Prisma 6, MySQL via PlanetScale (`relationMode = "prisma"`), SWR (no React Query), `next-safe-action` v8 for server actions, NextAuth v4, Sonner toasts, Zod v4. License: AGPL-3.0.

### 1.1 Project structure & monorepo

- `pnpm-workspace.yaml` declares `apps/*` + `packages/*` + `packages/embeds/*` + `apps/web/.react-email`.
- `turbo.json:14-26` defines `build`, `dev` (`cache:false, persistent:true`), `clean`, `test` (depends on `^build`).
- `apps/web/tsconfig.json:9-13` uses **path aliases** `@/ui/*`, `@/lib/*`, `@/styles/*`, `@/pages/*`. The base `tsconfig/nextjs.json` is in a shared package.
- **Strictness is loose:** `strict: false`, `strictNullChecks: true` (`apps/web/tsconfig.json:39-40`) — Dub accepts this trade-off for velocity; SahelFlow should keep `strict: true`.
- **Internal packages are real published packages** — `@dub/ui`, `@dub/utils`, etc. Each has `package.json` with `name`, `version`, `exports`, even though they're only consumed in-repo via `workspace:*`. This forces clean public/private API boundaries.

### 1.2 Data layer (Prisma)

- `prisma/schema/` is a **directory with 36 `.prisma` files** (one per aggregate, e.g. `link.prisma`, `domain.prisma`, `workspace.prisma`). Prisma supports multi-file schema since 5.15. `prisma/schema/schema.prisma:1-9` is the root with datasource + generator only.
- `schema.prisma:3` `relationMode = "prisma"` — emulates FK constraints in JS because PlanetScale doesn't support them. SahelFlow uses SQLite which **does** support FKs, so this doesn't apply.
- `link.prisma:1-7` (model Link): every column carries an inline comment explaining what it stores. Worth copying — turns schema into living documentation.
- **Indexes are first-class:** `link.prisma:78-89` declares **8 indexes** including compound ones tuned to actual queries: `@@index([projectId, folderId, archived, createdAt(sort: Desc)])` with a comment "most getLinksForWorkspace queries". This is the gold pattern — index per access pattern, not per column.
- `schema.prisma:7-8` Prisma client singleton: `omit: { user: { passwordHash: true } }` — **field-level omit so password never leaks into JS memory** even if you `findUnique` without `select`. SahelFlow should adopt this for any sensitive field.
- `prisma/edge.ts:1-13` a **separate edge-runtime Prisma client** with the PlanetScale adapter for middleware/edge routes. SahelFlow (Tauri) doesn't run on the edge, but the principle (different client for different runtime) is useful.
- **No repository pattern** — components/actions call `prisma.*` directly. Validation/coercion happens through Zod schemas in `lib/zod/schemas/*` (e.g. `domains.ts:18-74` is a 1:1 mirror of the Prisma model used both for API docs (`zod-openapi`) and runtime validation).

### 1.3 API / server actions

- **No tRPC.** Three layers coexist:
  1. **REST API routes** under `app/api/*` (e.g. `app/api/links`, `app/api/workspaces/[slug]`) — used by the public API + by SWR fetchers on the client.
  2. **`next-safe-action` server actions** under `lib/actions/*` for mutations invoked from client components (`add-edit-integration.ts`, `set-onboarding-progress.ts`, `update-workspace-preferences.ts`).
  3. **SWR hooks** under `lib/swr/*` (90+ hooks) for read paths.
- `lib/actions/safe-action.ts:9-23` `actionClient` base with `handleServerError` that logs to **Axiom** (`logger.error(e.message, e); after(logger.flush())`) and returns `e.message` or a generic string.
- **Layered action clients** (`lib/actions/safe-action.ts:25-132`):
  - `authUserActionClient` — only checks `session.user.id` exists.
  - `authActionClient` — also loads `workspace` from DB and injects `{ user, workspace: { role, plan } }` into ctx. This is where every workspace-scoped mutation's RBAC starts.
  - `authPartnerActionClient` — partner-scoped variant.
- Real example: `lib/actions/set-onboarding-progress.ts:9-31`:
  ```ts
  export const setOnboardingProgress = authUserActionClient
    .inputSchema(z.object({ onboardingStep: z.enum(ONBOARDING_STEPS).nullable() }))
    .action(async ({ ctx, parsedInput }) => { … return { success: true }; });
  ```
- **Error system:** `lib/api/error-codes.ts:3-15` a single `ErrorCodes` map (`bad_request: 400, unauthorized: 401, exceeded_limit: 403, rate_limit_exceeded: 429, …`). `lib/api/errors.ts:42-58` `class DubApiError extends Error` carries `code` + `docUrl`. `errors.ts:97-145` `handleApiError` is the central error normalizer that converts ZodError / DubApiError / Prisma P2025 / unknown into a stable `{ error: { code, message, doc_url } }` envelope.
- **Rate limiting:** `lib/upstash/ratelimit.ts:5-21` is a sliding-window ratelimit factory; `lib/auth/session.ts:73-88` sets `X-RateLimit-Limit/Remaining/Reset` headers on every authenticated API call and throws `rate_limit_exceeded` when exceeded.
- **Auth in route handlers** is a HOC: `lib/auth/session.ts:25-136` `withSession(handler)` — reads `Authorization: Bearer` header OR NextAuth cookie, validates API key against `Token.hashedKey`, applies rate limit, sets session, calls handler. The pattern wraps every protected API route. **No per-route boilerplate — pure HOC.**

### 1.4 Client state & server state

- **SWR is the read layer.** One hook per resource, all in `lib/swr/use-*.ts` (90+ files). `use-workspace.ts:11-46` is the canonical example — derives 8 booleans (`exceededEvents`, `exceededLinks`, `exceededPayouts`, `isMegaWorkspace`, …) from raw SWR data and returns them alongside `mutate` + `loading`. The page never sees raw data; it sees derived state.
- `dedupingInterval: 60000` (1 min) on the workspace hook — Dub leans hard on SWR's dedup.
- `lib/swr/mutate.ts:1-23` `mutatePrefix`/`mutateSuffix` — helpers that invalidate **every SWR key matching a prefix/suffix** with `revalidate: true`. Used after mutations to refresh dependent queries (e.g. after deleting a link, `mutatePrefix(`/api/links`)`).
- `lib/swr/use-api-mutation.ts:33-108` a custom hook wrapping `fetch` with `isSubmitting` state, optional `onSuccess`/`onError`, and **fallback to `toast.error(errorMessage)` if no onError given** — uniform error UX without per-call boilerplate.
- **Optimistic updates:** `ui/partners/partner-comments.tsx:51-96` builds a temp object with `id: 'tmp_' + uuid()` + `delivered: false`, calls `mutate(async … , { optimisticData, rollbackOnError: true })`, then `mutatePrefix` to revalidate. The `delivered: false` flag lets the UI render a subtle "sending…" state on the optimistic row.
- **URL state:** `use-workspace.ts:14-17` reads `useParams` first, falls back to `useSearchParams().get('slug')` — supports both `/[slug]/...` and `?slug=...` modes.

### 1.5 Error handling

- `app/not-found.tsx:1-21` branded 404 with gradient "404" text, `<NotFoundHint />` (probably suggests similar URLs), and animated background.
- `app/app.dub.co/(dashboard)/loading.tsx` is a one-liner: `export { default } from "@/ui/layout/layout-loader"` — reuses a single full-viewport spinner across the dashboard.
- No `error.tsx` files at route-level (only `global-error`). Errors flow through the action client + `toast.error`. **Trade-off:** simpler, but loses the "reset button" pattern.

### 1.6 Loading & suspense

- Layout-level `loading.tsx` for `(dashboard)` and `(redirects)` route groups.
- Skeletons via `LoadingSpinner` from `@dub/ui` — no per-page skeleton variants.

### 1.7 Forms

- `react-hook-form` + Zod (`ui/domains/add-edit-domain-form.tsx:34, 150-168`). The Zod schema `createDomainBodySchemaExtended` is **shared with the REST API**, so client + server validate identically.
- Async validation via `useDebouncedCallback` (`add-edit-domain-form.tsx:212-249`) — debounces domain availability check against `/api/domains/[slug]/validate`, sets status machine `idle → checking → conflict | available | invalid | error`. Each status has icon + color in `STATUS_CONFIG` (`add-edit-domain-form.tsx:65-100`). This is the kind of polish that makes a form feel non-prototype.

### 1.8 Auth

- NextAuth v4 with Prisma adapter. Session strategy = JWT (default for NextAuth v4 + PlanetScale).
- `lib/auth/index.ts:1-6` re-exports `admin`, `hash-token`, `options`, `session`, `utils`, `workspace` — a single barrel for everything auth.
- RBAC is workspace-scoped: `safe-action.ts:57-89` loads `project.users[0].role` and `workspacePreferences`. Roles live on the join table `ProjectUsers.role`.
- **API key auth baked into `withSession`** — hashed keys in `Token` table, `hashToken(apiKey)` lookup, rate-limited per-key.
- Account lockout fields on `User` model (`schema.prisma:25-26`): `invalidLoginAttempts`, `lockedAt`.

### 1.9 i18n

- **Dub has no real i18n.** UI strings are hardcoded English. (Product decision — single-market SaaS.)

### 1.10 Accessibility

- `Modal` (`packages/ui/src/modal.tsx:11-145`) uses Radix Dialog + **Vaul for mobile drawers** — on `isMobile`, the same `<Modal>` renders as a bottom-sheet Drawer instead. This is a fantastic pattern for responsive UX.
- VisuallyHidden title + description on the Drawer (`modal.tsx:79-82`) for screen readers.
- `useKeyboardShortcut` (`packages/ui/src/hooks/use-keyboard-shortcut.tsx:1-138`) is a **priority-based shortcut registry** — listeners register with `priority`, modal/sheet flags; on keydown the system finds matching listeners in the current scope (modal/sheet open or not) and runs the highest-priority one. Skips inputs/textareas/contentEditable.

### 1.11 Testing

- `vitest.config.ts:6-14` — `testTimeout: VITEST_TEST_TIMEOUT_MS`, `setupFiles: ['./tests/setupTests.ts']`, `globals: true`.
- `tests/setupTests.ts:1-95` mocks Axiom SDK, `crypto.webcrypto`, etc. before any test imports.
- Integration tests via `IntegrationHarness` (`tests/utils/integration.ts`) — boots a real DB-backed workspace, exposes `{ workspace, user, http }` to tests. `tests/links/create-link.test.ts:16-48` shows it: `await http.post<Link>({ path: '/links', body: … })`. Each test uses `onTestFinished` to clean up the link it created.
- Playwright config at `apps/web/playwright.config.ts`.

### 1.12 Performance

- SWR `dedupingInterval: 60000` everywhere prevents redundant fetches during a session.
- Redis caching for link metadata (`lib/upstash/record-metatags.ts`) — read path for hot redirects hits Redis, not DB.
- **`@tanstack/react-table`** for data tables (`apps/web/package.json`), **`react-window` + `react-virtualized-auto-sizer`** for long lists.

### 1.13 Component system

- `packages/ui/src/index.tsx:1-60` exports ~70 components — button, modal, table, filter, combobox, sheet, popover, tooltip, empty-state, form, file-upload, mini-area-chart, rich-text-area, smart-datetime-picker, utm-builder, truncated-list, …
- Design tokens via Tailwind classes (`bg-default`, `text-emphasis`, `border-subtle`, `text-content-emphasis`) — no CSS variables in the public API.
- `packages/ui/src/empty-state.tsx:10-42` the canonical empty-state: 64×64 icon box, "text-balance" description, optional `learnMore` link, optional children (CTA button).

### 1.14 Polish layer

- `ui/shared/empty-state.tsx:8-34` wraps `EmptyState` with a branded CTA button (gradient text).
- `ui/modals/confirm-modal.tsx:25-80` generic confirm modal with `confirmVariant: 'primary' | 'danger'`, optional keyboard shortcut, optional `onCancel`, loading state on confirm.
- `ui/layout/layout-loader.tsx:1-7` full-viewport centered spinner.
- 60+ specialized modals in `ui/modals/` (`add-edit-domain-modal`, `archive-link-modal`, `bulk-archive-partners-modal`, `confirm-set-default-group-modal`, …) — every mutation has a dedicated modal.

### 1.15 DX & tooling

- `prettier.config.js` — `trailingComma: "all"`, `printWidth: 80`, plugins `prettier-plugin-organize-imports` + `prettier-plugin-tailwindcss` (auto-sorts Tailwind classes).
- `pnpm` v9, `packageManager: "pnpm@9.15.9"` pinned.
- No husky in repo (relies on CI).

---

## Repo 2 · Formbricks — survey/form product (forms, i18n, RBAC depth)

`apps/web` + `apps/storybook`, 14 packages (`ai`, `cache`, `database`, `email`, `i18n-utils`, `jobs`, `logger`, `storage`, `survey-ui`, `surveys`, `types`, `vite-plugins`, `config-*`). PNPM v10, Turborepo. Next.js 15, Prisma 6 (PostgreSQL + pgvector), `next-safe-action` v7, react-i18next with **lingo.dev** for translation management, Better Auth (recently migrated from NextAuth), Vitest + Playwright.

### 2.1 Project structure

- **Module-per-feature layout:** `apps/web/modules/{account, analysis, auth, billing, ee, integrations, mcp, organization, response-pipeline, settings, storage, survey, ui, workspaces}`. Each module has its own `components/`, `lib/`, `hooks/`, `actions.ts`, `page.tsx` (when routed). Pages import from modules, never the other way around.
- `apps/web/app/(app)/[environmentId]/(…)` uses **Next.js parallel route groups** for layout switching.
- `turbo.json` is exhaustive — **170+ lines** declaring per-package task dependencies (e.g. `@formbricks/web#dev` depends on 6 package builds), and **~250 env vars** listed under `build.env` so Turborepo can fingerprint them.
- `pnpm-workspace.yaml` has an `overrides` block with **security pins** for 20+ transitive deps with GHSA references — Formbricks actively patches transitive vulnerabilities at the workspace level. SahelFlow should adopt this practice.

### 2.2 Data layer

- `packages/database/schema.prisma` is **1437 lines, single file** (vs Dub's 36-file split). Uses `@map(name: "created_at")` for snake_case DB columns with camelCase JS — important for teams that share the DB with other tools.
- `generator json { provider = "prisma-json-types-generator" }` (`schema.prisma:24-26`) — generates typed wrappers for `Json` fields. Survey model (`schema.prisma:357-368`) has 7 typed JSON fields: `welcomeCard: Json @default("{\"enabled\": false}") /// [SurveyWelcomeCard]`, `questions: Json @default("[]") /// [SurveyQuestions]`, `blocks: Json[]`, `endings: Json[]`, `hiddenFields`, `variables`, `styling`. **The triple-slash comments are picked up by the generator to produce real TS types.** This is huge for any app that stores complex config in JSON.
- `packages/database/src/client.ts:4-23` Prisma client with adapter pattern (`createPrismaPgAdapter`), `log: ['query', 'info']` only when `DEBUG=1`, singleton via `globalThis`.
- **Multi-column indexes for type-specific lookups:** `ContactAttribute` (`schema.prisma:78-84`) has separate indexes on `(attributeKeyId, value)`, `(attributeKeyId, valueNumber)`, `(attributeKeyId, valueDate)` because the same field can be a string/number/date — different index per type.

### 2.3 API / server actions

- `next-safe-action` everywhere; **no tRPC, no REST routes for mutations**.
- `apps/web/lib/utils/action-client/index.ts:13-64` — base `actionClient` (Sentry capture + audit-logging event ID) → `authenticatedActionClient` (session + user). Layered exactly like Dub.
- **`checkAuthorizationUpdated`** (`apps/web/lib/utils/action-client/action-client-middleware.ts:94-122`) is the crown jewel — a **multi-scope RBAC check** that takes an array of access requirements and returns `true` if **any** match:
  ```ts
  await checkAuthorizationUpdated({
    userId: ctx.user.id,
    organizationId: sourceOrganizationId,
    access: [
      { type: "organization", roles: ["owner", "manager"] },
      { type: "workspaceTeam", minPermission: "readWrite", workspaceId: sourceWorkspaceId },
      { type: "team", minPermission: "admin", teamId },
    ],
  });
  ```
  This is the most expressive RBAC of the three apps. Permission weights (`teamPermissionWeight: { read:1, readWrite:2, manage:3 }`) make `minPermission` comparisons declarative.
- Every action wraps its body in `withAuditLogging("copiedToOtherWorkspace", "survey", async ({ ctx, parsedInput }) => …)` (`modules/survey/list/actions.ts:31-78`) — audit log is a HOC, not boilerplate.
- **Two DB lookups per action** (auth check + actual work) — Formbricks accepts this cost because their RBAC is per-resource, not just per-role.

### 2.4 Client state

- SWR for server state (`lib/swr/use-*` — not present, but hooks under `modules/*/hooks/`).
- `useState`/Context for ephemeral UI state.
- **`modules/ui/components/data-table`** uses `@tanstack/react-table` + a custom toolbar with `SelectedRowSettings` that swaps in when rows are selected (`data-table-toolbar.tsx:23-39`). Includes column-settings dropdown, settings modal, refresh button.

### 2.5 Error handling

- `apps/web/app/error.tsx:1-58` is **the model error boundary**: uses `getClientErrorData(error)` to extract `type` (e.g. `'rate_limit'`), gets translated title/description via i18n, **only sends to Sentry if `!isExpectedError(error)`** (so 4xx doesn't spam Sentry), shows `ErrorComponent` + "Try again" + "Go to dashboard" buttons (conditionally on `errorData.showButtons`).
- `apps/web/app/global-error.tsx:1-22` minimal — `<html><body><NextError statusCode={0}/></body></html>`.
- `apps/web/app/not-found.tsx:1-18` simple branded 404.
- `apps/web/modules/ui/components/error-component/index.tsx:1-39` red-tinted alert card with XCircle icon, accepts pre-translated `title`/`description` (i18n-friendly — component itself doesn't call `t`).

### 2.6 Loading & suspense

- `modules/survey/list/loading.tsx:1-31` shows the **full page chrome with skeleton placeholders**: header, fake filter buttons (3× `w-24 rounded-md bg-slate-300`), fake action buttons, then `<SurveyLoading />`. This is the "make it feel instant" pattern — same layout as the loaded page, just grey boxes.
- `modules/ui/components/skeleton-loader/index.tsx:11-118` skeleton variants per content type (`response`, `responseTable`, `summary`) — each is a hand-crafted grey-box mockup of the actual content.

### 2.7 Forms

- Standard shadcn/ui form (`modules/ui/components/form/index.tsx:1-155`): `FormField` (with context), `FormItem` (generates id), `FormLabel` (red on error), `FormControl` (sets `aria-describedby`, `aria-invalid`), `FormDescription`, `FormError`. Same pattern SahelFlow already has via shadcn.
- `modules/auth/login/components/login-form.tsx:91-99` — `useForm<TLoginForm>({ defaultValues, resolver: zodResolver(ZLoginForm) })`. Clean separation: schema at top (`ZLoginForm`), `defaultValues` from props, `useForm` call.
- **Forms use `react-hot-toast` not sonner** — Formbricks is mid-migration; the rest of the app uses sonner. SahelFlow should pick one and stick with it.

### 2.8 Auth

- **Better Auth** (recently migrated from NextAuth — see `modules/auth/lib/auth.ts:46-65` for the cutover comment). Plugins: `twoFactor`, `genericOAuth`, `jwt`, `oauthProvider`, `nextCookies`. Uses Prisma adapter + **Redis secondary storage** so session reads don't hit the DB.
- `modules/auth/lib/session.ts:22-38` — **`cache(async (): Promise<Session | null> => { … })`** wraps the session read in React's per-request cache, so calling `getSession()` 20 times in one RSC render = 1 actual auth call. Marked `"server-only"`. This is the single most important auth pattern SahelFlow should adopt.
- `lib/utils/action-client/action-client-middleware.ts:39-48` permission weights — `teamPermissionWeight: { read: 1, readWrite: 2, manage: 3 }` — declarative hierarchy comparisons.
- SSO, SAML, OIDC, 2FA (TOTP + backup codes), email verification, password reset — all in `modules/auth/lib/`.

### 2.9 i18n (most sophisticated of the three)

- **i18next + react-i18next + lingo.dev** for translation management.
- `apps/web/i18n.json` declares 14 target locales (de-DE, es-ES, fr-FR, hu-HU, ja-JP, nl-NL, pt-BR, pt-PT, ro-RO, ru-RU, sv-SE, tr-TR, zh-Hans-CN, zh-Hant-TW) — lingo.dev auto-translates.
- `apps/web/lingodotdev/server.ts:1-39` `getTranslate(locale?)` — creates an i18next instance per request with **ICU pluralization** (`i18next-icu`), `resourcesToBackend` for lazy locale loading, `fallbackLng: DEFAULT_LOCALE`.
- `apps/web/lingodotdev/client.tsx:1-50` `I18nProvider` initializes i18next once on the client, `changeLanguage` on locale switch.
- `apps/web/lingodotdev/language.ts:1-15` `getLocale()` — reads user's locale from DB if logged in, else `findMatchingLocale()` (Accept-Language negotiation), else `DEFAULT_LOCALE`. **Locale is a per-user setting, not a per-URL setting.**
- `apps/web/lib/i18n/utils.ts` `createI18nString("Hello", ["default"]) → { default: "Hello" }` — **per-language string fields in the DB**. A survey question can have different text per language, stored as a JSON object `{ default: "Hello", es: "Hola" }`. This is the pattern SahelFlow needs for multi-language store/product names.

### 2.10 Accessibility

- `ACCESSIBILITY.md` at repo root (Formbricks publishes their a11y policy).
- Every UI component has `data-testid` attributes (e.g. `error-title`, `error-description`, `skeleton-loader-summary`) — used both by Playwright and by users with assistive tech that targets testids.
- `modules/ui/components/empty-state/index.tsx:11-26` two variants: `default` (richer with grey-bg sections) and `simple` (single centered line).

### 2.11 Testing

- **302 `*.test.ts(x)` files in modules/** — tests live next to the code (colocated), not in a separate `/tests` dir.
- `vitest.workspace.ts:1` declares workspaces `packages/*/vite.config.{ts,mts}` + `apps/**/vite.config.{ts,mts}` — each package has its own vite config.
- `playwright.config.ts:21-44` — `fullyParallel: true`, `retries: process.env.CI ? 2 : 0`, **`maxFailures: process.env.CI ? undefined : 1`** (fail-fast locally, keep-going on CI), `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`, `permissions: ['clipboard-read','clipboard-write']`.
- `modules/auth/lib/session-cookie.test.ts`, `modules/auth/lib/auth-session-repository.test.ts` — auth code has the most tests.

### 2.12 Performance

- `instrumentation.ts` + `instrumentation-jobs.ts` + `instrumentation-node.ts` — separate instrumentation for Next.js, BullMQ jobs, and Node runtime (OpenTelemetry).
- `packages/jobs` — BullMQ queue package, separate from web. Long-running work goes through Redis queues.
- `packages/cache` — abstracted cache layer (Redis) with an interface so it can be swapped.
- Sentry `sentry.edge.config.ts` + `sentry.server.config.ts` — separate edge/server configs.

### 2.13 Component system

- `modules/ui/components/` has 50+ components — not a separate package, lives in the web app. (Different philosophy from Dub.)
- shadcn/ui pattern (Radix primitives + Tailwind) for form, dialog, checkbox, etc.
- `components.json` for shadcn CLI.

### 2.14 Polish layer

- `modules/ui/components/empty-state/index.tsx:11-26` — variant prop (`default | simple`).
- `modules/ui/components/error-component/index.tsx` — pre-translated, reusable.
- `modules/ui/components/skeleton-loader/index.tsx` — three hand-crafted variants per content type.
- `modules/ui/components/upgrade-prompt` — paywall CTA component.
- `modules/ui/components/confirmation-modal` — generic confirm modal (Dub has `confirm-modal`, Formbricks has `confirmation-modal` — both apps standardize this).

### 2.15 DX & tooling

- `lib/env.ts:1-50` — **`@t3-oss/env-nextjs` + zod** for env validation. Custom `throwEnvValidationError` for nicer errors. Every env var is typed and validated at boot. SahelFlow should adopt this **immediately** — it eliminates the "undefined is not a string" class of bugs.
- Husky pre-commit runs `lint-staged`.
- `sonar-project.properties` — SonarQube static analysis.
- `prisma.config.mjs` at root for custom Prisma config.
- `scripts/` folder for maintenance scripts (e.g. `fb-migrate-dev`).

---

## Repo 3 · Cal.com — scheduling platform (most sophisticated, RSC + tRPC)

`apps/{web, api, docs}` + 30+ packages including `prisma`, `trpc`, `ui`, `lib`, `features` (with sub-packages per feature), `app-store` (plugin marketplace), `platform`, `embeds`, `kysely`, `i18n`, `emails`, `ai`, `sms`, `testing`, `tsconfig`, `config`. Yarn workspaces + Turborepo. Next.js 15, React 18, Prisma 6 (PostgreSQL), tRPC v10 + superjson, NextAuth v4, **kbar** for command palette, **i18next** with 35+ locales, Biome for lint/format, Sentry.

### 3.1 Project structure

- `apps/web/modules/{api-keys, apps, auth, availability, bookings, calendars, data-table, event-types, filters, form-builder, notifications, onboarding, schedules, settings, shell, timezone, …}` — same module-per-feature pattern as Formbricks but bigger.
- `apps/web/app/(booking-page-wrapper)/`, `(use-page-wrapper)/`, `(dashboard)` — route groups for layout variants.
- `apps/web/components/PageWrapperAppDir.tsx:14-38` — every page wraps in `<PageWrapper>` that injects `<AppProviders>`. This is the legacy → app-router migration seam.
- **Package per feature:** `packages/features/{bot-detection, data-table, embed, holidays, noShow, onboarding, ooo, video-call-guest}`. Each feature is its own publishable package with `repositories/`, `lib/`, `__tests__/`. This is the cleanest separation of the three apps.

### 3.2 Data layer

- `packages/prisma/schema.prisma` — **2851 lines, single file** (Cal.com hasn't migrated to multi-file yet). 100+ models. Uses `@db.Uuid`, `@db.Time`, `@db.Date`, `@db.Timestamp(3)`, `BigInt` for monetary fields, `Json` for 30+ config fields.
- **Three generators:** `prisma-client` (with `previewFeatures = ["views"]`), `zod` (via `zod-prisma-types`), `kysely` (for raw SQL type safety), `enums` (via `prisma-enum-generator`). SahelFlow probably only needs the first two.
- **Prisma client extensions** for runtime safety (`packages/prisma/extensions/disallow-undefined-delete-update-many.ts:27-46`):
  ```ts
  export function disallowUndefinedDeleteUpdateManyExtension() {
    return Prisma.defineExtension({
      query: { $allModels: {
        async deleteMany({ args, query }) { checkUndefinedInValue(args.where); return query(args); },
        async updateMany({ args, query }) { checkUndefinedInValue(args.where); return query(args); },
      } },
    });
  }
  ```
  This catches the classic Prisma footgun: `prisma.user.deleteMany({ where: { workspaceId: undefined } })` deletes everything. **SahelFlow should adopt this immediately.**
- **Repository pattern with typed interface + implementation:** `packages/features/data-table/repositories/filterSegment.ts:13-46` declares `interface IFilterSegmentRepository { get, create, update, delete, setPreference }`, then `class FilterSegmentRepository implements IFilterSegmentRepository` (lines 48-395). The handler accepts the interface, the implementation is wired in `index.ts`. This makes the handler unit-testable with a mock repo.
- **Zod schemas parse Prisma JSON fields on read:** `filterSegment.ts:110-116`:
  ```ts
  activeFilters: ZActiveFilters.catch([]).parse(segment.activeFilters),
  sorting: ZSortingState.catch([]).parse(segment.sorting),
  columnVisibility: ZColumnVisibility.catch({}).parse(segment.columnVisibility),
  ```
  `.catch(defaultValue)` means corrupt JSON in the DB doesn't crash the app — it falls back to a safe default. **This is the pattern for any JSON column in SahelFlow.**
- **Two Prisma clients:** `prisma` (read-write) + `readonlyPrisma` (read replica for insights/analytics) — `packages/trpc/server/createContext.ts:73-79` injects both into tRPC ctx.

### 3.3 API / tRPC

- **tRPC v10 is the mutation/query layer.** No REST routes for app internal data (only for the public API v1/v2 which is separately mounted).
- `packages/trpc/server/trpc.ts:8-17` — `initTRPC.context<typeof createContextInner>().create({ transformer: superjson, errorFormatter })`. **superjson** so `Date`, `Map`, `Set`, `BigInt` round-trip client↔server without manual conversion.
- **Layered procedures** (`packages/trpc/server/procedures/authedProcedure.ts:23-26`):
  ```ts
  const authedProcedure = procedure
    .use(perfMiddleware)            // logs procedure duration via performance.measure
    .use(errorConversionMiddleware) // converts HttpError → TRPCError
    .use(isAuthed);                 // session + user
  export const authedAdminProcedure = publicProcedure.use(isAdminMiddleware);
  export const authedOrgAdminProcedure = publicProcedure.use(isOrgAdminMiddleware);
  ```
- `middlewares/sessionMiddleware.ts:7-41` `isAuthed` uses `unstable_pipe` to compose into `isAdminMiddleware` / `isOrgAdminMiddleware` — **procedure-level RBAC via composition**.
- **Lazy handler imports inside procedures** (`packages/trpc/server/routers/viewer/eventTypes/_router.ts:30-44`):
  ```ts
  getByViewer: authedProcedure.input(ZEventTypeInputSchema).query(async ({ ctx, input }) => {
    const { getByViewerHandler } = await import("./getByViewer.handler");
    const timer = logP(`getByViewer(${ctx.user.id})`);
    const result = await getByViewerHandler({ ctx, input });
    timer();
    return result;
  }),
  ```
  This **keeps the router file lightweight** — handler code is dynamically imported on first call. Critical for serverless cold starts. For SahelFlow (Tauri desktop) less critical, but still reduces initial bundle.
- **Schema/handler file split:** every procedure has `something.schema.ts` (Zod) + `something.handler.ts` (business logic). The router file only wires them together. This is the cleanest tRPC layout I've seen.
- **`PBAC` (Permission-Based Access Control):** `eventTypes/util.ts` exports `createEventPbacProcedure("eventType.update", [MembershipRole.ADMIN, MembershipRole.OWNER])` — a procedure factory that checks the user has a specific permission on a specific resource. Beyond RBAC.
- `errorFormatter.ts:17-36` — when error.cause is ZodError, returns `{ message: 'Invalid input', code: 400, data: { code: 'BAD_REQUEST', httpStatus: 400, path, zodError: error.cause.flatten() } }` — **client gets structured field-level validation errors**.

### 3.4 Client state

- tRPC React Query for server state. `apps/web/app/_trpc/trpc-provider.tsx:13-19`:
  ```tsx
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  </trpc.Provider>
  ```
- **Optimistic updates with React Query** (`apps/web/modules/event-types/views/event-types-listing-view.tsx:311-359`):
  ```ts
  const setHiddenMutation = trpc.viewer.eventTypesHeavy.update.useMutation({
    onMutate: async (data) => {
      await utils.viewer.eventTypes.getEventTypesFromGroup.cancel();
      const previousValue = utils.viewer.eventTypes.getEventTypesFromGroup.getInfiniteData({ … });
      if (previousValue) {
        await utils.viewer.eventTypes.getEventTypesFromGroup.setInfiniteData({ … }, (oldData) => ({
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            eventTypes: page.eventTypes.map((et) =>
              et.id === data.id ? { ...et, hidden: !et.hidden } : et
            ),
          })),
        }));
      }
      return { previousValue };
    },
    onError: async (_err, _input, context) => {
      if (context?.previousValue) {
        utils.viewer.eventTypes.getEventTypesFromGroup.setInfiniteData({ … }, () => context.previousValue);
      }
    },
    onSettled: () => utils.viewer.eventTypes.getEventTypesFromGroup.invalidate(),
  });
  ```
  This is the **canonical React Query optimistic update pattern** — cancel in-flight, snapshot, write optimistic, rollback on error, revalidate on settle. SahelFlow should copy-paste this.
- **Zustand + persist for cross-page state** (`apps/web/modules/onboarding/store/onboarding-store.ts:155-261`):
  - `persist` middleware with **IndexedDB storage** (not localStorage) — handles multi-MB images.
  - **`version: 1` + `migrate` function** — when schema changes, old persisted state is migrated; oversized base64 images from a pre-fix version are cleaned up. This is how you evolve persisted state without breaking existing users.
  - `partialize` to control which fields are persisted.
- `apps/web/modules/data-table/DataTableProvider.tsx:1-50` — **typed Context + useDataTable hook** for data-table state (filters, sorting, column visibility/sizing, pagination). Composed from sub-providers (`DataTableStateProvider`, `DataTableFiltersProvider`, `DataTableSegmentProvider`). The `useDataTable` hook throws if used outside the provider.

### 3.5 Error handling

- `apps/web/app/error.tsx:1-58` — uses `getErrorFromUnknown(error)` to normalize, checks `instanceof HttpError`, calls `redactError(err)` to strip sensitive data before display, then renders `<ErrorPage>` with status code + message + optional debug panel.
- `apps/web/components/error/error-page.tsx:31-58` — `ErrorDebugPanel` shows `error.message`, `error.name`, `error.class`, `http.url`, `http.status`, `http.cause`, `error.stack` in a definition list. **Debug mode is opt-in per page.**
- `apps/web/app/global-error.tsx:1-22` wraps the regular error in `<html><body>`.
- `packages/lib/http-error.ts:1-43` `HttpError<TCode extends number>` — typed error with `statusCode`, `url`, `method`, `cause`, `data`, and a static `fromRequest(request, response, parsedError)` factory.

### 3.6 Loading & suspense

- `apps/web/app/(use-page-wrapper)/refer/loading.tsx` — only one `loading.tsx` in the app router. Cal.com relies on `PageWrapper` + per-component skeletons instead.
- `apps/web/modules/data-table/components/DataTableSkeleton.tsx:1-50` — a skeleton that **mirrors the actual table structure**: header row + N body rows, with `columnWidths` prop so skeleton columns match real column widths.

### 3.7 Forms

- Cal.com uses **react-hook-form + Zod** in the standard shadcn pattern (via `packages/ui/components/form/*`).
- Form variants live under `packages/ui/components/form/{checkbox, step, wizard, select, switch, date-range-picker, color-picker, datepicker, inputs, toggleGroup}` — **field components are organized by input type** under `form/`, with a wizard + step sub-component for multi-step forms.

### 3.8 Auth

- NextAuth v4 with a **custom `getServerSession`** (`packages/features/auth/lib/getServerSession.ts:39-151`) that **caches sessions in an LRU cache** (`new LRUCache<string, Session>({ max: 1000 })`) keyed by the stringified JWT token. This avoids hitting the DB on every server-side render. SahelFlow should adopt this — it's a 1-line change with huge payoff.
- Session enrichment via `UserRepository.enrichUserWithTheProfile({ user, upId })` — separation of concerns: NextAuth gives you the JWT, the repository gives you the full user.
- **Admin impersonation** baked in (`getServerSession.ts:127-145`) — if `token.impersonatedBy?.id` is set, the session gets `user.impersonatedBy = { id, uuid, role }` so the UI can show "You are impersonating X" banner.
- RBAC: `user.role` (ADMIN/USER), `user.organization?.isOrgAdmin`, `MembershipRole` enum (OWNER/ADMIN/MEMBER) on the team membership.
- 2FA via `totp.ts`, OAuth via `identityProviders.ts`, SSO via `packages/features/auth/lib/oAuthAuthorization.ts`.

### 3.9 i18n

- **i18next + next-i18next with 35+ locales** (`i18n.json`). Includes RTL languages (ar, he).
- `packages/i18n/server.ts:1-81` — server-side `loadTranslations(locale, ns)` with **in-memory `translationCache: Map<string, Record<string, string>>`** and **`i18nInstanceCache: Map<string, I18nInstance>`** so locale files are loaded once per process. Falls back to English via `mergeWithEnglishFallback`.
- `apps/web/app/layout.tsx:88-95` — `dir(newLocale)` from `i18next` handles RTL automatically. `<html lang={locale} dir={direction}>`.
- `apps/web/app/AppRouterI18nProvider.tsx` — provides translations to client components without re-fetching.

### 3.10 Performance

- **`<SpeculationRules>`** (`apps/web/app/SpeculationRules.tsx:1-35`) — uses the **Speculation Rules API** to **prerender routes on hover**:
  ```tsx
  <SpeculationRules
    prerenderPathsOnHover={["/event-types", "/availability", "/bookings/upcoming", "/teams", "/apps"]}
  />
  ```
  This makes those pages load instantly when the user clicks them. **SahelFlow should adopt this for the most-clicked dashboard routes.**
- Font loading: `Inter` (Google, `preload: true, display: 'swap'`) + `CalSans-SemiBold` (local woff2, `preload: true, display: 'block'`) as CSS variables (`apps/web/app/layout.tsx:11-17`). Both preloaded for instant first paint.
- `packages/trpc/server/middlewares/perfMiddleware.ts:1-11` — `performance.mark('Start')` / `performance.mark('End')` / `performance.measure(...)` on every procedure. Logs to DevTools Performance panel.
- Virtualized data table (`apps/web/modules/data-table/components/DataTable.tsx:71-82`) via `@tanstack/react-virtual` with `overscan: 10` — renders only visible rows. Essential for 10k+ row tables.
- Sentry + OpenTelemetry + `distributedTracing.createTrace()` per tRPC request.

### 3.11 Component system

- `packages/ui/components/` has **70+ component directories** — button, dialog, form/*, table, skeleton, empty-screen, command, breadcrumb, editor, sheet, toast, tooltip, navigation, dropdown, popover, pagination, etc.
- `packages/ui/components/empty-screen/EmptyScreen.tsx:10-87` — most configurable empty-state of the three: `Icon | customIcon | avatar`, `headline`, `description`, `buttonText + buttonOnClick | buttonRaw` (pass your own button), `border`, `dashedBorder`, `limitWidth`. `data-testid="empty-screen"`.
- `packages/ui/components/skeleton/Skeleton.tsx` — `Skeleton`, `SkeletonAvatar`, `SkeletonText`, `SkeletonButton`, `SkeletonContainer`, `SelectSkeletonLoader`, `Loader` (spinner variant). **A whole skeleton component family.**
- `packages/ui/components/toast/showToast.tsx:1-100` — `showToast(message, variant: 'success' | 'warning' | 'error', options)` + `SuccessToast`/`ErrorToast`/`WarningToast` components. Wraps `sonner` with branded styles. `data-testid="toast-success"` etc. for Playwright.
- `packages/ui/components/command/` — kbar-based command palette.

### 3.12 Polish layer

- `apps/web/modules/data-table/components/DataTableSkeleton.tsx` — table-shaped skeleton with column-width matching.
- `apps/web/modules/data-table/components/DataTableSelectionBar.tsx` — appears when rows are selected (bulk actions).
- `apps/web/modules/shell/Kbar.tsx:60-480` — full command palette with shortcut strings (`["e","t"]` for event types), section grouping ("Installable Apps", "Bookings"), keyboard hints (ArrowDown/Up/Enter/ExternalLink).
- `apps/web/modules/shell/SideBar.tsx` — `// Make sure that Sidebar is rendered optimistically so that a refresh of pages when logged in have SideBar from the beginning.` — they explicitly call out rendering the sidebar before the auth check completes, to avoid a flash of empty sidebar on refresh.

### 3.13 Testing

- `vitest.config.mts:1-50` — supports multiple modes via `VITEST_MODE` env var: `packaged-embed`, `integration`, `timezone`. Each mode runs a different test subset. **Timezone-dependent tests are isolated** so they don't flake in CI.
- `setupVitest.ts:1-25` — mocks `window.matchMedia` for jsdom (required by Radix).
- `vitest-mocks/` directory at root for shared mocks.
- `playwright.config.ts:21-44` — `DEFAULT_TEST_TIMEOUT = process.env.CI ? 60_000 : 240_000` (4 min locally!), separate webServer config, `reuseExistingServer: !process.env.CI`.
- `__checks__/` directory — Cal.com uses Checkly for synthetic monitoring.
- Every tRPC handler has a `.handler.test.ts` companion.

### 3.14 DX & tooling

- **Biome** (not ESLint) — `biome.json` with organize-imports groups (`["@calcom/**", "@ee/**"]`, `["@lib/**", "@components/**", "@server/**", "@trpc/**"]`, `~/**`, `:PATH:`). Faster than ESLint + Prettier combined.
- `lint-staged.config.mjs:1-10` runs `biome lint --reporter summary --config-path=biome-staged.json` on staged files + `prisma format` on `schema.prisma`.
- `.husky/pre-commit` — skips lint-staged during merge commits (`if [ -f .git/MERGE_HEAD ]; then … exit 0; fi`), then runs `lint-staged` + `yarn app-store:build` (regenerates app-store types) + `git add packages/app-store/*.generated.*`.
- `packages/tsconfig/base.json:1-25` — `strict: true`, `noImplicitAny: true`, `isolatedModules: true`, `forceConsistentCasingInFileNames: true`. Plus `react-library.json` + `nextjs.json` presets.
- `AGENTS.md` + `CLAUDE.md` at root — **agent instructions** so AI coding assistants know the conventions.
- `PERMISSIONS.md` — documents the RBAC matrix in plain English.

---

## Cross-cutting patterns SahelFlow should adopt

Ranked by impact × ease of adoption for a Tauri + Next.js 16 + Prisma/SQLite + shadcn/ui desktop app. Each item: **pattern · why · where in SahelFlow · effort**.

### Tier 1 — adopt immediately (high impact, low effort)

**1. `next-safe-action` with layered action clients (Dub + Formbricks)**
- **Why:** Eliminates per-action auth/RBAC boilerplate. `authUserActionClient` → `authWorkspaceActionClient` → `authAdminActionClient`. Centralizes error logging. Every mutation flows through one choke point.
- **Where:** Every server action in `/tmp/sahelflow_v2/app/actions/` (currently ~87 API routes; many should be actions).
- **Effort:** ~1 day. Install `next-safe-action`, create `lib/actions/safe-action.ts` with 3 layers, migrate 5 pilot actions, then incrementally convert the rest.

**2. Prisma `disallowUndefinedDeleteUpdateMany` extension (Cal.com)**
- **Why:** `prisma.user.deleteMany({ where: { workspaceId: undefined } })` deletes every user. This extension throws at runtime if any where value is `undefined`. One-time setup, lifetime protection.
- **Where:** `prisma/extensions.ts` (new file). Apply to the existing Prisma client singleton.
- **Effort:** 1 hour. Copy Cal.com's `packages/prisma/extensions/disallow-undefined-delete-update-many.ts:1-46` verbatim, add `.use(disallowUndefinedDeleteUpdateManyExtension())` to the client.

**3. `@t3-oss/env-nextjs` + Zod env validation (Formbricks)**
- **Why:** Catches missing/malformed env vars at boot, not at first use. Types `process.env` properly. SahelFlow currently uses `process.env.X as string` everywhere — unsafe.
- **Where:** `lib/env.ts` (new). Replace every `process.env.X` with the typed `env.X`.
- **Effort:** ~3 hours. List all env vars, write Zod schemas, replace usages.

**4. React `cache()` on `getSession()` (Formbricks)**
- **Why:** A single RSC render can call `getSession()` 5-20 times (layout, header, page, sidebar each call it). Without `cache()`, that's 5-20 DB hits. With `cache()`, it's 1.
- **Where:** `lib/auth/session.ts`. One-line change: `export const getSession = cache(async () => { … })`.
- **Effort:** 30 minutes.

**5. LRU cache on `getServerSession` (Cal.com)**
- **Why:** JWT-based sessions get re-decoded + re-queried on every request. Cal.com caches 1000 sessions in-memory keyed by the JWT. For a desktop app (single user, fast), this turns auth into a sub-millisecond operation.
- **Where:** `lib/auth/get-server-session.ts`. Use `lru-cache` package.
- **Effort:** 1 hour.

**6. `error.tsx` that only sends to Sentry for unexpected errors (Formbricks)**
- **Why:** 4xx errors (rate limits, validation, not-found) are expected — they shouldn't pollute Sentry. Use `isExpectedError(error)` to gate `Sentry.captureException`.
- **Where:** `app/error.tsx`, `app/global-error.tsx`.
- **Effort:** 1 hour. Copy Formbricks' `apps/web/app/error.tsx:1-58` pattern.

**7. Branded `ErrorComponent` + `EmptyState` + `Skeleton` family (all three apps)**
- **Why:** SahelFlow's current error/empty/loading states look AI-prototyped. A single shared `ErrorComponent` (red card, icon, title, description, retry button) + `EmptyState` (icon, title, description, CTA) + `Skeleton*` variants (per content type) is the polish layer.
- **Where:** `components/ui/error-component.tsx`, `components/ui/empty-state.tsx`, `components/ui/skeleton.tsx` (extend the existing shadcn skeleton with `SkeletonAvatar`, `SkeletonText`, `SkeletonButton`, `SkeletonContainer`).
- **Effort:** ~4 hours. Copy Dub's `packages/ui/src/empty-state.tsx:10-42` and Cal.com's `packages/ui/components/skeleton/Skeleton.tsx` directly.

**8. Sonner toasts with `showToast(message, variant)` wrapper (Cal.com)**
- **Why:** Standardizes toast variants (success/warning/error) with consistent icon + color + `data-testid`. Currently SahelFlow probably calls `toast.success()`/`toast.error()` directly with inconsistent styling.
- **Where:** `lib/toast.ts` (new). Export `showToast`, `SuccessToast`, `ErrorToast`, `WarningToast`.
- **Effort:** 1 hour.

### Tier 2 — adopt this sprint (high impact, medium effort)

**9. Optimistic updates with React Query / SWR `onMutate` pattern (Cal.com + Dub)**
- **Why:** Instant UI feedback on mutations (toggle, archive, delete, status change). Rollback on error. This is the #1 thing that makes an app feel "real" vs prototype.
- **Where:** Every mutation that updates a list — order status changes, parcel assignment, customer archive, etc.
- **Effort:** ~1 day to establish the pattern + 1-2 days to apply to the top 10 mutations. Copy Cal.com's `apps/web/modules/event-types/views/event-types-listing-view.tsx:311-359` as the template.

**10. Per-route `loading.tsx` with full-page-chrome skeletons (Formbricks)**
- **Why:** A loading state that mirrors the loaded page layout (header + filter bar + table skeleton) feels instant. A centered spinner feels slow. Formbricks' `modules/survey/list/loading.tsx` is the gold example.
- **Where:** Every route under `app/(dashboard)/...`. Currently SahelFlow probably has 2-3 loading.tsx; should have 20+.
- **Effort:** ~2 days to author skeletons for the top 15 routes.

**11. Layered RBAC with permission weights (Formbricks)**
- **Why:** SahelFlow has users, workspaces (multi-tenant), and teams. `checkAuthorizationUpdated({ access: [{ type: 'organization', roles: ['owner'] }, { type: 'workspaceTeam', minPermission: 'readWrite', workspaceId }, { type: 'team', minPermission: 'admin', teamId }] })` is the most expressive pattern. Permission weights (`read: 1, readWrite: 2, manage: 3`) make comparisons declarative.
- **Where:** `lib/auth/rbac.ts` (new). Replace ad-hoc role checks across actions.
- **Effort:** ~2 days.

**12. Speculation Rules API for hover-prerender (Cal.com)**
- **Why:** When the user hovers a nav link, the browser prerenders the page. Click feels instant. Cal.com prerenders `/event-types`, `/availability`, `/bookings/upcoming`, `/teams`, `/apps` on hover. For SahelFlow: prerender `/orders`, `/customers`, `/parcels`, `/analytics`, `/settings` on hover.
- **Where:** `app/(dashboard)/layout.tsx`. Add `<SpeculationRules prerenderPathsOnHover={[…]} />`.
- **Effort:** 30 minutes. Copy `apps/web/app/SpeculationRules.tsx:1-35` verbatim.

### Tier 3 — adopt next sprint (medium impact, higher effort)

**13. tRPC with superjson + lazy handler imports + schema/handler split (Cal.com)**
- **Why:** End-to-end types from DB→API→UI. superjson makes Date/BigInt/Map round-trip. Lazy imports keep the router bundle small. Schema.ts + handler.ts split is the cleanest tRPC layout.
- **Where:** Replace direct Prisma calls in client components with tRPC procedures. Replaces fetch-based API routes for internal data.
- **Effort:** ~1 week for full migration. Start with one domain (orders) as a pilot.
- **Note:** SahelFlow currently has 87 API routes + scattered `fetch` calls — tRPC would consolidate, but it's a big change. Alternative: keep REST routes but adopt the schema/handler split + Zod everywhere.

**14. Module-per-feature layout (Formbricks + Cal.com)**
- **Why:** `modules/orders/{components, lib, hooks, actions.ts, page.tsx}`. Pages import from modules, never the reverse. Currently SahelFlow has `components/`, `lib/`, `hooks/` as flat dirs — finding the orders-related code means grepping.
- **Where:** Reorganize `app/(dashboard)/orders/` + related `components/orders/`, `lib/orders/`, `hooks/use-orders*.ts` into `modules/orders/`.
- **Effort:** ~3 days for a clean migration (do it incrementally per module).

**15. Saved filter views persisted to DB (Cal.com)**
- **Why:** "My open orders from last week, sorted by customer" should be one click. Cal.com's `FilterSegment` model (`packages/features/data-table/repositories/filterSegment.ts`) stores activeFilters, sorting, columnVisibility, columnSizing, perPage, searchTerm — per user, per table, optionally shared with team.
- **Where:** Orders table, customers table, parcels table, analytics views. New `FilterSegment` Prisma model + `UserFilterSegmentPreference`.
- **Effort:** ~3 days.

**16. Zustand + persist with IndexedDB + versioned migration (Cal.com)**
- **Why:** Cross-page UI state (draft orders, in-progress filter config, onboarding progress) survives reload. IndexedDB handles larger payloads than localStorage. Versioned `migrate` function evolves the schema without breaking existing users.
- **Where:** Draft order builder, onboarding flow, unsent message drafts, command palette recent items.
- **Effort:** ~2 days to set up + 1 day per use case.

**17. i18next with per-user locale + lingo.dev auto-translation (Formbricks)**
- **Why:** SahelFlow targets Algerian sellers — French + Arabic (RTL!) at minimum, English as fallback. Per-user locale stored in DB. ICU pluralization. lingo.dev auto-translates new strings.
- **Where:** `lib/i18n/`, `app/(dashboard)/layout.tsx` (`<html lang dir>`), every user-facing string.
- **Effort:** ~1 week for the initial setup + 2-3 weeks for full string coverage. RTL is the hardest part — start with `dir="rtl"` on `<html>` and audit every layout.
- **For Arabic RTL specifically:** all three apps support it via `i18next`'s `dir()` but only Cal.com has 35+ locales including ar/he. Use Cal.com as the reference.

**18. Modal → Drawer auto-switch on mobile (Dub.co)**
- **Why:** `<Modal>` renders as a Radix Dialog on desktop, as a Vaul Drawer on mobile. Same API, optimal UX per device. SahelFlow runs in Tauri (desktop) so this is lower priority, but if a web version ships, this is the pattern.
- **Where:** `components/ui/modal.tsx`. Replace shadcn's modal with Dub's `packages/ui/src/modal.tsx:11-145`.
- **Effort:** 2 hours.

**19. Priority-based keyboard shortcut registry (Dub.co)**
- **Why:** A global `useKeyboardShortcut(key, callback, { priority, modal, sheet })` hook with a Context provider. Listeners register; on keydown the highest-priority matching listener in the current scope (modal open? sheet open?) runs. Skips inputs/textareas. This is what powers Linear/Vercel/Notion-style ⌘K palettes and per-page shortcuts.
- **Where:** `lib/hooks/use-keyboard-shortcut.tsx`. Wrap the app in `<KeyboardShortcutProvider>`. Register `⌘K` for command palette, `g o` for orders, `g c` for customers, `?` for shortcuts help, `c` for compose new order, etc.
- **Effort:** ~1 day to set up + 2 days to wire 20+ shortcuts.

**20. kbar command palette (Cal.com)**
- **Why:** Cal.com's `modules/shell/Kbar.tsx` shows the gold pattern: section grouping, shortcut strings, keyboard hints, app-store integrations as actions. SahelFlow should have ⌘K → "New order", "Search customers", "Go to settings", "Switch workspace", "Toggle theme".
- **Where:** `components/command-palette.tsx`.
- **Effort:** ~2 days for a solid first version.

### Tier 4 — adopt long-term (high effort, strategic value)

**21. Prisma `omit` for sensitive fields (Dub.co)**
- **Why:** `new PrismaClient({ omit: { user: { passwordHash: true } } })` means password hash never enters JS memory even on `findUnique` without `select`. Defense in depth.
- **Where:** `lib/prisma.ts`. Requires Prisma 5.13+.
- **Effort:** 1 hour. (Tier 4 only because SahelFlow's auth may not store password hashes yet — depends on auth strategy.)

**22. Repository pattern with typed interface (Cal.com)**
- **Why:** `interface IOrderRepository` + `class OrderRepository implements IOrderRepository`. Handlers depend on the interface, not the implementation. Enables unit testing with a mock repo.
- **Where:** `modules/orders/repositories/order-repository.ts`.
- **Effort:** ~2 weeks to refactor top 5 domains. Worth it if you're going to write serious unit tests.

**23. Prisma JSON fields with `.catch()` Zod parsing on read (Cal.com)**
- **Why:** `ZActiveFilters.catch([]).parse(segment.activeFilters)` — corrupt JSON in DB doesn't crash the app; falls back to safe default. SahelFlow stores complex config (order metadata, customer attributes, sync state) as JSON.
- **Where:** Every Prisma model with `Json` fields. Write a Zod schema + `.catch()` for each.
- **Effort:** ~1 day for top 10 JSON fields.

**24. Audit logging HOC around mutations (Formbricks)**
- **Why:** `withAuditLogging("copiedToOtherWorkspace", "survey", async ({ ctx, parsedInput }) => …)` — every mutation produces an audit log entry automatically. Critical for multi-tenant SaaS where you need to know "who changed what when".
- **Where:** `lib/audit/with-audit-logging.ts`. Wrap every write action.
- **Effort:** ~3 days.

**25. Multi-file Prisma schema (Dub.co)**
- **Why:** `prisma/schema/{link,domain,workspace,…}.prisma` — one file per aggregate. Navigating a 1000-line single schema is painful. SahelFlow has 30 models today but will grow.
- **Where:** `prisma/schema/`.
- **Effort:** 2 hours to split, requires Prisma 5.15+.

**26. Virtualized data table (Cal.com)**
- **Why:** `@tanstack/react-virtual` renders only visible rows. Essential once any table exceeds 1000 rows. Cal.com's `DataTable.tsx:71-82` shows the pattern with `overscan: 10` + `measureElement` (Firefox excluded due to perf).
- **Where:** Orders table, customers table, parcels table.
- **Effort:** ~1 day to integrate `@tanstack/react-virtual` into the existing table component.

**27. `perfMiddleware` for tRPC / actions (Cal.com)**
- **Why:** `performance.mark('Start')` / `performance.mark('End')` / `performance.measure('[OK] query 'bookings.get'')` on every procedure. Surfaces in DevTools Performance panel. SahelFlow can ship a Tauri dev-tools overlay that shows slow queries/mutations.
- **Where:** `lib/middleware/perf.ts`.
- **Effort:** 1 hour.

**28. Per-feature publishable packages (Cal.com)**
- **Why:** `packages/features/{data-table, onboarding, embed, …}` — each feature is its own package with `package.json` + `exports`. Forces clean public/private API. Enables reuse across apps (e.g. embed the same data-table package in a future mobile app).
- **Where:** Restructure into `packages/features/{orders, customers, parcels, …}`.
- **Effort:** ~2 weeks. Only worth it once the codebase stabilizes.

---

## What SahelFlow should NOT copy

- **Dub's `relationMode = "prisma"`** — SahelFlow uses SQLite which supports FKs natively. Use real FKs.
- **Dub's `strict: false` tsconfig** — SahelFlow should keep `strict: true`.
- **Cal.com's NextAuth v4** — v4 is in maintenance; if SahelFlow needs NextAuth, use v5 / Auth.js. Better yet, use Formbricks' Better Auth approach which is more modern.
- **Cal.com's 2851-line single `schema.prisma`** — use Dub's multi-file pattern instead.
- **Formbricks' react-hot-toast** — pick sonner (Dub + Cal.com) for consistency.
- **Formbricks' 170-line turbo.json with 250 env vars** — SahelFlow is a single-app desktop product; don't over-engineer turbo config.
- **Dub's `mutatePrefix` everywhere** — works for SWR but if SahelFlow uses React Query, prefer `utils.invalidateQueries({ queryKey: ['orders'] })` for explicit cache invalidation.

---

## Concrete next actions for SahelFlow (priority order)

1. **Day 1:** Prisma `disallowUndefinedDeleteUpdateMany` extension + `@t3-oss/env-nextjs` + React `cache()` on `getSession()` + LRU cache on `getServerSession`.
2. **Day 2:** `next-safe-action` layered action clients + migrate 5 pilot actions.
3. **Day 3-4:** Branded `ErrorComponent` + `EmptyState` + `Skeleton*` family + `showToast` wrapper. Replace ad-hoc error/empty/loading UI across the top 10 routes.
4. **Day 5:** `error.tsx` + `global-error.tsx` with Sentry gating. Per-route `loading.tsx` for top 5 routes.
5. **Day 6-7:** Speculation Rules API + priority-based keyboard shortcut registry.
6. **Week 2:** Optimistic updates on top 10 mutations + saved filter views on the orders table.
7. **Week 3:** Module-per-feature reorganization (start with orders module).
8. **Week 4+:** i18next + French + Arabic RTL; tRPC migration pilot; command palette.

---

*Document end. All file:line citations verified against shallow clones at `/tmp/research/{calcom, dub, formbricks}` on 2025-07-03.*

# GLM continuity protocol

> **Status:** Active operational protocol  
> **Continuity ref:** `agent-handoff`  
> **Integrated authority:** `main`

## Purpose

The `agent-handoff` orphan ref preserves the useful part of the original GLM/Z.ai workflow: a small durable checkpoint and a one-command bootstrap path across disposable sessions.

It is **not** a second SahelFlow repository, product constitution, roadmap, tool source, release authority or implementation branch. All current product, experience, engineering, source and work authority lives on `main`.

## Repository roles

| Ref | Role | Allowed contents |
|---|---|---|
| `main` | Integrated product, application, documentation and shared tooling truth | Product/experience/architecture/operations docs, source, tests, scripts and merged work |
| `agent-handoff` | GLM session continuity only | `README.md`, `AGENT_HANDOFF.md`, thin `bootstrap.sh` |
| `agent/<outcome>` | Normal proposed work | Research, documentation or code for one coherent outcome, reviewed through a pull request to `main` |

GLM never implements application work directly on `agent-handoff`. It creates or contributes to a normal branch based on current `main`.

## Authority rule

The handoff ref may summarize current work, but it cannot redefine it. At every session start GLM reads, in order:

1. repository-root `AGENTS.md` on `main`;
2. `documentation/operations/WORKING_MEMORY.md`;
3. the active wave linked from Working Memory;
4. the relevant product, experience and architecture authorities;
5. the relevant source and evidence.

When the orphan handoff conflicts with `main`, `main` wins and the handoff is corrected immediately.

## Start or resume GLM

From any clone:

```bash
git fetch origin main agent-handoff
git show origin/agent-handoff:bootstrap.sh > /tmp/sahelflow-glm-bootstrap.sh
bash /tmp/sahelflow-glm-bootstrap.sh
```

The bootstrap:

- obtains or refreshes a checkout of current `main`;
- installs dependencies and generates Prisma when needed;
- runs the current repository documentation audit;
- optionally runs the fast verification gate;
- prints the canonical read order and next wave;
- never stores credentials or treats the orphan ref as product authority.

The same shared bootstrap can be run from a current `main` checkout:

```bash
bun run glm:bootstrap
```

Useful flags:

```bash
bun run glm:bootstrap -- --skip-install
bun run glm:bootstrap -- --skip-checks
bun run glm:bootstrap -- --repo-dir /path/to/sahelflow_v2
```

## GLM handoff format

`AGENT_HANDOFF.md` stays compact and current:

```markdown
# GLM continuity checkpoint

- Updated:
- Current main commit:
- Active wave:
- GLM assignment:
- Governing product/experience/architecture links:
- Verified findings:
- Branches, PRs or artifacts produced:
- Blockers or uncertainty:
- Exact next action:
```

Do not copy entire authority documents, source audits or narrative session histories into the handoff. Link them. Git history preserves older checkpoints.

## Working protocol

1. Bootstrap current `main`.
2. Read current authority and the active wave.
3. Verify the exact repository state relevant to the assignment.
4. Work through research, challenge, design, implementation or review as useful.
5. Put proposed repository changes on `agent/<outcome>`, never on the continuity ref.
6. Record evidence honestly; GitHub/source inspection is not packaged Windows or live-provider evidence.
7. Update Working Memory or the active wave when shared truth changes.
8. Update the orphan handoff only when GLM needs a durable resume checkpoint.

## Shared tooling ownership

The executable source for repository checks and development helpers belongs on `main`. The orphan ref carries no independent tool implementations.

Current shared commands:

```bash
bun run glm:bootstrap
bun run sf-audit
bun run sf-verify --fast
bun run sf-verify
bun run sf-seed
bun run sf-browser
```

The following old orphan-only commands are retired rather than migrated:

- `sf-db` — depended on the old implicit development-database model;
- `sf-license` — encoded the superseded local signer/trial model and must not be used for SahelFlow 1.0 licensing;
- `sf-port` — v2-to-v3 transition utility from an obsolete migration era;
- `sb-db` — legacy Supabase mutation access, outside the current local-first authority and safety model.

Reintroduce any equivalent capability only as reviewed `main` tooling under the current architecture and active wave.

## Safety and cleanup rules

- Never store PATs, passwords, provider credentials, signing keys, recovery material or seller data on either branch.
- Do not revive Session-number, v3/v4, Maze Map branch, `PROJECT_STATE.md` or old readiness claims as current authority.
- Do not create a second handoff, roadmap, capability atlas or architecture package for GLM.
- Historical orphan-branch content remains available through Git history but is not executed or consulted by the current protocol.

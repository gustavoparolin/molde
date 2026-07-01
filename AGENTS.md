# Agent Instructions — Molde (Parolin Stack)

> **Who this file is for**: Any AI agent driving this repository — Claude Code, GitHub Copilot, an
> autonomous orchestrator (Hermes/Jorjis), or any future model. The rules here are **non-negotiable**.
> Read every section before touching code.

---

## 0. First: orient yourself

1. **Read `.specify/memory/molde-brain.md`** — deploy recipe (`provision.ps1`), known gotchas,
   AI integration patterns, AND the **"Parolin infrastructure reference"** (VPS Oracle, Coolify,
   Cloudflare, R2, Tailscale, DBeaver, container IPs, subdomain pattern). Essential for any
   infrastructure or storage decisions.
2. **Read `.specify/memory/parolin-stack.md`** — developer reference: exact stack versions
   (React 19, Fastify 5, Prisma 7, Node 22), canonical configs (`backend/package.json`,
   `prisma.config.ts`), auth flow, env var table, deploy recipe, and known code gotchas. Read
   before scaffolding any new feature or debugging a build failure.
3. Read `.specify/memory/constitution.md` — governance rules that override everything else.
4. Read `.brief/idea.md` — the product intent for *this* app. If it's incomplete, interview the user
   and write it back before doing anything.
5. Scan `.brief/inspiration/` — read the images. The UI should echo their layout, density, and tone.
6. Read `.brief/stack.md` (if present) — infra overrides (custom domain, R2, AI flags).

**If this is a brand-new app (freshly copied from the Molde template):** before specifying or coding,
check for a newer speckit and update it (see §2.4). The template may be months old; the latest
speckit may have critical fixes or new commands.

Do not start specifying or coding until you understand the full brief and the infra context.

---

## 1. The `.brief/` folder is planning context

| File / Dir | Purpose |
|---|---|
| `.brief/idea.md` | Product intent. **Read fully, write back if incomplete.** |
| `.brief/inspiration/` | Reference screenshots. UI must echo these visually. |
| `.brief/stack.md` | Stack overrides (domain, R2, AI, infra notes). |
| `.brief/notes.md` | Freeform notes from the user. |

---

## 2. The speckit framework — your primary tool for non-trivial work

Speckit is a **software development discipline (SDD) framework** that structures the journey from
a product idea to deployed, tested, reviewed code. It prevents the most common failure modes:
skipping design, skipping tests, skipping GitHub issues, and skipping peer review.

**Installed version**: `0.11.0` (see `.specify/integrations/speckit.manifest.json`).

### 2.1 Why speckit matters

During the first Molde app (Recibos), critical steps were skipped:

- GitHub issues were never created → no traceability, no project tracking.
- Tests were never written → quality regressions went undetected.
- No PR was created → no peer review, no second set of eyes on the implementation.

This AGENTS.md exists so no agent ever repeats those omissions. Every gate below is **mandatory**.

### 2.2 Full command reference

| Command | Purpose | Produces |
|---|---|---|
| `/speckit-specify <description>` | Write a product specification from the brief | `specs/NNN-feature/spec.md` |
| `/speckit-clarify` | Resolve NEEDS CLARIFICATION markers in spec | Updated `spec.md` |
| `/speckit-checklist <domain>` | Generate requirements quality checklist | `specs/NNN-feature/checklists/<domain>.md` |
| `/speckit-plan` | Architecture design, data model, API contracts | `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` |
| `/speckit-tasks` | Break plan into executable tasks | `tasks.md` |
| `/speckit-analyze` | Cross-artifact consistency check (read-only) | Analysis report |
| `/speckit-taskstoissues` | Convert tasks.md into GitHub Issues | GitHub Issues on the repo |
| `/speckit-implement` | Implement all tasks in order | Source code |
| `/speckit-constitution` | Regenerate / update the constitution | `.specify/memory/constitution.md` |
| `/speckit-agent-context-update` | Refresh agent context pointers in CLAUDE.md | Updated `CLAUDE.md` |

### 2.3 Extension hooks

Speckit supports before/after hooks for each command via `.specify/extensions.yml`. Always check for
hooks at the start and end of each command. Mandatory hooks (`optional: false`) must run and block
completion. Optional hooks are surfaced but not auto-executed.

### 2.4 Speckit origin and update procedure

**Speckit is the open-source SDD framework at `https://github.com/github/spec-kit`.**
The Molde template ships a customized snapshot of it (Parolin Stack conventions baked in).

**How to install / upgrade the official CLI** (one-time setup per developer machine):
```bash
# Requires uv (https://docs.astral.sh/uv/) and Python 3.11+
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z
# Replace vX.Y.Z with the latest tag from https://github.com/github/spec-kit/releases

# Check for newer releases (read-only)
specify self check

# Upgrade in place
specify self upgrade
```

**How Molde integrates speckit:**
- Molde ships a pre-configured snapshot in `.claude/skills/speckit-*/SKILL.md` (for Claude Code)
  and `.github/prompts/speckit.*.prompt.md` (for Copilot). These are tracked with checksums in
  `.specify/integrations/claude.manifest.json` and `.specify/integrations/speckit.manifest.json`.
- Molde's version uses **dashes** in skill names (`/speckit-specify`) while the official CLI uses
  **dots** (`/speckit.specify`). The underlying logic is the same.
- Parolin Stack conventions (vertical slice, Mantine 8, `requireAuth`, Prisma 7, etc.) are baked
  into Molde's skill files — the official CLI would need re-initialization to get these.

**Update procedure for a Molde-derived app** (run between features, never mid-feature):
1. Check installed version: `cat .specify/integrations/speckit.manifest.json` → `version`.
2. Run `specify self check` to see if upstream has a newer version.
3. If a new version is available, update the **Molde template first**:
   - In `C:\Users\gusta\OneDrive\web\molde`: `specify self upgrade`
   - Review what changed (skill files under `.claude/skills/`), reconcile any Parolin Stack
     customizations that may have been overwritten.
4. Copy updated skill files from Molde into this project's `.claude/skills/` directory.
5. Re-read the new skill files before proceeding — commands may have changed.
6. If `specify` CLI is not installed or offline: proceed with current version and note it.

---

## 3. Mandatory development workflow — no steps may be skipped

> **STOP**: If you are tempted to skip any phase below, re-read §2.1 first.

### Phase 0: Brief validation

- [ ] Read `.brief/idea.md`. If it has TODO or is blank, interview the user and fill it.
- [ ] Read `.brief/inspiration/` images. Note layout, color, density.
- [ ] Confirm the repo has a GitHub remote: `git config --get remote.origin.url`. If not, create one
  with `gh repo create <slug> --private --source . --remote origin && git push -u origin main`.

### Phase 1: Specify

```
/speckit-specify <one-paragraph description from idea.md>
```

- Produces `specs/NNN-feature/spec.md`.
- Run `/speckit-clarify` if `[NEEDS CLARIFICATION]` markers remain.
- Run `/speckit-checklist requirements` to validate spec quality.
- Do **not** proceed until all checklist items pass.

### Phase 2: Plan

```
/speckit-plan
```

- Produces `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`.
- The plan is technology-specific. It must reference the Parolin Stack (Fastify + Prisma + React +
  Mantine + Coolify + Cloudflare Pages) unless `.brief/stack.md` overrides.
- Check constitution gates; any MUST violation is CRITICAL and blocks progression.

### Phase 3: Generate tasks

```
/speckit-tasks
```

- Produces `tasks.md` with all phases, task IDs (`T001`, `T002`, …), and `[US1]` story labels.
- Parallel tasks are marked `[P]`.
- Every task must have an exact file path — no hand-wavy descriptions.

### Phase 4: Analyze (required before GitHub issues)

```
/speckit-analyze
```

- Read-only cross-artifact check. Produces a findings report in-conversation (no file writes).
- Resolve all CRITICAL findings before proceeding.
- HIGH findings should be addressed; document any you intentionally accept.

### Phase 5: Create GitHub Issues — MANDATORY

```
/speckit-taskstoissues
```

- Converts every task in `tasks.md` into a GitHub Issue on **this repo's remote**.
- Verifies the remote is a GitHub URL first — aborts if not.
- **This step was skipped during Recibos development. Never skip it again.**
- Issues provide: traceability, project board visibility, PR linking, async review capability.
- After creating issues, note the issue number range in `.brief/notes.md`.

### Phase 6: Implement

```
/speckit-implement
```

- Works one task at a time in order. Marks each `[x]` in `tasks.md` when done.
- Respects TDD: if contracts exist, write tests before implementing the contract.
- Stops and reports on failure; does not silently skip tasks.

**During implementation — non-negotiable rules:**

- [ ] Every new backend route must use `requireAuth` (unless explicitly public).
- [ ] All DB access goes through `src/repositories/db.ts` (Prisma with audit extension).
- [ ] Copy the `Item` vertical slice shape exactly (see §6 below).
- [ ] No secrets in source code or `.env.example` (only placeholder values).
- [ ] After each parent task group completes: run quality gates (see §4).

### Phase 7: Write tests

- Unit tests go next to the source file (`*.test.ts`). Framework: Vitest.
- E2E tests go in `e2e/*.spec.ts`. Framework: Playwright. Run with `npx playwright test`.
- **Minimum**: one happy-path unit test per service function, one E2E per user-facing flow.
- **This step was skipped during Recibos development. Never skip it again.**
- Tests must pass before any commit.

### Phase 8: Peer review — create a PR

```bash
git checkout -b feature/issue-N-short-description
# ... implement and commit ...
gh pr create --title "feat: description" --body "$(cat <<'EOF'
## Summary
- Bullet points of changes

## Test plan
- [ ] How to verify

Fixes #N
EOF
)"
```

- Branch naming: `feature/issue-N-short-description` or `fix/issue-N-short-description`.
- PR body must reference the GitHub issue (`Fixes #N`).
- Do **not** self-merge. The PR is the review artifact.
- **This step was skipped during Recibos development. Never skip it again.**

---

## 4. Quality gates — run before every commit

```bash
npm run typecheck     # must pass, always
npm run lint          # must pass if configured
npm test              # Vitest unit tests
npx playwright test   # E2E, only when both servers are running
```

**Never commit if any gate fails.** Fix the issue, then commit.

### Commit discipline

- One commit per feature. Never batch multiple features into one uncommitted tree.
- Use conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Always include `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` (or active model).
- Update `CHANGELOG.md` and bump `package.json` version for feature commits.

---

## 5. The Hermes autonomous protocol

When acting as Hermes (the autonomous orchestrator that turns a Telegram idea into a deployed app),
run the `/molde.new` skill — it covers the full intake → spec → implement → deploy loop.
The skill is the single source of truth for this workflow; do not duplicate its steps here.

---

## 6. Architecture reference — imitate the `Item` slice

Every new entity must follow this exact layering. No shortcuts, no mixtures.

```
schema.prisma
  → repositories/<entity>Repository.ts   (DB + optional in-memory fallback in skeleton only)
  → services/<entity>Service.ts          (domain logic, events)
  → api/routes/<entity>s.ts              (Zod validation, requireAuth, registered in server.ts)

frontend:
  store/<entity>sStore.ts               (Zustand)
  → pages/<Entity>sPage.tsx             (Mantine components, uses apiClient.ts)
```

- `requireAuth` on every route that touches user data.
- `createdBy`/`updatedBy` are auto-filled by the Prisma audit extension — never set manually.
- All DB access via `repositories/db.ts`.
- Frontend state via Zustand stores only (no prop drilling, no raw fetch in components).
- UI: Mantine 8. No external CSS frameworks. Tokens in `frontend/src/theme.ts`.

---

## 7. Security — non-negotiable

- `.env` is gitignored → real credentials go here only.
- `.env.example` is git-tracked → only placeholder values, never real credentials.
- `~/.config/molde/provision.env` holds deploy credentials → never committed anywhere.
- Every secret (DB URL, JWT secret, Google OAuth, R2 keys, AI API keys) goes to Coolify envs.
- Build-time frontend config (`VITE_API_BASE_URL`) is injected by the GitHub Action, not hardcoded.

---

## 8. Deep reference documents

| Document | What it contains |
|---|---|
| `.specify/memory/molde-brain.md` | Deploy recipe (provision.ps1), architecture, AI integration, infra ops, known gotchas |
| `.specify/memory/parolin-stack.md` | Dev reference: stack versions, canonical configs, auth flow, env vars, known code gotchas |
| `.specify/memory/constitution.md` | Governance rules (non-negotiable) |
| `.specify/integrations/speckit.manifest.json` | Installed speckit version + file checksums |
| `.specify/integrations/claude.manifest.json` | Installed Claude skill files + checksums |
| `.specify/init-options.json` | Speckit config (sequential feature numbering, PS scripts) |
| `.specify/workflows/workflow-registry.json` | Registered workflow: Full SDD Cycle |
| `specs/` | All feature specs created via `/speckit-specify` |

---

## 9. Common failure modes — learn from Recibos

| What was skipped | Consequence | Rule |
|---|---|---|
| GitHub Issues | No traceability, no PR links, no project board | Always run `/speckit-taskstoissues` after tasks |
| Tests | Silent regressions (sharp pipeline bug took 6h to find) | Always write Vitest unit tests; Playwright E2E for UI flows |
| PR / peer review | No audit trail, no second set of eyes | Always open a PR; never self-merge |
| `/speckit-analyze` | Inconsistencies between spec, plan, tasks go undetected | Run analyze before creating issues |
| Sharp `.metadata()` on same instance | Image preprocessing silently broken; LLM received wrong input | Use separate `sharp(buf)` for metadata reads (see `molde-brain.md`) |
| `AI_MAX_TOKENS` too low for thinking models | Empty responses from qwen3-vl:30b (reasoning consumed all tokens) | Set `AI_MAX_TOKENS=16384` for thinking models |

---

## 10. Writing back to the template — field notes

**The Molde template learns from every app built on top of it.**

If you are an AI agent working on a Molde-derived app (any project that has `.brief/` and
`.specify/` folders) and you encounter any of the following:

- A **bug** that stems from template code or template patterns
- A **gotcha** that wasted significant debugging time
- A **pattern** that works better than what the template demonstrates
- An **infra/deploy** surprise not covered in `molde-brain.md`
- A **performance** finding relevant to the stack

→ **Append an entry to `C:/Users/gusta/OneDrive/web/molde/.specify/memory/field-notes.md`.**

Use the entry format defined at the top of that file (date · app · category · severity · status).
Set `status: noted`. Gustavo will review and promote entries to `molde-brain.md` or fix them in
the template.

**Do NOT** write every minor decision here — only discoveries that would have saved time if they
had been documented before you started.

# Field Notes — Molde Template Feedback Log

> **Append-only log.** Any AI agent working on a Molde-derived app should add entries here when
> it discovers something worth preserving: bugs, gotchas, patterns, infra surprises.
>
> **Two-layer system:**
> - **This file** = raw discoveries (agents write here freely).
> - **`molde-brain.md`** = curated knowledge (Gustavo or an agent promotes HIGH/CRITICAL entries).
>
> After adding an entry, set `status: noted`. Gustavo will mark it `promoted` or `fixed-in-template`
> when it's incorporated into the template.

---

## Entry format

```
## [YYYY-MM-DD] [app-slug] — [category]: one-line summary
**Severity:** CRITICAL | HIGH | LOW
**Status:** `noted` | `promoted` | `fixed-in-template`

What happened, what the root cause was, and what the fix/pattern is.

**Template impact:** what (if anything) should change in Molde's code or docs.
```

**Categories:** `bug` · `pattern` · `gotcha` · `infra` · `performance` · `dx`

---

## [2026-07-19] coringao-orcamento — infra: Coolify API blocked by a Cloudflare challenge when called from GitHub Actions
**Severity:** HIGH
**Status:** `fixed-in-template`

**Resolution (2026-07-20):** the provision token has no Zone Settings scope, so the WAF itself
was left untouched (still Gustavo's call). Instead, `deploy-backend.yml` now tries the Cloudflare
path first (real TLS; self-heals if the WAF is ever adjusted) and, on failure, falls back to
calling the VPS origin directly via `curl --resolve <host>:443:$COOLIFY_ORIGIN_IP -k` — `-k` is
required because Traefik serves its default self-signed cert on the direct path (the real cert
lives at the CF edge); the request stays authenticated by the Coolify API bearer token.
`provision.ps1` now sets the `COOLIFY_ORIGIN_IP` secret (from `COOLIFY_HOST`) automatically.
Validated with a real workflow_dispatch run on coringao-orcamento: CF path challenged → fallback
fired → Coolify queued the deployment. **Apps provisioned earlier need the secret set manually**
(`gh secret set COOLIFY_ORIGIN_IP --body <vps-ip>`) plus the updated workflow file.

`deploy-backend.yml`'s redeploy trigger (`curl .../api/v1/deploy?...`, run from a GitHub-hosted
runner) got back a Cloudflare **Managed Challenge** HTML page ("Just a moment...") instead of
reaching Coolify — even with the correct `CF-Access-Client-Id`/`CF-Access-Client-Secret` headers
(those satisfy Cloudflare *Access*, but this looks like a separate zone-level Bot Fight Mode /
WAF challenge that Access headers don't bypass). `curl` exits 22 on the non-2xx HTML response, so
the job fails and the redeploy never actually happens. This was the **first time this exact call
path was verified against a live GH Actions run** for any app — `provision.ps1` has set the
backend-CD secrets automatically since 2026-06-30, but nothing confirmed the workflow actually
*reaches* Coolify end-to-end from GitHub's IP ranges, so this may be silently broken for every
app's backend CD (parafit, recibos, trajetorias2, paramalhar, celula), not just this one. Manually
calling the same Coolify endpoint from a residential/dev-machine IP (not a GH Actions runner)
worked fine, which points at the runner's IP reputation/ASN as the trigger, not the request itself.

**Template impact:** needs a Cloudflare-side fix (WAF/Bot Fight Mode rule allow-listing GitHub
Actions IP ranges for `coolify.parolin.net`, or a Cloudflare Access "Service Auth" bypass policy
scoped to the API path) — this touches shared production security posture across every app on the
zone, so an agent should not change it unilaterally; surface it to Gustavo first.

## [2026-07-19] coringao-orcamento — bug: `deploy-backend.yml`'s curl call was silently unrunnable
**Severity:** HIGH
**Status:** `fixed-in-template`

`curl -sf --fail-with-body` — `-f`/`--fail` and `--fail-with-body` are mutually exclusive in curl;
combining them always errors with `curl: option --fail-with-body: is badly used here` (exit 2)
before the request is even sent. Every backend CD run must have hit this immediately, meaning the
Coolify redeploy trigger has likely never actually fired for **any** app since the workflow was
added to the template (2026-06-30) — it's been silently failing (or silently skipping, for apps
without the secrets set, which masked the bug). Found on `coringao-orcamento`'s first real run
right after wiring up production secrets. Fixed in the template by dropping the redundant `-f`
(`curl -s --fail-with-body ...`), which still fails the step (non-zero exit) on a non-2xx response
while showing the response body — same intended behavior, just without the conflicting flag.

**Template impact:** fixed directly in `molde/.github/workflows/deploy-backend.yml`. Apps
provisioned before this fix should re-copy the corrected workflow file.

## [2026-07-19] parafin — infra: hardcoded AI model defaults go stale in a matter of months
**Severity:** CRITICAL
**Status:** `promoted`

`provision.env`'s `AI_MODEL` was `glm-4v-flash` (Z.AI/bigmodel.cn) — the API now rejects it with
"model doesn't exist" (renamed/retired). Separately, `molde-brain.md`'s own documented default,
**Gemini 2.0 Flash, was deprecated and shut down 2026-06-01** — so the template's "confirmed
working" fallback was *also* dead by the time this was checked, just two months later. Neither
failure was caught earlier because the PDF-extraction feature that depends on `AI_*` had been
deployed but never actually exercised end-to-end with a real file — the failure was silent until
someone finally clicked the button.

**Fix:** two behavior changes going forward. (1) Never trust a hardcoded model name as
"confirmed working" indefinitely — treat any `AI_MODEL` default as **time-sensitive**: at the
moment a new app is provisioned, *or* whenever an existing app's AI feature starts erroring,
research/verify the current best available model for the provider actually in use, rather than
copying whatever name is in an old `.env.example` or a previous app's `provision.env`. (2) Any
feature gated behind `AI_*` needs at least one real smoke-test call (not just unit tests with a
mocked client) before being considered "done" — a mocked test can't catch a dead model name.

**Template impact:** `molde-brain.md` §AI integration rewritten to drop the specific hardcoded
default recommendation and instead instruct the agent to verify the current model at setup time.
Also added Claude (via Anthropic's OpenAI-compat endpoint) as a validated higher-quality option,
and a separate gotcha about not asking small/free models to do sign arithmetic on financial
values (see next entry).

---

## [2026-07-19] parafin — gotcha: don't ask a free/flash LLM to compute value signs — ask it to perceive a flag instead
**Severity:** HIGH
**Status:** `promoted`

Extracting credit-card transactions via LLM: when the prompt asked the model directly for a
signed `"valor"` (negative for refunds/payments, positive for purchases), a free-tier flash model
(GLM) applied the negative sign to *every* transaction, not just the credits — a real
correctness bug that would have silently corrupted every backfilled transaction if unnoticed.
Smaller/free/"flash"-tier models are unreliable at arithmetic/sign reasoning layered on top of
extraction, even when the instruction is explicit and repeated.

**Fix:** ask the model only to *perceive* something literally printed in the source (e.g., "does
this line have a `CR` suffix? true/false" + `"valorAbsoluto"` always positive), then compute the
signed value and the transaction type deterministically in code from that flag. This pattern
generalizes: whenever an LLM extraction step also requires a derived computation (sign flips,
date-year inference from a statement period crossing a year boundary, unit conversions), split it
into "LLM perceives a raw/literal fact" + "code computes the derived value" — don't ask the LLM to
do both perception and computation in one shot for anything that has a hard right answer.

**Template impact:** worth a short callout in `molde-brain.md` §AI integration alongside the model
freshness note above — not written into the shared code itself since it's a prompting pattern,
not a reusable function.

---

## [2026-06-15] recibos — bug: sharp `.metadata()` invalidates pipeline silently
**Severity:** CRITICAL
**Status:** `promoted`

Calling `.metadata()` on the same `sharp(buf)` instance used for image processing consumes the
lazy stream internally. Subsequent `.jpeg().toBuffer()` calls return empty or corrupt output with
no error thrown. The OCR received a blank image — took 6h to diagnose.

**Fix:** Always use a **separate** `sharp(buf)` instance for metadata reads:
```typescript
const meta = await sharp(buf).metadata();   // read-only, throw-away instance
let pipeline = sharp(buf).rotate();         // fresh pipeline for output
```

**Template impact:** Documented in `molde-brain.md`. Any new service using `sharp` must follow
this pattern. Consider adding a lint comment to the AI integration example.

---

## [2026-06-15] recibos — gotcha: `AI_MAX_TOKENS` too low for thinking models
**Severity:** HIGH
**Status:** `promoted`

`qwen3-vl:30b` (and other reasoning/thinking models) consume tokens internally for chain-of-thought
before producing output. With the default `AI_MAX_TOKENS=4096`, the model exhausted the budget on
reasoning and returned an empty response — no error, just silence.

**Fix:** Set `AI_MAX_TOKENS=16384` (or higher) for any thinking model.

**Template impact:** Documented in `molde-brain.md`. The `.env.example` comment should warn about this.

---

## [2026-06-15] recibos — gotcha: GitHub Issues / tests / PR were all skipped
**Severity:** HIGH
**Status:** `promoted`

During the first Molde app build, the AI skipped creating GitHub Issues, writing tests, and opening
a PR. The resulting app had no traceability, silent regressions went undetected, and there was no
audit trail.

**Fix:** `AGENTS.md` §2.1 and §9 document these as mandatory non-skippable phases.

**Template impact:** Already addressed in AGENTS.md. Monitor future apps — if an agent skips these
again, add a harder gate (e.g., a pre-commit hook that checks for open issues).

---

## [2026-06-29] parafit — bug: local Prisma 7 migrate fails (no .env autoload + missing datasource.url)
**Severity:** HIGH
**Status:** `noted`

Setting up local Postgres testing on a fresh Molde app, two template gaps blocked `prisma migrate`:

1. **Prisma 7 no longer auto-loads `.env`.** `backend/prisma.config.ts` reads
   `process.env.DATABASE_URL` but nothing populates it, so every `prisma migrate` / `prisma generate`
   command runs with `DATABASE_URL=undefined`.
2. **`prisma migrate` requires `datasource.url` in the config**, but the template's `prisma.config.ts`
   only declares `datasource.adapter`. Error: `The datasource.url property is required in your Prisma
   config file when using prisma migrate`.

Also: `backend` dev script (`node --watch --import=tsx src/api/server.ts`) doesn't load `.env`
either, so `npm run dev` silently falls back to the in-memory repos instead of hitting Postgres.

**Fix applied in parafit:**
- `prisma.config.ts`: load root `.env` guarded by `existsSync` (so prod/Coolify, which has no `.env`,
  is unaffected), and add `url: process.env.DATABASE_URL!` to `datasource` alongside `adapter`:
  ```ts
  const envPath = fileURLToPath(new URL("../.env", import.meta.url));
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  export default defineConfig({
    datasource: { url: process.env.DATABASE_URL!, adapter: () => new PrismaPg(process.env.DATABASE_URL!) },
  });
  ```
- `backend/package.json` dev script: prepend `node --env-file-if-exists=../.env ...` so the dev server
  reads the root `.env` locally (harmless in prod, which uses the `start` script + Coolify env vars).
- Also note: `prisma migrate dev` did NOT reliably generate the client on a fresh install — had to run
  `npx prisma generate` explicitly, otherwise `@prisma/client` had no `PrismaClient` export.

**Template impact:** Fix `molde/backend/prisma.config.ts` and the `dev` script in
`molde/backend/package.json` the same way. Otherwise every new Molde app hits this on first local
`prisma migrate`. Consider documenting the `npx prisma generate` step in README §"Rodar localmente".

---

## [2026-06-29] parafit — bug: provision.ps1 ssh-keygen `-N '""'` breaks Coolify deploy key on Windows
**Severity:** CRITICAL
**Status:** `noted`

`scripts/provision.ps1` (deploy-key step) ran `ssh-keygen -t ed25519 ... -N '""'` to make a
passphrase-less key. On Windows PowerShell, single-quoted `'""'` passes the **literal two-character
string `""` as the passphrase** — so the key is encrypted. Coolify's `POST /api/v1/security/keys`
then rejects it with **`Invalid private key`**, aborting provisioning right before the Coolify
Application + envs + deploy are created. (Confirmed: `ssh-keygen -y -P "" -f key` → "incorrect
passphrase"; with `-N ''` it loads fine. No CRLF issue.)

**Fix:** Change `-N '""'` → `-N ''` (truly empty passphrase) in `provision.ps1`. For extra safety,
normalize the private key to LF before sending: `(Get-Content $f -Raw) -replace "\`r\`n","\`n"`.

**Recovery when it half-fails:** provision is **not idempotent** (`$ErrorActionPreference=Stop`,
no skip-on-exists) and `deprovision.ps1` does **not** delete Coolify resources (Postgres/app) or the
`<slug>.parolin.net` CNAME — only Pages, R2, and the `api-<slug>` DNS. So a clean redo needs manual
Coolify+CNAME cleanup. Cleaner: a "resume" script that reuses the existing Cloudflare + Postgres and
runs only the remaining Coolify steps (start DB → key → app → envs → PATCH → deploy), reading the
DB's `internal_db_url` from `GET /api/v1/databases/:uuid`.

**Gotchas seen during resume:**
- Coolify stores each env **twice** (production `is_preview=false` + preview `is_preview=true`) — a
  `GET /envs` showing 2× per key is NORMAL, not duplication. (`$x.value` over the pair joins to e.g.
  "22 22" in PowerShell — cosmetic, not a corrupted value.)
- Creating the app can pre-seed `NIXPACKS_NODE_VERSION`, so the env POST returns **409 Conflict** —
  harmless if the value is already `22`.

**Template impact:** Apply the `-N ''` fix to `molde/scripts/provision.ps1` (and check the `.sh`
twin). Consider making provision idempotent (skip-on-409) and extending `deprovision.ps1` to remove
the `<slug>.parolin.net` CNAME + Coolify app/db (with confirmation) so a botched run can be cleanly redone.

---

## [2026-06-29] parafit — dx: agent started spec-kit + committed before running `personalize` (near-miss .brief leak)
**Severity:** HIGH
**Status:** `noted`

On a fresh Molde copy, the agent jumped straight into `.brief` work + spec-kit + a `git commit` **without
running `scripts/personalize.sh` first**. Two consequences: (1) the initial commit staged `.brief/` (50
personal screenshots) while `origin` still pointed at `gustavoparolin/molde.git` — a `git push` there would
have leaked private planning assets **into the template repo**; avoided only because the agent manually
checked `git remote -v` before pushing. (2) `personalize` then runs `rm -rf .git`, throwing that commit away.

**Root cause:** nothing enforces "personalize first." The README documents it, but an agent that doesn't
read the README (or isn't invoked via `/molde.new`) has no guardrail.

**Fix / template impact (recommended):**
1. **Pre-commit hook in the template** that aborts when `git remote get-url origin` matches `*/molde.git`
   (i.e. not yet personalized) — blocks the leak at the source for every future app.
2. **First-step gate in `AGENTS.md`/`CLAUDE.md`**: "If `package.json` name == `molde-app` OR origin remote
   is `*/molde.git` OR `.brief/` is not gitignored → run `scripts/personalize.sh` (or `/molde.new`) BEFORE
   any commit / spec-kit / push."
3. Optionally have `personalize` warn if a prior commit already tracked `.brief/`.

---

## [2026-06-30] parafit — pattern: E2E-testing Google-OAuth-gated routes via the dev mock endpoint
**Severity:** HIGH
**Status:** `noted`

Every Molde app gates routes behind Google OAuth, which Playwright can't drive directly without a
real Google account + headful flow. Parafit's backend already ships a dev-only bypass
(`POST /auth/google/mock` in `api/routes/auth.ts`, guarded so it's harmless if hit in prod — it
still issues a real JWT via `reply.jwtSign`) built for exactly this. The missing piece was wiring
it into Playwright:

1. **`globalSetup`** (in `playwright.config.ts`) seeds fixture data via a Prisma-direct script
   (`execSync("npm run seed:e2e ...")`), then POSTs to `/auth/google/mock` with a fixed
   `googleSubjectId`/email to get a token, and stashes `userId`/`token`/etc. into `process.env` —
   which propagates to Playwright's worker subprocesses since they fork from the main process.
2. **Each spec's `test.beforeEach`** injects `localStorage["auth.user"]` (JSON) and
   `localStorage["auth.token"]` (raw JWT) via `page.addInitScript(...)` **before** `page.goto()`.
   This is required, not optional: the frontend's authStore/apiClient read these keys
   **synchronously at module-load time**, not reactively — setting localStorage after the app's JS
   has already executed does nothing.

**Template impact:** Worth promoting into the template itself: ship a generic
`e2e/global-setup.ts` skeleton + a `seed:e2e` script convention + documented `auth.user`/
`auth.token` localStorage contract in `AGENTS.md`, so every future Molde app gets OAuth-free E2E
for free instead of re-deriving this pattern each time.

---

## [2026-06-30] parafit — gotcha: TS intersection elides element type when both sides declare the same prop
**Severity:** MEDIUM
**Status:** `noted`

`type Detail = Summary & { days: DayDetail[] }` where `Summary` already declares `days: { id: string }[]`
does **not** merge to `(DayDetail & {id:string})[]` as you'd expect — TypeScript resolves `.days` to
one of the two conflicting array types (observed: it kept `Summary`'s narrower one), so
`.map((day) => ...)` callbacks silently get the wrong, narrower type with no error at the
intersection declaration itself — the breakage only surfaces downstream where `.name`/`.exercises`/
etc. don't exist on the narrow type.

**Fix:** `Omit<Summary, "days"> & { days: DayDetail[] }` — remove the conflicting key from one side
before intersecting.

**Template impact:** No code fix needed (app-specific types), but worth a one-line callout in
`AGENTS.md`'s TypeScript conventions section since this is a generic pitfall any Zustand store with
a "summary vs detail" type pair (common in Molde's vertical-slice pattern) can hit.

---

## [2026-06-30] parafit — bug: redirect-on-no-session effect races a component's own `reset()` call
**Severity:** MEDIUM
**Status:** `noted`

A page component had `useEffect(() => { if (!session) navigate("/treino") }, [session, navigate])`
to bounce users who land there with no active session (e.g. a hard refresh). But the same
component's own "Save" handler does `await finishSession(...); reset(); navigate("/")` as its exit
flow — `reset()` nulls the store's `session`, which re-fires the effect (still mounted, subscribed)
and its `navigate("/treino")` raced the intentional `navigate("/")`, observed to win, bouncing the
user to the wrong screen. Caught by an E2E test asserting the post-save URL; would have shipped as
a confusing UX bug otherwise.

**Fix:** Scope the guard effect to mount-only (`[]` deps) when the same component both (a) redirects
on missing state and (b) intentionally clears that state as part of its own success/exit flow.

**Template impact:** General pattern worth a line in `AGENTS.md`: "guard effects that redirect on
null store state must not share reactive deps with the component's own state-clearing exit path."

---

## [2026-06-30] parafit — gotcha: Mantine `Tabs` keeps all `Tabs.Panel`s mounted, breaks unscoped Playwright text queries
**Severity:** LOW
**Status:** `noted`

Mantine's `Tabs` component renders every `Tabs.Panel` in the DOM simultaneously (hidden via CSS,
not unmounted) unless `keepMounted={false}` is set. An E2E test doing `page.getByText("Day A")`
after creating a day failed with a Playwright strict-mode violation: two elements matched, one in
the "Overview" panel's day list and one in the "Days" panel's day editor — same text, both present
in the DOM regardless of which tab is visually active.

**Fix:** Scope locators to the active panel via `page.getByRole("tabpanel", { name: "<tab label>" })`
before chaining `.getByText(...)` / `.getByRole(...)` calls, any time a page has Mantine `Tabs` with
content that could repeat text across panels (e.g. an item's name shown in both an overview list and
an edit list).

**Template impact:** Worth a one-liner in the E2E testing guidance: "scope locators to
`getByRole('tabpanel', { name })` on any page using Mantine `Tabs`, don't assume only the active
panel is in the DOM."

---

## [2026-06-30] parafit — infra: Coolify Postgres interno usa `postgres` como nome do banco, não o slug do app
**Severity:** HIGH
**Status:** `fixed-in-template`

Ao provisionar um app Molde no Coolify, o campo "Initial Database" do recurso Postgres fica como
`postgres` (padrão do container Docker). O backend conecta via `DATABASE_URL` que também aponta
para `.../<slug-do-app>` (gerado pelo `provision.ps1`), mas o banco **fisicamente criado dentro do
container** continua se chamando `postgres` — a URL gerada pelo provision aponta para o nome certo,
mas o container não cria esse banco; ele cria o banco `postgres`.

**Como identificar:** no DBeaver (via túnel SSH), a árvore mostra o banco como `postgres`, não
`parafit`/`recibos`/etc. `\l` no psql confirma.

**Fix manual pós-provision:** via `docker exec`:
```bash
sudo docker exec <uuid-container> psql -U postgres -d template1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='postgres' AND pid <> pg_backend_pid();" \
  -c "ALTER DATABASE postgres RENAME TO <slug>;"
```
Não é preciso atualizar `DATABASE_URL` se o `provision.ps1` já gerou a URL com o nome correto —
o Coolify aponta para o slug, que agora existe. Se a URL estava apontando para `postgres` (geração
antiga), atualizar a env var no Coolify + redeploy.

**Nota:** `trajetorias2` é exceção — foi provisionado com `POSTGRES_USER=trajetorias2_app` e
`POSTGRES_DB=trajetorias2` desde o início (versão mais nova do provision?), então o banco já
estava nomeado corretamente.

**Template impact:** `provision.ps1` deveria passar `POSTGRES_DB=<slug>` ao criar o recurso
Postgres no Coolify (`POST /api/v1/databases` → campo `postgres_db`). Verificar se o endpoint
da API do Coolify aceita esse campo; se sim, adicionar ao script e fechar esse gotcha de vez.

---

## [2026-06-30] parafit — infra: Coolify NÃO faz auto-deploy do backend (só o frontend via Cloudflare Pages)
**Severity:** HIGH
**Status:** `fixed-in-template`

O workflow `deploy-frontend.yml` (Cloudflare Pages) roda a cada push em `main` e mantém o
frontend sempre atualizado. O backend (`api-<slug>` no Coolify) **não tem CD** — fica rodando
o último build manual indefinidamente. No parafit, o backend ficou parado no commit inicial
(`4adb04f`, pré-personalize) por dias, com o frontend já em US5, até ser identificado e corrigido
manualmente.

**Sintoma:** `GET /health` retorna 200 (o processo está up), mas `GET /plans` retorna `404 Route
not found` em vez de 401 — a rota não existe na versão antiga do código.

**Fix imediato:** clicar "Redeploy" no Coolify para o app `api-<slug>`. Fazer isso após cada push
que toque o backend enquanto o CD não estiver configurado.

**Fix permanente (ainda não implementado):** configurar um webhook de deploy no Coolify usando
sua API REST (`POST /api/v1/deploy?uuid=<app-uuid>&force=false`) disparado pelo GitHub Actions
logo após o push em main — adicionar um step no workflow existente ou criar
`.github/workflows/deploy-backend.yml`.

**Template impact:** Adicionar `deploy-backend.yml` ao template Molde com o step de webhook
Coolify. Requer `COOLIFY_WEBHOOK_TOKEN` como GitHub secret (gerado no painel Coolify do app →
"Webhooks"). Documentar em `README.md` §"Deploy" que o backend precisa desse secret configurado
para ter CD automático.

---

## [2026-06-30] parafit — gotcha: icon-only `ActionIcon` buttons need explicit `aria-label`s that are unique per row, or Playwright `getByRole` collapses them
**Severity:** LOW
**Status:** `noted`

A reorderable list rendered both a parent-level "move up/down" control (with `aria-label={t("Mover
para cima")}` → "Move up") and a per-row "move up/down" control with the *same* translated label
text but no `aria-label` at all initially. Once both had labels with identical text, Playwright's
`getByRole("button", { name: "Move up" })` matched across unrelated UI levels (parent list reorder +
item-within-list reorder), and disabled buttons (e.g. the first row's "can't move up further") still
match by accessible name even though disabled — so `.nth(1)` did not reliably mean "the second
enabled one."

**Fix:** Give nested/repeated icon-only controls distinct `aria-label` text per semantic level (e.g.
"Move up" for day-level reorder vs. "Move exercise up" for exercise-level reorder within a day), not
just per-instance numbering. Disabled matches still count toward Playwright's match set, so plan
locator scoping (`.last()`, container-scoped locators) with that in mind.

**Template impact:** Worth noting in the E2E/accessibility guidance: "when a page has reorder
controls at more than one nesting level, give each level a distinct aria-label string — don't reuse
the same translated label for parent and child controls."

---

## [2026-06-30] molde — infra: backend CD + naming conventions estabelecidos no template
**Severity:** HIGH
**Status:** `fixed-in-template`

Três mudanças estruturais foram aplicadas ao template Molde (2026-06-30):

1. **Backend CD via `deploy-backend.yml`** — `.github/workflows/deploy-backend.yml` adicionado ao
   template. Aciona `GET /api/v1/deploy?uuid=$COOLIFY_APP_UUID&force=false` quando arquivos em
   `backend/**` ou `package.json` mudam. O `provision.ps1` agora seta automaticamente os 5 secrets
   necessários: `COOLIFY_APP_UUID`, `COOLIFY_API_TOKEN`, `COOLIFY_API_URL`, `CF_ACCESS_CLIENT_ID`,
   `CF_ACCESS_CLIENT_SECRET`. Apps provisionados antes precisam setar esses secrets manualmente.

2. **Naming convention oficial estabelecida** — `provision.ps1` usa:
   - API domain: `<slug>-api.parolin.net` (antes era `api-<slug>.parolin.net`)
   - DB name: `<slug>-db` (antes era `postgres` ou o slug sem sufixo)
   - DB username: `<slug>-user` (antes era `postgres` ou nome ad-hoc)
   - R2 bucket: `<slug>-assets` (sem mudança)
   - Apps legados (parafit, recibos, trajetorias2, paramalhar) mantêm o padrão antigo.

3. **Spec-kit documentado com origem real** — `github.com/github/spec-kit` é o repositório oficial.
   CLI: `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z`.
   Atualização: `specify self upgrade`. O Molde mantém uma customização (dashes vs dots em nomes
   de skill, convenções Parolin Stack). Ao atualizar spec-kit upstream, reconciliar manualmente.

---

## [2026-07-01] parafit — infra: NIXPACKS_NODE_VERSION do template (22) contradiz o engines.node (>=24) do próprio template
**Severity:** CRITICAL
**Status:** `noted`

`scripts/provision.ps1`/`provision.sh` do Molde setam `NIXPACKS_NODE_VERSION=22` como env var no
Coolify na hora de provisionar o backend — mas `backend/package.json` do PRÓPRIO template já declara
`"engines": { "node": ">=24.0" }` (desde a migração pra Prisma 7). Resultado: todo deploy do backend
falha no build (`npm install && prisma generate`) com
`Cannot find module '.../@prisma/client/runtime/query_engine_bg.postgresql.wasm-base64.js'`,
porque o `prisma generate` roda sob Node 22 mas gera artefatos incompatíveis com o Node que o
schema realmente espera. Isso ficou não-detectado no Parafit por dias — o backend parecia
"travado sem CD" quando na real todo deploy (manual ou automático) vinha falhando silenciosamente
nesse passo.

**Fix aplicado no Parafit** (`scripts/provision.ps1`/`.sh`): `NIXPACKS_NODE_VERSION` → `"24"`.
O template Molde (`C:/Users/gusta/OneDrive/web/molde/scripts/provision.ps1`/`.sh`) ainda está com
`"22"` — não alterado aqui de propósito (edição em repo compartilhado sem pedido explícito).

**Template impact:** bump `NIXPACKS_NODE_VERSION` pra `"24"` (ou remover a env var e deixar o
Nixpacks ler `engines.node` do `package.json` direto — mais robusto a futuras mudanças de versão)
nos dois scripts de provisionamento. Vale também checar se apps Molde mais antigos que o commit
`deploy-backend.yml` (nota acima, 2026-06-30) têm esse mesmo mismatch — o CD automático também
falharia silenciosamente pelo mesmo motivo.

---

## [2026-07-01] parafit — pattern: páginas multi-step precisam guardar a posição na URL, não só no store
**Severity:** HIGH
**Status:** `promoted`

Usuário reportou "se eu dou refresh no meio de um exercício, volta pra primeira página" no
`ActiveSessionPage` (fluxo de treino ativo, navegação entre exercícios). Causa raiz: a rota era
`/treino/sessao` (sem id nenhum) e a posição (`currentExerciseIndex`) só existia no Zustand
`sessionStore`, em memória. Um refresh reseta o JS runtime inteiro — o store volta ao estado
inicial — e como a rota não carregava nada a partir da URL, o `useEffect` de guarda simplesmente
redirecionava de volta pro seletor de planos. Nenhum dado foi perdido de verdade (a sessão e os
sets já logados continuavam intactos no backend); o bug era puramente de UI não saber onde estava.

**Fix:** rota virou `/treino/sessao/:sessionId?ex=<index>`. No mount, se o store não tem a sessão
(refresh, deep link, aba nova), busca via `GET /sessions/:id` e restaura a posição a partir do
`?ex=`; a cada mudança de exercício (next/prev/swipe/superset auto-advance/tap na timeline),
sincroniza `?ex=` de volta pra URL via `setSearchParams(..., {replace:true})`. Também: a página
`/treino` (home do fluxo, antes de entrar numa sessão) passou a checar
`GET /sessions?status=active|paused` quando o store está vazio, pra resumir uma sessão em
andamento mesmo entrando fresco (não só dando refresh na própria página de sessão).

**Gotcha real (perdeu ~40min até isolar):** a primeira versão do fix restaurava em DOIS passos —
`loadSession(id)` (que já seta `currentExerciseIndex: 0` internamente) seguido de um
`goToExercise(indexDaUrl)` como follow-up. Isso corre contra o próprio `useEffect` que sincroniza
`currentExerciseIndex → URL`: cada `set()` do Zustand dispara notify síncrono (via
`useSyncExternalStore`), então as DUAS chamadas de `set()` (uma dentro de `loadSession`, outra do
`goToExercise` alguns microtasks depois) geram passes de render/efeito SEPARADOS — e o React
StrictMode (dev) ainda dobra a invocação do efeito de restauração, disparando dois `loadSession`
concorrentes cujas atualizações de estado chegam em ordem imprevisível. Resultado: a URL ficava
"?ex=0" mesmo depois de restaurar pra "?ex=1", porque o efeito de sync via um snapshot de
`searchParams` já desatualizado no meio da corrida. **Só sumiu de verdade depois de**: (1) tornar a
restauração atômica — `loadSession(id, { exerciseIndex })` seta sessão E índice num único `set()`,
nunca deixando o store passar por um estado intermediário "índice 0" observável — e (2) guardar o
efeito de restauração com um `useRef` (não só o array de deps), pra que a segunda invocação do
StrictMode seja um no-op de verdade em vez de disparar o fetch de novo.

**Template impact:** adicionada uma seção nova ("Multi-step / stateful pages must reflect position
in the URL") no `molde-brain.md`, logo após "The reference slice", com o padrão genérico
(`/feature/:resourceId?step=<n>`, restauração atômica, guarda por ref contra StrictMode) — não é
código específico do Parafit, é um princípio de arquitetura de frontend que vale pra qualquer app
Molde com fluxo em etapas (wizard, checkout, carrossel de itens, editor paginado).

---

## [2026-07-02] parafit — infra: R2 é overkill pra um punhado de imagens estáticas
**Severity:** LOW
**Status:** `promoted`

Pedido: gerar e aplicar fotos de capa pra planos de treino (7 arquivos, ~130-200KB cada depois de
converter PNG→JPEG). Reflexo automático foi seguir o padrão já existente no projeto
(`uploadAssets.ts`, usado pros ~1500 assets de exercício vindos do scrape Technogym) — mas parar
pra pensar revelou que isso é overkill pra esse caso: 7 arquivos que quase nunca mudam, versionados
junto com o código de qualquer forma. `frontend/public/assets/` já vai pro deploy do Cloudflare
Pages como está — um path relativo (`/assets/plans/covers/foo.jpg`) funciona em dev local E em
produção sem nenhum passo de upload, sem precisar das credenciais R2 no `.env`.

**Fix:** guardou os arquivos direto em `frontend/public/assets/plans/covers/`, sem tocar no
`uploadAssets.ts`/R2 pra esse caso. `Plan.coverImageUrl` aponta pro path relativo direto.

**Template impact:** adicionado um bullet na seção "Cloudflare R2 — media and file storage" do
`molde-brain.md` deixando explícito quando NÃO vale a pena usar R2 — conjunto pequeno/raramente
atualizado de arquivos versionados com o código (logo, capas, arte de onboarding) vai direto em
`frontend/public/`; R2 compensa pra coisas numerosas, geradas em runtime, ou atualizadas
independente de deploy (scrape de mídia, foto que o usuário sobe).

## [2026-07-03] parafit — pattern: e2e specs compartilhando UM usuário de teste corre risco de race quando a suite cresce
**Severity:** HIGH
**Status:** `noted`

Setup típico de Playwright + mock-auth (padrão usado neste template): um `globalSetup.ts` roda
UMA VEZ pra toda a suite, autentica um usuário fixo (`e2e@parafit.test`), seeda um plano/fixture
pra ele, e todo spec injeta o MESMO token via `page.addInitScript`. Funciona bem com poucas specs.
Mas se dois specs quaisquer chamam uma ação que tem um invariante "descarta qualquer outro estado
pendente deste usuário" (aqui: iniciar um treino descarta qualquer sessão ativa/pausada anterior
do MESMO usuário, pra evitar "lixo da memória" entre execuções), e o Playwright agenda esses dois
specs em WORKERS PARALELOS diferentes (comportamento padrão com `fullyParallel: true`), um pode
silenciosamente roubar o estado do outro no meio do teste — o segundo spec simplesmente falha com
um erro que não faz sentido à primeira vista ("session status: active, esperava completed").
Passou despercebido enquanto a suite tinha só 1 spec que criava sessão; virou flake real assim que
um segundo apareceu.

**Fix:** trocar o usuário global único por um **fixture Playwright com escopo de worker**
(`{ scope: "worker" }`) que cria um usuário sintético só pra aquele worker
(`e2e-worker-<index>@parafit.test`, idempotente entre execuções via upsert por email/subject id) e
seeda o fixture dele na primeira vez que é usado. Um fixture auto (`{ auto: true }`) sobrescreve o
`page` built-in pra injetar auth automaticamente — elimina o boilerplate de `beforeEach` que cada
spec tinha. Tests dentro do MESMO worker continuam rodando sequencialmente (sem race entre eles);
workers diferentes agora têm usuários diferentes (sem race entre specs). Pegadinhas que apareceram
junto: (1) specs que dependem um do outro (ex: "criar entrada" → "remover entrada") precisam de
`test.describe.configure({ mode: "serial" })` pra garantir que caem no MESMO worker — sem isso,
`fullyParallel` pode espalhar os dois testes de um mesmo `describe` em workers diferentes, cada um
com seu próprio usuário isolado, quebrando a dependência; (2) testes que dependiam de "estado
acumulado historicamente pelo usuário compartilhado" (ex: histórico de sessões completadas) só
passavam por acidente — a isolação por worker expôs que o "happy path" nunca era de fato garantido,
precisou de fixture data explícita por teste.

**Template impact:** vale documentar esse padrão (`e2e/fixtures.ts` com worker-scoped fixture +
`page` override) na seção de E2E do `molde-brain.md`, como alternativa recomendada ao
`globalSetup.ts` de usuário único assim que uma suite passar de ~3-4 specs ou começar a ter mais
de um spec que mexe em estado "por usuário" (sessões, "plano atual", etc).

---

## [2026-07-17] parafin — infra: `.specify/scripts/` vem vazio no template — `/speckit-plan` não acha `setup-plan.ps1`
**Severity:** HIGH
**Status:** `noted`

O template Molde tem `.specify/scripts/` (bash e powershell) como diretório **vazio** — não só no
app gerado, mas na própria pasta `molde/.specify/scripts/` de origem. `init-options.json` seta
`"script": "ps"`, então a skill `/speckit-plan` tenta rodar
`.specify/scripts/powershell/setup-plan.ps1 -Json` e falha (exit 64, arquivo não existe). O mesmo
provavelmente vale para outros scripts core do spec-kit (`create-new-feature`, `check-prerequisites`,
`update-agent-context` — este último já existe só dentro de `extensions/agent-context/scripts/`,
fora do padrão). Não há `specify` CLI instalado globalmente nesta máquina para regenerar os scripts
(`which specify` → nada; só `uvx` disponível).

Contornei fazendo manualmente o que o script faria: usar `.specify/feature.json` (escrito pela
skill `speckit-specify`) para achar `SPECIFY_FEATURE_DIRECTORY`, copiar `plan-template.md` para
`plan.md` à mão, e preencher Technical Context/Constitution Check/Project Structure lendo o
`package.json`/estrutura real do backend e frontend em vez de depender do script de setup.

**Template impact:** ou (a) vendorizar os scripts core do spec-kit (`common.ps1`/`.sh`,
`create-new-feature`, `setup-plan`, `check-prerequisites`, `update-agent-context`) dentro de
`molde/.specify/scripts/` na origem, para todo app copiado já vir com eles: ou (b) documentar no
`molde-brain.md` que `/speckit-plan`/`/speckit-tasks` exigem rodar `specify init`/`specify check`
uma vez (via `uvx --from git+https://github.com/github/spec-kit.git specify ...`) antes do primeiro
uso, com instrução de qual comando exato roda isso. Vale confirmar qual das duas é a intenção
correta antes de "promover" esta entrada.

---

## [2026-07-18] parafin — bug: `provision.ps1` cria o Postgres com `postgres_db`/`postgres_user` hifenizados → Coolify rejeita
**Severity:** CRITICAL
**Status:** `fixed-in-template` (corrigido neste commit em `scripts/provision.ps1`, propagar ao `molde/` origem)

`provision.ps1 -Execute` falhava no passo "Coolify Postgres" com `422 Validation failed: "postgres_user field format is invalid", "postgres_db field format is invalid"`. Causa: o script passava `postgres_db="$Slug-db"` e `postgres_user="$Slug-user"` (com hífen) — a API de criação de banco do Coolify valida esses dois campos como identificador (sem hífen permitido), diferente do campo `name` (label livre) que aceita qualquer string. O nota #15 do `molde-brain.md` ("Coolify Postgres internal DB name — fixed as of 2026-06-30") documentava a convenção com hífen como se já funcionasse via API, mas na prática só foi testada via `ALTER DATABASE ... RENAME TO` manual em apps antigos — o caminho `-Execute` real nunca tinha sido exercitado ponta a ponta antes do Parafin.

**Fix aplicado:** `postgres_db`/`postgres_user` agora usam underscore (`${Slug}_db`/`${Slug}_user`), mantendo o `name` (label do recurso no Coolify) com hífen.

**Template impact:** já corrigido em `Parafin/scripts/provision.ps1` — replicar o mesmo diff em `molde/scripts/provision.ps1` (o `$dbNameLabel`/`$dbNameId`/`$dbUserId` no lugar de `$dbName`/`$dbUser`).

---

## [2026-07-18] parafin — bug: `provision.ps1` cria o Postgres mas nunca o inicia — deploy do app falha com Prisma P1001
**Severity:** CRITICAL
**Status:** `fixed-in-template` (corrigido neste commit em `scripts/provision.ps1`, propagar ao `molde/` origem)

Mesmo depois de corrigir o bug acima, o primeiro deploy do app falhou (`unhealthy`, rollback automático do Coolify) com `Error: P1001: Can't reach database server`. Investigando via SSH (Tailscale) + `docker ps` + query direta no Postgres interno do Coolify (`coolify-db`), descobri que **o container do Postgres nunca tinha sido criado** — `POST /api/v1/databases/postgresql` só registra o *recurso* no Coolify (fica com `status: exited`), não sobe o container. É preciso um `GET /api/v1/databases/{uuid}/start` explícito depois, e esperar ficar `running`/healthy antes de disparar o deploy do app (senão a app tenta conectar num banco que não existe ainda).

Isso não é mencionado em nenhum lugar do `molde-brain.md` — provavelmente porque em runs anteriores o Postgres foi startado manualmente pelo Coolify UI ou por coincidência de timing, mascarando o bug.

**Fix aplicado:** `provision.ps1` agora chama `start` logo após criar o Postgres e faz polling (até 150s) até `status` reportar `running` antes de prosseguir para a criação da Application.

**Template impact:** já corrigido em `Parafin/scripts/provision.ps1` — replicar o mesmo diff em `molde/scripts/provision.ps1`.

---

## [2026-07-18] parafin — gotcha: `ALLOWED_EMAILS` (allowlist de acesso) não é setado pelo provision.ps1 — app fica aberto por padrão
**Severity:** HIGH
**Status:** `noted`

Para apps que implementam uma allowlist de e-mail própria (padrão adicionado no Parafin para restringir acesso a 2 usuários da família, FR-017 — ver `googleAuth.ts` / `isEmailAllowed`), `provision.ps1` não seta essa env porque ela não existe no `provision.env` global (é config por-app, não credencial de infra compartilhada). Resultado: logo após o primeiro deploy, **qualquer conta Google (ou o endpoint `/auth/google/mock`, que fica sempre ativo em produção) conseguia logar** — a app ficou sem restrição de acesso por alguns minutos até eu perceber e setar `ALLOWED_EMAILS` manualmente via API do Coolify + redeploy.

**Template impact:** para apps com allowlist própria, `provision.ps1` deveria aceitar um parâmetro explícito (ex.: `-AppEnv @{ ALLOWED_EMAILS = "..." }`) para envs app-specific que não pertencem ao `provision.env` compartilhado, setadas ANTES do primeiro deploy — não depois. Vale considerar isso como um passo obrigatório do checklist de deploy sempre que o app tiver algum controle de acesso próprio além do OAuth padrão.

---

## [2026-07-19] coringao-orcamento — infra: o bug de `.env`/Prisma da entrada `parafit` de 2026-06-29 continua vivo no template, 3 semanas depois, sem correção
**Severity:** HIGH
**Status:** `noted`

Scaffoldeando este app em 2026-07-19, bati exatamente nos mesmos três problemas já documentados na entrada `parafit — bug: local Prisma 7 migrate fails` (linha acima, `noted` desde 29/06): `prisma.config.ts` sem `url`/sem carregar `.env`, `backend/package.json` `dev` sem `--env-file-if-exists`, e `prisma migrate dev` não gerando o client sozinho (precisei rodar `npx prisma generate` manualmente). Ou seja: o fix ficou documentado no field-notes mas **nunca foi aplicado ao template real** — o sistema de duas camadas (field-notes → molde-brain → template) tem um furo onde entradas `noted` se acumulam sem alguém promovê-las de fato para o código do Molde.

Achado NOVO que a entrada de 29/06 não cobriu: **`frontend/vite.config.ts` também não carrega o `.env` da raiz** (Vite por padrão só lê `.env` de dentro da própria pasta `frontend/`, não do monorepo). Faltava `envDir: "../"` na config — sem isso, `VITE_API_BASE_URL` do `.env` raiz nunca chega ao frontend em dev.

Achado NOVO #2: o `backend/package.json` do template tem `@prisma/client: ^7.8.0` nas `dependencies` mas `prisma: ^6.19.3` (CLI) nas `devDependencies` — desalinhado. O CLI 6.x não entende o formato de `prisma.config.ts` sem `url` explícito que o Prisma 7 client requer, e falha com `P1012 Argument "url" is missing`. Bump do `prisma` para `^7.8.0` resolveu.

**Fix aplicado neste app:** os três fixes da entrada de 29/06 (aplicados de novo) + `envDir: "../"` no `vite.config.ts` + `prisma` bumped para `^7.8.0` no `backend/package.json`.

**Template impact:** isto não é mais "vale aplicar quando alguém tiver tempo" — é o **segundo app em 3 semanas** batendo na mesma parede logo na primeira migration. Alguém (Gustavo ou um agente com esse mandato explícito) precisa efetivamente editar `molde/backend/prisma.config.ts`, `molde/backend/package.json` (script `dev` + versão do `prisma`) e `molde/frontend/vite.config.ts` no template-fonte, não só nas cópias gastas. Só marcar `noted` de novo não quebra o ciclo.

---

## [2026-07-19] coringao-orcamento — gotcha: campos de data "calendário puro" (sem hora) vazam bug de fuso horário se passarem por `Date` local em vez de UTC
**Severity:** MEDIUM
**Status:** `noted`

Um campo tipo `dataOrcamento` (só data, sem hora, ex. `"2026-03-24"`) vira problema assim que alguém faz `new Date("2026-03-24")` (que o JS interpreta como **UTC meia-noite**) e depois formata com `.toLocaleDateString()` ou `.getDate()`/`.setDate()` (que usam o **fuso LOCAL** do processo). Em qualquer fuso atrás de UTC (Brasil inteiro, por exemplo), isso silenciosamente exibe o dia anterior. Bati nesse exato bug de forma independente em **três lugares** neste app (geração de PDF, cálculo de "válido até" num template de mensagem, e teria batido de novo num quarto se não tivesse consolidado) — é fácil de reintroduzir porque cada `new Date(stringDeData)` novo é um ponto de risco.

**Fix:** criar um util só (`dateUtils.ts` neste app) com um punhado de funções que **nunca** usam getters/setters/formatters locais para esse tipo de campo — só as variantes UTC (`Date.UTC(...)`, `getUTCFullYear()`, `getUTCDate()`, `setUTCDate()`, ou formatação manual tipo `${dia}/${mes}/${ano}` a partir dos componentes UTC). Qualquer código que precise fazer aritmética ou exibir uma data-só-calendário passa por esse util, nunca por `Date`/`toLocaleDateString` crus.

**Template impact:** se o esqueleto Molde ganhar algum campo de data-só (nascimento, vencimento, validade) em algum app de referência, vale plantar esse util (`dateUtils.ts` com `paraDataCalendario`/`adicionarDias`/`formatarDataBR`/`paraISODateString`) direto no esqueleto, com o comentário explicando o porquê — é mais barato prevenir do que cada app redescobrir isso.

---

## [2026-07-19] coringao-orcamento — gotcha: `Intl.NumberFormat`/`toLocaleString('pt-BR', {style:'currency'})` insere um espaço NÃO separável (U+00A0) entre "R$" e o número
**Severity:** LOW
**Status:** `noted`

`(1690.75).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})` devolve `"R$ 1.690,75"` — visualmente idêntico a `"R$ 1.690,75"` com espaço comum, mas falha em qualquer comparação estrita (`toBe`, `===`) num teste. Um teste Vitest comparando string exata contra saída de formatação de moeda pt-BR quebrou por isso, com a mensagem de erro do Vitest mostrando "Expected" e "Received" **visualmente iguais** — só o modo verboso/diff de caractere (ou inspecionar os code points) revela a diferença.

**Template impact:** qualquer app Molde que formate R$ (a maioria) e escreva teste comparando string literal vai bater nisso mais cedo ou mais tarde. Vale um comentário-lembrete perto de qualquer helper de `formatarMoeda` do esqueleto, ou usar `.toContain`/regex em vez de igualdade estrita nesses testes.

## [2026-07-22] cota4 — gotcha: guard de consentimento do Prisma bloqueia `migrate reset` em sessão autônoma
**Severity:** LOW
**Status:** `noted`

`npx prisma migrate reset --force` (Prisma 7.8) dispara um guard anti-IA que exige consentimento explícito do usuário via env `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` — num run autônomo/noturno isso trava o fluxo. Workaround limpo quando o banco é dev e descartável: dropar o banco direto (`node -e` com `pg`: `DROP DATABASE IF EXISTS x WITH (FORCE)`) e rodar `npx prisma migrate dev`, que recria e aplica as migrations do zero. Atenção também: se um `migrate dev --create-only` for interrompido no meio, a próxima invocação pode APLICAR o draft pendente em vez de só criar — confira `prisma/migrations/` antes de editar SQL de uma migration que você acha que ainda não foi aplicada.

**Template impact:** documentar no molde-brain o workaround de reset para sessões autônomas.

## [2026-07-22] cota4 — pattern: RLS multi-tenant com Prisma 7 funcionando de ponta a ponta (receita validada)
**Severity:** HIGH
**Status:** `noted`

Receita completa validada com teste de integração (5/5): (1) migration inicial cria role de runtime sem bypass (`cota4_app`) + `ENABLE`/`FORCE ROW LEVEL SECURITY` + política `USING ("empresaId" = NULLIF(current_setting('app.current_empresa', true), '')::uuid)` — o NULLIF evita erro de cast com setting vazio e devolve zero linhas sem contexto; (2) dois clients Prisma: admin (DATABASE_URL, superuser, bypassa RLS para auth/painel/seeds) e app (DATABASE_URL_APP com a role restrita) com extension `$allModels.$allOperations` que roda CADA operação num batch transaction `[$executeRaw set_config('app.current_empresa', id, TRUE), query(args)]` lendo o id do AsyncLocalStorage — sem contexto, lança erro (guard-rail); (3) operações multi-passo atômicas (ex.: numeração sequencial com retry de P2002) via `$transaction(async tx => { await tx.$executeRaw set_config…; … })` no client SEM a extension de RLS (evita batch dentro de transação interativa); (4) tabelas admin-only ficam com RLS FORÇADO e SEM política — invisíveis para a role do app. Superuser bypassa RLS mesmo com FORCE, o que é exatamente o que migrations e o client admin precisam. Implementação de referência: `cota4/backend/src/repositories/db.ts` + migration `20260722020343_init_multitenant_rls`.

**Template impact:** candidato a virar seção do molde-brain (ou variante multi-tenant do template) quando o próximo app multi-tenant nascer.

## [2026-07-22] cota4 — bug: enterWith do AsyncLocalStorage dentro de requireAuth NÃO propaga para o handler (Node 24)
**Severity:** HIGH
**Status:** `noted`

O padrão do template (setCurrentUser via `storage.enterWith(...)` chamado DENTRO do `requireAuth` async, que o handler awaita) perde o contexto: no Node 24.12 + Fastify 5, ao voltar do `await requireAuth(...)`, a continuação do handler retoma o contexto capturado antes — `getStore()` volta undefined e o extension de auditoria/RLS não vê nada. No cota4 isso quebrou 100% das rotas de tenant (o RLS falhava alto com "sem contexto"); num app só-auditoria o sintoma é pior: createdBy/updatedBy ficam NULL EM SILÊNCIO. Fix validado: hook `onRequest` do Fastify abrindo o store para o request inteiro (`storage.run({...}, done)`) e `requireAuth` apenas MUTANDO o objeto do store existente (mesma referência). Vale conferir se os apps derivados existentes (coringao etc.) estão realmente gravando createdBy ou se está nulo em produção.

**Template impact:** corrigir o esqueleto do molde (googleAuth.ts + server.ts): onRequest hook com storage.run + setCurrentUser mutando o store.

## [2026-07-22] cota4 — gotcha: extension de auditoria $allModels quebra em modelo sem colunas createdBy/updatedBy
**Severity:** LOW
**Status:** `noted`

O extension do template injeta createdBy/updatedBy em TODO create/update/upsert ($allModels). No template todos os modelos têm as colunas, mas assim que o app cria um modelo sem elas (no cota4: EventoUso, ItemOrcamento, VisitanteDemo, SessaoImpersonacao) o Prisma 7 lança PrismaClientValidationError "Unknown argument createdBy" em runtime (typecheck não pega). Fix: allowlist `MODELOS_AUDITADOS` no extension usando o parâmetro `model` do hook.

**Template impact:** comentar o gotcha no db.ts do esqueleto (ou usar allowlist desde o template).

## [2026-07-22] cota4 — bug: provision.ps1 aborta no meio quando um POST de env do Coolify responde "already exists"
**Severity:** HIGH
**Status:** `noted`

No provision do cota4, um dos POSTs de env respondeu `{"message": "Environment variable already exists. Use PATCH request to update it."}` (o Coolify pré-criou/normalizou envs do app recém-criado) e, com `$ErrorActionPreference = "Stop"`, o script abortou DEPOIS de criar DNS/Pages/Postgres/app e ANTES do patch de build/secrets/deploy — deixando o provisionamento pela metade. Fix aplicado no cota4: try/catch no loop de envs caindo para PATCH quando a mensagem contém "already exists" (idempotente). Recuperação do estado parcial: script de conclusão que lê as envs atuais (GET /envs), reconcilia POST/PATCH e reexecuta os passos 7–9.

**Template impact:** aplicar o mesmo try/catch→PATCH no `scripts/provision.ps1` do template (o loop de envs é idêntico).

## [2026-07-24] cota4 — infra: regenerating package-lock.json on Windows breaks Linux CI (missing native optional binaries)
**Severity:** HIGH
**Status:** `noted`

Running `rm package-lock.json && npm install` on Windows (to force an override to re-resolve)
silently dropped the *install entries* for native optional binaries of other platforms from the
lockfile — 54 of them (`@rolldown/binding-*`, `@img/sharp-*`, `@astrojs/compiler-binding`). npm
issue 4828: when it regenerates the tree on one platform, it keeps the optional-dep *names* under
each package's `optionalDependencies` but omits the `node_modules/<pkg>` install entries for the
non-current platforms. The site build (Astro/rolldown) then failed on Linux CI with
`Cannot find module '@rolldown/binding-linux-x64-gnu'`. The app (Vite/rollup) and backend didn't
use rolldown/sharp, so only the site broke. Fix: copy the missing native entries from a known-good
lockfile (versions were identical), then `npm ci --dry-run` to confirm it's in sync — do NOT
`npm install` again on Windows or it re-drops them.

**Template impact:** never fully regenerate the lockfile on Windows; use incremental `npm install <pkg>`
for dep changes. Consider generating/refreshing the lockfile in a Linux step (or documenting it),
and add a CI note so this failure mode is recognized instantly.

## [2026-07-24] cota4 — gotcha: OAuth state/PKCE cookie requires redirect_uri on the SAME host the frontend calls for /login
**Severity:** HIGH
**Status:** `noted`

Hardening the Google OAuth flow with a signed HttpOnly cookie (state + PKCE code_verifier) turned
a previously stateless flow into one that depends on domain consistency. The SPA calls
`${VITE_API_BASE_URL}/auth/google/login` (here `api.cota4.com.br`), so the cookie is set host-only
on that domain; but `GOOGLE_REDIRECT_URI` still pointed at the old host (`cota4-api.parolin.net`),
so Google returned to a different domain where the cookie didn't exist → callback rejected every
login with `state_invalido`. Fix: set `GOOGLE_REDIRECT_URI` to the SAME host as `VITE_API_BASE_URL`
(both must also be authorized in the Google client). Stateless OAuth tolerated the mismatch; the
cookie does not.

**Template impact:** when the login flow uses a cookie for state/PKCE, document that `VITE_API_BASE_URL`
and `GOOGLE_REDIRECT_URI` must share the same host, and flag it during the domain cutover checklist.

## [2026-07-24] cota4 — infra: backup de banco via API do Coolify (receita completa; nenhum banco da VPS tinha backup)
**Severity:** HIGH
**Status:** `noted`

Descoberta: nenhum Postgres provisionado pelo Molde tinha backup agendado (o único que tinha era o `py93...`, criado junto com a instalação do Coolify). A receita para configurar 100% via API, validada em todos os 7 bancos da VPS: (1) o Coolify 4.1.2 tem `POST/PATCH /api/v1/databases/{uuid}/backups` com `frequency` (cron ou `daily`), `save_s3`, `s3_storage_uuid`, retenções local/S3 e `backup_now` para disparar na hora; (2) **não existe endpoint para cadastrar o storage S3** — é só pela UI (S3 Storages → Add) e a API também não lista os existentes, então o uuid vem da URL da página do storage (`/storages/<uuid>`); o da VPS atual é `tui1mnn3mr9j0u7g96gy4xw2` (nome `r2-backups`, bucket R2 `coolify-backups`, endpoint da conta, region `auto`); (3) padrão adotado: `frequency "0 3 * * *"` (03:00 UTC = 00:00 BRT), retenção 7 local / 30 S3; (4) verificação fim-a-fim: `GET .../backups/{uuid}/executions` até `success`, depois listar o bucket via S3 API (`curl --aws-sigv4` com as chaves R2 do provision.env) e conferir o magic `PGDMP` do dump baixado.

Gotchas encontrados: (a) se o `postgres_db` registrado no Coolify não bater com o banco real do container, o pg_dump falha com `database "postgres" does not exist` — corrigir com `databases_to_backup` apontando o nome real (caso recibos: banco `recibos`); (b) dump de MariaDB grande (celula: 2,4 GB) estoura rápido o free tier do R2 (10 GB) com retenção 30 — reduzir para 2 local / 7 S3 nesses casos; (c) `sleep` entre criação e verificação: a 1ª execução leva ~10–20 s para Postgres pequenos, minutos para dumps GB.

**Template impact:** o `provision.ps1` deveria criar o backup agendado logo após criar o Postgres (POST acima com o `s3_storage_uuid` fixo da VPS em provision.env, ex. `COOLIFY_S3_STORAGE_UUID=tui1mnn3mr9j0u7g96gy4xw2`), para que nenhum app novo nasça sem backup. Segunda cópia caseira: Synology Cloud Sync puxando o bucket `coolify-backups` (S3 endpoint custom do R2, download-only).

**Validação da ponta Synology (mesmo dia, ~23h30):** DSM Cloud Sync funcionou de primeira contra o R2 — provedor "S3 Storage" → Custom Server URL `<account>.r2.cloudflarestorage.com` (sem https://), signature **v4**, bucket escolhido no dropdown (a listagem funcionou, prova de que as credenciais e o endpoint bastam), direção "Baixar apenas alterações remotas", consistência avançada ON, "não remover arquivos do destino" ON (perfil arquivo profundo: o NAS acumula além da retenção da nuvem). Primeira sync desceu ~2,6 GB incluindo um dump de 2,41 GB sem engasgar (parte de 128 MB default). Gotchas: (a) com "não remover" ON e dumps grandes, agendar limpeza no Task Scheduler do NAS (`find .../celula-db-* -name "*.dmp" -mtime +14 -delete`); (b) se a pasta local escolhida for o home do usuário, o caminho real para scripts é `/volume1/homes/<usuário>/...`, não `/home/...`; (c) recomendável token R2 read-only para o NAS, em vez das chaves de leitura+escrita do provision.env — MAS com duas armadilhas descobertas a caro preço em 2026-07-25: **(c1) o campo Server address do Cloud Sync exige o hostname PURO, sem `https://`** — com o esquema na frente o wizard falha com o erro genérico "Failed to list buckets. authentication failed", mesmo com credenciais perfeitas (o Hyper Backup aceita igual, hostname puro); **(c2) `ListBuckets` no R2 é operação de nível Admin** — token "Object Read only" NÃO lista buckets nem com escopo All buckets, e o dropdown de bucket dos wizards (Cloud Sync e Hyper Backup) depende disso; para read-only duro que funcione nos wizards, usar permissão **Admin Read only** (lê tudo, lista buckets, não escreve/apaga/cria nada).

## [2026-07-25] coringao-orcamento — pattern: PDF do PDFKit não se testa procurando texto no buffer; use um duble que registra os `text()`
**Severity:** LOW
**Status:** `noted`

Ao cobrir com teste o gerador de PDF (layout programático com PDFKit — decisão de arquitetura do Molde, porque o VPS ARM não tem Chromium), a tentativa óbvia falha: gerar o Buffer e procurar strings dentro dele não encontra nada, porque os streams saem comprimidos com FlateDecode e as fontes embarcadas são subsets (o texto vira glyph id sem ToUnicode). Descomprimir com zlib resolve a compressão mas esbarra no mapeamento de glifos.

O que funcionou: substituir o PDFKit por um duble — `vi.mock("pdfkit", () => ({ default: FakePDFDocument }))`, com a classe criada dentro de `vi.hoisted` para poder ser referenciada na factory — implementando só a superfície usada (`rect/fill/font/fontSize/fillColor/strokeColor/text/heightOfString/moveTo/lineTo/stroke/moveDown/addPage/on/end`) e registrando cada `text()` junto com a página corrente. Com isso dá para assertar presença/ausência de bloco ("no tipo venda não desenha 'Valor por m²'") e, o que mais importa, invariantes de paginação — no caso, provar que a observação de um item nunca é desenhada em página diferente da descrição dele. Um `heightOfString` aproximado (proporcional a tamanho do texto e largura) já exercita a quebra de página de verdade; 18 testes em ~25 ms.

**Template impact:** vale um `pdfService.spec.ts` de exemplo com esse duble no esqueleto — o PDF programático nasce sem teste hoje, e o caminho errado custa um bom tempo antes de ficar claro que não tem saída.

## [2026-07-25] coringao-orcamento — gotcha: testar store zustand/persist no Vitest do frontend exige stub de localStorage E de window
**Severity:** LOW
**Status:** `noted`

O primeiro teste unitário do store do frontend quebra logo no import: o `apiClient` lê `localStorage.getItem("auth.token")` no topo do módulo e o ambiente de teste do Molde é `node`, sem jsdom. Puxar jsdom só por isso é caro; um localStorage falso em memória num `setupFiles` resolve em ~20 linhas.

O detalhe que custa tempo: só `globalThis.localStorage` não basta. O `zustand/persist` procura o storage em `window`, então sem `globalThis.window = { localStorage }` os testes passam mas cada `set()` despeja "[zustand persist middleware] Unable to update item ... the given storage is currently unavailable" na saída. Os dois stubs juntos deixam a suíte limpa e sem dependência nova.

**Template impact:** incluir `frontend/vitest.config.ts` (environment node, `include: src/**/*.spec.ts`, `setupFiles`) e `frontend/src/test/setup.ts` com os dois stubs no esqueleto — hoje o app nasce com `--passWithNoTests` e o primeiro teste de store tropeça nisso.

## [2026-07-26] cota4 — pattern: testes verdes não provam nada se cobrem o guard e não o CAMINHO (3 bugs em produção numa semana)
**Severity:** CRITICAL
**Status:** `noted`

Em 4 dias, 3 bugs chegaram em produção com typecheck, lint, 118 testes e E2E **todos verdes** — e foram descobertos por uma usuária real, não pela suíte. A autópsia achou três furos que são de PROCESSO, não de disciplina, e que qualquer app do Molde tem por construção:

**1. O teste cobria o guard, não o caminho que roda.** O commit de hardening anti-SSRF adicionou 3 testes — todos no `urlSegura()` (uma pré-checagem barata) e ZERO no `lookupSeguro()`, que é o código que o undici executa de verdade ao abrir o socket. Resultado: a segurança estava correta, os testes verdes, e a funcionalidade "buscar logo no site" morta por 2 dias. A pergunta que faltou no review: *"qual botão do app passa por este código, e existe um teste que aperta esse botão?"* — não "existe teste?".

**2. O smoke pós-deploy só perguntava "o cadeado fechou?".** Depois do deploy da auditoria, validamos `admin/metrics → 401`, `mock → 404`, headers do helmet, cookie do PKCE. Nenhuma verificação de "a porta ainda abre". Um único GET no endpoint teria pego na hora.

**3. O E2E era uma casca.** O único teste criava um orçamento **só com o nome do cliente, sem itens** — por isso um bug no formatador de quantidade (tipo do DTO mentia: API manda `number`, tipo dizia `string`, código fazia `.trim()`) sobreviveu 4 dias. E2E que não usa DADOS REALISTAS não exercita nada.

**4. (o pior) O CI mentia sobre o deploy.** O job `deploy-backend.yml` dava `success` quando o Coolify apenas **aceitava** o pedido de deploy. Um build falhou no Coolify e o GitHub mostrou verde — o fix ficou fora do ar sem ninguém saber. Esperar `/health` responder também NÃO basta: o container antigo continua de pé durante o build, então um smoke logo após o "finished" fala com a versão VELHA e dá vermelho enganoso (aconteceu, 2 segundos depois).

**Template impact (aplicado no Molde nesta data):**
- `/health` passa a publicar `versao` (de `backend/package.json`) e `commit` (`SOURCE_COMMIT`, injetado pelo Coolify). Sem isso não há como saber se a build nova está atendendo.
- `deploy-backend.yml` ganha dois passos depois do trigger: **esperar a versão nova atender** (compara commit/versão do `/health`, até 10 min) e **rodar o smoke**. O job fica vermelho quando a funcionalidade quebrou — que era o objetivo do CI desde sempre.
- `scripts/smoke-producao.mjs`: esqueleto de smoke de FUNCIONALIDADE (não de controles de segurança), rodável à mão (`npm run smoke:prod`) e no deploy. Regra ao escrever: cada verificação exercita um caminho que um usuário percorre, com dados realistas, e confere o RESULTADO (não só o status HTTP — ex.: o PDF começa com `%PDF`, o número salvo volta igual).
- Teste que garante `backend/package.json` e a raiz com a mesma versão (senão o CI espera uma versão que nunca chega).

**Regra para agentes (também em AGENTS.md):** toda mudança significativa — hardening, refactor, troca de biblioteca — só está pronta quando existe um teste que exercita o CAMINHO REAL do usuário afetado, e o smoke de produção cobre a funcionalidade. "Os testes passaram" não é evidência; "este botão foi apertado e devolveu o resultado certo" é.

---

## [2026-07-29] cota4 — infra: o default de IA do Molde estava MORTO, e a Z.AI perdeu a visão gratuita que era a razão de ele existir
**Severity:** HIGH
**Status:** `noted`

`provision.ps1:178-181` injeta `AI_API_KEY` + `AI_BASE_URL` + `AI_MODEL` do `~/.config/molde/provision.env` em **todo app novo** assim que `AI_API_KEY` existe — nem precisa passar `-EnableAI`. O valor que estava lá era `glm-4v-flash` (Z.AI/bigmodel.cn). Auditado com chamadas reais hoje: `POST /api/paas/v4/chat/completions` com esse modelo responde **HTTP 400 code 1211 "模型不存在"** (o modelo não existe). O field-notes de 2026-07-19 já suspeitava disso; agora está confirmado com resposta do servidor. Ou seja, qualquer app provisionado desde então nasceu com IA quebrada por herança, e o erro só apareceria na primeira chamada real — nunca em teste com mock.

Varredura de modelos na mesma conta (o que responde hoje): `glm-4.7-flash` → 200 em 5,5 s; `glm-4.5-flash` → 200 em 6,8 s; `glm-4-flash`, `glm-4v`, `glm-4v-plus`, `glm-4v-plus-0111`, `glm-4v-flash-250414`, `glm-4.1v-9b-thinking`, `glm-4.1v-thinking-flash` → todos 400/1211 mortos; `glm-4.5v`, `glm-4.6v`, `glm-z1-flash` → **HTTP 429 code 1113 "余额不足"** (saldo insuficiente — existem, mas são pagos).

**O achado que muda decisão de arquitetura:** a Z.AI não tem mais nenhum modelo de **visão** gratuito nesta conta. O default do Molde existia exatamente pela cota grátis de visão do `glm-4v-flash`, e essa razão acabou — os modelos de visão vivos cobram. Confirmado por outro caminho: `glm-4.7-flash` recusa conteúdo multimodal com 400 code 1210 `"messages.content.type 参数非法, 取值范围 ['text']"`. Portanto app novo que precise de FOTO/OCR **não pode herdar o default** — precisa de Gemini, que é o único caminho grátis com visão validado nesta stack.

Corrigido no `provision.env` (fora do repo): `AI_MODEL=glm-4.7-flash`, com a auditoria inteira registrada em comentário na própria seção, incluindo a regra "app de texto pode herdar; app de foto configura Gemini".

**Segundo achado, sobre como se testa chave de IA:** `GET /v1beta/models?key=<K>` do Gemini responde **200 mesmo com a cota diária estourada** — ele prova que a chave existe, não que ela produz. O teste que vale é uma geração real (`:generateContent` com `maxOutputTokens: 5`), que custa quase nada. Vale para qualquer provedor: chave que autentica ≠ chave que produz.

**Terceiro achado, diagnóstico de token da Cloudflare:** `GET /client/v4/user/tokens/verify` responde `{"success":false,"code":1000,"message":"Invalid API Token"}` para o token de provisionamento — e o token funciona perfeitamente. É token de **conta**, e aquele endpoint só valida token de **usuário**. O smoke test correto é `GET /client/v4/zones`. Sem saber disso, o próximo diagnóstico conclui "chave morta" e sai rotacionando o que está bom.

**Template impact:** (1) `provision.ps1` não deveria injetar IA por inércia — o bloco `if ($EnableAI -or $cfg["AI_API_KEY"])` faz com que a mera presença da chave no cofre configure IA em apps que não pediram; considerar exigir `-EnableAI` explícito. (2) O provision deveria fazer **uma chamada real ao modelo** antes de gravar o env, e falhar alto se o modelo não existir — o custo é uma requisição e evita nascer quebrado. (3) `molde-brain.md` §Providers precisa registrar que a Z.AI saiu da lista de opções gratuitas de visão. (4) O README do Molde documenta `COOLIFY_API_URL=https://coolify.parolin.net/api/v1`, mas os scripts concatenam `/api/v1` — o README está errado e induz erro em setup novo.


## [2026-07-29] coringao-orcamento — infra: version-gate do deploy-backend.yml também leva o Managed Challenge do Cloudflare — deploy OK marcado como falha
**Severity:** HIGH
**Status:** `noted`

O fix de 2026-07-20 protegeu só o passo que DISPARA o deploy (fallback via origem com `--resolve`). O passo seguinte — "Aguardar a versão NOVA atender", que faz poll do `/health` até a versão nova aparecer — continua indo pela borda do Cloudflare, e o runner do GitHub levou o Managed Challenge: 40 tentativas com `commit=[] versao=[]` (o challenge devolve HTML, o jq extrai vazio) e a run terminou em `##[error]A versão nova não entrou no ar em 10 min`, **com o deploy real concluído e o `/health` respondendo a versão nova** para qualquer outro cliente. Falso negativo: o gate criado para "o deploy não mentir" mentiu ao contrário.

**Template impact:** em `deploy-backend.yml`, o poll do `/health` deve usar o mesmo fallback do disparo (tentar via Cloudflare; em resposta sem os campos esperados, repetir via `curl --resolve <host>:443:$COOLIFY_ORIGIN_IP -k`). Alternativa: detectar HTML/challenge na resposta e avisar "runner bloqueado pela WAF" em vez de "build falhou" — a mensagem de erro atual aponta o suspeito errado.

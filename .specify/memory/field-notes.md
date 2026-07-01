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

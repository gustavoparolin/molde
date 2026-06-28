# Molde brain — execution & deploy recipe

> Single source of truth shared by Claude Code and Copilot (referenced from `.claude/commands/`
> and `.github/prompts/`). The skill `molde-deploy` follows this end to end. Infra-specific values
> (domains, server IDs, tokens) live privately in `~/.config/molde/` — never in this repo.

## Architecture

```
push main ──┬─► Cloudflare Pages (SPA)  <app>.parolin.net   (React 19 + Vite + Mantine)
            │       │ HTTPS, Bearer JWT
            └─► Coolify (Oracle VPS)     api-<app>.parolin.net
                    ├─ Fastify 5 (tsx, no build step)
                    └─ PostgreSQL (Prisma 7, migrate deploy on boot)
                         └─ Cloudflare R2 (optional, file uploads)
```

- Monorepo npm workspaces (`frontend` + `backend`); one push → two deploys.
- Backend runs TypeScript via `tsx` (no compile). Migrations apply on boot (`start` = `prisma migrate deploy`).
- Stateless auth: signed JWT in `Authorization: Bearer`. Audit columns (`createdBy/updatedBy`) auto-filled
  by the Prisma extension in `repositories/db.ts` from the request-scoped userId.

## The reference slice (imitate it)

`Item`: `schema.prisma` → `repositories/itemRepository.ts` (Postgres + in-memory fallback) →
`services/itemService.ts` (+ domain events) → `api/routes/items.ts` (zod + requireAuth) → registered in
`api/server.ts`. Frontend: `store/itemsStore.ts` → `pages/ItemsPage.tsx` via `services/apiClient.ts`.

## AI integration (optional)

When the app needs vision/LLM: use the `openai` npm package with provider-agnostic env vars.
Default provider in `.env.example`: Google Gemini (free tier, 15 RPM, 1500 req/day). OpenAI-compatible.

```typescript
import OpenAI from "openai";
const client = new OpenAI({
  apiKey: process.env.AI_API_KEY,
  baseURL: process.env.AI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai/",
  defaultHeaders: process.env.AI_BASE_URL?.includes("ngrok")
    ? { "ngrok-skip-browser-warning": "true" }
    : {},
});
// model = process.env.AI_MODEL ?? "gemini-2.0-flash"
// max_tokens = Number(process.env.AI_MAX_TOKENS ?? 4096)
```

Env vars: `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_MAX_TOKENS`, `OCR_TIMEOUT_MS`.

**Confirmed working providers (tested with receipt OCR):**
- Gemini 2.0 Flash: `https://generativelanguage.googleapis.com/v1beta/openai/` — fast, free tier
- Ollama local (`qwen3-vl:30b`): `http://localhost:11434/v1` — 29 items extracted from physical receipt
  - Thinking model: requires `AI_MAX_TOKENS=16384` (4096 consumed by reasoning, no room for output)
  - Via ngrok: `AI_BASE_URL=https://<tunnel>.ngrok-free.dev/v1` + `ngrok-skip-browser-warning` header

**Sharp image pipeline bug (CRITICAL if using sharp):**
Never call `.metadata()` on the same Sharp instance used for pipeline output — it invalidates the lazy state silently.
```typescript
// CORRECT:
const meta = await sharp(buf).metadata();       // separate instance, read-only
let pipeline = sharp(buf).rotate();             // fresh pipeline
if (needsResize) pipeline = pipeline.resize(…);
const buffer = await pipeline.jpeg({ quality: 92 }).toBuffer();
```

Provision with `-EnableAI` flag.

## Auth flow (Google OAuth + JWT)

`GET /auth/google/login` → `{authorizeUrl}` → Google consent → `GET /auth/google/callback?code=…`
→ exchange code → `upsertGoogleUser` (find by **googleSubjectId OR email**) → `reply.jwtSign` →
redirect `https://<app>.parolin.net/auth/callback?token=<jwt>`. Frontend stores it; `apiClient` sends
Bearer; 401 → auto-logout. DEV mock: `POST /auth/google/mock` (hidden behind `import.meta.env.DEV`).
A **single shared OAuth client** serves all `*.parolin.net`; per app, add one redirect URI (~30s).

## Deploy pipeline (by API — the molde-deploy skill)

Reads `~/.config/molde/provision.env`. Required keys: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_ZONE_ID`, `COOLIFY_HOST`, `COOLIFY_API_URL`, `COOLIFY_TOKEN`, `CF_ACCESS_CLIENT_ID`,
`CF_ACCESS_CLIENT_SECRET`, `COOLIFY_SERVER_UUID`, `COOLIFY_PROJECT_UUID`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`. Optional: `GITHUB_USER` (falls back to `gh api user`), `R2_*`, `AI_*`.

For slug `<app>`:

1. **GitHub:** `gh repo create <app> --private --source . --remote origin && git push -u origin main`;
   `gh secret set CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` (for the deploy-frontend workflow).

2. **Cloudflare (API):**
   - DNS A/CNAME: `api-<app>` → Coolify host (A if IP, CNAME if hostname).
   - Pages: create project `<app>` → read the **actual** subdomain from the API response (may be
     `<app>-xyz.pages.dev`, not `<app>.pages.dev` — CF assigns a suffix when the slug is taken).
   - DNS CNAME: `<app>.parolin.net` → that subdomain (must exist **before** the next step).
   - Pages custom domain: add `<app>.parolin.net` (Pages verifies the CNAME; takes ~2 min).
   - R2: create bucket `<app>-assets` if `-EnableR2`.

3. **Coolify (API):** All calls include `CF-Access-Client-Id` + `CF-Access-Client-Secret` headers
   (Coolify sits behind Cloudflare Zero Trust).
   - URL prefix: always `<COOLIFY_API_URL>/api/v1/…` (not bare `/`).
   - Create PostgreSQL → capture `internal_db_url`.
   - **Deploy key (not GitHub App):** generate SSH key pair locally →
     `gh api repos/<user>/<app>/keys --method POST` (public key) →
     `POST /api/v1/security/keys` (private key) → note `uuid` → delete local key files.
   - Create Application: `POST /api/v1/applications/private-deploy-key` with `private_key_uuid`,
     `git_repository=git@github.com:<user>/<app>.git`, `base_directory=/backend`, `build_pack=nixpacks`,
     `instant_deploy=false`.
   - Set envs: `PORT=3000`, `DATABASE_URL`, `FRONTEND_ORIGINS`, `JWT_SECRET`, `GOOGLE_*`,
     `NIXPACKS_NODE_VERSION=22`, `S3_*` (if R2), `AI_*` (if AI).
   - **PATCH the app** (the POST endpoint ignores these fields):
     `ports_exposes=3000`, `health_check_path=/health`, `health_check_port=3000`,
     `install_command="npm install --ignore-scripts && node --experimental-require-module ./node_modules/.bin/prisma generate"`,
     `start_command="node --experimental-require-module ./node_modules/.bin/prisma migrate deploy && node --import=tsx src/api/server.ts"`.
   - Deploy: `GET /api/v1/deploy?uuid=<appUuid>&force=true`.

4. **Verify:** `GET https://api-<app>.parolin.net/health` → `{"status":"ok"}`; smoke the real Google login.

5. **Residual manual (🧑 ~30s):** add `https://api-<app>.parolin.net/auth/google/callback` to the shared
   Google OAuth client's Authorized redirect URIs.

Always run `provision` in **dry-run first** (prints the intended calls), then `-Execute` for real.

## Known gotchas

1. **`auth_failed` / unique email** — `upsertGoogleUser` must match by `googleSubjectId` OR `email`
   (a prior mock account shares the email). Already handled in `userRepository.ts`.

2. **`redirect_uri_mismatch`** — `GOOGLE_REDIRECT_URI` must be byte-identical to a URI registered on the
   shared client (scheme + host + `/auth/google/callback`).

3. **Prod frontend calling `localhost:3000`** — `VITE_API_BASE_URL` is build-time. The deploy workflow
   injects it; if you build elsewhere, set it there.

4. **404 on refresh of an internal route** — needs `frontend/public/_redirects` = `/*  /index.html  200`.

5. **CORS blocked** — `FRONTEND_ORIGINS` must include exactly `https://<app>.parolin.net` (no trailing slash).

6. **Old JWT after auth changes** — stale tokens 401 → frontend auto-logout; just re-login.

7. **Coolify webhook URL drift** — if using GitHub App (legacy), the webhook URL must point at the current
   Coolify host. Use deploy key approach (see §Deploy pipeline) to avoid this entirely.

8. **Coolify API behind Zero Trust** — if Coolify is proxied by Cloudflare Zero Trust, every API call
   needs `CF-Access-Client-Id` + `CF-Access-Client-Secret` headers (service token). Without them, all
   requests get a Cloudflare 403 before reaching Coolify.

9. **Coolify API path prefix** — all endpoints are under `/api/v1/` (e.g. `/api/v1/databases/postgresql`).
   Bare paths like `/databases/postgresql` return 404.

10. **Prisma 7 + Node 22.11.0 (nixpacks pin)** — nixpacks v1.41 pins nixpkgs to a commit that ships
    Node 22.11.0. Prisma 7 requires `^20.19 || ^22.12 || >=24`. The `@prisma/dev` dependency
    (`zeptomatch`) is ESM-only → crashes with `ERR_REQUIRE_ESM` on 22.11.0.
    Fix: override `install_command` and `start_command` with `--experimental-require-module` flag
    (enables `require(esm)` on 22.11). See the PATCH step above. Set `NIXPACKS_NODE_VERSION=22`.

11. **Cloudflare Pages CNAME target** — CF Pages may assign a suffix to the project subdomain
    (e.g. `myapp-2k8.pages.dev` instead of `myapp.pages.dev`) when the bare slug is taken by another
    CF user. Always read `result.subdomain` from the Pages create response and use that as the CNAME
    target. Using the wrong subdomain causes error **1014 CNAME Cross-User Banned**.

12. **Pages custom domain verification order** — the CNAME DNS record must exist in the zone **before**
    calling `POST /accounts/<id>/pages/projects/<slug>/domains`. Pages verifies the CNAME on add; if the
    record doesn't exist yet, the domain stays `pending` indefinitely and 1014 persists.

13. **Oracle Cloud / VPS firewall** — if the VPS has a default Security List (Oracle) or firewall rules,
    inbound TCP 80 and 443 must be open to `0.0.0.0/0` for Cloudflare to reach Traefik/Coolify.
    Without this, the app may be `running:healthy` internally but unreachable externally.

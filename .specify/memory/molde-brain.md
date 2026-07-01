# Molde brain — execution & deploy recipe

> Single source of truth shared by Claude Code and Copilot (referenced from `.claude/commands/`
> and `.github/prompts/`). The skill `molde-deploy` follows this end to end. Infra-specific values
> (domains, server IDs, tokens) live privately in `~/.config/molde/` — never in this repo.

## Architecture

```
push main ──┬─► Cloudflare Pages (SPA)  <app>.parolin.net   (React 19 + Vite + Mantine)
            │       │ HTTPS, Bearer JWT
            └─► Coolify (Oracle VPS)     <app>-api.parolin.net
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

See **`parolin-stack.md`** §3.2 for the full flow diagram. Summary:
`GET /auth/google/login` → Google consent → `GET /auth/google/callback?code=…` → JWT signed →
redirect to frontend `/auth/callback?token=<jwt>`. Stateless. DEV mock behind `import.meta.env.DEV`.
A **single shared OAuth client** serves all `*.parolin.net`; per app, add one redirect URI (~30s).

## Deploy pipeline (by API — the molde-deploy skill)

Reads `~/.config/molde/provision.env`. Required keys: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_ZONE_ID`, `COOLIFY_HOST`, `COOLIFY_API_URL`, `COOLIFY_TOKEN`, `CF_ACCESS_CLIENT_ID`,
`CF_ACCESS_CLIENT_SECRET`, `COOLIFY_SERVER_UUID`, `COOLIFY_PROJECT_UUID`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`. Optional: `GITHUB_USER` (falls back to `gh api user`), `R2_*`, `AI_*`.

For slug `<app>`:

1. **GitHub:** `gh repo create <app> --private --source . --remote origin && git push -u origin main`;
   `gh secret set CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` (for `deploy-frontend.yml`).
   `gh secret set COOLIFY_APP_UUID` / `COOLIFY_API_TOKEN` / `COOLIFY_API_URL` / `CF_ACCESS_CLIENT_ID` /
   `CF_ACCESS_CLIENT_SECRET` (for `deploy-backend.yml` — auto-set by step 5 below).

2. **Cloudflare (API):**
   - DNS A/CNAME: `<app>-api` → Coolify host (A if IP, CNAME if hostname).
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
   Google OAuth client's Authorized redirect URIs. **Exact steps:**
   - Open the client directly:
     `https://console.cloud.google.com/auth/clients/111027901822-un9pavjod3l8b18t7mauvp72hq6qol00.apps.googleusercontent.com?project=gen-lang-client-0208522494`
     (Google Auth Platform → Clients → client **"Parolin Projects"**, project `gen-lang-client-0208522494`,
     client_id `111027901822-...apps.googleusercontent.com`). This is the same `GOOGLE_CLIENT_ID` in `provision.env`.
   - Scroll to **"Authorized redirect URIs"** → click **"+ Add URI"**.
   - Paste `https://api-<app>.parolin.net/auth/google/callback` (e.g. `https://api-parafit.parolin.net/auth/google/callback`).
   - Click **Save** (bottom) → wait for the **"OAuth client saved"** toast.
   - Do NOT touch "Authorized JavaScript origins" — the domain is auto-added to authorized domains.
   - The existing URIs (paramalhar, recibos, localhost:3000…) stay; you're only appending one row.

Always run `provision` in **dry-run first** (prints the intended calls), then `-Execute` for real.

## Parolin infrastructure reference

> **Read this before choosing technologies.** Every Molde app runs on the same shared infra.
> Understanding the stack prevents redundant decisions and surfaces constraints early.

### Stack overview

| Layer | Technology | Who manages it |
|---|---|---|
| Frontend hosting | Cloudflare Pages | Cloudflare (auto-deploy on push) |
| Backend hosting | Coolify on Oracle VPS | Manual redeploy after push (no CD — see gotcha #14) |
| Database | PostgreSQL 16 (Docker container, one per app) | Coolify |
| File / media storage | Cloudflare R2 | Cloudflare (optional per app) |
| DNS | Cloudflare — zone `parolin.net` | Cloudflare |
| VPS access | Oracle Cloud Always-Free (Ampere ARM, Oracle Linux) | Oracle |
| Stable VPS access | Tailscale mesh VPN | Tailscale (account `gumela@gmail.com`) |

### Naming conventions (canonical — applied by provision.ps1)

| Resource | Convention | Example (slug = `parafit`) |
|---|---|---|
| Frontend domain | `<slug>.parolin.net` | `parafit.parolin.net` |
| API domain | `<slug>-api.parolin.net` | `parafit-api.parolin.net` |
| Postgres DB name | `<slug>-db` | `parafit-db` |
| Postgres username | `<slug>-user` | `parafit-user` |
| R2 bucket | `<slug>-assets` | `parafit-assets` |
| Coolify app name | `<slug>-api` | `parafit-api` |
| Coolify DB name | `<slug>-db` | `parafit-db` |
| GitHub repo | `<slug>` | `parafit` |

**Note:** Apps provisioned before 2026-06-30 use the old pattern `api-<slug>.parolin.net` —
parafit, recibos, trajetorias2, paramalhar. New apps use `<slug>-api.parolin.net`.

### VPS — Oracle Cloud

- **Provider:** Oracle Cloud Always-Free (Ampere ARM), region `sa-saopaulo-1`.
- **OS:** Oracle Linux / Ubuntu (`ubuntu` user).
- **Public IP:** `144.22.138.47`.
- **SSH key:** `~/.ssh/oracle_vps.key` (Ed25519, passphrase-free, stored locally on the dev machine).
- **SSH config entry** (in `~/.ssh/config`):
  ```
  Host oracle-vps paramalhar
      HostName 144.22.138.47
      User ubuntu
      IdentityFile ~/.ssh/oracle_vps.key
      IdentitiesOnly yes
  ```
- **Firewall:** Oracle Cloud Security List (VCN). TCP 80 + 443 must be open to `0.0.0.0/0` for
  Cloudflare → Traefik/Coolify to work. Port 22 can be restricted to the dev machine's IP, but this
  breaks whenever the home WAN IP changes — see Tailscale below.

### Tailscale — stable VPS access

Oracle's Security List IP allowlist for SSH breaks whenever the home WAN IP changes (dynamic IP via
ZTE modem on a residential cable/fiber line). **Tailscale** is the permanent fix: all dev machines
and the VPS are in the same tailnet, so SSH/DBeaver can use the stable Tailscale IP regardless of
WAN changes.

- **Account:** `gumela@gmail.com` (Google login), personal free-tier plan, single tailnet.
- **Registered devices:**
  - `oracle-vps-parolin` → Tailscale IP `100.105.170.101` (Linux, `--ssh` flag enabled, gives
    Tailscale-native SSH as well)
  - `gus-legion` → Tailscale IP `100.80.107.67` (Windows 11 dev laptop)
- **Install on a new Linux host:** `curl -fsSL https://tailscale.com/install.sh | sudo sh && sudo tailscale up --hostname=<name> --ssh`
- **Install on Windows:** `winget install --id Tailscale.Tailscale -e` (note capital T's — case-sensitive).
  After install, use the **GUI tray app** ("Sign in to your network") to authenticate — running
  `tailscale up` from CLI alone doesn't always complete auth on Windows (GUI intercepts the OAuth
  flow). Enable "Run unattended" in tray Preferences to make the connection survive reboots without
  a desktop login.
- **When to use Tailscale IP vs public IP:** for SSH and DBeaver tunnels, prefer the Tailscale IP
  (`100.105.170.101`) — it never changes and doesn't depend on the Oracle Security List. Public IP
  is still needed for Cloudflare → Coolify traffic (API traffic goes through CF Zero Trust, not Tailscale).

### Postgres — one container per app

Each app gets its **own dedicated PostgreSQL Docker container** on the VPS. There is no shared
Postgres server with multiple databases. Isolation is at the container level (separate credentials,
separate storage, separate network endpoint).

**Finding a container's internal IP** (needed for DBeaver — see below):
```bash
sudo docker inspect <uuid> --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
```
All app containers are on the `coolify` Docker bridge network, subnet `10.0.2.0/24`. The VPS host
can reach any container IP directly; DBeaver uses the SSH tunnel to the VPS host, then forwards to
the container IP.

**Known container IPs (current, may change after container recreation):**

| App | Container UUID prefix | Internal IP | DB name | DB user | Note |
|---|---|---|---|---|---|
| parafit | `eus6e9vzt2v0zssijpjppdrz` | `10.0.2.11` | `parafit` | `postgres` | legacy naming |
| paramalhar | `py93j9ymwzqdszeq5p2qvxdu` | `10.0.2.8` | `paramalhar` | `paramalhar_app` | legacy naming |
| recibos | `f13lkyius8n7ctiyksxfhx6u` | `10.0.2.4` | `recibos` | `postgres` | legacy naming |
| trajetorias2 | `a7r8osrtc2xxs03tpcbkmw8h` | `10.0.2.6` | `trajetorias2` | `trajetorias2_app` | legacy naming |

> **Note:** `coolify-db` (Coolify's own internal Postgres) must never be touched.

### DBeaver — connecting to Postgres

**Local Postgres** (same machine as the dev environment):
- Host: `localhost`, Port: `5432`, User: `postgres`, Password: `MARCIE#5178nova` (URL-encoded: `MARCIE%235178nova`)
- All local app databases live in this single instance: `parafit`, `workout_tracker` (paramalhar),
  `recibos`, etc. Visible as separate nodes under "Databases" in the same DBeaver connection.

**VPS Postgres** (per-app, one DBeaver connection each):
- **Main tab:** Host = container's internal Docker IP (e.g. `10.0.2.11`), Port `5432`, Database =
  app slug, User/Password from the app's Coolify environment variables.
- **SSH tab:** Enable tunnel → Host `144.22.138.47` (or Tailscale IP `100.105.170.101`), Port `22`,
  User `ubuntu`, Auth = Public Key → `~/.ssh/oracle_vps.key`.
- **"Share this tunnel with other connections"** — keep this UNCHECKED if multiple VPS connections
  are open simultaneously; the shared state can go stale (EOFException on all connections). Each
  connection manages its own tunnel independently.

### Cloudflare R2 — media and file storage

- Bucket naming convention: **`<app>-assets`** (e.g. `parafit-assets`, `paramalhar-assets`).
- Buckets are **private by default** — no public access. Serve files via pre-signed URLs or a Cloudflare
  Worker with access controls.
- Access from the backend via the standard S3 SDK:
  - `S3_ENDPOINT=https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`
  - `S3_ACCESS_KEY` / `S3_SECRET_KEY` = R2 API token scoped to the bucket.
  - `S3_BUCKET=<app>-assets`
- Provision with `-EnableR2` flag in `provision.ps1` to create the bucket and inject the env vars.
- For local dev: point `S3_ENDPOINT` at a local MinIO instance (`http://localhost:9000`).

---

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

14. **Backend CD (fixed as of 2026-06-30)** — `deploy-backend.yml` was added to the Molde template;
    `provision.ps1` now sets `COOLIFY_APP_UUID`, `COOLIFY_API_TOKEN`, `COOLIFY_API_URL`,
    `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` as GitHub secrets automatically.
    **For apps provisioned before 2026-06-30** (parafit, recibos, trajetorias2, paramalhar):
    set the missing secrets manually with `gh secret set COOLIFY_APP_UUID --body <uuid>` etc.,
    and confirm `deploy-backend.yml` is present in the repo's `.github/workflows/`.
    Symptom if misconfigured: `/health` returns 200 but routes return `404` — server is up but
    on old code.

15. **Coolify Postgres internal DB name (fixed as of 2026-06-30)** — `provision.ps1` now passes
    `postgres_db=<slug>-db`, `postgres_user=<slug>-user`, `postgres_password=<generated>` when
    creating the Postgres container, so the DB is named correctly from the start.
    **For apps provisioned before 2026-06-30** (parafit, recibos, trajetorias2, paramalhar):
    the DB was renamed manually via `ALTER DATABASE postgres RENAME TO <slug>`. Already done.

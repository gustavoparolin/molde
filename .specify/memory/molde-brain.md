# Molde brain — execution & deploy recipe

> Single source of truth shared by Claude Code and Copilot (referenced from `.claude/commands/`
> and `.github/prompts/`). The skill `molde-new-app` follows this end to end. Infra-specific values
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

## Auth flow (Google OAuth + JWT)

`GET /auth/google/login` → `{authorizeUrl}` → Google consent → `GET /auth/google/callback?code=…`
→ exchange code → `upsertGoogleUser` (find by **googleSubjectId OR email**) → `reply.jwtSign` →
redirect `https://<app>.parolin.net/auth/callback?token=<jwt>`. Frontend stores it; `apiClient` sends
Bearer; 401 → auto-logout. DEV mock: `POST /auth/google/mock` (hidden behind `import.meta.env.DEV`).
A **single shared OAuth client** serves all `*.parolin.net`; per app, add one redirect URI.

## Deploy pipeline (by API — the molde-deploy skill)

Reads `~/.config/molde/provision.env`. For slug `<app>`:

1. **GitHub:** `gh repo create <app> --private --source . --remote origin && git push -u origin main`;
   `gh secret set CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` (for the deploy-frontend workflow).
2. **Cloudflare (API / wrangler):**
   - DNS: create `api-<app>` record pointing at the Coolify host.
   - Pages: create project `<app>`; custom domain `<app>.parolin.net` (auto-creates its DNS).
   - R2: create bucket `<app>-assets` if the app uploads files.
3. **Coolify (API):**
   - Create PostgreSQL → capture the internal connection string.
   - Create Application from the GitHub repo via the existing GitHub App; **Base Directory `/backend`**,
     Nixpacks, `NIXPACKS_NODE_VERSION=22`, FQDN `api-<app>.parolin.net`.
   - Set env: `PORT, DATABASE_URL, FRONTEND_ORIGINS=https://<app>.parolin.net, JWT_SECRET,
     GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI=https://api-<app>.parolin.net/auth/google/callback`.
   - Deploy.
4. **Verify:** `GET https://api-<app>.parolin.net/health` → `{"status":"ok"}`; smoke the real Google login.
5. **Residual manual (🧑 ~30s):** add `https://api-<app>.parolin.net/auth/google/callback` to the shared
   Google OAuth client's Authorized redirect URIs.

Always run `provision` in **dry-run first** (prints the intended calls), then for real.

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
7. **Coolify auto-deploy stopped** — the GitHub App webhook URL must point at the current Coolify host
   (`https://coolify.parolin.net/webhooks/source/github/events`).

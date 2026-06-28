# Stack profile — TEMPLATE (register your own)

> A **stack profile** describes the HOW/WHERE of deployment, paired with `.brief/idea.md` (the WHAT).
> Together they feed spec-kit. This file is the blank shape. The filled version for your real
> infrastructure lives **privately** at `~/.config/molde/stack.md` and is seeded into `.brief/stack.md`
> per app — so the public template never leaks your domains, tokens, or server IDs.

Fill each `<…>` placeholder with your own values.

## Identity & domains

- Frontend domain pattern: `<app>.<your-zone>`        (e.g. `<app>.parolin.net`)
- API domain pattern:      `api-<app>.<your-zone>`     (e.g. `api-<app>.parolin.net`)
- Database name pattern:   `<app>`

## Hosting

| Layer | Where | Notes |
|---|---|---|
| Frontend | Cloudflare Pages | SPA fallback `/*  /index.html  200`; deploy via `wrangler pages deploy` in CI |
| Backend  | Coolify on VPS | Base dir `/backend`, Nixpacks, Node 22, port 3000 |
| Database | Postgres (Coolify-managed) | Migrations run on boot (`prisma migrate deploy`) |
| Storage  | Cloudflare R2 (opt-in) | Only if the app uploads files; provision with `-EnableR2` |
| Auth     | Google OAuth + signed JWT | Shared OAuth client across `*.<your-zone>`; add one redirect URI per app |
| AI       | Z.AI / OpenAI-compatible (opt-in) | `openai` package with `AI_API_KEY / AI_BASE_URL / AI_MODEL`; provision with `-EnableAI` |

## Environment variables

See `.env.example` for the full list. Production values are set in Coolify (backend) and
Cloudflare Pages build environment (`VITE_API_BASE_URL`).

## Provisioning automation

Agent provisions infra via API using `~/.config/molde/provision.env`. Required keys:

```
CLOUDFLARE_API_TOKEN        CLOUDFLARE_ACCOUNT_ID      CLOUDFLARE_ZONE_ID
COOLIFY_HOST                COOLIFY_API_URL             COOLIFY_TOKEN
CF_ACCESS_CLIENT_ID         CF_ACCESS_CLIENT_SECRET     # Zero Trust service token for Coolify
COOLIFY_SERVER_UUID         COOLIFY_PROJECT_UUID
GOOGLE_CLIENT_ID            GOOGLE_CLIENT_SECRET
GITHUB_USER                 # GitHub username (falls back to `gh api user`)
R2_ACCESS_KEY_ID            R2_SECRET_ACCESS_KEY        # only if -EnableR2
AI_API_KEY                  AI_BASE_URL                 AI_MODEL   # only if -EnableAI
```

Run: `pwsh scripts/provision.ps1 [-EnableR2] [-EnableAI] -Execute`

The only residual manual step per app is adding the new redirect URI to the shared OAuth client (~30s).

## Known gotchas

Record here the deploy traps you hit so future runs skip them.
See `.specify/memory/molde-brain.md` for the reference list (13 gotchas documented).

Key ones: Coolify needs CF-Access headers if behind Zero Trust; Cloudflare Pages subdomain may have a
suffix (`myapp-2k8.pages.dev`) — read it from the API, don't assume `<slug>.pages.dev`; CNAME must
exist before adding the custom domain to Pages; Oracle Security List must allow inbound TCP 80/443.

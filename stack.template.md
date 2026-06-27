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
| Frontend | `<static host>` (e.g. Cloudflare Pages) | SPA fallback `/*  /index.html  200` |
| Backend  | `<container host>` (e.g. Coolify on a VPS) | Base directory `/backend`, Nixpacks, Node 22 |
| Database | `<managed/self-hosted Postgres>` | migrations run on boot (`prisma migrate deploy`) |
| Storage  | `<S3-compatible>` (e.g. Cloudflare R2) | only if the app uploads files |
| Auth     | Google OAuth + signed JWT | shared OAuth client across `*.<your-zone>` |

## Environment variables

See `.env.example` for the full list. Production values are set in the host panels
(`<container host>` for the backend, `<static host>` build env for `VITE_API_BASE_URL`).

## Provisioning automation

The agent provisions infra via API using credentials in `~/.config/molde/provision.env`:
`<DNS/Pages provider API>` + `<container host API>`. The only residual manual step per app is adding
the new redirect URI to the shared OAuth client (~30s).

## Known gotchas

Record here the deploy traps you hit so future runs skip them (auth callback mismatches, build-time env
vars, CORS origins, webhook URLs, …). See `.specify/memory/molde-brain.md` for the reference list.

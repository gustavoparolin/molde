# Molde Constitution

## I. Vertical Slice, Borrowed from `Item`

Every new entity follows the exact pattern of the `Item` slice:
`repository → service → route → store → page`. No shortcuts, no mixtures.
The `Item` example in the skeleton is the canonical reference — imitate it structurally.

## II. Auth is Non-Negotiable

Every route that touches user data must use `requireAuth`. JWT is signed and
expires after 30 days. The shared Google OAuth client (`*.parolin.net`) is
already set up; each app only adds one redirect URI.

## III. Prisma is the Single ORM

All DB access goes through `src/repositories/db.ts`. The `$extends` audit hook
auto-fills `createdBy` / `updatedBy` from `AsyncLocalStorage` — never set these
fields manually. Migrations run on Coolify at container startup.

## IV. Mantine is the Design System

Use Mantine 8 components. No external CSS frameworks. Tokens live in
`frontend/src/theme.ts` (brand purple + `md` radius + Inter). If a feature
needs a chart, Dropzone, or date picker, use `@mantine/charts`, `@mantine/dropzone`,
`@mantine/dates` — they are already available in the skeleton.

## V. Environment Variables, Never Hardcoded Secrets

- Runtime secrets (`DATABASE_URL`, `JWT_SECRET`, `GOOGLE_*`) → Coolify envs, never in repo.
- Build-time frontend config (`VITE_API_BASE_URL`) → GitHub Action env, auto-injected.
- Provisioning credentials → `~/.config/molde/provision.env`, never committed.
- `.env` is always gitignored; `.env.example` has no real values.

## VI. Automation First, One Manual Step

The `molde-deploy` skill provisions everything (Cloudflare DNS + Pages + Coolify
Postgres + App + envs + deploy) via API. The **only** manual step per app is
adding one redirect URI to the shared Google OAuth client (~30 s).

## VII. In-Memory Fallback in Skeleton Only

Repositories have an in-memory fallback so the skeleton runs without a DB.
Generated apps should remove the fallback once a real DB is provisioned.

## VIII. Quality Gates Before Every Commit

`npm run typecheck` must pass. If E2E tests exist, `npx playwright test` must
pass. Never bypass with `--no-verify` or `skipLibCheck` workarounds in source
(only in tsconfigs for third-party type compat).

## Governance

This constitution governs all Molde-generated apps. When an app diverges, the
divergence must be explicit and documented in `.brief/notes.md`. The skeleton
(repository `gustavoparolin/molde`) is the source of truth.

**Version**: 1.0.0 | **Ratified**: 2026-06-27

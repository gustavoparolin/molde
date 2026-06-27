# Agent instructions (Claude Code · GitHub Copilot)

This repository is a **Molde** scaffold (Parolin Stack). These instructions apply to whichever
assistant is driving — they live here so both tools share the same brain without symlinks.

## The `.brief/` folder is planning context

Everything under `.brief/` is **input for the spec**, not product code:

- `.brief/idea.md` — the product intent/brief for this app. **Read it fully.**
- `.brief/inspiration/` — screenshots of reference apps. **Read these images**; the UI you build
  should echo them (layout, density, tone). Mantine is the design system.
- `.brief/stack.md` — the stack profile (domains, infra, deploy). Treat as ground truth for infra.
- `.brief/notes.md` — freeform notes.

Never assume; if `idea.md` is incomplete, interview the user and write it back before specifying.

## Build by imitating the `Item` slice

The reference vertical slice is `Item`:

- Backend: `prisma/schema.prisma` → `repositories/itemRepository.ts` → `services/itemService.ts` →
  `api/routes/items.ts` (registered in `api/server.ts`). Auth via `requireAuth`; audit columns
  (`createdBy/updatedBy`) are filled automatically by the Prisma extension in `repositories/db.ts`.
- Frontend: `store/itemsStore.ts` → `pages/ItemsPage.tsx`, using `services/apiClient.ts` (Bearer + 401
  auto-logout). UI uses **Mantine** components and the theme in `frontend/src/theme.ts`.

Copy this shape 1:1 for the real domain entities. Keep the same layering and naming.

## Workflow

1. Use **spec-kit** for non-trivial work: `/speckit.specify` → `/speckit.plan` → `/speckit.tasks` →
   `/speckit.implement`. The skill `molde-new-app` orchestrates a brand-new app end to end.
2. Run `npm run typecheck` before every commit. Use conventional commits (`feat:`, `fix:`, …).
3. Secrets never go in the repo. Infra/provisioning tokens live in `~/.config/molde/provision.env`.

## Deep reference

`.specify/memory/molde-brain.md` holds the full execution + deploy recipe and known gotchas.

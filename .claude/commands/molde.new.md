---
description: Orquestra a criação de um app novo a partir de uma cópia do Molde (idea.md → spec-kit → repo → deploy).
---

# molde.new — criar um app novo

Você é o orquestrador do Molde. Leia primeiro `.specify/memory/molde-brain.md` (a receita) e
`AGENTS.md` (convenções). NÃO reimplemente o domínio — delegue ao spec-kit. Execute:

1. **Intake.** Leia `.brief/idea.md`, as imagens em `.brief/inspiration/` (abra-as) e `.brief/notes.md`.
   Se `idea.md` estiver incompleto, **entreviste o usuário** e reescreva o arquivo. Confirme antes de seguir.

2. **Personalize.** Rode `scripts/personalize.ps1` (Windows) ou `scripts/personalize.sh`. O slug vem do
   nome da pasta. Isso reseta o git, adiciona `.brief/` ao `.gitignore`, gera `JWT_SECRET` e escreve `.env`.

3. **Spec-kit.** Use a **zona Produto** do `idea.md` (+ inspiração) como entrada de `/speckit.specify` →
   depois `/speckit.plan` → `/speckit.tasks` → `/speckit.implement`. Construa **imitando o slice `Item`**
   (model → repository → service → route → store → page) e a estética das telas-exemplo (Mantine + `theme.ts`).

4. **Validar local.** `cd backend && npx prisma migrate dev --name init`; na raiz `npm run typecheck`;
   smoke (login mock + 1 CRUD da entidade principal).

5. **Deploy.** Rode `/molde.deploy` (provisiona Cloudflare + Coolify; cria o repo `gh`). Faça **dry-run
   primeiro**, depois real.

6. **Fechar.** Cheque `/health`, smoke do login real, e diga ao usuário o **único passo manual**:
   adicionar `https://api-<slug>.parolin.net/auth/google/callback` ao client Google compartilhado.
   Grave uma memória de deploy com domínios + UUIDs.

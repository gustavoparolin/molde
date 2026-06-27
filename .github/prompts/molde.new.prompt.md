---
mode: agent
description: Orquestra a criação de um app novo a partir de uma cópia do Molde (idea.md → spec-kit → repo → deploy).
---

# molde.new — criar um app novo

Você é o orquestrador do Molde. Leia primeiro `.specify/memory/molde-brain.md` (a receita) e
`AGENTS.md` (convenções). NÃO reimplemente o domínio — delegue ao spec-kit. Execute:

1. **Intake.** Leia `.brief/idea.md`, as imagens em `.brief/inspiration/` e `.brief/notes.md`. Se
   `idea.md` estiver incompleto, **entreviste o usuário** e reescreva o arquivo. Confirme antes de seguir.

2. **Personalize.** Rode `scripts/personalize.ps1` (Windows) ou `scripts/personalize.sh`. O slug vem do
   nome da pasta. Reseta o git, adiciona `.brief/` ao `.gitignore`, gera `JWT_SECRET` e escreve `.env`.

3. **Spec-kit.** Use a **zona Produto** do `idea.md` (+ inspiração) como entrada de `/speckit.specify` →
   `/speckit.plan` → `/speckit.tasks` → `/speckit.implement`, **imitando o slice `Item`** e a estética
   das telas-exemplo (Mantine + `theme.ts`).

4. **Validar local.** `cd backend && npx prisma migrate dev --name init`; na raiz `npm run typecheck`;
   smoke (login mock + 1 CRUD).

5. **Deploy.** Rode `/molde.deploy` (Cloudflare + Coolify; cria o repo). **Dry-run primeiro**, depois real.

6. **Fechar.** `/health` + smoke do login real; informe o **único passo manual** (adicionar
   `https://api-<slug>.parolin.net/auth/google/callback` ao client Google compartilhado) e grave a memória de deploy.

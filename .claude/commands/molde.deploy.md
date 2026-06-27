---
description: Provisiona a infra do app (Cloudflare + Coolify) e cria o repo no GitHub.
---

# molde.deploy — provisionar e publicar

Leia `.specify/memory/molde-brain.md` (seção "Deploy pipeline"). Pré-requisito:
`~/.config/molde/provision.env` preenchido. Execute:

1. **Repo + secrets.** `gh repo create <slug> --private --source . --remote origin && git push -u origin main`.
   `gh secret set CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` (para o workflow `deploy-frontend.yml`).
2. **Provision (dry-run).** `pwsh scripts/provision.ps1 -Slug <slug>` (adicione `-EnableR2` se o app
   faz upload). Revise as chamadas impressas.
3. **Provision (real).** `pwsh scripts/provision.ps1 -Slug <slug> -Execute`.
4. **Verificar.** `GET https://api-<slug>.parolin.net/health` → `{"status":"ok"}`; smoke do login real.
5. **Avisar o único passo manual:** adicionar `https://api-<slug>.parolin.net/auth/google/callback` ao
   client Google compartilhado. Depois grave a memória de deploy (domínios + UUIDs do Coolify).

Se algo falhar no provision, use `scripts/deprovision.ps1 -Slug <slug>` para limpar e refazer.

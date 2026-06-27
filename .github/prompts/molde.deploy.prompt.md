---
mode: agent
description: Provisiona a infra do app (Cloudflare + Coolify) e cria o repo no GitHub.
---

# molde.deploy — provisionar e publicar

Leia `.specify/memory/molde-brain.md` (seção "Deploy pipeline"). Pré-requisito:
`~/.config/molde/provision.env` preenchido. Execute:

1. **Repo + secrets.** `gh repo create <slug> --private --source . --remote origin && git push -u origin main`;
   `gh secret set CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
2. **Provision (dry-run):** `pwsh scripts/provision.ps1 -Slug <slug>` (`-EnableR2` se houver upload). Revise.
3. **Provision (real):** `pwsh scripts/provision.ps1 -Slug <slug> -Execute`.
4. **Verificar:** `GET https://api-<slug>.parolin.net/health` → ok; smoke do login real.
5. **Único passo manual:** adicionar `https://api-<slug>.parolin.net/auth/google/callback` ao client
   Google compartilhado; grave a memória de deploy. Em falha, `scripts/deprovision.ps1 -Slug <slug>`.

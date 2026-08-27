# Molde

> Template + pipeline para criar apps full-stack no **Parolin Stack** "em minutos": da ideia
> (com screenshots de inspiração) ao app no ar em `xyz.parolin.net`, com a IA fazendo o máximo.

**Stack:** React 19 + Vite + **Mantine 8** (frontend) · Fastify 5 + Prisma 7 + PostgreSQL (backend) ·
Google OAuth + JWT · Cloudflare Pages/DNS/R2 + Coolify (Oracle Always Free).

---

## Como usar (workflow copy-paste)

```
1. Em OneDrive/web: copie a pasta `molde` → cole com o nome do app novo (ex.: celula3)
2. code .                       # abre no VSCode
3. .brief/inspiration/          # cole screenshots de apps de referência
4. abra .brief/idea.md          # já vem com instruções; preencha (sozinho ou com a IA)
5. entregue ao spec-kit         # dispara a skill `molde-new-app`
   → personalize → /speckit.specify → plan → tasks → implement → deploy → app no ar
```

O slug é inferido do **nome da pasta** (`celula3` → `celula3.parolin.net` + `api-celula3.parolin.net`
+ banco `celula3`). A skill reseta o git, cria o repo novo, e provisiona Cloudflare + Coolify via API.
Único passo manual por app: adicionar 1 redirect URI no client Google compartilhado (~30s).

## A camada privada `.brief/` (planejamento) vs o produto (commitado)

`.brief/` guarda seu **brainstorm pessoal** — `idea.md` (a intenção), `inspiration/` (telas), `stack.md`
(o perfil de stack) e `notes.md`. No Molde ela é versionada (template); ao criar um app, `personalize`
**adiciona `.brief/` ao `.gitignore`** desse app — então suas notas/telas **nunca** vão ao GitHub do
produto, mas ficam no OneDrive como backup. O produto (`specs/`, `backend/`, `frontend/`) é o que é
commitado.

## Rodar localmente (smoke do esqueleto)

```bash
npm install
cd backend && npx prisma migrate dev --name init   # precisa de um Postgres local
cd .. && npm run typecheck                           # backend + frontend
npm run dev                                           # backend  (:3000)
npm run dev:web                                       # frontend (:5173) — outro terminal
```

Sem OAuth configurado, entre pelo atalho **Dev: entrar sem OAuth** na tela de login (mock). O esqueleto
roda **mesmo sem banco** (fallback in-memory nos repositórios) — útil para um smoke rápido.

### Alerta de segurança em dependência? `npm run relock`

```bash
npm run relock -- --dry-run   # mostra o que mudaria, não grava nada
npm run relock                # resolve limpo, grava o lock, sincroniza, gera o Prisma Client e audita
```

O `npm audit fix` resolve alerta em dependência transitiva com o movimento que ele achar — e às vezes esse movimento é **downgrade de major** (foi o caso do `deepmerge-ts`, que ele "corrigia" voltando o Prisma de 7.x para 6.12). O caminho certo é um `overrides` no `package.json` raiz, mas o npm 11 **ignora `overrides` novo enquanto existir `node_modules`** na pasta: ele reconstrói a árvore da instalação física e responde `up to date` sem re-resolver nada. O `relock` resolve num diretório que só tem os `package.json`, onde o npm é obrigado a consultar o registry, e traz o lock de volta. De brinde, sobe tudo que estava atrasado dentro do semver declarado — major nenhum é tocado. Detalhes e o histórico do caso em [AGENTS.md](AGENTS.md) § 7 e em `.specify/memory/field-notes.md`.

A fatia de referência é o **`Item`** (model Prisma → repository → service → route → store → page). Copie
esse padrão 1:1 para as entidades do seu domínio.

## Quando usar o Molde — e quando NÃO

| Tipo de projeto | Encaixe | O que fazer |
|---|---|---|
| App com dados no Postgres + UI + (Claude opcional) — recibos, finanças, dashboards | 🟢 ideal | Use o Molde |
| Importação de planilha/CSV grande + analytics | 🟢 bom | Molde + importador batch (script, não request) + `@mantine/charts` |
| Site de conteúdo/marketing (SEO-first) | 🟡 overkill | Fora do Molde: use **Astro estático** no Cloudflare Pages (sem Fastify/Postgres) |
| Cofre de senhas/documentos críticos (zero-knowledge) | 🔴 cuidado | Fora do Molde: exige cripto E2E + segredo compartilhado + dead-man's-switch → **spike de segurança** dedicado |

## Setup único de credenciais (uma vez na vida)

Para a IA provisionar infra sozinha, crie `~/.config/molde/provision.env` (fora de qualquer repo):

```
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
COOLIFY_API_URL=https://coolify.parolin.net/api/v1
COOLIFY_TOKEN=...
COOLIFY_SERVER_UUID=...
GOOGLE_CLIENT_ID=...        # client OAuth compartilhado p/ *.parolin.net
GOOGLE_CLIENT_SECRET=...
```

O perfil de stack preenchido (domínios, alvos de deploy, armadilhas) mora em `~/.config/molde/stack.md`
e é semeado em `.brief/stack.md` a cada app. Veja [`stack.template.md`](stack.template.md) para o formato.

## Documentação

- [`AGENTS.md`](AGENTS.md) — instruções para Claude Code / GitHub Copilot.
- [`.specify/memory/molde-brain.md`](.specify/memory/molde-brain.md) — o "cérebro": receita de execução e deploy + armadilhas conhecidas.
- [`stack.template.md`](stack.template.md) — formato de um perfil de stack (registre o seu).

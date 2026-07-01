# Parolin Stack — Receita para um novo app

> **Para a IA que está lendo isto:** este documento descreve o stack de desenvolvimento do
> Parolin Stack. O objetivo é que você consiga, a partir de uma ideia nova, **andaimar (scaffold)
> um app completo e colocá-lo no ar em minutos**, fazendo tudo que for automatizável e guiando o
> humano nos poucos passos que exigem clique manual.
>
> Leia as seções 1–4 para **entender** o stack. Use a seção 5 como **roteiro de execução**.
> A seção 7 lista armadilhas reais já resolvidas — leia antes de debugar.
>
> Para detalhes de infraestrutura (VPS Oracle, Coolify, DBeaver, Tailscale, IPs de containers),
> leia **`molde-brain.md`** (seção "Parolin infrastructure reference").

**App de referência:** Parafit — produção em parafit.parolin.net, API em api-parafit.parolin.net.
**Última atualização:** 2026-06-30.

---

## 0. Divisão de trabalho — 🤖 IA vs 🧑 Humano

A IA faz tudo que é **código, config, git e CLI**. O humano só faz o que exige **clique em
painel web** (e mesmo isso é minimizado pela skill `molde-deploy` + `provision.ps1`).

| Etapa | Quem | Como |
|---|---|---|
| Scaffold do monorepo (frontend + backend + prisma + auth) | 🤖 | arquivos + `npm install` |
| Schema Prisma + primeira migration | 🤖 | `prisma migrate dev` |
| Criar repositório GitHub + push | 🤖 | `gh repo create` |
| Rodar localmente e validar | 🤖 | `npm run dev` + typecheck |
| Provisionar infra (DNS, Pages, Coolify, DB) | 🤖 via skill | `molde-deploy` + `provision.ps1` |
| Adicionar redirect URI no Google OAuth | 🧑 | Google Cloud Console (único passo manual — ~30s) |
| Preencher env vars de produção | 🤖 via provision | `provision.ps1` injeta automaticamente |
| Conectar tudo e disparar deploy | 🤖 | `git push` (Cloudflare) + Coolify manual redeploy |

> **Regra de ouro:** a IA **nunca inventa** URLs, IDs, segredos ou nomes de host. Se um valor
> não está no repositório, no `.env` ou foi dado pelo humano, **pergunte** — não chute.

---

## 1. Visão geral do stack

```
                           push em main (GitHub)
                                   │
              ┌────────────────────┴────────────────────┐
              │ deploy-frontend.yml (auto)   deploy-backend.yml (auto) │
              ▼                                                        ▼
   ┌──────────────────────┐                  ┌────────────────────────┐
   │  Cloudflare Pages     │   HTTPS (CORS)   │  Coolify (Oracle VPS)  │
   │  app.parolin.net      │ ───────────────► │  app-api.parolin.net   │
   │  React 19 + Vite SPA  │   Bearer JWT     │  Fastify (tsx runtime) │
   └──────────────────────┘                  │         │              │
                                             │         ▼              │
                                             │  ┌────────────────┐    │
                                             │  │  PostgreSQL     │    │
                                             │  │  (Prisma ORM)   │    │
                                             │  └────────────────┘    │
                                             └────────────────────────┘
                                                       │
                                                       ▼
                                          Cloudflare R2 (S3) — mídia
```

| Camada | Tecnologia | Versão de referência |
|---|---|---|
| Frontend | React + TypeScript + Vite | React 19, Vite 7 |
| Estado | Zustand | 5.x |
| Roteamento | React Router DOM | 7.x |
| UI | Mantine | 8.x |
| Ícones | lucide-react | — |
| Backend | Fastify + TypeScript via **tsx** (sem build step) | Fastify 5 |
| ORM | Prisma | **7.x** |
| Banco | PostgreSQL | 16+ (Docker no VPS, via Coolify) |
| Auth | Google OAuth 2.0 + **JWT assinado** (`@fastify/jwt`) | — |
| Validação | Zod | 3.x |
| Storage | Cloudflare R2 (S3-compatível, `@aws-sdk/client-s3`) | — |
| Runtime | Node | **22 LTS** (nixpacks fixa em 22.11.0; ver gotcha #8) |
| Testes | Vitest (unit) + Playwright (e2e) | — |
| Lint/format | ESLint + Prettier | — |

**Princípios:**
- **Monorepo npm workspaces** (`frontend` + `backend`), um único `git push` dispara o deploy do frontend.
- **Backend roda TypeScript direto** com `tsx` — não há etapa de compilação no servidor.
- **Migrations aplicam no boot** (`prisma migrate deploy` no `start`).
- **Custo zero**: Cloudflare Pages (free) + Coolify auto-hospedado em VPS Oracle Always Free.
- **Stateless auth**: JWT no `Authorization: Bearer`, sem sessão no servidor.

---

## 2. Anatomia do repositório

```
<app>/
├── package.json            # raiz: workspaces + scripts agregados + devDeps compartilhadas
├── tsconfig.json           # base estendida por frontend/ e backend/
├── .env                    # dev local (gitignored)
├── .env.example            # template versionado (sem segredos reais)
├── frontend/
│   ├── package.json        # React/Vite/Zustand/Mantine
│   ├── vite.config.ts      # plugin-react, server.port 5173
│   ├── tsconfig.json       # jsx react-jsx, moduleResolution Bundler
│   ├── public/_redirects   # "/*  /index.html  200"  (SPA fallback do Cloudflare Pages)
│   └── src/
│       ├── main.tsx
│       ├── app/App.tsx     # rotas + guard de auth
│       ├── pages/
│       ├── features/auth/  # SignInPanel, authCallbackHandler, AuthCallbackPage
│       ├── services/apiClient.ts   # fetch + Bearer + auto-logout 401
│       └── store/authStore.ts      # Zustand + persistência localStorage
├── backend/
│   ├── package.json        # Fastify/Prisma/Zod; scripts dev/start/db:migrate
│   ├── tsconfig.json       # module NodeNext, target ES2022
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── prisma.config.ts   # OBRIGATÓRIO no Prisma 7 (ver §2.5)
│   │   └── migrations/
│   └── src/
│       ├── api/server.ts   # registra plugins (cors, jwt) + rotas + listen
│       ├── api/routes/     # auth.ts, ...
│       ├── auth/googleAuth.ts       # OAuth + requireAuth() (verifica JWT)
│       ├── repositories/   # db.ts (prisma singleton) + *Repository.ts
│       └── services/
└── e2e/                    # Playwright (opcional, medium+)
```

### Configs canônicas

**Raiz `package.json`** — workspaces + scripts agregados:
```json
{
  "name": "<app>",
  "private": true,
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev": "npm run dev --workspace backend",
    "dev:web": "npm run dev --workspace frontend",
    "typecheck": "npm run typecheck --workspace backend && npm run typecheck --workspace frontend",
    "lint": "npm run lint --workspace backend && npm run lint --workspace frontend",
    "test": "npm run test --workspace backend && npm run test --workspace frontend",
    "db:migrate": "npm run db:migrate --workspace backend"
  }
}
```
> `npm run dev` na raiz sobe só o backend. Em dev local, rode o frontend em terminal separado:
> `npm run dev:web` (Vite na 5173).

**`backend/package.json`** — repare no `dev` (carrega .env via node flag) e no `start`:
```json
{
  "name": "backend",
  "type": "module",
  "engines": { "node": ">=22.0" },
  "scripts": {
    "dev": "node --env-file-if-exists=../.env --watch --import=tsx src/api/server.ts",
    "start": "npm run db:migrate && node --import=tsx src/api/server.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "db:migrate": "prisma migrate deploy",
    "db:migrate:dev": "prisma migrate dev"
  }
}
```
> **Em produção (Coolify)** o `start_command` é sobrescrito via PATCH da API para incluir
> `--experimental-require-module` (workaround para o Node 22.11.0 do nixpacks — ver gotcha #8).
> O arquivo `package.json` não precisa disso porque em dev o Node é 24+.

**`backend/tsconfig.json`**: `module: NodeNext`, `moduleResolution: NodeNext`, `target: ES2022`, `strict: true`, `types: ["node"]`.
**`frontend/tsconfig.json`**: `jsx: react-jsx`, `module: ESNext`, `moduleResolution: Bundler`, `types: ["vite/client"]`.
**`frontend/public/_redirects`**: exatamente `/*    /index.html   200` (sem isso, refresh em rota interna dá 404 no Cloudflare).

### §2.5 `backend/prisma/prisma.config.ts` — OBRIGATÓRIO no Prisma 7

O Prisma 7 **não carrega `.env` automaticamente** e exige que o datasource declare explicitamente
tanto `url` (para os comandos `migrate`) quanto `adapter` (para o runtime). Sem este arquivo,
`prisma migrate deploy` falha com *"datasource.url property is required"*.

```typescript
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Carrega .env em dev; em prod (Coolify) as vars já vêm do ambiente, então pula.
const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

export default defineConfig({
  datasource: {
    // `url` é exigido pelos comandos `prisma migrate`; `adapter` é usado pelo runtime.
    url: process.env.DATABASE_URL!,
    adapter: () => new PrismaPg(process.env.DATABASE_URL!),
  },
});
```

> Nota: o caminho `../../.env` assume que `prisma.config.ts` fica em `backend/prisma/`. Se for
> colocado em `backend/` diretamente, use `../.env`.

---

## 3. Convenções obrigatórias

### 3.1 Domínios (padrão fixo)
- Frontend: **`<app>.parolin.net`**
- API: **`<app>-api.parolin.net`**

Domínios de **1 nível** sob `parolin.net`. Nunca `.com.br` nem subníveis extras.

### 3.2 Autenticação — Google OAuth + JWT (o fluxo completo)

```
[Frontend]  GET /auth/google/login ──► [Backend] devolve { authorizeUrl }
     │ window.location = authorizeUrl
     ▼
[Google] tela de consentimento ──► redireciona p/ GOOGLE_REDIRECT_URI
     ▼
[Backend] GET /auth/google/callback?code=...
     │  - troca code por perfil (exchangeGoogleCodeForProfile)
     │  - upsert do usuário (por googleSubjectId OU email — ver §7)
     │  - assina JWT (reply.jwtSign) com { userId, email, displayName, avatarUrl }
     │  - redirect 302 → https://<app>.parolin.net/auth/callback?token=<jwt>
     ▼
[Frontend] /auth/callback (AuthCallbackPage)
     │  - lê token da query, decodifica payload, salva no authStore + localStorage
     │  - navega para a home
     ▼
[Frontend] toda requisição → apiClient injeta  Authorization: Bearer <jwt>
[Backend]  requireAuth() → request.jwtVerify(); 401 se inválido/expirado
[Frontend] 401 → logout automático (limpa store + localStorage)
```

Pontos não-negociáveis:
- O backend **assina e verifica** JWT. Nunca confiar em headers crus tipo `X-User-Id`.
- `JWT_SECRET` é **obrigatório em produção** e **diferente** do valor de dev.
- Em **DEV** existe um atalho mock (`POST /auth/google/mock`) para logar sem configurar OAuth.
  Some em produção (hidden behind `import.meta.env.DEV`).
- O JWT é registrado em `server.ts` com `sign: { expiresIn: "30d" }`.
- **Um único client Google OAuth** serve todos os apps `*.parolin.net` — ao criar um novo app,
  basta adicionar uma redirect URI ao client existente (~30s, único passo manual).

### 3.3 CORS
Origens permitidas **somente** via env `FRONTEND_ORIGINS` (lista separada por vírgula).
Nunca hardcodar origem. `allowedHeaders: ["Content-Type", "Authorization"]`.

### 3.4 Segredos
- Dev: `.env` na raiz (gitignored). `.env.example` versionado, **sem valores reais**.
- Prod: env vars no painel (Coolify p/ backend, Cloudflare Pages p/ frontend).
- **Nunca** commitar segredo. Gerar `JWT_SECRET` com:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### 3.5 Commits
Conventional commits (`feat:`, `fix:`, `chore:`...). Rodar `npm run typecheck` antes de commitar.
Co-autoria do Claude no rodapé das mensagens.

---

## 4. Variáveis de ambiente — referência completa

| Variável | Dev (`.env`) | Produção | Onde se define | Obrigatória |
|---|---|---|---|---|
| `PORT` | `3000` | `3000` | Coolify | sim |
| `DATABASE_URL` | `postgresql://postgres:<password>@localhost:5432/<app>` | string do Postgres do Coolify | Coolify | sim |
| `FRONTEND_ORIGINS` | `http://localhost:5173` | `https://<app>.parolin.net` | Coolify | sim |
| `JWT_SECRET` | valor aleatório | **outro** valor aleatório | Coolify | sim |
| `GOOGLE_CLIENT_ID` | do Google Console | mesmo | Coolify | sim¹ |
| `GOOGLE_CLIENT_SECRET` | do Google Console | mesmo | Coolify | sim¹ |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/auth/google/callback` | `https://api-<app>.parolin.net/auth/google/callback` | Coolify | sim¹ |
| `NIXPACKS_NODE_VERSION` | — | `22` | Coolify | sim |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_REGION` | MinIO local ou vazio | Cloudflare R2 | Coolify | só se usar upload |
| `VITE_API_BASE_URL` | `http://localhost:3000` | `https://api-<app>.parolin.net` | **Cloudflare Pages** | sim |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` / `AI_MAX_TOKENS` | chave Gemini ou Ollama | prod key | Coolify | só se usar AI |

¹ OAuth real. Em dev dá pra logar via mock sem isso (mas configure assim que puder).

> ⚠️ **`VITE_API_BASE_URL` é compilada no build** (Vite inlina `import.meta.env` no bundle).
> Ela tem que existir no **Cloudflare Pages** (env de build). Se faltar, o frontend de produção
> chama `localhost:3000`.

---

## 5. Receita: do zero ao ar

### Fase A — 🤖 IA: scaffold local

1. Criar a estrutura do §2 (raiz + `frontend/` + `backend/`), copiando as configs canônicas.
2. `backend/prisma/schema.prisma`: começar com `UserAccount` (campos mínimos abaixo) e os
   models do domínio novo. **Sempre** incluir:
   ```prisma
   model UserAccount {
     id              String   @id @default(uuid())
     googleSubjectId String   @unique
     email           String   @unique
     displayName     String
     avatarUrl       String?
     createdAt       DateTime @default(now())
     updatedAt       DateTime @updatedAt
     // + relações do domínio
   }
   ```
3. Criar `backend/prisma/prisma.config.ts` (ver §2.5) — **obrigatório para o Prisma 7**.
4. Portar os arquivos de auth do app de referência (são genéricos, mudam só o domínio):
   - `backend/src/auth/googleAuth.ts` (OAuth + `requireAuth` via `request.jwtVerify()`)
   - `backend/src/api/routes/auth.ts` (`/auth/google/login|callback|mock`, `/auth/me`)
   - `backend/src/repositories/userRepository.ts` (`upsertGoogleUser` com fallback por email)
   - `backend/src/repositories/db.ts` (singleton Prisma)
   - `frontend/src/services/apiClient.ts`, `store/authStore.ts`,
     `features/auth/{SignInPanel,authCallbackHandler,AuthCallbackPage}.tsx`, `app/App.tsx`
5. Registrar plugins em `backend/src/api/server.ts`:
   ```ts
   await server.register(jwt, { secret: process.env.JWT_SECRET ?? "dev-secret-change-in-prod", sign: { expiresIn: "30d" } });
   await server.register(cors, { /* origin via FRONTEND_ORIGINS */, allowedHeaders: ["Content-Type", "Authorization"] });
   ```
6. `npm install` na raiz.
7. Criar `.env` (a partir do `.env.example`) com `JWT_SECRET` gerado e `DATABASE_URL` local.
8. `cd backend && npx prisma migrate dev --name init` (gera client + 1ª migration).
9. `npm run typecheck` na raiz — tem que passar limpo.
10. Subir local e fumar: backend (`npm run dev`) + frontend (`npm run dev:web`),
    logar via mock, criar/ler um registro.
11. `gh repo create <app> --private --source . --remote origin` e `git push -u origin main`.

→ Ao fim da Fase A o app roda local e está no GitHub.

### Fase B — 🤖 IA: provisionar infraestrutura via `molde-deploy`

A partir da versão 0.11.0 do Molde, **toda a provisão é automatizada** pela skill `molde-deploy`
+ `provision.ps1`. O único passo manual que resta é adicionar a redirect URI no Google OAuth
(~30s). Para detalhes do script, ver **`molde-brain.md`** (seção "Deploy pipeline").

```bash
# Dry-run primeiro (imprime as chamadas sem executar):
pwsh scripts/provision.ps1 -Slug <app>

# Depois executar de verdade:
pwsh scripts/provision.ps1 -Slug <app> -Execute
```

Flags adicionais: `-EnableR2` (cria bucket R2) · `-EnableAI` (injeta vars AI).

**Único passo manual** após o provision:
- Abrir o client Google OAuth compartilhado (ver link em `molde-brain.md` §Deploy → step 5)
- Adicionar `https://<app>-api.parolin.net/auth/google/callback` às Authorized redirect URIs
- Clicar Save

### Fase C — 🤖 IA: conectar e validar

1. Verificar saúde: `GET https://<app>-api.parolin.net/health` → `{"status":"ok"}`.
2. Smoke test do login real no domínio de produção.
3. Atualizar `README.md` do novo app e gravar memória de deploy (domínios + UUIDs Coolify).

### Fase D — Ciclo de desenvolvimento (totalmente automático)

- `git push` em `main` aciona **dois workflows em paralelo**:
  - `deploy-frontend.yml` → Cloudflare Pages reconstrói e publica o frontend.
  - `deploy-backend.yml` → Coolify redeploya o backend via API (chama `/api/v1/deploy`).
- Ambos estão no template e são configurados automaticamente pelo `provision.ps1`.
- Não é necessária nenhuma ação manual após o push.

---

## 6. Como o pipeline de deploy funciona

- **Frontend (Cloudflare Pages):** `deploy-frontend.yml` executa `npm install && npm run build
  --workspace frontend` → publica `frontend/dist` via wrangler Direct Upload. SPA fallback via
  `frontend/public/_redirects`. Acionado automaticamente em todo push.
- **Backend (Coolify):** `deploy-backend.yml` chama `GET /api/v1/deploy?uuid=<appUuid>&force=false`
  quando arquivos em `backend/**` ou `package.json` mudam. O Coolify executa nixpacks
  (Node 22 via `NIXPACKS_NODE_VERSION`), instala deps em `/backend`, e o `start_command` sobrescrito
  roda `prisma migrate deploy` antes de subir Fastify via `tsx`.
- A provisão usa **deploy key** (par de chaves SSH) em vez de GitHub App — ver `molde-brain.md`
  para os detalhes da PATCH do `install_command`/`start_command`.

---

## 7. Armadilhas conhecidas

1. **`auth_failed` / `Unique constraint failed on the fields: (email)`**
   Conta criada antes (ex.: via mock) tem `googleSubjectId` diferente do real, mas mesmo email.
   `upsertGoogleUser` precisa buscar por **`googleSubjectId` OU `email`** e atualizar o registro
   existente, nunca inserir duplicata:
   ```ts
   const existing = await prisma.userAccount.findFirst({
     where: { OR: [{ googleSubjectId }, { email }] },
   });
   // existe → update (inclusive corrige o googleSubjectId); senão → create
   ```

2. **`redirect_uri_mismatch` do Google**
   A `GOOGLE_REDIRECT_URI` (env) tem que ser **idêntica** a uma das URIs no Google Console —
   incluindo `https`, host e path `/auth/google/callback`.

3. **Frontend de produção chamando `localhost:3000`**
   Faltou `VITE_API_BASE_URL` no **Cloudflare Pages** (é build-time, não runtime). Setar e
   **rebuildar**.

4. **`deploy-backend.yml` não está disparando**
   O workflow precisa de 5 GitHub secrets: `COOLIFY_APP_UUID`, `COOLIFY_API_TOKEN`,
   `COOLIFY_API_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`. O `provision.ps1`
   seta esses secrets automaticamente em `‑Execute` mode. Se o app foi provisionado antes
   dessa funcionalidade, sete manualmente: `gh secret set COOLIFY_APP_UUID --body <uuid>`.
   O trigger é `paths: ['backend/**', 'package.json', 'package-lock.json']`.

5. **Refresh em rota interna dá 404 no Cloudflare**
   Faltou `frontend/public/_redirects` com `/*  /index.html  200`.

6. **JWT antigo após trocar o esquema de auth**
   Tokens antigos (ex.: `mock-...`) são rejeitados com 401 e o frontend faz logout automático.
   É o comportamento esperado — basta relogar.

7. **CORS bloqueando**
   Origem do frontend ausente em `FRONTEND_ORIGINS`. Conferir que inclui exatamente
   `https://<app>.parolin.net` (sem barra no fim).

8. **`prisma migrate deploy` falha com "datasource.url property is required"**
   O Prisma 7 **não lê `.env` automaticamente** e exige `url` explícito no `prisma.config.ts`.
   Criar o arquivo conforme §2.5. Ver também `molde-brain.md` gotcha #10.

9. **Node 22.11.0 (nixpacks) incompatível com Prisma 7**
   Nixpacks v1.41 fixa nixpkgs em um commit que instala Node 22.11.0. Prisma 7 requer
   `^20.19 || ^22.12 || >=24`. O `@prisma/dev` é ESM-only → `ERR_REQUIRE_ESM` em 22.11.
   Solução: o `provision.ps1` faz PATCH do `install_command` e `start_command` para incluir
   `--experimental-require-module`. Ver `molde-brain.md` gotcha #10 para o comando exato.

10. **Banco de dados criado com nome `postgres` (apps provisionados antes de 2026-06-30)**
    A partir de 2026-06-30 o `provision.ps1` passa `postgres_db=<slug>-db` na criação do Postgres,
    então apps novos terão o nome correto. Apps antigos (parafit, recibos, trajetorias2, paramalhar)
    foram renomeados manualmente. Se encontrar este problema num app legado:
    ```bash
    sudo docker exec <uuid> psql -U postgres -d template1 \
      -c "ALTER DATABASE postgres RENAME TO <slug>-db;"
    ```
    Ver `molde-brain.md` gotcha #15.

---

## 8. Checklist "novo app em minutos"

**🤖 IA (local):**
- [ ] Scaffold monorepo + configs canônicas (§2)
- [ ] Schema Prisma com `UserAccount` + domínio
- [ ] `backend/prisma/prisma.config.ts` criado (§2.5)
- [ ] Portar módulo de auth
- [ ] `npm install`
- [ ] `.env` com `JWT_SECRET` gerado
- [ ] `prisma migrate dev --name init`
- [ ] `npm run typecheck` limpo
- [ ] Smoke local (login mock + 1 CRUD)
- [ ] `gh repo create` + push

**🤖 IA (provision via `molde-deploy`):**
- [ ] `provision.ps1 -Slug <app>` dry-run
- [ ] `provision.ps1 -Slug <app> -Execute`
- [ ] Renomear banco Postgres (gotcha #10) se necessário
- [ ] `/health` ok

**🧑 Humano (único passo manual):**
- [ ] Adicionar redirect URI ao client Google OAuth (~30s)

**🤖 IA (fechar):**
- [ ] `/health` ok em `https://<slug>-api.parolin.net/health`
- [ ] Login real ok em produção
- [ ] `git push` → confirmar que ambos os workflows (frontend + backend) completaram
- [ ] README + memória de deploy do novo app

---

> Para IPs de containers, Tailscale, DBeaver, Coolify admin, Oracle VPS — ver **`molde-brain.md`**
> seção "Parolin infrastructure reference".

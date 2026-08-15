---
name: inspection
description: Conduz uma inspeção de software Fagan/Scrum — o inspector registra defeitos com critérios de aceite, o author implementa ou recusa com evidência, o humano modera empates. Use quando o usuário disser inspection, inspeção, inspect, QA review, review board, parecer técnico, processar inspection, continuar inspection, senior QA, revise o repositório, review this repo, ou pedir que dois agentes debatam defeitos. Um pedido vago de revisar o repositório inteiro abre a temporada de lentes (tenant primeiro), nunca um dump misturado. Achados estruturais e de segurança são promovidos às field-notes deste template para avisar os apps irmãos. Não é sprint review do Scrum, review de PR do GitHub, nem craft de UI (Impeccable).
user-invocable: true
---

# Inspection (inspeção)

Empirismo do Scrum (transparência → inspeção → adaptação) + método de Fagan (IBM, 1976): log de defeitos, papéis, consenso. Não é sprint review. Não é review de PR. Não é craft de UI (`/impeccable`, nos apps que o tiverem).

Este arquivo é o **canônico da fábrica**. Filhos copiam para `.github/skills/inspection/` e podem **acrescentar lentes de produto** (o Cota4 acrescenta `oficio` e `toques`). Não copiar lentes de produto de volta para o Molde.

Stubs em `.claude/skills/`, `.cursor/skills/` e `.agents/skills/` apontam para cá.

## Papéis

| Papel | Quem | Faz |
|---|---|---|
| **Inspector** | a IA que acha | Lê código, escreve o log, promove P0/P1 estrutural, volta para consenso |
| **Author** | a IA que mexe | Executa, recusa com evidência, ou adia. Não apaga o log |
| **Moderator** | o Gustavo | Desempata. Nenhuma IA finge ser o dono |

`AGENTS.md` / constituição deste repo vencem o skill. Conflito → debate, não “obedecer o inspector e quebrar o invariante”.

## Quando usar / quando parar

Usar: o humano pediu inspection, processar/continuar um log, ou nomeou uma lente.

Prompt fraco (“você é um senior QA, revise este repositório”) **não** autoriza dump misturado. Abre a **temporada v1 do template**:

1. `tenant` — posse de formulário, sessão, guard, RLS
2. `ops` — CI como gate, docs vs código

Uma lente por passagem, teto **7** achados P0–P2. Consenso (ou ADIADO) antes da próxima. Se já houver log da mesma lente com `consenso: nao`, continue aquele.

Não é inspection: escolha de modelo de IA, performance sem número, rewrite de fatia, nits, “e se” sem cenário no código.

## Lentes (template)

Catálogo: [lentes.md](lentes.md). Filho que tiver ofício próprio documenta lentes extra no **próprio** SKILL.md.

## Onde o log vive

`.brief/inspections/YYYY-MM-DD-<lente>.md` (`.brief/` é gitignorado). Cloud: colar na resposta; não inventar arquivo no git com PII.

Modelo: [template.md](template.md).

## Inspector

1. Ler `AGENTS.md` (e `CLAUDE.md` se existir) + a lente.
2. Achado só se demonstrável (arquivo:linha). Cada `F-xx`: cenário, aceite, “você pode recusar se…”, **classe** `app` | `template` | `stack`.
3. P0/P1 `template`/`stack`: Promote **nesta** passagem.
4. `next_actor: author`. Não patchar o filho nesta passagem se o papel for só inspector.

## Author

1. Não apagar o log. `FEITO` | `RECUSADO` | `ADIADO`. Recusa com evidência.
2. Gates deste repo (`typecheck` / `lint` / `test`). Commit/PR conforme o `AGENTS.md` **deste** app (Molde abre PR; alguns filhos commitam em `main` — não inventar o contrário).
3. Append no board; `next_actor: inspector`.

## Consenso

Uma recusa, uma reabertura, depois moderator. Item fechado sai: CHANGELOG / `.brief/todo.md` / Brain. Log não é terceiro cérebro.

## Promote — avisar a fábrica e os irmãos

Segurança estrutural é prioridade. O aviso **não espera** consenso do filho.

| Classe | Sobe? | Exemplo |
|---|---|---|
| `app` | Não | Regra de ofício daquele produto |
| `template` | Sim | Auth/store, guard opcional, CI sem gate, `enterWith` em função awaitada |
| `stack` | Sim + tag `parolin` / `grv` / `both` | Coolify, Cloudflare, JWT, RLS de infra |

P0/P1 `template`/`stack`: append imediato em `.specify/memory/field-notes.md` deste Molde (`C:/Users/gusta/OneDrive/web/molde/.specify/memory/field-notes.md` se o inspector estiver num filho). Formato do topo do arquivo. `status: noted`. Incluir raio (quais apps herdaram o padrão) e `stack:`.

**Não** abrir PR nos irmãos nesta sessão. Quem propaga é promoção no template (`fixed-in-template`), não oito Authors divergentes.

## Invariantes do template

- Toda rota com dado de usuário: `requireAuth`.
- Sem `enterWith` dentro de função awaitada; HTTP usa `storage.run` no ciclo do request (field-note 2026-07-22).
- Guard de identidade no servidor não pode ser opcional no campo que identifica o recurso.
- Porta nova de troca de tenant/sessão limpa rascunhos persistidos. Órfão se descarta; não se adota.
- GET sem efeito colateral de negócio.
- Gate local (`typecheck` `lint` `test`) é o que o GitHub deveria correr no SHA que vai ao ar.
- Documento não é sensor.
- Não logar token/chave. Secrets nunca no git.

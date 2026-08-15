# Template do log

Gravar em `.brief/inspections/YYYY-MM-DD-<lente>.md` (local) ou colar na resposta (cloud).

Não apagar seções do inspector. Author só faz append nos marcadores.

```markdown
---
doc: inspection
lens: tenant
status: AWAITING_AUTHOR
consenso: nao
inspector_id: <modelo>
inspector_product: <Cursor Grok / Claude / Copilot / Codex>
date: YYYY-MM-DD
time: HH:MM
tz: America/Sao_Paulo
repo_version: <package.json version>
next_actor: author
---

# Inspection `<lente>` — YYYY-MM-DD

## 0. Contrato
- AGENTS.md / constituição deste repo vencem este log.
- Author: `FEITO` | `RECUSADO` | `ADIADO` por `F-xx`. Recusa com evidência.
- Gates se houver código. Commit/PR conforme AGENTS.md deste app.

## 1. Achados
### F-01 P1 — título
- Arquivos:
- Classe: app | template | stack
- Cenário:
- Aceite:
- Você pode recusar se:
- Não faça:

## 2. Fora de escopo desta passagem

## 3. Board (author append)
<!-- AUTHOR_LOG_START -->
### Passagem — YYYY-MM-DD HH:MM -03 — <modelo>

| ID | Decisão | Arquivos | Testes | Se não FEITO, por quê |
|----|---------|----------|--------|------------------------|
| F-01 | | | | |

Gates:
Perspectiva nova:
Pedido ao inspector:
Commit/PR: não fiz
<!-- AUTHOR_LOG_END -->

## 4. Debate
<!-- DEBATE_START -->
<!-- DEBATE_END -->

## 5. Consenso
Critério: P0–P2 fechados; P3 pode adiar em lote; gates se houve código; debate sem turno pendente.
```

# Próxima sessão — alertas do Dependabot (Parafin, Molde, parafit)

**Criado em:** 15/11/2026 (Claude, pedido do Gustavo) · **Item:** `T7` em `C:\Users\gusta\OneDrive\web\molde\.brief\todo.md` · Apagar este arquivo quando o `T7` fechar, depois que o resultado estiver nos CHANGELOGs.

## Como abrir

Claude Code, sessão nova, na pasta `C:\Users\gusta\OneDrive\web\Parafin`. Colar:

```
Leia C:\Users\gusta\OneDrive\web\molde\.brief\proxima-sessao-dependabot.md e execute.
```

## Alertas abertos em 15/11/2026

Lidos com `gh api "repos/gustavoparolin/<repo>/dependabot/alerts?state=open&per_page=100"`. Todos são dependências transitivas no `package-lock.json`. O `painel` estava com zero alertas.

| Repo | Alerta | Gravidade | Pacote | Uso | Corrigido em | Observação |
|---|---|---|---|---|---|---|
| parafin | #47 | high | `sharp` | runtime | 0.35.5 | falha no `librsvg` (CVE-2026-96889); conferir se o app aceita SVG vindo de fora |
| parafin / molde / parafit | #25 / #32 / #39 | medium | `fast-jwt` | runtime | 6.3.4 | o cache do verificador aceita JWT expirado sem `iat`; mexe em sessão, então entra junto com o high (gate 6 do CLAUDE.md global) |
| parafin / molde / parafit | #45 / #53 / #60 | medium | `postcss-selector-parser` | dev | 7.1.6 | só build |
| parafin / molde / parafit | #35 / #42 / #49 | low | `fastify` | runtime | 5.12.6 | validação de cabeçalho |
| parafit | #63 | medium | `glob` | runtime | 14.0.2 | |
| parafit | #61 | low | `serialize-javascript` | runtime | 7.1.3 | XSS |
| parafit | #62 | low | `deepmerge` | runtime | sem correção publicada | decidir entre `overrides`, tirar o pacote que o puxa, ou dispensar no GitHub com a justificativa escrita |

## Ordem

1. Parafin: `sharp` e `fast-jwt` primeiro, depois o resto.
2. Molde: é o template, então a correção daqui vira o padrão dos filhos.
3. parafit.
4. No fim, rodar o mesmo `gh api` no `cota4`, no `coringao-orcamento` e no `trajetorias2`, que não foram levantados em 15/11, e anotar o resultado no `T7`.

## Regras

- **Conferir o remoto antes de qualquer veredito:** `git fetch` e `git status -sb` (em 15/11 o Parafin e o parafit estavam 16 e 15 commits atrás), e o `gh api` de novo. Outra sessão ou outra máquina pode já ter corrigido.
- **Correção pelo `npm run relock`** (`C:\Users\gusta\OneDrive\web\molde\scripts\relock.mjs`), nunca `npm audit fix`. Quando o pacote pai pina a versão vulnerável, usar `overrides` no `package.json` raiz e validar rodando de verdade (o mesmo padrão do `deepmerge-ts`, descrito no CHANGELOG do Parafin).
- **Antes de `npm ci` no Windows, parar os servidores de dev do repositório.** O Vite segura o `esbuild.exe` e o `npm ci` apaga metade do `node_modules` (field-note do Molde de 03/11/2026).
- **Gates completos antes de cada commit:** `npm run typecheck`, `npm run lint`, `npm test` e, se existir `e2e/`, `npx playwright test`. Lock novo não é mudança de documentação.
- **Parafin: mexer no `package-lock.json` dispara o deploy do backend no Coolify** (`deploy-backend.yml`), e a Gardenia está usando o remoto para conciliar. Avisar o Gustavo antes do push, para ele escolher a hora. O `npm run prod:espelhar` continua proibido (aviso no `CLAUDE.md` do Parafin).
- **Seguir a convenção de cada repositório:** os upgrades de 02 e 03/11 entraram por issue e PR no Molde, no Parafin e no parafit. Entrada em `[Unreleased]` › Segurança no CHANGELOG (o Molde não tem CHANGELOG; a mensagem do commit basta). Achado P0/P1 ou pegadinha nova vira field-note do Molde.
- **Ao fechar:** conferir que o `gh api` com `state=open` voltou vazio nos três, tirar o `T7` do todo e apagar este arquivo.

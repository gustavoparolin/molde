# Ideia do app — preencha aqui

> **Para a IA (Claude Code / Copilot):** tudo nesta pasta `.brief/` é **contexto** para desenhar o app.
> Leia as telas em `inspiration/` (são imagens — abra e observe layout, densidade, tom), o `stack.md`
> (infra) e o `notes.md`. Depois use estes campos como entrada do `/speckit.specify`. Se algo estiver
> vago, **me entreviste** e atualize este arquivo antes de especificar.

---

## Infra (a skill lê isto; não vai para o spec)

- **slug:** _(deixe em branco — é inferido do nome da pasta; ex.: `celula3`)_
- **nome de exibição:** _(ex.: "Celula 3")_
- **uma linha:** _(o que o app faz, em uma frase)_
- **integrações:**
  - [ ] upload de arquivos (Cloudflare R2) — ex.: fotos, documentos
  - [ ] Claude AI (extração/IA) — ex.: ler dados de uma foto
  - [ ] outra integração: _(qual?)_

## Produto (vira a descrição do /speckit.specify)

### O problema / quem usa
_(quem é o usuário e qual dor o app resolve)_

### Entidades (dados)
_(liste as entidades e campos principais — a IA traduz para models Prisma, espelhando o `Item`)_
- Exemplo: `Compra { data, loja, total }`, `Item { compraId, nome, preço, quantidade }`

### O que o usuário faz (histórias, P1 primeiro)
_(cada história = uma fatia testável independentemente; P1 é o MVP)_
- **P1:** _(ação principal — ex.: "tirar foto de um recibo e ver os itens extraídos")_
- **P2:** _(…)_

### Telas / referências visuais
_(referencie as imagens de inspiration/ e diga o que te agrada em cada uma)_
- ![](inspiration/exemplo.png) — _(o que imitar desta tela)_

### Fora de escopo (v1)
_(o que explicitamente NÃO entra agora)_

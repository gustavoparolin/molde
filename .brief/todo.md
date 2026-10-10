# todo — passos a executar

**Atualizado em:** 10/10/2026 (Claude) · **Próximo ID:** `T7` / `Q1`

> **Protocolo:** fila única de passos pendentes — do Gustavo (🧑) e do agente (🤖). **Só tarefa acionável, só o que FALTA fazer**: contexto, histórico e o porquê das coisas moram no CHANGELOG, no código e no Brain, não aqui.
> **ID estável.** Todo item nasce com um ID (`T1`, `T2`…) que **nunca é reciclado nem renumerado**, nem depois de resolvido e apagado: a posição no arquivo é a *ordem*, o ID é o *nome* — é o que permite citar o item num commit, num card ou numa conversa dois meses depois. Perguntas usam `Q1`, `Q2`… O próximo ID livre está na linha **Próximo ID** acima: ao criar item, use-o e incremente.
> **Estado e urgência são eixos diferentes.** Estado no título: ⏳ aberto · 🔄 em andamento · 🚫 bloqueado (**motivo na própria linha, obrigatório**). Urgência: 🔴 quando for urgente. Um item pode ser `⏳ 🔴`.
> **O título termina em verbo** — o que a mão faz ao sentar. Se não couber em uma linha, o item está grande demais: quebre.
> **Pouca semântica; MUITO detalhe de execução, em bullets:** link da página exata como `[rótulo](url)` (nunca URL crua, nunca em tabela), navegação `a > b > c > d`, campo com valor de → para, botão a clicar, comando copiável em bloco de código. Ferramenta sempre nomeada por extenso e com onde ela vive ("Cloud Sync, app do DSM, painel do Synology da casa").
> **Todo item termina em `**Resposta:**`** — é onde o Gustavo escreve o que quiser sobre aquele item: decidir, adiar, descartar, corrigir o rumo.
> **Decisão que trava trabalho vira pergunta `Q`**, na seção *Perguntas que só humano responde*: opções fechadas, a recomendada marcada ✅, e o que cada resposta destrava. Pergunta sem resposta **bloqueia** o item — o agente não inventa default nem age pela recomendação sozinho.
> **Nada se apaga sem depositar.** Ao resolver um item, o resultado vai ANTES para o **CHANGELOG** (entrega, decisão — com data e quem decidiu) ou para **`molde/.specify/memory/field-notes.md`** (pegadinha, achado de infra que serviria a outro app). Só então a linha sai daqui. Este arquivo não guarda histórico: o ID citado num commit se resolve no CHANGELOG.
> **Tamanho.** Se o arquivo está crescendo, o sintoma quase nunca é falta de arquivo-morto — é trabalho que devia estar em issue do GitHub ou em `.brief/spec` e ficou aqui. Acima de ~120 linhas, antes de qualquer outra coisa, olhe quantos itens deviam sair.
> **"processar todo":** aplicar as respostas e os `Q`, executar o que for do agente, depositar e apagar o resolvido. **SEMPRE que ler este arquivo, processar também a seção NOTAS do final** (ver lá).

**Onde dói hoje:** o `modelos.json` está commitado mas não está no ar — enquanto o `T1` não subir, os cinco backends seguem na cópia embutida e a troca automática de modelo não chega em nenhum deles.

<details>
<summary><strong>🔗 Ferramentas e URLs (clique para expandir)</strong></summary>

**Deste app** *(o agente preenche ao criar/deployar — padrão: `<slug>.parolin.net`)*:

- **Produção** — app → `https://<slug>.parolin.net` · API → `https://<slug>-api.parolin.net/health`
- **GitHub** — repo → `https://github.com/gustavoparolin/<slug>` · Actions (deploys) → `.../actions`

**Comuns da stack Parolin:**

- **Coolify** — painel da VPS Oracle (apps e bancos de produção) → [abrir](https://coolify.parolin.net) · **Backups agendados** ficam dentro do painel de cada banco, aba *Backups*
- **Cloudflare (conta)** → [abrir](https://dash.cloudflare.com/3c01ecc63645d5a2597ceed6ff2bc6d3) · **Painel R2** → [abrir](https://dash.cloudflare.com/3c01ecc63645d5a2597ceed6ff2bc6d3/r2/overview)
- **PageSpeed Insights** → [medir uma URL](https://pagespeed.web.dev/) — sempre a URL pública **com a barra final** e na aba *Celular*; receita e metas na skill global `pagespeed-review`. **Bot Fight Mode** da zona (Cloudflare → zona → *Security → Settings* → *Bot traffic*) custa 19 pontos de *Best Practices* em todo site sob o proxy laranja, inclusive os apps do Coolify
- **Google OAuth clients** — console do Google Cloud onde se autorizam as URIs de callback do client compartilhado `*.parolin.net` → [abrir](https://console.cloud.google.com/auth/clients?project=gen-lang-client-0208522494)
- **Google AI Studio** — onde se vê a cota e os modelos do Gemini → [abrir](https://aistudio.google.com/) · **Chaves de API** → [abrir](https://aistudio.google.com/apikey)
- **Poe** — provedor de IA da assinatura → [modelos](https://poe.com/explore?category=Official) · [chaves](https://poe.com/api_key)
- **Resend** — entrega de e-mails. Domínios → [abrir](https://resend.com/domains) · Chaves → [abrir](https://resend.com/api-keys)
- **1Password** — app no Windows ou [web](https://my.1password.com) · cofre de infra: `parolin-infra`
- **DSM** — painel web do Synology G_Cloud, o NAS da casa → [abrir](https://192-168-1-5.gustavoparolin.direct.quickconnect.to:5001/) *(funciona em casa e fora; fallback na LAN: [IP local](http://192.168.1.5:5000))* · **Hyper Backup** e **Cloud Sync** são apps *dentro* do DSM (menu principal) · **Task Scheduler**: Control Panel → Task Scheduler (DSM em INGLÊS)
- **Agendador de Tarefas do Windows** — no notebook: menu Iniciar → digite "Agendador de Tarefas"
- **Models-Benchmark** (Obsidian) — `X:\Obsidian\Brain\Projects\Models-Benchmark\` · disponibilidade diária em `availability.md` · **é a fonte única sobre modelos de IA**
- **provision.env** — chaves locais: `C:\Users\gusta\.config\molde\provision.env`

</details>

## `T1` 🧑 Publicar o `modelos.json` no site ⏳ 🔴 — sem isto, os apps seguem na cópia embutida

O arquivo que manda nos nomes de modelo da stack já está commitado em `web/parolin`, mas **não está no ar**: o Cloudflare Pages só publica depois do push.

- Terminal, na pasta `C:\Users\gusta\OneDrive\web\parolin`: `git push`
- Aguardar ~1 min e conferir se abre: [parolin.net/modelos.json](https://parolin.net/modelos.json)
- Não precisa mexer em nada no Cloudflare — é o mesmo deploy do site

**Resposta:**

## `T2` 🧑 Dar `git push` nos cinco backends ⏳ — cada push dispara o deploy do app

Ordem sugerida (do menos crítico para o mais): `molde`, `parafit`, `Parafin`, `coringao-orcamento`, `cota4`. Em cada pasta: `git push`.

- Depois do deploy de cada um, conferir nos **Logs** do app no [Coolify](https://coolify.parolin.net) a linha `modelos de IA` — ela diz `origem: "remoto"` (leu o parolin.net) ou `origem: "embutido"` (não leu, e está usando a cópia local — o app funciona igual, mas a troca automática não chega nele)

**Resposta:**

## `T3` 🧑 Apagar as envs de modelo no Coolify 🚫 🔴 — bloqueado pelo `T2`: só depois que os apps estiverem rodando com o código novo

Enquanto elas existirem, mandam mais que o arquivo (precedência env > remoto), e são exatamente as cópias que envelheceram e deixaram três apps chamando modelo apagado. Fazer **só depois** que o app já estiver rodando com o código novo — assim a volta atrás continua possível.

Em [Coolify](https://coolify.parolin.net) → **Projects** → app → aba **Environment Variables**, apagar (produção **e** preview):

```
AI_LOCAL_MODEL
AI_LOCAL_MODEL_VISAO
AI_MODEL
AI_MODEL_FALLBACK
```

- **cota4** (produção + preview) · **coringao-orcamento** (produção + preview) · **parafin** (produção)
- **NÃO apagar** `AI_API_KEY`, `POE_API_KEY`, `AI_BASE_URL`, `AI_LOCAL_BASE_URL`, `AI_LOCAL_TIMEOUT_MS`, `AI_CLOUD_TIMEOUT_MS` — esses são segredo e ambiente, continuam em env
- Clicar **Redeploy** em cada app e conferir de novo a linha `modelos de IA` nos Logs

**Resposta:**

## `T4` 🧑 Criar a chave do Resend para o relatório diário chegar por e-mail ⏳

O relatório está pronto e roda todo dia às 09:00 junto com a medição, mas hoje ele é **gravado em disco** em vez de enviado, porque não existe `RESEND_API_KEY` em lugar nenhum (nem no cofre, nem no `.env`, nem no Coolify). Para ligar:

- Criar/copiar a chave em [Resend → API keys](https://resend.com/api-keys)
- Conferir em [Resend → Domains](https://resend.com/domains) se `parolin.net` está verificado; se não estiver, usar um domínio que esteja e ajustar o remetente abaixo
- Abrir `C:\Users\gusta\.config\molde\provision.env` e acrescentar as linhas:

```
RESEND_API_KEY=re_sua_chave_aqui
REPORT_EMAIL_FROM=Models-Benchmark <modelos@parolin.net>
REPORT_EMAIL_TO=gumela@gmail.com
```

- Testar sem esperar o dia seguinte: no terminal, `cd X:\Obsidian\Brain\Projects\Models-Benchmark` e `python scripts\daily_availability.py` — a última linha do log diz se enviou
- Enquanto não houver chave, o relatório do dia fica legível em `X:\Obsidian\Brain\Projects\Models-Benchmark\scripts\.report-nao-enviado.html` (abrir com duplo clique)

**Resposta:**

## `T5` 🤖 Rodar o spike de manuscrito no coringão ⏳ — o teste que decide a visão local

O `qwen3.8:27b-mlx` leu 4/4 campos de uma imagem sintética em 3,7 s, mas **manuscrito é outra coisa**: é onde o `qwen3-vl` fez 0/25 e o Gemini 81,6%. O `spike-extracao.ts` já está apontado para o modelo novo e as 5 fotos reais estão no repositório. Enquanto não rodar, a rota local de FOTO está ligada com base em teste sintético.

**Resposta:**

---

## `T6` 🧑 Ligar "Docker BuildKit secrets" nos cinco apps do Coolify ⏳ — tira os segredos das camadas da imagem

- Por quê, em uma linha: toda env criada pela API nasceu como build-arg e fica no `docker history` da imagem (field-notes 10/10/2026). O template já está corrigido; falta os apps existentes.
- Em cada app: [Coolify](https://coolify.parolin.net) > Projects > production > *app* > Environment Variables > dropdown **Build secrets**: de `Standard build arguments` para `Docker BuildKit secrets`. Salva sozinho.
- Apps: `coringao-orcamento`, `cota4`, `parafin`, `parafit-api`, `trajetorias2-api`. Opcional: `celula` e `paratrade` (dockerfile; só se o Dockerfile não usar `ARG` para essas envs).
- Depois, botão **Deploy** em cada um para gerar imagem nova; conferir `/health` responde.
- Alternativa por variável: ícone de engrenagem na linha > desmarcar **Buildtime** em tudo que não for `NIXPACKS_*`. Mais cliques, mesmo efeito.

**Resposta:**

---

## Perguntas que só humano responde

**Como responder:** uma linha, aqui ou no chat — `Q1a Q2b` — ou só **`ok`** para aceitar todas as recomendadas (✅). Justificar é opcional (`Q2b, mas em setembro` funciona). Se a resposta vier de outra pessoa, diga de quem.

**O que o agente faz com ela:** (1) marca `[x]` e anota `→ resposta (dd/mm)`; (2) grava a decisão datada no CHANGELOG, com quem decidiu; (3) reescreve o item `T` que dependia dela para virar tarefa executável e executa a parte que for dele; (4) apaga a pergunta respondida. Pergunta sem resposta fica `[ ]` e **bloqueia** o item — o agente não inventa default nem age pela recomendação sozinho.

_(nenhuma pergunta aberta)_

---

## NOTAS

> Caixa de entrada livre do Gustavo: melhorias, bugs, comentários, resultados de teste — sem formato. O agente, **SEMPRE** que ler este arquivo: lê as notas, interpreta, cria itens TODO quando fizer sentido, **executa** o que for de responsabilidade dele e **apaga** as notas processadas (o resultado vai para CHANGELOG/Brain, como tudo).

_(vazio)_

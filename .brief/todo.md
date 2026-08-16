# todo — passos a executar

> **Protocolo:** este arquivo é a fila única de passos pendentes — do Gustavo (🧑) e do agente (🤖). Só o que FALTA fazer: o que foi feito sai daqui e vai para CHANGELOG/Brain/verbatim. Pouca semântica e porquê; MUITO detalhe de execução, em bullets: link da página exata como `[rótulo](url)` (nunca URL crua, nunca em tabela), navegação `a > b > c > d`, campo com valor de → para, botão a clicar. Ferramenta sempre nomeada por extenso e com onde ela vive ("Cloud Sync, app do DSM, painel do Synology da casa"). Status ⏳/🔴 no título; valores copiáveis em bloco de código. Perguntas têm linha `**Resposta:**`; quando o Gustavo disser **"processar todo"**, aplicar as respostas, executar o que for do agente e apagar o resolvido. **SEMPRE que ler este arquivo, processar também a seção NOTAS do final** (ver lá).

<details>
<summary><strong>🔗 Ferramentas e URLs (clique para expandir)</strong></summary>

**Deste app** *(o agente preenche ao criar/deployar — padrão: `<slug>.parolin.net`)*:

- **Produção** — app → `https://<slug>.parolin.net` · API → `https://<slug>-api.parolin.net/health`
- **GitHub** — repo → `https://github.com/gustavoparolin/<slug>` · Actions (deploys) → `.../actions`

**Comuns da stack Parolin:**

- **Coolify** — painel da VPS Oracle (apps e bancos de produção) → [abrir](https://coolify.parolin.net) · **Backups agendados** ficam dentro do painel de cada banco, aba *Backups*
- **Cloudflare (conta)** → [abrir](https://dash.cloudflare.com/3c01ecc63645d5a2597ceed6ff2bc6d3) · **Painel R2** → [abrir](https://dash.cloudflare.com/3c01ecc63645d5a2597ceed6ff2bc6d3/r2/overview)
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

## 🧑 1. Publicar o `modelos.json` no site ⏳ — sem isto, os apps seguem na cópia embutida

O arquivo que manda nos nomes de modelo da stack já está commitado em `web/parolin`, mas **não está no ar**: o Cloudflare Pages só publica depois do push.

- Terminal, na pasta `C:\Users\gusta\OneDrive\web\parolin`: `git push`
- Aguardar ~1 min e conferir se abre: [parolin.net/modelos.json](https://parolin.net/modelos.json)
- Não precisa mexer em nada no Cloudflare — é o mesmo deploy do site

## 🧑 2. Push dos cinco backends ⏳ — cada push dispara o deploy do app

Ordem sugerida (do menos crítico para o mais): `molde`, `parafit`, `Parafin`, `coringao-orcamento`, `cota4`. Em cada pasta: `git push`.

- Depois do deploy de cada um, conferir nos **Logs** do app no [Coolify](https://coolify.parolin.net) a linha `modelos de IA` — ela diz `origem: "remoto"` (leu o parolin.net) ou `origem: "embutido"` (não leu, e está usando a cópia local — o app funciona igual, mas a troca automática não chega nele)

## 🧑 3. Apagar as envs de modelo no Coolify 🔴 — só DEPOIS do passo 2

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

## 🧑 4. Chave do Resend para o relatório diário chegar por e-mail ⏳

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

## 🤖 5. Rodar o spike de manuscrito no coringão ⏳ — o teste que decide a visão local

O `qwen3.8:27b-mlx` leu 4/4 campos de uma imagem sintética em 3,7 s, mas **manuscrito é outra coisa**: é onde o `qwen3-vl` fez 0/25 e o Gemini 81,6%. O `spike-extracao.ts` já está apontado para o modelo novo e as 5 fotos reais estão no repositório. Enquanto não rodar, a rota local de FOTO está ligada com base em teste sintético.

---

## NOTAS

> Caixa de entrada livre do Gustavo: melhorias, bugs, comentários, resultados de teste — sem formato. O agente, **SEMPRE** que ler este arquivo: lê as notas, interpreta, cria itens TODO quando fizer sentido, **executa** o que for de responsabilidade dele e **apaga** as notas processadas (o resultado vai para CHANGELOG/Brain, como tudo).

_(vazio)_

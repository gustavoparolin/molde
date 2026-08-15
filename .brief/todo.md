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

## ⏳ 🧑 Duas sobras do paramalhar que só você apaga (o Claude não pode deletar dados na nuvem)

Contexto em uma linha: em 15/08 à noite o parafit passou a servir a mídia dos exercícios do próprio `parafit-assets` (v0.29.5: env do Coolify trocada por API, seeds, migration aplicada em produção e verificada — o bucket antigo **não é mais usado por ninguém**). Ao conferir a VPS, apareceu que o Postgres do paramalhar **nunca foi apagado**: o `DELETE` de 09/08 respondeu "queued" e não executou; o banco segue `running:healthy` no Coolify e mandando dump diário para o R2 (64 dumps, o último de hoje, 211 KB — congelado há semanas). Nenhum app aponta para ele (conferido nas envs de todos). O classificador do Claude Code bloqueia essas duas deleções; são cliques:

- **Bucket R2 `paramalhar-assets` (67 objetos, 69 MB, todos já copiados para `parafit-assets` — conferido chave a chave e byte a byte):** Painel R2 → [abrir](https://dash.cloudflare.com/3c01ecc63645d5a2597ceed6ff2bc6d3/r2/overview) > `paramalhar-assets` > aba *Objects* > marcar tudo (caixa do cabeçalho; são 3 pastas `exercises/equipment|muscles|videos`) > **Delete** > confirmar; depois aba *Settings* > rolar até o fim > **Delete bucket** > digitar o nome > confirmar. Se preferir linha de comando, o script pronto está em `C:\Users\gusta\AppData\Local\Temp\claude\x--Obsidian\4abac6d9-71b0-4360-b427-8717e20aa9e3\scratchpad\r2-empty.mjs` (só aceita esse bucket) — mas o painel é mais rápido.
- **Banco `postgresql-database-py93j9ymwzqdszeq5p2qvxdu` no Coolify (o Postgres do paramalhar, 11 MB, `pgvector/pgvector:pg18`):** [Coolify](https://coolify.parolin.net) > projeto **shared-infra** > ambiente **production** > `postgresql-database-py93j9ymwzqdszeq5p2qvxdu` (ele **não aparece** na lista da API `/databases`, mas aparece no painel e em `GET /databases/py93…`) > menu do recurso > **Danger Zone** > **Delete** > marcar *delete volumes* e *docker cleanup* > confirmar. Depois conferir na aba de recursos que sumiu (não confiar no "queued" — foi exatamente isso que ficou pendurado em 09/08) e, se quiser, `ssh oracle-vps` + `sudo docker ps | grep py93` tem que voltar vazio. Os dumps em `coolify-backups/…/postgresql-database-py93…` ficam 30 dias depois do último (janela até ~14/09).

**Resposta:**

---

## NOTAS

> Caixa de entrada livre do Gustavo: melhorias, bugs, comentários, resultados de teste — sem formato. O agente, **SEMPRE** que ler este arquivo: lê as notas, interpreta, cria itens TODO quando fizer sentido, **executa** o que for de responsabilidade dele e **apaga** as notas processadas (o resultado vai para CHANGELOG/Brain, como tudo).

_(vazio)_

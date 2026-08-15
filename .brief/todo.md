# todo — passos a executar

> **Protocolo:** este arquivo é a fila única de passos pendentes — do Gustavo (🧑) e do agente (🤖). Só o que FALTA fazer: o que foi feito sai daqui e vai para CHANGELOG/Brain/verbatim. Pouca semântica e porquê; MUITO detalhe de execução, em bullets: link da página exata como `[rótulo](url)` (nunca URL crua, nunca em tabela), navegação `a > b > c > d`, campo com valor de → para, botão a clicar. Ferramenta sempre nomeada por extenso e com onde ela vive ("Cloud Sync, app do DSM, painel do Synology da casa"). Status ⏳/🔴 no título; valores copiáveis em bloco de código. Perguntas têm linha `**Resposta:**`; quando o Gustavo disser **"processar todo"**, aplicar as respostas, executar o que for do agente e apagar o resolvido. **SEMPRE que ler este arquivo, processar também a seção NOTAS do final** (ver lá).

<details>
<summary><strong>🔗 Ferramentas e URLs (clique para expandir)</strong></summary>

**Deste app** *(o agente preenche ao criar/deployar — padrão: `<slug>.parolin.net`)*:

- **Produção** — app → `https://<slug>.parolin.net` · API → `https://api-<slug>.parolin.net/health`
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

## ⏳ 🧑 Sobras da morte de recibos / paramalhar / mercado / taskly (pastas apagadas em 15/08) — só você consegue

Contexto em uma linha: em 15/08 o Claude apagou as 4 pastas de `web/` (Lixeira do Windows + lixeira do OneDrive), atualizou índices/filas/docs e o Parafin (spec 003 encerrada, `migrar-recibos.ts` removido, commit `6817edc`), tirou o alias SSH `paramalhar`, arquivou o repo vazio `taskly` e as 7 permissões mortas do `settings.json`. Registro completo: `X:\Obsidian\Brain\Projects\Molde\Log\2026-08-15.md` e a field-note `[2026-08-15] … deprovision, round 2`. Ficou o que precisa de login/decisão sua:

- **Repo `gustavoparolin/taskly` (vazio, público, arquivado):** apagar. Ou `gh auth refresh -h github.com -s delete_repo` (abre o navegador) e depois `gh repo delete gustavoparolin/taskly --yes`; ou no site: [Settings do repo](https://github.com/gustavoparolin/taskly/settings) > rolar até *Danger Zone* > **Delete this repository** > digitar `gustavoparolin/taskly`.
- **Google OAuth (client compartilhado):** [abrir o client direto](https://console.cloud.google.com/auth/clients/111027901822-un9pavjod3l8b18t7mauvp72hq6qol00.apps.googleusercontent.com?project=gen-lang-client-0208522494) (ou [lista de clients](https://console.cloud.google.com/auth/clients?project=gen-lang-client-0208522494) > `111027901822-…`) > seção *Authorized redirect URIs* > apagar as três linhas abaixo > **Save**. Conferir também *Authorized JavaScript origins* por `https://recibos.parolin.net` e `https://paramalhar.parolin.net` (se existirem, apagar).
  ```
  https://api-recibos.parolin.net/auth/google/callback
  https://api-paramalhar.parolin.net/auth/google/callback
  https://api.paramalhar.com.br/auth/google/callback
  ```
- **Bucket R2 `recibos-assets` (órfão):** decidir apagar. Painel R2 → [abrir](https://dash.cloudflare.com/3c01ecc63645d5a2597ceed6ff2bc6d3/r2/overview) > `recibos-assets` > aba *Objects*: se estiver vazio (a métrica do `wrangler` disse 0, mas ela se mostrou não confiável — olhar a listagem), *Settings* > **Delete bucket**. Se tiver as fotos originais dos cupons e você quiser guardar, baixar antes (o Parafin refez os 11 recibos a partir das fotos, não do bucket).
- **Bucket R2 `paramalhar-assets`: NÃO APAGAR.** O parafit serve a mídia dos exercícios por ele (`pub-476f957c88664a4d8ed1f4d8236c5557.r2.dev`). Só some depois que o item 🤖 do `.brief/todo.md` do parafit (migrar mídia para `parafit-assets`) estiver feito.
- **1Password (cofre `parolin-infra`)** — três itens de apps mortos; ver também as tasks do Brain `20260729-07` e `20260729-08`, que já ganharam a anotação:
  - `anthropic-recibos` → antes de arquivar, revogar a chave em [console da Anthropic > API keys](https://console.anthropic.com/settings/keys) (é a mesma chave do item `Claude AI API KEY` do Personal). Se algum app seu ainda usar essa chave, não revogue — só renomeie o item.
  - `r2-paramalhar-img` → o bucket `paramalhar-img` já não existe; revogar o token em Painel R2 > *Manage R2 API Tokens* (o token com esse nome) e arquivar o item.
  - `postgres-paramalhar` → banco apagado em 09/08; arquivar direto.
- **Postgres local (DBeaver, `localhost:5432`):** se existirem, `DROP DATABASE workout_tracker;` e `DROP DATABASE recibos;` (bancos locais dos dois apps mortos). Opcional — só ocupam espaço.
- **`treino-2026.md` (seu plano de treino pessoal, estava em `paramalhar/docs/`, gitignorado):** foi copiado para `C:\Users\gusta\OneDrive\web\parafit\.brief\paramalhar-docs\treino-2026.md` junto com o resto de `docs/` (catálogo SmartFit, screenshots de inspiração, fotos das máquinas). Se você quiser isso no Brain (Health/Reference), mande `inbox …` — o Claude não roteia conteúdo de saúde por conta própria.
- **Lixeira:** `taskly` e `mercado` estão na Lixeira do Windows com o caminho original; `recibos` e `paramalhar` também, mas via pasta de passagem `C:\Users\gusta\AppData\Local\Temp\claude\x--Obsidian\…\scratchpad\_para-lixeira\` (o envio direto do OneDrive falhou pelo `.git` somente-leitura). Restaurar = botão direito > Restaurar; esvaziar quando quiser. `node_modules` foram apagados de vez antes (regeneráveis).

**Resposta:**

---

## NOTAS

> Caixa de entrada livre do Gustavo: melhorias, bugs, comentários, resultados de teste — sem formato. O agente, **SEMPRE** que ler este arquivo: lê as notas, interpreta, cria itens TODO quando fizer sentido, **executa** o que for de responsabilidade dele e **apaga** as notas processadas (o resultado vai para CHANGELOG/Brain, como tudo).

_(vazio)_

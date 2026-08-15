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

## 🔴 🧑 O Postgres do paramalhar ainda está vivo no Coolify (2ª tentativa de deleção — a 1ª ficou "queued")

Contexto em uma linha: o `DELETE` de 09/08 respondeu "queued" e nunca executou; em 15/08 à noite o Claude conferiu de novo depois do seu "Done": o bucket `paramalhar-assets` sumiu ✅, mas `postgresql-database-py93j9ymwzqdszeq5p2qvxdu` continua `running:healthy`, sem `deleted_at`, container "Up 8 weeks" e volume `postgres-data-py93…` (69 MB) na VPS. Nenhum app aponta para ele (conferido nas envs de todos os seis). Dumps diários continuam indo para `coolify-backups` (o último de hoje).

- [Coolify](https://coolify.parolin.net) > projeto **shared-infra** > ambiente **production** > procurar `postgresql-database-py93j9ymwzqdszeq5p2qvxdu` (se não aparecer na lista do ambiente, abrir direto: `https://coolify.parolin.net/project/e114az5efvjemct7utkrzxvv/production/database/py93j9ymwzqdszeq5p2qvxdu`) > aba **Danger Zone** > **Delete** > marcar *Delete configurations*, *Delete volumes* e *Run docker cleanup* > confirmar.
- Esperar 1 minuto e conferir que sumiu de verdade: recarregar a página do recurso (tem que dar "não encontrado") e/ou `ssh oracle-vps` → `sudo docker ps -a | grep py93` tem que voltar vazio. Se o container continuar "Up" depois de 5 minutos, o Coolify enfileirou e não executou de novo — aí o caminho é o manual na VPS: `sudo docker stop py93j9ymwzqdszeq5p2qvxdu && sudo docker rm py93j9ymwzqdszeq5p2qvxdu && sudo docker volume rm postgres-data-py93j9ymwzqdszeq5p2qvxdu` (e o recurso morto some do Coolify na próxima varredura, ou apaga-se pelo painel sem volumes).
- Depois me diga "py93 apagado" que eu confiro pela API e dou baixa aqui e no `molde-brain.md`.

**Resposta:**

---

## NOTAS

> Caixa de entrada livre do Gustavo: melhorias, bugs, comentários, resultados de teste — sem formato. O agente, **SEMPRE** que ler este arquivo: lê as notas, interpreta, cria itens TODO quando fizer sentido, **executa** o que for de responsabilidade dele e **apaga** as notas processadas (o resultado vai para CHANGELOG/Brain, como tudo).

_(vazio)_

#!/usr/bin/env node
// ESQUELETO de smoke de produção — ESCREVA AS VERIFICAÇÕES DO SEU APP AQUI.
//
// Por que este arquivo existe (field-note 2026-07-26, app cota4): em 4 dias, 3
// bugs chegaram em produção com typecheck, lint, 118 testes unitários e E2E
// TODOS VERDES. Quem achou foi uma usuária real. A autópsia:
//   1. os testes cobriam o GUARD, não o caminho que roda (3 testes na
//      pré-checagem barata, ZERO no código que o cliente HTTP executa);
//   2. o smoke pós-deploy só perguntava "o cadeado fechou?" (401/404/headers),
//      nunca "a porta ainda abre?";
//   3. o E2E criava um registro SEM os dados que o bug precisava para aparecer;
//   4. o CI dava "success" quando o Coolify apenas ACEITAVA o pedido de deploy.
//
// A REGRA para escrever verificação aqui:
//   - exercite um caminho que uma PESSOA percorre, com dados REALISTAS;
//   - confira o RESULTADO, não só o status HTTP (o PDF começa com "%PDF"? o
//     número que salvou volta igual? o link tem o formato certo?);
//   - prefira o que já quebrou uma vez: bug que aconteceu tende a voltar.
//
// Uso:  node scripts/smoke-producao.mjs --api https://api.seuapp.com.br
// Roda também no deploy (deploy-backend.yml) — se uma verificação falhar, o
// deploy fica VERMELHO, que é o ponto.

const API = process.argv.includes("--api")
  ? process.argv[process.argv.indexOf("--api") + 1]
  : (process.env.API_PUBLICA ?? "http://localhost:3000");

const resultados = [];

function registrar(nome, ok, detalhe = "") {
  resultados.push({ nome, ok });
  console.log(`${ok ? "  ok  " : " FALHA"} │ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
}

async function checar(nome, fn) {
  try {
    registrar(nome, true, (await fn()) ?? "");
  } catch (erro) {
    registrar(nome, false, erro instanceof Error ? erro.message : String(erro));
  }
}

function assertar(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

console.log(`\nSmoke de produção — ${API}\n${"─".repeat(60)}`);

// ── Verificações mínimas que valem para qualquer app do Molde ────────────────

await checar("API responde /health", async () => {
  const res = await fetch(`${API}/health`);
  assertar(res.ok, `HTTP ${res.status}`);
  const corpo = await res.json();
  assertar(corpo.status === "ok", `status inesperado: ${JSON.stringify(corpo)}`);
  return `versão ${corpo.versao ?? "?"}${corpo.commit ? ` · ${corpo.commit}` : ""}`;
});

await checar("Rota protegida exige autenticação (401, não 500)", async () => {
  // Troque pelo endpoint protegido do seu app. Um 500 aqui esconde bug real.
  const res = await fetch(`${API}/auth/me`);
  assertar(res.status === 401, `esperado 401, veio ${res.status}`);
  return "401";
});

await checar("Rota inexistente devolve 404 (não 500)", async () => {
  const res = await fetch(`${API}/rota-que-nao-existe-${Date.now()}`);
  assertar(res.status === 404, `esperado 404, veio ${res.status}`);
  return "404";
});

// ── ESCREVA AQUI o caminho principal do SEU app ──────────────────────────────
//
// Exemplo do formato (do cota4, que exercita criar → reler → editar → PDF):
//
// await checar("Criar registro com dados realistas e reler íntegro", async () => {
//   const criado = await json("/recursos", { method: "POST", body: JSON.stringify({ ... }) });
//   const lido = await json(`/recursos/${criado.id}`);
//   assertar(lido.quantidade === 2500, `número corrompido: ${lido.quantidade}`);
//   return "íntegro";
// });
//
// Se o seu app tem entrada anônima (demo), use-a. Se só tem login real,
// exercite o que dá sem token e considere um token de smoke em secret.

const falhas = resultados.filter((r) => !r.ok);
console.log("─".repeat(60));
console.log(`${resultados.length - falhas.length}/${resultados.length} verificações passaram`);

if (falhas.length > 0) {
  console.error(`\nFALHOU: ${falhas.map((f) => f.nome).join(", ")}`);
  process.exit(1);
}
console.log("Produção saudável.\n");

#!/usr/bin/env node
// Regenera o package-lock.json por RESOLUÇÃO LIMPA do registry.
//
// Por que este arquivo existe (field-note 2026-08-27, os 5 repos do Molde): o
// npm 11 IGNORA um `overrides` recém-adicionado enquanto houver `node_modules`
// na pasta. Ele reconstrói a árvore ideal a partir da árvore FÍSICA já
// instalada e responde "up to date" em menos de um segundo, sem re-resolver
// nada. Não adianta apagar o `package-lock.json`, apagar também o hidden
// lockfile `node_modules/.package-lock.json`, rodar `npm install
// --package-lock-only`, nem apagar o `node_modules` inteiro e reinstalar — esse
// último reinstala a partir do lock antigo, que já traz a versão vulnerável
// resolvida. (No OneDrive, o `rm -rf node_modules` levou 6m37s para no fim não
// resolver nada.)
//
// A saída é resolver num diretório que só tem os `package.json` — sem
// `node_modules` por perto o npm é obrigado a consultar o registry — e trazer o
// lock de volta. De brinde, essa resolução já sobe tudo que estava atrasado
// DENTRO do semver declarado (o "Wanted" do `npm outdated`), o que dispensa um
// `npm update` separado.
//
// Quando usar:
//   - adicionou/mudou um `overrides` e ele não pegou ("up to date" instantâneo);
//   - quer subir os minors/patches sem tocar em major nenhum;
//   - o Dependabot aponta transitiva que o `npm audit fix` só "corrige" com
//     downgrade de major (foi o caso do `deepmerge-ts` via `@prisma/config`).
//
// Uso:
//   npm run relock                gera, mostra o que muda, grava e sincroniza
//   npm run relock -- --dry-run   mostra o que mudaria e NÃO grava nada
//
// Depois de gravar, o script roda `npm install` (sincroniza o node_modules),
// `prisma generate` se houver schema, e `npm audit`. O `prisma generate` não é
// zelo: recriar o node_modules apaga o client gerado, e o typecheck quebra logo
// em seguida reclamando que `@prisma/client` não exporta `PrismaClient` — parece
// regressão do update e não é.
//
// ATENÇÃO: `npm audit` DEPOIS da subida, não só antes. Subir um minor pode
// PIORAR o audit: no cota4, `@capacitor/cli` 8.4.2 para 8.5.0 trouxe
// `xcode@3.0.1 -> uuid@7.0.3` e três alertas moderate novos.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RAIZ = process.cwd();
const SIMULAR = process.argv.includes("--dry-run");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function lerJson(arquivo) {
  return JSON.parse(fs.readFileSync(arquivo, "utf8"));
}

// O npm do Windows é um `.cmd`, e o Node exige `shell: true` para executá-lo.
// Nesse modo, passar os argumentos separados dispara o aviso DEP0190 (eles são
// concatenados sem escape), então montamos UMA linha de comando já com as aspas.
function citar(argumento) {
  return /[\s"]/.test(argumento) ? `"${argumento.replace(/"/g, '\\"')}"` : argumento;
}

function npm(args, cwd) {
  if (process.platform === "win32") {
    return spawnSync([NPM, ...args.map(citar)].join(" "), { cwd, encoding: "utf8", shell: true });
  }
  return spawnSync(NPM, args, { cwd, encoding: "utf8" });
}

// Expande os workspaces do package.json, inclusive globs de um nível
// ("packages/*"), que é o que o npm aceita na prática.
function acharWorkspaces(pkg) {
  const achados = [];
  for (const padrao of pkg.workspaces ?? []) {
    if (!padrao.includes("*")) {
      achados.push(padrao);
      continue;
    }
    const [prefixo] = padrao.split("*");
    const pasta = path.join(RAIZ, prefixo);
    if (!fs.existsSync(pasta)) continue;
    for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
      if (item.isDirectory() && fs.existsSync(path.join(pasta, item.name, "package.json"))) {
        achados.push(path.posix.join(prefixo.replace(/\\/g, "/"), item.name));
      }
    }
  }
  return achados.filter((ws) => fs.existsSync(path.join(RAIZ, ws, "package.json")));
}

// Nome do pacote a partir da chave do lock ("node_modules/a/node_modules/b" -> "b").
function nomeDoPacote(chave) {
  const partes = chave.split("node_modules/");
  return partes[partes.length - 1];
}

// Uma linha por NOME de pacote, para o diff não virar ruído de caminho.
function versoesPorNome(lock) {
  const mapa = new Map();
  for (const [chave, dados] of Object.entries(lock.packages ?? {})) {
    if (!chave.startsWith("node_modules/") || !dados.version) continue;
    const nome = nomeDoPacote(chave);
    if (!mapa.has(nome)) mapa.set(nome, new Set());
    mapa.get(nome).add(dados.version);
  }
  return new Map([...mapa].map(([nome, versoes]) => [nome, [...versoes].sort().join(", ")]));
}

function compararLocks(antes, depois) {
  const a = versoesPorNome(antes);
  const d = versoesPorNome(depois);
  const alterados = [];
  const adicionados = [];
  const removidos = [];
  for (const [nome, versao] of d) {
    if (!a.has(nome)) adicionados.push(nome);
    else if (a.get(nome) !== versao) alterados.push({ nome, de: a.get(nome), para: versao });
  }
  for (const nome of a.keys()) if (!d.has(nome)) removidos.push(nome);
  alterados.sort((x, y) => x.nome.localeCompare(y.nome));
  return { alterados, adicionados, removidos };
}

const pkgRaiz = lerJson(path.join(RAIZ, "package.json"));
const workspaces = acharWorkspaces(pkgRaiz);
const arquivoLock = path.join(RAIZ, "package-lock.json");

console.log(`\nrelock — ${pkgRaiz.name ?? path.basename(RAIZ)}`);
console.log(`  workspaces: ${workspaces.length ? workspaces.join(", ") : "(nenhum)"}`);
console.log(`  overrides:  ${JSON.stringify(pkgRaiz.overrides ?? {})}`);

// 1. Diretório limpo, só com os package.json, preservando a estrutura de pastas.
const temporario = fs.mkdtempSync(path.join(os.tmpdir(), "relock-"));
try {
  fs.copyFileSync(path.join(RAIZ, "package.json"), path.join(temporario, "package.json"));
  for (const ws of workspaces) {
    const destino = path.join(temporario, ws);
    fs.mkdirSync(destino, { recursive: true });
    fs.copyFileSync(path.join(RAIZ, ws, "package.json"), path.join(destino, "package.json"));
  }

  // 2. Sem node_modules por perto, o npm é obrigado a resolver do registry.
  console.log("\n  resolvendo do registry (sem node_modules por perto)...");
  const resolucao = npm(["install", "--package-lock-only", "--no-audit", "--no-fund"], temporario);
  const lockNovo = path.join(temporario, "package-lock.json");
  if (resolucao.status !== 0 || !fs.existsSync(lockNovo)) {
    console.error("\n  FALHA na resolução:\n" + (resolucao.stderr || resolucao.stdout || ""));
    process.exit(1);
  }

  // 3. O que muda em relação ao lock que está no repo.
  const depois = lerJson(lockNovo);
  if (fs.existsSync(arquivoLock)) {
    const { alterados, adicionados, removidos } = compararLocks(lerJson(arquivoLock), depois);
    if (!alterados.length && !adicionados.length && !removidos.length) {
      console.log("\n  nada muda — o lock já está na resolução limpa.");
    } else {
      const plural = alterados.length === 1 ? "pacote muda" : "pacotes mudam";
      console.log(`\n  ${alterados.length} ${plural} de versão:`);
      for (const { nome, de, para } of alterados) console.log(`    ${nome}  ${de} -> ${para}`);
      if (adicionados.length) console.log(`\n  ${adicionados.length} entram: ${adicionados.join(", ")}`);
      if (removidos.length) console.log(`\n  ${removidos.length} saem: ${removidos.join(", ")}`);
    }
  }

  if (SIMULAR) {
    console.log("\n  --dry-run: nada foi gravado.\n");
    process.exit(0);
  }

  // 4. Traz o lock de volta e sincroniza a árvore local com ele.
  fs.copyFileSync(lockNovo, arquivoLock);
  console.log("\n  package-lock.json gravado. sincronizando node_modules...");
  const instalacao = npm(["install", "--no-audit", "--no-fund"], RAIZ);
  if (instalacao.status !== 0) {
    console.error("\n  FALHA no npm install:\n" + (instalacao.stderr || instalacao.stdout || ""));
    process.exit(1);
  }
} finally {
  fs.rmSync(temporario, { recursive: true, force: true });
}

// 5. Recriar a árvore apaga o Prisma Client gerado — sem isto o typecheck quebra
//    e parece regressão do update.
const schema = ["backend/prisma/schema.prisma", "prisma/schema.prisma"]
  .map((relativo) => path.join(RAIZ, relativo))
  .find((absoluto) => fs.existsSync(absoluto));
if (schema) {
  const geracao = npm(["exec", "--", "prisma", "generate", "--schema", schema], RAIZ);
  const estado = geracao.status === 0 ? "ok" : "FALHOU — rode à mão antes de culpar o update";
  console.log(`  prisma generate: ${estado}`);
}

// 6. O audit vale DEPOIS, não só antes: subir minor pode piorar o resultado.
const auditoria = npm(["audit"], RAIZ);
const resumo = (auditoria.stdout || "").trim().split("\n").filter(Boolean).pop() ?? "";
console.log(`  npm audit: ${resumo || "sem saída"}`);

console.log("\n  falta rodar os gates: npm run typecheck && npm run lint && npm test\n");

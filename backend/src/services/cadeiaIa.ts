// A ORDEM em que os provedores de IA são tentados. Portado do Cota4 em
// 2026-07-29, por decisão do Gustavo: todo app da stack Parolin usa IA do mesmo
// jeito, e o template é quem replica isso para os apps que ainda vão nascer.
//
//   Gemini (todas as chaves) · Ollama local · Poe
//
// POR QUE ESTA ORDEM: o Gemini free tier é grátis e enxerga imagem. O Ollama do
// Mac Studio é grátis e depende da máquina ligada; desde 2026-08-16 roda o
// `qwen3.8:27b-mlx`, que é MUITO mais rápido que o antigo `qwen3.6` (~12 s na
// primeira chamada, ~4 s com o modelo já quente, contra ~42 s) e tem VISÃO
// NATIVA — até então o Gemini era o único caminho gratuito com visão nesta
// stack, porque a Z.AI aposentou o `glm-4v-flash` e passou a cobrar pelos
// modelos de visão (auditado em 2026-07-29, ver `providers/zai.md` no
// Models-Benchmark). A visão do modelo local só foi medida em imagem sintética,
// não em foto de cliente, por isso a ordem segue como está. O Poe é rápido
// (~2 s) e consome a assinatura do Gustavo, por isso fica por último.
//
// ARMADILHA DO MODELO LOCAL: o `qwen3.8` devolve o JSON dentro de cerca
// markdown (```json …```) MESMO com `format: "json"` — o `gemma4:26b` não faz
// isso. Quem for dar `JSON.parse` na resposta precisa tirar a cerca antes; o
// Cota4 e o coringao fazem isso em `parseJsonLoose.ts`, que este template ainda
// não traz.
//
// PARA INVERTER (app com usuário esperando na frente do cliente, onde velocidade
// vale mais que economia): troque a ordem em `cadeiaDeProvedores` para
// `[...poe, ...gemini, ...local]`. É o que o coringao-orcamento faz. O Cota4 vai
// além e escolhe a ordem pelo PLANO da empresa — só faz sentido em app
// multi-tenant.
//
// VÁRIAS CHAVES DO GEMINI: `AI_API_KEY` aceita uma lista separada por vírgula.
// O free tier tem cota DIÁRIA por PROJETO do Google (não por e-mail), e ela
// estourou num teste real de 62 orçamentos, derrubando a IA de produção até a
// virada do dia. Com uma chave por conta Google, a cota de uma não derruba o
// dia. As chaves são tentadas em ordem, e a que responder 429 de cota é pulada
// na hora — insistir nela é só atraso.
//
// ANTES DE TROCAR QUALQUER NOME DE MODELO AQUI: consulte o Models-Benchmark
// (`X:\Obsidian\Brain\Projects\Models-Benchmark`), que é a fonte única sobre
// modelos. Nome de modelo em código é fotografia, não garantia — dois defaults
// "confirmados funcionando" morreram em dois meses sem ninguém perceber, porque
// teste com mock não pega modelo morto.

export type Provedor =
  | {
      tipo: "nuvem";
      /** Rótulo para o log — nunca inclui a chave. */
      rotulo: string;
      baseUrl: string;
      chave: string;
      modelo: string | undefined;
      /** Modelo alternativo do MESMO provedor, para o retry trocar de fila. */
      modeloAlternativo: string | undefined;
    }
  | {
      tipo: "ollama";
      rotulo: string;
      baseUrl: string;
      modelo: string;
      modeloVisao: string | undefined;
    };

export const GEMINI_BASE_PADRAO = "https://generativelanguage.googleapis.com/v1beta/openai/";
const POE_BASE = "https://api.poe.com/v1/";

/** Lista separada por vírgula; espaços e entradas vazias são descartados. */
export function chaves(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

function provedoresGemini(): Provedor[] {
  const base = process.env.AI_BASE_URL ?? GEMINI_BASE_PADRAO;
  const lista = chaves(process.env.AI_API_KEY);
  return lista.map((chave, i) => ({
    tipo: "nuvem" as const,
    // Numerado para o log dizer QUAL chave falhou sem revelar nenhuma.
    rotulo: lista.length > 1 ? `gemini#${i + 1}` : "gemini",
    baseUrl: base,
    chave,
    modelo: process.env.AI_MODEL,
    modeloAlternativo: process.env.AI_MODEL_FALLBACK,
  }));
}

function provedorPoe(): Provedor[] {
  const chave = chaves(process.env.POE_API_KEY)[0];
  if (!chave) return [];
  return [
    {
      tipo: "nuvem",
      rotulo: "poe",
      baseUrl: process.env.POE_BASE_URL ?? POE_BASE,
      chave,
      modelo: process.env.POE_MODEL ?? "gpt-5.4-mini",
      modeloAlternativo: process.env.POE_MODEL_FALLBACK ?? "claude-haiku-4.5",
    },
  ];
}

function provedorLocal(): Provedor[] {
  const baseUrl = process.env.AI_LOCAL_BASE_URL;
  if (!baseUrl) return [];
  return [
    {
      tipo: "ollama",
      rotulo: "mac",
      baseUrl,
      modelo: process.env.AI_LOCAL_MODEL ?? "qwen3.8:27b-mlx",
      // OBRIGATÓRIO para o caminho da FOTO: mandar imagem a um modelo de texto
      // não dá erro — ele responde qualquer coisa, que é a pior falha possível.
      // Sem esta variável, o provedor local deve ser PULADO quando a entrada é
      // imagem (é o que `visionService` do Cota4 faz).
      modeloVisao: process.env.AI_LOCAL_MODEL_VISAO,
    },
  ];
}

/** A cadeia na ordem de tentativa. */
export function cadeiaDeProvedores(): Provedor[] {
  return [...provedoresGemini(), ...provedorLocal(), ...provedorPoe()];
}

/** Só para diagnóstico (logs de boot, via `diagnosticoDaCadeia`) — nunca expõe chave. */
export function descreverCadeia(): string {
  const nomes = cadeiaDeProvedores().map((p) =>
    p.tipo === "nuvem" ? `${p.rotulo}(${p.modelo ?? "padrão"})` : `${p.rotulo}(${p.modelo})`,
  );
  return nomes.length ? nomes.join(" → ") : "(nenhum provedor configurado)";
}

/**
 * O que este processo tem de IA, em uma linha de log no boot.
 *
 * Chame no arranque do servidor: `server.log.info(diagnosticoDaCadeia(), "cadeia de IA")`.
 * Existe porque, no meio de uma queda de IA, a pergunta é "quantas chaves estão
 * ativas AGORA?" — e sem isto a resposta só existe dentro da variável de
 * ambiente do container, que ninguém quer abrir durante um incidente.
 */
export function diagnosticoDaCadeia(): { chavesGemini: number; cadeia: string } {
  return {
    chavesGemini: chaves(process.env.AI_API_KEY).length,
    cadeia: descreverCadeia(),
  };
}

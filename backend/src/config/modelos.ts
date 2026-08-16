// De onde vêm os NOMES dos modelos de IA desta stack.
//
// Precedência: env (override pontual) > https://parolin.net/modelos.json > a
// cópia embutida logo abaixo. O arquivo remoto é publicado pelo Models-Benchmark
// (`X:\Obsidian\Brain\Projects\Models-Benchmark`) a partir de medição diária com
// CHAMADA REAL: um modelo que não respondeu não é publicado, e o papel cai para o
// próximo da linha de sucessão. É assim que o conserto chega aqui sozinho.
//
// POR QUE ISTO EXISTE (2026-08-16): o nome do modelo local vivia em 13 lugares —
// cinco defaults em código, três `.env`, dois `.env.example` e oito entradas no
// Coolify. No dia em que o `qwen3.6` foi apagado do Mac Studio, TRÊS apps em
// produção passaram a chamar um modelo inexistente. Isso não gera erro visível: a
// cadeia apenas cai para o próximo provedor, e o app fica mais caro e mais lento
// em silêncio. Nome de modelo não é segredo — é configuração, e configuração com
// treze cópias envelhece em pelo menos uma delas.
//
// SÓ NOMES DE MODELO vêm do arquivo remoto. Nunca baseUrl, nunca chave, nunca a
// ordem dos provedores: um arquivo público que os apps obedecem é superfície de
// ataque, e se ele pudesse definir o endpoint, quem o controlasse redirecionaria
// os prompts desta stack para o host que quisesse. Com só nomes, o pior caso é
// chamar um modelo que não existe e cair para o próximo provedor.
//
// A env continua valendo para experimentar um modelo sem tocar em código. O que
// ela NÃO deve ser é cópia do valor padrão: env preenchida com o mesmo valor do
// arquivo é a cópia que envelhece — foi exatamente o caso do Coolify.

export type Papel =
  | "local"
  | "localVisao"
  | "gemini"
  | "geminiFallback"
  | "poe"
  | "poeFallback"
  | "transcricao";

/** Nome deste app no bloco `apps` do JSON remoto (perfil próprio, quando houver). */
const APP = "molde";

/**
 * A rede de segurança. Vale quando o arquivo remoto não responde — e vale no
 * primeiro instante de vida do processo, antes da primeira busca terminar.
 * Mantenha em dia com o `padrao` de https://parolin.net/modelos.json.
 */
const EMBUTIDO: Record<Papel, string> = {
  local: "qwen3.8:27b-mlx",
  localVisao: "qwen3.8:27b-mlx",
  gemini: "gemini-3.6-flash",
  geminiFallback: "gemini-3.5-flash-lite",
  poe: "gpt-5.4-mini",
  poeFallback: "claude-haiku-4.5",
  transcricao: "gemini-3.6-flash",
};

/** Qual env sobrepõe cada papel. `transcricao` divide `AI_MODEL` com `gemini`. */
const ENV_DO_PAPEL: Record<Papel, string> = {
  local: "AI_LOCAL_MODEL",
  localVisao: "AI_LOCAL_MODEL_VISAO",
  gemini: "AI_MODEL",
  geminiFallback: "AI_MODEL_FALLBACK",
  poe: "POE_MODEL",
  poeFallback: "POE_MODEL_FALLBACK",
  transcricao: "AI_MODEL",
};

const URL_PADRAO = "https://parolin.net/modelos.json";
const TIMEOUT_MS = 2_000;
const INTERVALO_MS = 15 * 60 * 1_000;

/**
 * Nome de modelo aceitável. É a allowlist que impede o arquivo remoto de injetar
 * qualquer coisa no corpo da requisição ao provedor.
 */
const NOME_VALIDO = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,79}$/;

let remoto: Partial<Record<Papel, string>> = {};
let atualizadoEm: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Valida e aplica o JSON. Um arquivo inválido é DESCARTADO INTEIRO, mantendo o
 * que já valia: meia configuração é pior que a anterior.
 */
export function aplicarJson(dados: unknown): boolean {
  if (!dados || typeof dados !== "object") return false;
  const doc = dados as { schema?: unknown; padrao?: unknown; apps?: unknown; atualizado_em?: unknown };
  if (doc.schema !== 1 || !doc.padrao || typeof doc.padrao !== "object") return false;

  const aceitos: Partial<Record<Papel, string>> = {};
  const juntar = (fonte: unknown) => {
    if (!fonte || typeof fonte !== "object") return;
    for (const [papel, valor] of Object.entries(fonte as Record<string, unknown>)) {
      if (!(papel in EMBUTIDO)) continue; // papel que este app não conhece
      if (typeof valor !== "string" || !NOME_VALIDO.test(valor)) continue;
      aceitos[papel as Papel] = valor;
    }
  };
  juntar(doc.padrao);
  // O perfil do app vem DEPOIS, para sobrepor o padrão.
  const apps = doc.apps as Record<string, unknown> | undefined;
  if (apps && typeof apps === "object") juntar(apps[APP]);

  if (Object.keys(aceitos).length === 0) return false;
  remoto = aceitos;
  atualizadoEm = typeof doc.atualizado_em === "string" ? doc.atualizado_em : null;
  return true;
}

async function buscar(): Promise<boolean> {
  const url = process.env.MODELOS_URL ?? URL_PADRAO;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return false;
    return aplicarJson(await res.json());
  } catch {
    // Rede fora, DNS, timeout: silêncio proposital. O app já tem valor válido, e
    // um erro barulhento a cada 15 min vira ruído que ninguém lê.
    return false;
  }
}

/**
 * O nome do modelo para um papel, AGORA. Síncrona de propósito: a cadeia de IA é
 * montada a cada requisição e não pode esperar rede.
 */
export function modelo(papel: Papel): string {
  const daEnv = process.env[ENV_DO_PAPEL[papel]]?.trim();
  if (daEnv) return daEnv;
  return remoto[papel] ?? EMBUTIDO[papel];
}

/**
 * Busca o arquivo no boot e reagenda a cada 15 min. O `unref` garante que este
 * timer nunca segure o processo vivo (importante em teste e em script curto).
 */
export async function iniciarModelos(): Promise<void> {
  await buscar();
  if (timer) clearInterval(timer);
  timer = setInterval(() => void buscar(), INTERVALO_MS);
  timer.unref?.();
}

/** Para o timer — usado em teste e em desligamento gracioso. */
export function pararModelos(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Só para o log de boot e o /health: de onde veio cada nome que está valendo. */
export function estadoDosModelos(): {
  origem: "remoto" | "embutido";
  atualizadoEm: string | null;
  modelos: Record<Papel, string>;
} {
  const modelos = Object.fromEntries(
    (Object.keys(EMBUTIDO) as Papel[]).map((p) => [p, modelo(p)]),
  ) as Record<Papel, string>;
  return { origem: Object.keys(remoto).length ? "remoto" : "embutido", atualizadoEm, modelos };
}

/** Zera o estado remoto. Existe para o teste começar de um lugar conhecido. */
export function _resetarParaTeste(): void {
  remoto = {};
  atualizadoEm = null;
  pararModelos();
}

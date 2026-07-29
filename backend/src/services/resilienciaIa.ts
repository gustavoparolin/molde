// Política de tentativas do provedor de IA.
//
// INCIDENTE DE 2026-07-28. O Gustavo foi usar o app e a IA não respondeu. A
// causa não era o código: o Gemini devolveu **503 "This model is currently
// experiencing high demand. Spikes in demand are usually temporary. Please try
// again later."** — o free tier sobrecarregado. O provedor literalmente pede
// para tentar de novo, e nós desistíamos na primeira negativa.
//
// Pior: o fallback que existia (Ollama local) só está configurado em DEV. Em
// produção há um provedor só, então um 503 de 30 segundos virava "a IA falhou"
// para quem estava com o cliente na frente.
//
// Três degraus, do mais barato ao mais caro:
//   1. O MESMO modelo de novo, com espera curta — resolve o pico temporário.
//   2. O modelo ALTERNATIVO (AI_MODEL_FALLBACK), que tem fila própria no
//      provedor: quando o flash está saturado, o lite costuma responder.
//   3. O Ollama local, se houver (AI_LOCAL_BASE_URL) — já existia.
//
// O que NÃO se repete: erro de chave, de cota diária e de payload inválido. Se
// a credencial está errada, tentar de novo três vezes só atrasa o "não" que a
// pessoa precisa ver.

/** Erros que valem uma segunda chance: o provedor está ocupado, não recusando. */
export function ehTransitorio(erro: unknown): boolean {
  const msg = erro instanceof Error ? erro.message : String(erro);

  // 429 é ambíguo no Gemini: pode ser "rápido demais" (transitório) ou cota
  // diária estourada (não adianta insistir). O corpo distingue os dois.
  if (/HTTP 429/.test(msg)) {
    return !/quota|billing|exceeded your current quota|daily limit/i.test(msg);
  }

  // Sobrecarga e indisponibilidade do lado deles.
  if (/HTTP 50[0234]/.test(msg)) return true;
  if (/UNAVAILABLE|high demand|overloaded|try again later/i.test(msg)) return true;

  // Timeout e queda de conexão no meio do caminho.
  if (/aborted|AbortError|The operation was aborted/i.test(msg)) return true;
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(msg)) return true;

  // 401/403 (chave), 400/422 (payload) e o resto: não insistir.
  return false;
}

export type PassoTentativa = {
  /** Modelo a usar nesta tentativa (undefined = o padrão do ambiente). */
  modelo?: string;
  /** Quanto esperar ANTES desta tentativa. */
  esperaMs: number;
};

/**
 * O roteiro de tentativas na nuvem. A primeira é imediata, com o modelo padrão.
 *
 * Havendo alternativo, a SEGUNDA já troca de modelo — e isso foi medido, não
 * suposto: com o `gemini-3.5-flash` saturado, as quatro tentativas seguidas
 * falharam, e cada negativa custou de 0,8 s a **16 s** para chegar. Insistir no
 * mesmo modelo era pagar caro por uma resposta que não vinha; o alternativo, no
 * mesmo instante, respondia em 1,4 s. Modelo saturado tende a seguir saturado
 * nos próximos segundos — o que muda o resultado é mudar de fila.
 *
 * Sem alternativo configurado, resta insistir no mesmo, com esperas maiores.
 *
 * A espera é curta de propósito: do outro lado tem gente parada na frente do
 * cliente.
 */
export function planoDeTentativas(
  modeloPadrao: string | undefined,
  modeloAlternativo: string | undefined,
): PassoTentativa[] {
  const temAlternativo = !!modeloAlternativo && modeloAlternativo !== modeloPadrao;
  if (!temAlternativo) {
    return [
      { modelo: modeloPadrao, esperaMs: 0 },
      { modelo: modeloPadrao, esperaMs: 1500 },
      { modelo: modeloPadrao, esperaMs: 4000 },
    ];
  }
  return [
    { modelo: modeloPadrao, esperaMs: 0 },
    { modelo: modeloAlternativo, esperaMs: 500 },
    { modelo: modeloAlternativo, esperaMs: 2500 },
  ];
}

export function esperar(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

/**
 * O pedido é ruim, e será ruim em qualquer provedor?
 *
 * Só nesse caso vale interromper a cadeia inteira — imagem grande demais é a
 * mesma imagem para todos, e repeti-la em quatro lugares é desperdício.
 *
 * O CUIDADO que motivou esta função: o Gemini responde **400 "API key not
 * valid"** para chave revogada, não 401. A versão anterior cortava a cadeia em
 * qualquer 400 — bastava uma chave velha na lista para Mac e Poe nunca serem
 * chamados, com dois provedores saudáveis parados. Era exatamente o cenário
 * que a cadeia existe para resolver.
 */
export function ehPedidoRuim(erro: unknown): boolean {
  const msg = erro instanceof Error ? erro.message : String(erro);
  // Problema de credencial NÃO é pedido ruim: é problema DAQUELE provedor.
  if (/api[ _-]?key|API_KEY_INVALID|unauthor|permission|credential|forbidden/i.test(msg)) {
    return false;
  }
  // Payload que nenhum provedor aceitaria.
  return /HTTP 4(00|13|15|22)/.test(msg);
}

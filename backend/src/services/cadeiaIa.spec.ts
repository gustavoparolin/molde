import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cadeiaDeProvedores, descreverCadeia, diagnosticoDaCadeia } from "./cadeiaIa.js";

// A ordem padrão do template: Gemini (todas as chaves) → Ollama local → Poe.
// O gratuito primeiro; a assinatura por último. App que precise de velocidade
// inverte a ordem em `cadeiaDeProvedores` — ver o comentário do módulo.

const ORIGINAL = { ...process.env };

beforeEach(() => {
  for (const k of Object.keys(process.env)) {
    if (/^(AI_|POE_)/.test(k)) delete process.env[k];
  }
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("ordem da cadeia", () => {
  it("gratuito primeiro, assinatura por último", () => {
    process.env.AI_API_KEY = "g1";
    process.env.AI_LOCAL_BASE_URL = "http://mac:11434";
    process.env.POE_API_KEY = "p1";
    expect(cadeiaDeProvedores().map((p) => p.rotulo)).toEqual(["gemini", "mac", "poe"]);
  });

  it("provedor não configurado simplesmente não entra na fila", () => {
    process.env.AI_API_KEY = "g1";
    expect(cadeiaDeProvedores().map((p) => p.rotulo)).toEqual(["gemini"]);
  });

  it("sem nada configurado, a cadeia é vazia — o chamador decide o que fazer", () => {
    expect(cadeiaDeProvedores()).toEqual([]);
  });
});

describe("várias chaves do Gemini", () => {
  it("cada chave vira um provedor, na ordem, numerado no rótulo", () => {
    process.env.AI_API_KEY = "k1, k2 ,k3";
    const cadeia = cadeiaDeProvedores();
    expect(cadeia.map((p) => p.rotulo)).toEqual(["gemini#1", "gemini#2", "gemini#3"]);
    expect(cadeia.map((p) => (p.tipo === "nuvem" ? p.chave : null))).toEqual(["k1", "k2", "k3"]);
  });

  it("com uma chave só, o rótulo não ganha número", () => {
    process.env.AI_API_KEY = "k1";
    expect(cadeiaDeProvedores()[0].rotulo).toBe("gemini");
  });

  it("vírgulas soltas e espaços não viram provedor fantasma", () => {
    process.env.AI_API_KEY = " , k1 ,, ";
    expect(cadeiaDeProvedores()).toHaveLength(1);
  });
});

describe("diagnóstico de boot", () => {
  it("conta as chaves e descreve a ordem", () => {
    process.env.AI_API_KEY = "k1,k2,k3";
    process.env.AI_MODEL = "gemini-3.6-flash";
    const d = diagnosticoDaCadeia();
    expect(d.chavesGemini).toBe(3);
    expect(d.cadeia).toMatch(/^gemini#1\(gemini-3\.6-flash\) →/);
  });

  it("nunca vaza chave — nem no objeto inteiro que vai para o log", () => {
    process.env.AI_API_KEY = "segredo-gemini-1,segredo-gemini-2";
    process.env.POE_API_KEY = "segredo-poe";
    process.env.AI_LOCAL_BASE_URL = "http://mac:11434";
    expect(JSON.stringify(diagnosticoDaCadeia())).not.toContain("segredo");
  });

  it("sem IA configurada, diz zero em vez de fingir que há cadeia", () => {
    expect(diagnosticoDaCadeia()).toEqual({
      chavesGemini: 0,
      cadeia: "(nenhum provedor configurado)",
    });
  });
});

describe("descrição para diagnóstico", () => {
  it("mostra ordem e modelos, nunca as chaves", () => {
    process.env.AI_API_KEY = "segredo-do-gemini";
    process.env.AI_MODEL = "gemini-3.6-flash";
    process.env.POE_API_KEY = "segredo-do-poe";
    const texto = descreverCadeia();
    expect(texto).toBe("gemini(gemini-3.6-flash) → poe(gpt-5.4-mini)");
    expect(texto).not.toContain("segredo");
  });
});

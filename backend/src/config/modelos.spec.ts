import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetarParaTeste,
  aplicarJson,
  estadoDosModelos,
  iniciarModelos,
  modelo,
  pararModelos,
} from "./modelos.js";

const JSON_VALIDO = {
  schema: 1,
  atualizado_em: "2026-08-16T12:00:00-03:00",
  padrao: { local: "qwen3.8:27b-mlx", gemini: "gemini-3.6-flash" },
  apps: { molde: { local: "gemma4:26b" } },
};

describe("modelos — de onde vem o nome do modelo", () => {
  beforeEach(() => {
    _resetarParaTeste();
    for (const k of ["AI_LOCAL_MODEL", "AI_MODEL", "MODELOS_URL"]) delete process.env[k];
  });
  afterEach(() => {
    pararModelos();
    vi.unstubAllGlobals();
  });

  it("sem remoto e sem env, vale a cópia embutida", () => {
    expect(modelo("local")).toBe("qwen3.8:27b-mlx");
    expect(estadoDosModelos().origem).toBe("embutido");
  });

  it("o remoto vence a cópia embutida", () => {
    aplicarJson({ schema: 1, padrao: { gemini: "gemini-9-turbo" } });
    expect(modelo("gemini")).toBe("gemini-9-turbo");
    expect(estadoDosModelos().origem).toBe("remoto");
  });

  it("a env vence o remoto — é o override para experimentar sem deploy", () => {
    aplicarJson(JSON_VALIDO);
    process.env.AI_LOCAL_MODEL = "modelo-de-teste";
    expect(modelo("local")).toBe("modelo-de-teste");
  });

  it("o perfil do app sobrepõe o padrão", () => {
    aplicarJson(JSON_VALIDO); // padrao.local = qwen3.8, apps.molde.local = gemma4:26b
    expect(modelo("local")).toBe("gemma4:26b");
    expect(modelo("gemini")).toBe("gemini-3.6-flash");
  });

  // As quatro defesas: o arquivo é público e os apps obedecem a ele.
  it("descarta o arquivo inteiro quando o schema não é o esperado", () => {
    aplicarJson(JSON_VALIDO);
    expect(aplicarJson({ schema: 2, padrao: { local: "outro" } })).toBe(false);
    expect(modelo("local")).toBe("gemma4:26b"); // seguiu valendo o que já estava
  });

  it("ignora nome de modelo fora da allowlist e papel desconhecido", () => {
    expect(aplicarJson({ schema: 1, padrao: { local: "modelo com espaço", gemini: "gemini-ok" } })).toBe(true);
    expect(modelo("local")).toBe("qwen3.8:27b-mlx"); // recusado, ficou o embutido
    expect(modelo("gemini")).toBe("gemini-ok");
    expect(aplicarJson({ schema: 1, padrao: { rootkit: "x" } })).toBe(false);
  });

  it("recusa valores que não são string", () => {
    expect(aplicarJson({ schema: 1, padrao: { local: { $ne: null } } })).toBe(false);
    expect(aplicarJson({ schema: 1, padrao: { local: 123 } })).toBe(false);
  });

  it("rede fora no boot não quebra nem derruba o processo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await iniciarModelos();
    expect(modelo("local")).toBe("qwen3.8:27b-mlx");
    expect(estadoDosModelos().origem).toBe("embutido");
  });

  it("boot com o arquivo no ar aplica o que veio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schema: 1, padrao: { poe: "gpt-6-mini" } }) }),
    );
    await iniciarModelos();
    expect(modelo("poe")).toBe("gpt-6-mini");
  });

  it("HTTP 404 mantém o que já valia", async () => {
    aplicarJson(JSON_VALIDO);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    await iniciarModelos();
    expect(modelo("local")).toBe("gemma4:26b");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerItemRoutes } from "./routes/items.js";
import { recordRequest, getMetricsSummary } from "../observability/metrics.js";

const server = Fastify({ logger: true });

await server.register(jwt, {
  secret: process.env.JWT_SECRET ?? "dev-secret-change-in-prod",
  sign: { expiresIn: "30d" },
});

const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

await server.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

await registerAuthRoutes(server);
await registerItemRoutes(server);

server.addHook("onResponse", (request, reply, done) => {
  const route = (request.routeOptions?.url as string | undefined) ?? request.url;
  recordRequest(request.method, route, reply.statusCode, reply.elapsedTime);
  done();
});

// A VERSÃO e o COMMIT fazem parte do health de propósito: sem eles o CI não tem
// como saber se a build nova já está atendendo, e um smoke pós-deploy pode
// conversar com o container ANTIGO (que segue de pé durante o build) e dar um
// vermelho enganoso. Ver field-note 2026-07-26 "testes verdes não provam nada".
// A versão vem do package.json do backend (em produção o processo sobe por
// `node`, não por script do npm, então `npm_package_version` não existe).
const VERSAO_APP = (() => {
  try {
    const caminho = join(import.meta.dirname, "..", "..", "package.json");
    return (JSON.parse(readFileSync(caminho, "utf-8")) as { version?: string }).version ?? "?";
  } catch {
    return "?";
  }
})();

server.get("/health", async () => ({
  status: "ok",
  versao: VERSAO_APP,
  commit: process.env.SOURCE_COMMIT?.slice(0, 7) ?? null,
}));
server.get("/admin/metrics", async () => ({ metrics: getMetricsSummary() }));

const port = Number(process.env.PORT ?? 3000);

server.listen({ port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});

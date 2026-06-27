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

server.get("/health", async () => ({ status: "ok" }));
server.get("/admin/metrics", async () => ({ metrics: getMetricsSummary() }));

const port = Number(process.env.PORT ?? 3000);

server.listen({ port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});

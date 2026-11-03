import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerItemRoutes } from "./items.js";

// HTTP test without booting the server or touching the database: Fastify() +
// @fastify/jwt + registerItemRoutes + server.inject. Every case here is rejected
// before the service layer runs, so no Postgres is needed. Copy this shape for the
// validation contract of your real routes.

let server: FastifyInstance;
let auth: { authorization: string };

beforeAll(async () => {
  server = Fastify();
  await server.register(jwt, { secret: "test-secret" });
  await registerItemRoutes(server);
  await server.ready();
  auth = { authorization: `Bearer ${server.jwt.sign({ userId: "u1", email: "u1@example.com" })}` };
});

afterAll(async () => {
  await server.close();
});

describe("Item routes: auth and validation contract", () => {
  it("rejects requests without a token with 401", async () => {
    const res = await server.inject({ method: "GET", url: "/items" });
    expect(res.statusCode).toBe(401);
  });

  it("POST /items with an empty title returns 400 with the zod issues", async () => {
    const res = await server.inject({ method: "POST", url: "/items", headers: auth, payload: { title: "" } });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ message: string; issues: Array<{ path: string[]; code: string }> }>();
    expect(body.message).toBe("Invalid request");
    expect(body.issues).toEqual([expect.objectContaining({ path: ["title"], code: "too_small" })]);
  });

  it("POST /items without a body returns 400, not a crash", async () => {
    const res = await server.inject({ method: "POST", url: "/items", headers: auth });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH /items/:id with no fields returns the custom refine message", async () => {
    const res = await server.inject({ method: "PATCH", url: "/items/abc", headers: auth, payload: {} });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ issues: Array<{ message: string }> }>();
    expect(body.issues.map((i) => i.message)).toEqual(["Provide at least one field to update"]);
  });
});

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/googleAuth.js";
import * as items from "../../services/itemService.js";

// Reference CRUD route for the `Item` slice. Every endpoint is behind requireAuth and
// scoped to the authenticated user. Copy this shape (zod validation → service call →
// status code) for your real entities.

const CreateItem = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10_000).optional(),
});

const UpdateItem = z
  .object({
    title: z.string().min(1).max(200).optional(),
    body: z.string().max(10_000).optional(),
  })
  .refine((v) => v.title !== undefined || v.body !== undefined, {
    message: "Provide at least one field to update",
  });

export async function registerItemRoutes(server: FastifyInstance): Promise<void> {
  server.get("/items", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    reply.send({ items: await items.listItems(auth.userId) });
  });

  server.post("/items", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const parsed = CreateItem.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid request", issues: parsed.error.issues });
      return;
    }

    const item = await items.createItem(auth.userId, parsed.data);
    reply.code(201).send({ item });
  });

  server.get("/items/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const item = await items.getItem(auth.userId, id);
    if (!item) {
      reply.code(404).send({ message: "Item not found" });
      return;
    }
    reply.send({ item });
  });

  // IDENTIDADE DO RECURSO: aqui ela vem da URL (`:id`) e a posse do `auth.userId` — o
  // repositório filtra pelos dois, e um id de outro dono vira 404. Isso está certo e é
  // o padrão a copiar. Se algum dia a identidade vier no BODY (Empresa/tenant, tela de
  // Ajustes, form cacheado entre telas), o campo é OBRIGATÓRIO quando a sessão já tem o
  // recurso: "ausente" é recusa (409 com código próprio), não "então não confiro". Um
  // guard `if (body.id && body.id !== atual.id)` é no-op quando o cliente omite o id —
  // foi o F-05 da inspection do Cota4 (2026-08-15). Receita pronta lá:
  // backend/src/services/posseFormularioEmpresa.ts (regra pura) + teste HTTP sem subir
  // o server: Fastify() + @fastify/jwt + registerXRoutes(server) + server.inject
  // (backend/src/api/routes/empresa.integration.spec.ts). Teste negativo obrigatório:
  // id de outro tenant → 409; sem id com sessão → 4xx; id da sessão → segue.
  server.patch("/items/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const parsed = UpdateItem.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid request", issues: parsed.error.issues });
      return;
    }

    const { id } = request.params as { id: string };
    const item = await items.updateItem(auth.userId, id, parsed.data);
    if (!item) {
      reply.code(404).send({ message: "Item not found" });
      return;
    }
    reply.send({ item });
  });

  server.delete("/items/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const ok = await items.deleteItem(auth.userId, id);
    if (!ok) {
      reply.code(404).send({ message: "Item not found" });
      return;
    }
    reply.code(204).send();
  });
}

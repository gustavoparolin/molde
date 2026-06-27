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

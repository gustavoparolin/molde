import { isDatabaseConfigured, prisma } from "./db.js";

// Reference repository for the example `Item` slice. It demonstrates the two patterns
// every Molde repository follows: (1) a Postgres path via the shared `prisma` client,
// and (2) an in-memory fallback so the skeleton runs without a database (mock smoke test).

export type Item = {
  id: string;
  ownerUserId: string;
  title: string;
  body?: string;
  createdAt: string;
  updatedAt: string;
};

const itemsById = new Map<string, Item>();

function mapItem(item: {
  id: string;
  ownerUserId: string;
  title: string;
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Item {
  return {
    id: item.id,
    ownerUserId: item.ownerUserId,
    title: item.title,
    body: item.body ?? undefined,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function listItems(ownerUserId: string): Promise<Item[]> {
  if (!isDatabaseConfigured) {
    return [...itemsById.values()]
      .filter((i) => i.ownerUserId === ownerUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const items = await prisma.item.findMany({
    where: { ownerUserId },
    orderBy: { createdAt: "desc" },
  });
  return items.map(mapItem);
}

export async function getItem(ownerUserId: string, id: string): Promise<Item | undefined> {
  if (!isDatabaseConfigured) {
    const item = itemsById.get(id);
    return item && item.ownerUserId === ownerUserId ? item : undefined;
  }

  const item = await prisma.item.findFirst({ where: { id, ownerUserId } });
  return item ? mapItem(item) : undefined;
}

export async function createItem(
  ownerUserId: string,
  input: { title: string; body?: string },
): Promise<Item> {
  if (!isDatabaseConfigured) {
    const now = new Date().toISOString();
    const created: Item = {
      id: crypto.randomUUID(),
      ownerUserId,
      title: input.title,
      body: input.body,
      createdAt: now,
      updatedAt: now,
    };
    itemsById.set(created.id, created);
    return created;
  }

  const created = await prisma.item.create({
    data: { ownerUserId, title: input.title, body: input.body },
  });
  return mapItem(created);
}

export async function updateItem(
  ownerUserId: string,
  id: string,
  input: { title?: string; body?: string },
): Promise<Item | undefined> {
  if (!isDatabaseConfigured) {
    const existing = itemsById.get(id);
    if (!existing || existing.ownerUserId !== ownerUserId) return undefined;
    if (input.title !== undefined) existing.title = input.title;
    if (input.body !== undefined) existing.body = input.body;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  const existing = await prisma.item.findFirst({ where: { id, ownerUserId } });
  if (!existing) return undefined;

  const updated = await prisma.item.update({
    where: { id },
    data: { title: input.title, body: input.body },
  });
  return mapItem(updated);
}

export async function deleteItem(ownerUserId: string, id: string): Promise<boolean> {
  if (!isDatabaseConfigured) {
    const existing = itemsById.get(id);
    if (!existing || existing.ownerUserId !== ownerUserId) return false;
    itemsById.delete(id);
    return true;
  }

  const existing = await prisma.item.findFirst({ where: { id, ownerUserId } });
  if (!existing) return false;

  await prisma.item.delete({ where: { id } });
  return true;
}

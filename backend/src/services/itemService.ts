import * as repo from "../repositories/itemRepository.js";
import { onItemCreated, onItemDeleted } from "../observability/itemEvents.js";

// Thin service layer: orchestrates repository calls + domain events. Validation lives
// in the route (zod); business rules live here. Mirror this split for your real domain.

export function listItems(userId: string) {
  return repo.listItems(userId);
}

export function getItem(userId: string, id: string) {
  return repo.getItem(userId, id);
}

export async function createItem(userId: string, input: { title: string; body?: string }) {
  const item = await repo.createItem(userId, input);
  onItemCreated(userId, item.id);
  return item;
}

export function updateItem(userId: string, id: string, input: { title?: string; body?: string }) {
  return repo.updateItem(userId, id, input);
}

export async function deleteItem(userId: string, id: string): Promise<boolean> {
  const ok = await repo.deleteItem(userId, id);
  if (ok) onItemDeleted(userId, id);
  return ok;
}

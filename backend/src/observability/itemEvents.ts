import { logAuditEvent } from "./auditLogger.js";

// Example domain events for the `Item` slice — mirror this pattern for your real entities.
export function onItemCreated(userId: string, itemId: string) {
  logAuditEvent("item.created", { userId, itemId });
}

export function onItemDeleted(userId: string, itemId: string) {
  logAuditEvent("item.deleted", { userId, itemId });
}

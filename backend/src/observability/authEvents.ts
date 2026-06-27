import { logAuditEvent } from "./auditLogger.js";

export function onAuthSuccess(userId: string, provider: string) {
  logAuditEvent("auth.success", { userId, provider });
}

export function onAuthFailure(reason: string, provider: string) {
  logAuditEvent("auth.failure", { reason, provider });
}

export function onMockAuthUsed(userId: string) {
  logAuditEvent("auth.mock_used", { userId });
}

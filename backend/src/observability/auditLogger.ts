type AuditMetadata = Record<string, unknown>;

const SENSITIVE_PATTERNS = ["token", "secret", "password", "credential"];

function isSensitiveKey(key: string): boolean {
  const lk = key.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => lk.includes(p));
}

function redact(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (isSensitiveKey(key)) return "[REDACTED]";
  const lv = value.toLowerCase();
  if (SENSITIVE_PATTERNS.some((p) => lv.includes(p))) return "[REDACTED]";
  return value;
}

export function logAuditEvent(eventType: string, metadata: AuditMetadata): void {
  const safeMetadata: AuditMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    safeMetadata[key] = redact(key, value);
  }

  console.info(
    JSON.stringify({ eventType, metadata: safeMetadata, occurredAt: new Date().toISOString() }),
  );
}

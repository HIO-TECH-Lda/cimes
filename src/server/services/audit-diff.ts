import { MASKED_VALUE, SENSITIVE_DIFF_KEYS } from "@/server/domain/audit";

/**
 * Diferenças de auditoria (RF-AUD-02): valores antigos e novos com campos
 * sensíveis mascarados (RNF-13). O diff é um objecto plano `{ campo: {antigo, novo} }`
 * serializado para o `AuditLog.diffJson`.
 */

export type AuditDiff = Record<string, { antigo: string; novo: string }>;

function mask(key: string, value: string): string {
  return SENSITIVE_DIFF_KEYS.has(key.toLowerCase()) ? MASKED_VALUE : value;
}

/** Só valores escalares entram no diff; objectos e arrays são serializados. */
function normalise(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

/**
 * Constrói o diff entre o estado antigo e o novo. Chaves em que ambos os valores
 * são iguais ficam de fora. Valores sensíveis são mascarados antes de gravar.
 */
export function buildAuditDiff(
  antigo: Record<string, unknown> | null,
  novo: Record<string, unknown> | null,
): AuditDiff {
  const diff: AuditDiff = {};
  const keys = new Set([...Object.keys(antigo ?? {}), ...Object.keys(novo ?? {})]);
  for (const key of keys) {
    const before = normalise(antigo?.[key] ?? null);
    const after = normalise(novo?.[key] ?? null);
    if (before === after) continue;
    diff[key] = { antigo: mask(key, before), novo: mask(key, after) };
  }
  return diff;
}

/** Serializa o diff para `diffJson` (NVarChar(Max)). Objecto vazio → null. */
export function serialiseAuditDiff(diff: AuditDiff): string | null {
  if (Object.keys(diff).length === 0) return null;
  return JSON.stringify(diff);
}
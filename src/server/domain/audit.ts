/**
 * Acções de auditoria (RF-AUD-03) e respectiva categoria (RF-AUD-04): o auditor
 * vê tudo; o Gestor de RH vê os eventos de negócio; o administrador de sistema
 * vê os técnicos (entradas, papéis, configuração, tarefas e IA).
 */

export const AUDIT_ACTIONS = [
  "LOGIN_SUCCEEDED",
  "LOGIN_FAILED",
  "LOGOUT",
  "ACCOUNT_LOCKED",
  "PASSWORD_RESET",
  "EMAIL_CHANGED",
  "ROLE_GRANTED",
  "ROLE_REVOKED",
  "SETTING_CHANGED",
  "CATALOG_CHANGED",
  "TEMPLATE_PUBLISHED",
  "OPENING_STATUS_CHANGED",
  "APPLICATION_SUBMITTED",
  "APPLICATION_STATUS_CHANGED",
  "ACADEMIC_DATA_VALIDATED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_VALIDATED",
  "DOCUMENT_REJECTED",
  "SENSITIVE_DATA_VIEWED",
  "FILE_DOWNLOADED",
  "NLQ_EXECUTED",
  "INTERVIEW_SCHEDULED",
  "OFFER_SENT",
  "OFFER_RESPONDED",
  "CONTRACT_STATUS_CHANGED",
  "SIGNATURE_CREATED",
  "DOCUMENT_ISSUED",
  "DOCUMENT_REVOKED",
  "INTERNSHIP_STATUS_CHANGED",
  "INTERNSHIP_EXTENDED",
  "EVALUATION_STATUS_CHANGED",
  "EVALUATION_REOPENED",
  "OUTCOME_RECORDED",
  "EXPORT_EXECUTED",
  "DSR_CREATED",
  "DSR_RESOLVED",
  "RETENTION_RUN",
  "LEGAL_HOLD_SET",
  "IMPORT_EXECUTED",
  "AI_RUN",
  "JOB_FAILED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Eventos técnicos: só SYSTEM_ADMIN e AUDITOR os vêem (RF-AUD-04). */
export const TECHNICAL_AUDIT_ACTIONS: ReadonlySet<AuditAction> = new Set([
  "LOGIN_SUCCEEDED",
  "LOGIN_FAILED",
  "LOGOUT",
  "ACCOUNT_LOCKED",
  "PASSWORD_RESET",
  "EMAIL_CHANGED",
  "ROLE_GRANTED",
  "ROLE_REVOKED",
  "SETTING_CHANGED",
  "CATALOG_CHANGED",
  "TEMPLATE_PUBLISHED",
  "IMPORT_EXECUTED",
  "AI_RUN",
  "NLQ_EXECUTED",
  "JOB_FAILED",
] as const);

/** Eventos de negócio: visíveis ao Gestor de RH (e ao auditor, que vê tudo). */
export function isTechnicalAuditAction(action: AuditAction): boolean {
  return TECHNICAL_AUDIT_ACTIONS.has(action);
}

/**
 * Campos sensíveis que nunca entram em claro num diff de auditoria (RNF-13,
 * R-09): BI, NUIT, contactos, endereço, data de nascimento e texto livre.
 */
export const SENSITIVE_DIFF_KEYS: ReadonlySet<string> = new Set([
  "bi",
  "nuit",
  "email",
  "phone",
  "altEmail",
  "address",
  "birthDate",
  "notes",
  "summary",
] as const);

/** Mascarado uniforme para valores sensíveis. */
export const MASKED_VALUE = "[mascarado]";
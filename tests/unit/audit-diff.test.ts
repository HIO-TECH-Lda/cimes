import { describe, expect, it } from "vitest";

import {
  AUDIT_ACTIONS,
  MASKED_VALUE,
  SENSITIVE_DIFF_KEYS,
  isTechnicalAuditAction,
} from "@/server/domain/audit";
import { buildAuditDiff, serialiseAuditDiff } from "@/server/services/audit-diff";

describe("RF-AUD-03: acções de auditoria", () => {
  it("contém todas as acções mínimas da especificação", () => {
    const expected = [
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
    ];
    for (const action of expected) {
      expect(AUDIT_ACTIONS).toContain(action);
    }
    expect(AUDIT_ACTIONS).toHaveLength(expected.length);
  });

  it("login, papéis, configuração e IA são técnicos; vaga e candidatura são negócio", () => {
    expect(isTechnicalAuditAction("LOGIN_FAILED")).toBe(true);
    expect(isTechnicalAuditAction("ROLE_GRANTED")).toBe(true);
    expect(isTechnicalAuditAction("SETTING_CHANGED")).toBe(true);
    expect(isTechnicalAuditAction("AI_RUN")).toBe(true);
    expect(isTechnicalAuditAction("OPENING_STATUS_CHANGED")).toBe(false);
    expect(isTechnicalAuditAction("APPLICATION_SUBMITTED")).toBe(false);
    expect(isTechnicalAuditAction("OFFER_SENT")).toBe(false);
  });
});

describe("diff de auditoria (RF-AUD-02, RNF-13)", () => {
  it("só campos alterados entram no diff", () => {
    const diff = buildAuditDiff({ status: "DRAFT", name: "Vaga A" }, { status: "SUBMITTED", name: "Vaga A" });
    expect(Object.keys(diff)).toEqual(["status"]);
    expect(diff.status).toEqual({ antigo: "DRAFT", novo: "SUBMITTED" });
  });

  it("campos sensíveis ficam mascarados nos dois lados (BI, NUIT, e-mail)", () => {
    const diff = buildAuditDiff(
      { bi: "1101001234567", nuit: "123456789", email: "candidato@exemplo.mz", city: "Beira" },
      { bi: "1101009999999", nuit: "987654321", email: "novo@exemplo.mz", city: "Quelimane" },
    );
    expect(diff.bi?.antigo).toBe(MASKED_VALUE);
    expect(diff.bi?.novo).toBe(MASKED_VALUE);
    expect(diff.nuit?.antigo).toBe(MASKED_VALUE);
    expect(diff.email?.novo).toBe(MASKED_VALUE);
    expect(diff.city).toEqual({ antigo: "Beira", novo: "Quelimane" });
  });

  it("a lista de campos sensíveis cobre BI, NUIT, contactos, endereço e notas", () => {
    for (const key of ["bi", "nuit", "phone", "address", "birthDate", "notes"]) {
      expect(SENSITIVE_DIFF_KEYS.has(key)).toBe(true);
    }
  });

  it("valores nulos e não escalares são normalizados", () => {
    const diff = buildAuditDiff({ dept: null }, { dept: { id: "ICT" } });
    expect(diff.dept?.antigo).toBe("");
    expect(diff.dept?.novo).toBe(JSON.stringify({ id: "ICT" }));
    const diff2 = buildAuditDiff({ a: new Date("2026-01-01T00:00:00Z") }, { a: new Date("2026-01-02T00:00:00Z") });
    expect(diff2.a?.novo).toBe("2026-01-02T00:00:00.000Z");
  });

  it("diff vário e vazio serializa para null (sem coluna desnecessária)", () => {
    expect(serialiseAuditDiff({})).toBeNull();
    expect(serialiseAuditDiff({ x: { antigo: "1", novo: "2" } })).toBe(JSON.stringify({ x: { antigo: "1", novo: "2" } }));
  });
});
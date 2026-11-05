import { describe, expect, it } from "vitest";

import {
  biNumberSchema,
  completedSteps,
  normalizeBi,
  normalizeFullName,
  normalizePhoneMz,
  nuitCheckDigitWarning,
  phoneAltMzSchema,
  phoneMzSchema,
  stepContactsSchema,
  stepEducationSchema,
  stepPersonalSchema,
  stepSkillsSchema,
} from "@/server/domain/candidate-profile";

/**
 * Tabela CAN (RF-CAN-02) e regras de datas de conclusão (RN-ELG-02/03):
 * validações correm no cliente e no servidor com o mesmo esquema.
 */

describe("nome completo (CAN)", () => {
  it("normaliza espaços e aceita acentos, apóstrofo e hífen", () => {
    expect(normalizeFullName("  Maria   José  D'Almeida-Silva ")).toBe("Maria José D'Almeida-Silva");
    const r = stepPersonalSchema.safeParse({
      fullName: "  Maria   José  D'Almeida-Silva ",
      birthDate: "2000-05-10",
      biNumber: "110100123456B",
      biExpiryDate: "2030-12-31",
      sex: "",
      nuit: "",
    });
    expect(r.success).toBe(true);
  });

  it("exige 5-120 caracteres e pelo menos duas palavras", () => {
    const base = { birthDate: "2000-05-10", biNumber: "110100123456B", biExpiryDate: "2030-12-31" };
    expect(stepPersonalSchema.safeParse({ ...base, fullName: "Ana" }).success).toBe(false);
    expect(stepPersonalSchema.safeParse({ ...base, fullName: "Ana Silva" }).success).toBe(true);
    expect(stepPersonalSchema.safeParse({ ...base, fullName: "A".repeat(121) }).success).toBe(false);
    expect(stepPersonalSchema.safeParse({ ...base, fullName: "Ana Silva 123" }).success).toBe(false);
  });
});

describe("BI e NUIT (P-06, P-32, RF-CAN-03)", () => {
  it("normaliza espaços e minúsculas e valida 12 dígitos + letra", () => {
    expect(normalizeBi(" 1101 0012 3456b ")).toBe("110100123456B");
    expect(biNumberSchema.safeParse("110100123456B").success).toBe(true);
    expect(biNumberSchema.safeParse("110100123456B2").success).toBe(false);
    expect(biNumberSchema.safeParse("110100123456").success).toBe(false);
    expect(biNumberSchema.safeParse("A10100123456B").success).toBe(false);
  });

  it("NUIT: 9 dígitos; dígito de controlo errado só é aviso", () => {
    expect(nuitCheckDigitWarning("100456789")).toBe(false); // controlo válido
    expect(nuitCheckDigitWarning("400123789")).toBe(true); // controlo errado
    const r = stepPersonalSchema.safeParse({
      fullName: "Ana Silva",
      birthDate: "2000-05-10",
      biNumber: "110100123456B",
      biExpiryDate: "2030-12-31",
      nuit: " 100456789 ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.nuit).toBe("100456789");
  });
});

describe("celulares (CAN, E.164)", () => {
  it("aceita prefixos +258, 00258, 258 ou nenhum; móvel 8[2-7] + 7 dígitos", () => {
    expect(normalizePhoneMz("+258 82 345 6789")).toBe("+258823456789");
    expect(normalizePhoneMz("00258843456789")).toBe("+258843456789");
    expect(normalizePhoneMz("258 87 111 2233")).toBe("+258871112233");
    expect(normalizePhoneMz("86 555 6677")).toBe("+258865556677");
    expect(phoneMzSchema.safeParse("+258 82 345 6789").success).toBe(true);
    expect(phoneMzSchema.safeParse("+258 81 345 6789").success).toBe(false); // 81 fora de 82-87
    expect(phoneMzSchema.safeParse("+258 82 345 678").success).toBe(false);
    expect(phoneAltMzSchema.safeParse("+258 23 123 4567").success).toBe(true); // fixo: 2X + 7 dígitos
    expect(phoneAltMzSchema.safeParse("+258 99 123 4567").success).toBe(false);
  });
});

describe("formação (RN-ELG-02/03)", () => {
  const base = {
    institutionId: "inst-1",
    courseId: "course-1",
    academicStatus: "FINALIST" as const,
    declaredAverage: 14.5,
  };

  it("finalista: conclusão prevista a partir do mês corrente", () => {
    const agora = new Date();
    const mesCorrente = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    expect(stepEducationSchema.safeParse({ ...base, graduationDate: mesCorrente }).success).toBe(true);
    const mesAnterior = new Date(mesCorrente.getTime() - 24 * 3600_000);
    expect(stepEducationSchema.safeParse({ ...base, graduationDate: mesAnterior }).success).toBe(false);
  });

  it("graduado: conclusão real até hoje", () => {
    const ontem = new Date(Date.now() - 24 * 3600_000);
    const amanha = new Date(Date.now() + 24 * 3600_000);
    expect(stepEducationSchema.safeParse({ ...base, academicStatus: "GRADUATE", graduationDate: ontem }).success).toBe(true);
    expect(stepEducationSchema.safeParse({ ...base, academicStatus: "GRADUATE", graduationDate: amanha }).success).toBe(false);
  });

  it("instituição e curso: catálogo ou Outra/Outro, mas não ambos nem nenhum", () => {
    const conclusao = new Date("2027-06-15");
    expect(stepEducationSchema.safeParse({ ...base, graduationDate: conclusao }).success).toBe(true);
    expect(
      stepEducationSchema.safeParse({ ...base, institutionId: "inst-1", institutionOther: "Outra", graduationDate: conclusao }).success,
    ).toBe(false);
    expect(
      stepEducationSchema.safeParse({ ...base, graduationDate: conclusao, courseOther: "Curso X", courseId: "course-1" }).success,
    ).toBe(false);
    expect(
      stepEducationSchema.safeParse({ ...base, graduationDate: conclusao, institutionId: undefined, institutionOther: "Instituto Sintético" }).success,
    ).toBe(true);
  });

  it("média 0-20 com até duas casas decimais", () => {
    const conclusao = new Date("2027-06-15");
    expect(stepEducationSchema.safeParse({ ...base, graduationDate: conclusao, declaredAverage: 17.25 }).success).toBe(true);
    expect(stepEducationSchema.safeParse({ ...base, graduationDate: conclusao, declaredAverage: 17.255 }).success).toBe(false);
    expect(stepEducationSchema.safeParse({ ...base, graduationDate: conclusao, declaredAverage: 20.5 }).success).toBe(false);
  });
});

describe("contactos e competências", () => {
  it("passo de contactos: província do catálogo e cidade 2-80", () => {
    const base = { phone: "+258823456789", province: "SOFALA", city: "Beira" };
    expect(stepContactsSchema.safeParse(base).success).toBe(true);
    expect(stepContactsSchema.safeParse({ ...base, province: "OUTRA" }).success).toBe(false);
    expect(stepContactsSchema.safeParse({ ...base, city: "B" }).success).toBe(false);
    expect(stepContactsSchema.safeParse({ ...base, neighbourhood: "Munhava" }).success).toBe(true);
  });

  it("passo de competências: pelo menos um local; até 20 competências", () => {
    expect(stepSkillsSchema.safeParse({ availableLocationIds: ["loc-1"] }).success).toBe(true);
    expect(stepSkillsSchema.safeParse({ availableLocationIds: [] }).success).toBe(false);
    const vinte = Array.from({ length: 20 }, (_, i) => `sk-${i}`);
    const vinteUm = Array.from({ length: 21 }, (_, i) => `sk-${i}`);
    expect(stepSkillsSchema.safeParse({ skillIds: vinte, availableLocationIds: ["loc-1"] }).success).toBe(true);
    expect(stepSkillsSchema.safeParse({ skillIds: vinteUm, availableLocationIds: ["loc-1"] }).success).toBe(false);
    expect(
      stepSkillsSchema.safeParse({
        languages: [{ language: "Português", level: "NATIVE" }],
        availableLocationIds: ["loc-1"],
      }).success,
    ).toBe(true);
  });
});

describe("indicador de progresso (RF-CAN-01)", () => {
  it("marca os passos concluídos a partir dos campos guardados", () => {
    const nada = completedSteps({});
    expect(nada).toEqual([]);
    const pessoal = completedSteps({ fullName: "Ana Silva", birthDate: new Date(), biNumberHash: "h" });
    expect(pessoal).toEqual(["pessoais"]);
    const ateCompetencias = completedSteps({
      fullName: "Ana Silva",
      birthDate: new Date(),
      biNumberHash: "h",
      phoneE164: "+258823456789",
      province: "SOFALA",
      institutionId: "i",
      courseId: "c",
      academicStatus: "FINALIST",
      graduationDate: new Date(),
      declaredAverage: 14.5,
      availableLocationsJson: '["loc-1"]',
    });
    expect(ateCompetencias).toEqual(["pessoais", "contactos", "formacao", "competencias"]);
  });
});
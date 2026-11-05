import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCORING_WEIGHTS,
  openingDraftCompleteSchema,
  openingPublishedEditSchema,
  openingPublicationSchema,
  openingScoringSchema,
  scoringWeightsSumSchema,
} from "@/server/domain/opening";
import { formatSequenceCode, sequenceKey } from "@/server/domain/sequence";

/** RF-VAG-01 (esquema), RF-VAG-05 (código) e RN-VAG-02 (pesos somam 100). */

function rascunhoValido() {
  return {
    title: "Estágio em Logística Portuária",
    departmentId: "dep-1",
    locationId: "loc-1",
    positions: 2,
    description: "Apoio à gestão de contentores no terminal de contentores.",
    requirements: "Frequência universitária em áreas ligadas a logística.",
    acceptsFinalists: true,
    acceptsGraduates: false,
    courseIds: ["course-1"],
    fieldOfStudyIds: [],
    durationMonths: 6,
    expectedStartDate: "2027-04-01",
    keySubjects: [{ keySubjectId: "ks-1", weight: 3 }],
    skills: [{ skillId: "sk-1", required: true, weight: 4 }],
    scoringWeights: { academic: 60, keySubjects: 20, skills: 20 },
  };
}

describe("código de sequência (RF-VAG-05)", () => {
  it("formata VAG-AAAA-NNNN com 4 dígitos", () => {
    expect(formatSequenceCode("VAG", 2027, 1)).toBe("VAG-2027-0001");
    expect(formatSequenceCode("VAG", 2027, 423)).toBe("VAG-2027-0423");
  });

  it("rejeita ano ou valor fora do intervalo", () => {
    expect(() => formatSequenceCode("VAG", 1999, 1)).toThrow();
    expect(() => formatSequenceCode("VAG", 2027, 10000)).toThrow();
    expect(() => formatSequenceCode("VAG", 2027.5, 1)).toThrow();
  });

  it("chave do contador por ano", () => {
    expect(sequenceKey("VAG", 2027)).toBe("VAG-2027");
  });
});

describe("esquema do pedido de vaga (RF-VAG-01)", () => {
  it("aceita um rascunho completo", () => {
    const r = openingDraftCompleteSchema.safeParse(rascunhoValido());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stipendVisible).toBe(false); // por omissão não é visível
      expect(r.data.expectedStartDate).toBeInstanceOf(Date);
    }
  });

  it("exige pelo menos um curso ou uma área aceite", () => {
    const semNenhum = { ...rascunhoValido(), courseIds: [], fieldOfStudyIds: [] };
    expect(openingDraftCompleteSchema.safeParse(semNenhum).success).toBe(false);
    const soArea = { ...rascunhoValido(), courseIds: [], fieldOfStudyIds: ["fs-1"] };
    expect(openingDraftCompleteSchema.safeParse(soArea).success).toBe(true);
  });

  it("exige finalista, graduado ou ambos", () => {
    const nenhum = {
      ...rascunhoValido(),
      courseIds: ["course-1"],
      acceptsFinalists: false,
      acceptsGraduates: false,
    };
    const r = openingDraftCompleteSchema.safeParse(nenhum);
    expect(r.success).toBe(false);
  });

  it("posições entre 1 e 20; duração entre 1 e 12 meses", () => {
    expect(openingDraftCompleteSchema.safeParse({ ...rascunhoValido(), positions: 0 }).success).toBe(false);
    expect(openingDraftCompleteSchema.safeParse({ ...rascunhoValido(), positions: 21 }).success).toBe(false);
    expect(openingDraftCompleteSchema.safeParse({ ...rascunhoValido(), durationMonths: 13 }).success).toBe(false);
  });

  it("disciplinas-chave 0–10 e competências 0–15, com peso 1–5", () => {
    const dez = Array.from({ length: 10 }, (_, i) => ({ keySubjectId: `ks-${i}`, weight: 5 }));
    expect(openingDraftCompleteSchema.safeParse({ ...rascunhoValido(), keySubjects: dez }).success).toBe(true);
    const onze = Array.from({ length: 11 }, (_, i) => ({ keySubjectId: `ks-${i}`, weight: 5 }));
    expect(openingDraftCompleteSchema.safeParse({ ...rascunhoValido(), keySubjects: onze }).success).toBe(false);
    const peso6 = [{ keySubjectId: "ks-1", weight: 6 }];
    expect(openingDraftCompleteSchema.safeParse({ ...rascunhoValido(), keySubjects: peso6 }).success).toBe(false);
  });

  it("pesos do score são inteiros que somam 100 (RN-VAG-02)", () => {
    expect(scoringWeightsSumSchema.safeParse({ academic: 60, keySubjects: 20, skills: 20 }).success).toBe(true);
    expect(scoringWeightsSumSchema.safeParse({ academic: 50, keySubjects: 20, skills: 20 }).success).toBe(false);
    expect(scoringWeightsSumSchema.safeParse({ academic: 60.5, keySubjects: 20, skills: 19.5 }).success).toBe(false);
    expect(DEFAULT_SCORING_WEIGHTS).toEqual({ academic: 60, keySubjects: 20, skills: 20 });
  });
});

describe("publicação e edição (RF-VAG-03, RF-VAG-06)", () => {
  it("janela de candidatura exige abertura antes do fecho", () => {
    const ok = openingPublicationSchema.safeParse({
      applicationOpenAt: "2027-03-01T08:00:00Z",
      applicationCloseAt: "2027-03-15T17:00:00Z",
    });
    expect(ok.success).toBe(true);
    const inverso = openingPublicationSchema.safeParse({
      applicationOpenAt: "2027-03-16T08:00:00Z",
      applicationCloseAt: "2027-03-15T17:00:00Z",
    });
    expect(inverso.success).toBe(false);
  });

  it("edição de publicada aceita só descrição e/ou prazo (RF-VAG-06)", () => {
    const r = openingScoringSchema.safeParse({
      keySubjects: [],
      skills: [],
      scoringWeights: { academic: 100, keySubjects: 0, skills: 0 },
    });
    expect(r.success).toBe(true);
    const soDescricao = openingPublishedEditSchema.safeParse({ description: "nova descrição" });
    expect(soDescricao.success).toBe(true);
    const soPrazo = openingPublishedEditSchema.safeParse({ applicationCloseAt: "2027-04-30T17:00:00Z" });
    expect(soPrazo.success).toBe(true);
    const vazio = openingPublishedEditSchema.safeParse({});
    expect(vazio.success).toBe(true);
  });
});
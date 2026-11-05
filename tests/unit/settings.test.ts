import { describe, expect, it } from "vitest";
import { parseCsv, synonymsToJson, observedDate } from "../../prisma/seed/csv";
import { defaultSettings, SETTING_SCHEMAS, validateSetting } from "@/server/domain/settings";

describe("leitor CSV dos seeds (Anexo F)", () => {
  it("interpreta cabeçalho e linhas com separador ;", () => {
    const rows = parseCsv("codigo;nome\nBEIRA;Beira\nQUELIMANE;Quelimane");
    expect(rows).toEqual([
      { codigo: "BEIRA", nome: "Beira" },
      { codigo: "QUELIMANE", nome: "Quelimane" },
    ]);
  });

  it("erro claro quando a linha tem colunas a mais ou a menos", () => {
    expect(() => parseCsv("a;b\n1;2;3")).toThrow(/3 colunas/);
  });

  it("sinónimos viram JSON em minúsculas, sem vazios", () => {
    expect(synonymsToJson(" Base de dados |banco de dados|| ")).toBe(
      JSON.stringify(["base de dados", "banco de dados"]),
    );
  });

  it("domingo vai para a segunda-feira seguinte (F.7)", () => {
    // 25 de Dezembro de 2027 é sábado; 25 de Dezembro de 2022 é domingo.
    const sunday = observedDate(new Date(Date.UTC(2022, 11, 25)));
    expect(sunday.toISOString()).toBe(new Date(Date.UTC(2022, 11, 26)).toISOString());
    const saturday = observedDate(new Date(Date.UTC(2027, 11, 25)));
    expect(saturday.toISOString()).toBe(new Date(Date.UTC(2027, 11, 25)).toISOString());
  });
});

describe("parâmetros do sistema (RF-ADM-11)", () => {
  it("todos os códigos têm esquema e omissão", () => {
    const defaults = defaultSettings();
    for (const { code, valueJson } of defaults) {
      expect(SETTING_SCHEMAS).toHaveProperty(code);
      expect(validateSetting(code, valueJson).ok).toBe(true);
    }
  });

  it("pesos do score têm de somar 1 (P-11: 40/40/20)", () => {
    expect(validateSetting("score.weights", JSON.stringify({ academic: 0.4, experience: 0.4, results: 0.2 })).ok).toBe(true);
    const bad = validateSetting("score.weights", JSON.stringify({ academic: 0.5, experience: 0.5, results: 0.5 }));
    expect(bad.ok).toBe(false);
  });

  it("rejeita valor fora do contrato e código desconhecido", () => {
    expect(validateSetting("candidate.maxActiveApplications", "50").ok).toBe(false);
    expect(validateSetting("catalogo.inexistente", "1").ok).toBe(false);
    expect(validateSetting("candidate.maxActiveApplications", "{não json").ok).toBe(false);
  });

  it("valores por omissão correspondem aos pressupostos (P-09 a P-13, P-29)", () => {
    const values = Object.fromEntries(defaultSettings().map((d) => [d.code, JSON.parse(d.valueJson)]));
    expect(values["candidate.maxActiveApplications"]).toBe(3);
    expect(values["internship.durationMaxMonths"]).toBe(12);
    expect(values["average.tolerance"]).toBe(0.5);
    expect(values["finalist.monthsToCompletion"]).toBe(18);
    expect(values["graduate.monthsAfterCompletion"]).toBe(24);
    expect(values["evaluation.reminderDays"]).toEqual([60, 30, 15]);
    expect(values["evaluation.openDaysBeforeEnd"]).toBe(30);
    expect(values["evaluation.selfAssessDaysBeforeEnd"]).toBe(10);
    expect(values["evaluation.finalDeadlineBusinessDays"]).toBe(5);
  });
});
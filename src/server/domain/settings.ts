import { z } from "zod";

/**
 * Parâmetros do sistema (`Setting`, RF-ADM-11): cada código tem esquema Zod e
 * valor por omissão dos pressupostos (P-09 a P-13, P-29). A alteração é
 * auditada (SETTING_CHANGED) e a validação rejeita valores fora do contrato.
 * Identificadores em inglês (convenção do projecto).
 */

export const SETTING_SCHEMAS = {
  "candidate.maxActiveApplications": z.number().int().min(1).max(10), // P-12: 3
  "internship.durationMinMonths": z.number().int().min(1).max(12), // P-13: 1
  "internship.durationMaxMonths": z.number().int().min(1).max(12), // P-13: 12
  "score.weights": z.object({
    academic: z.number().min(0).max(1),
    experience: z.number().min(0).max(1),
    results: z.number().min(0).max(1),
  }).refine((w) => Math.abs(w.academic + w.experience + w.results - 1) < 0.001), // P-11: 40/40/20
  "average.passMark": z.number().min(0).max(20), // P-10: 10
  "average.tolerance": z.number().min(0).max(2), // P-10: 0,5
  "finalist.monthsToCompletion": z.number().int().min(1).max(36), // P-09: 18
  "graduate.monthsAfterCompletion": z.number().int().min(1).max(36), // P-09: 24
  "evaluation.reminderDays": z.array(z.number().int().min(1).max(180)), // P-29: 60/30/15
  "evaluation.openDaysBeforeEnd": z.number().int().min(1).max(90), // P-29: 30
  "evaluation.selfAssessDaysBeforeEnd": z.number().int().min(1).max(60), // P-29: 10
  "evaluation.finalDeadlineBusinessDays": z.number().int().min(1).max(30), // P-29: 5
  "catalog.languages": z.array(z.object({ code: z.string().min(2).max(30), name: z.string().min(2).max(60) })),
} as const;

export type SettingCode = keyof typeof SETTING_SCHEMAS;

/** Valores por omissão (pressupostos aprovados; alteráveis pelo Gestor de RH). */
export const SETTING_DEFAULTS: Record<SettingCode, unknown> = {
  "candidate.maxActiveApplications": 3,
  "internship.durationMinMonths": 1,
  "internship.durationMaxMonths": 12,
  "score.weights": { academic: 0.4, experience: 0.4, results: 0.2 },
  "average.passMark": 10,
  "average.tolerance": 0.5,
  "finalist.monthsToCompletion": 18,
  "graduate.monthsAfterCompletion": 24,
  "evaluation.reminderDays": [60, 30, 15],
  "evaluation.openDaysBeforeEnd": 30,
  "evaluation.selfAssessDaysBeforeEnd": 10,
  "evaluation.finalDeadlineBusinessDays": 5,
  "catalog.languages": [
    { code: "PORTUGUES", name: "Português" },
    { code: "INGLES", name: "Inglês" },
    { code: "FRANCES", name: "Francês" },
    { code: "ESPANHOL", name: "Espanhol" },
    { code: "KISWAHILI", name: "Kiswahili" },
    { code: "SENA", name: "Sena" },
    { code: "NDAU", name: "Ndau" },
    { code: "CHUWABO", name: "Chuwabo" },
    { code: "EMAKHUWA", name: "Emakhuwa" },
    { code: "XICHANGANA", name: "Xichangana" },
  ],
};

/** Valida um valor para um código de parâmetro. Devolve o valor tipado ou erro. */
export function validateSetting(code: string, valueJson: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const schema = (SETTING_SCHEMAS as Record<string, z.ZodType | undefined>)[code];
  if (!schema) return { ok: false, error: `Parâmetro desconhecido: ${code}` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(valueJson);
  } catch {
    return { ok: false, error: "Valor não é JSON válido" };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`).join("; ") };
  }
  return { ok: true, value: result.data };
}

/** Lista de códigos com omissão, para o seed e para a UI. */
export function defaultSettings(): Array<{ code: SettingCode; valueJson: string }> {
  return (Object.keys(SETTING_DEFAULTS) as SettingCode[]).map((code) => ({
    code,
    valueJson: JSON.stringify(SETTING_DEFAULTS[code]),
  }));
}
import { z } from "zod";

/**
 * Perfil do candidato (CAN, RF-CAN-01 a 03): esquema Zod partilhado pelo
 * cliente (feedback imediato) e pelo servidor (autoridade), normalização de
 * BI/telefone/nome como funções puras, e regras de data de conclusão
 * (RN-ELG-02/03). PII (BI, NUIT) é cifrado pelo serviço — aqui só há
 * validação e normalização.
 */

export const PROVINCES = [
  "NIASSA",
  "CABO_DELGADO",
  "NAMPULA",
  "ZAMBEZIA",
  "TETE",
  "MANICA",
  "SOFALA",
  "INHAMBANE",
  "GAZA",
  "MAPUTO_PROVINCIA",
  "MAPUTO_CIDADE",
] as const;

export const SEXES = ["FEMALE", "MALE", "UNDISCLOSED"] as const;

export const LANGUAGE_LEVELS = ["BASIC", "INTERMEDIATE", "ADVANCED", "FLUENT", "NATIVE"] as const;

export const ACADEMIC_STATUSES = ["FINALIST", "GRADUATE"] as const;

const idCurto = z.string().min(1).max(30);

/**
 * Campos que o cliente envia como "" quando não escolhe — enum ou texto
 * (ex.: NUIT). O preprocess evita um union que degradaria a mensagem de erro.
 */
function opcionalComVazio<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (v === "" || v == null ? undefined : v), schema.optional());
}

/**
 * Nome completo (CAN): 5-120 caracteres; letras (incluindo acentuadas),
 * espaços, apóstrofo e hífen; pelo menos duas palavras; espaços normalizados.
 */
export function normalizeFullName(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export const fullNameSchema = z
  .string()
  .transform(normalizeFullName)
  .pipe(
    z
      .string()
      .min(5)
      .max(120)
      .regex(/^[\p{L}' -]+$/u, "Só letras, espaços, apóstrofo e hífen")
      .refine((v) => v.split(" ").length >= 2, "Indica pelo menos dois nomes"),
  );

/**
 * Número do BI (P-06): aceita espaços e minúsculas na entrada, normaliza
 * (sem espaços, maiúsculas) e exige `12 dígitos + letra`.
 */
export function normalizeBi(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export const biNumberSchema = z
  .string()
  .transform(normalizeBi)
  .pipe(z.string().regex(/^\d{12}[A-Z]$/, "Formato do BI: 12 dígitos seguidos de uma letra (P-06)"));

/**
 * Celular de Moçambique (CAN): aceita espaços e os prefixos `+258`, `00258`,
 * `258` ou nenhum; guarda em E.164 `+2588XXXXXXXX` (prefixo 82 a 87 + 7 dígitos).
 */
export function normalizePhoneMz(input: string): string {
  const digitos = input.replace(/[\s()-]/g, "").replace(/^\+?0*258/, "");
  return digitos.startsWith("+") ? digitos : `+258${digitos}`;
}

export const phoneMzSchema = z
  .string()
  .transform(normalizePhoneMz)
  .pipe(z.string().regex(/^\+2588[2-7]\d{7}$/, "Celular: +258 e prefixo 82 a 87, mais 7 dígitos"));

/** Celular alternativo: móvel (8X) ou fixo (2X), 9 dígitos após +258. */
export const phoneAltMzSchema = z
  .string()
  .transform(normalizePhoneMz)
  .pipe(z.string().regex(/^\+258(8[2-7]|2\d)\d{7}$/, "Celular alternativo: móvel 8X ou fixo 2X, 9 dígitos"));

/** NUIT (Anexo G, P-32): 9 dígitos; o dígito de controlo só produz aviso. */
export function nuitCheckDigitWarning(nuit: string): boolean {
  if (!/^\d{9}$/.test(nuit)) return false;
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  const soma = pesos.reduce((acc, peso, i) => acc + Number(nuit[i]) * peso, 0);
  const resto = soma % 11;
  const controlo = resto === 0 || resto === 1 ? 0 : 11 - resto;
  return Number(nuit[8]) !== controlo;
}

/** Passo 1 — dados pessoais. */
export const stepPersonalSchema = z.object({
  fullName: fullNameSchema,
  birthDate: z.coerce.date().refine((d) => d.getTime() < Date.now(), "A data de nascimento tem de ser no passado"),
  sex: opcionalComVazio(z.enum(SEXES)),
  biNumber: biNumberSchema,
  biExpiryDate: z.coerce.date(),
  nuit: opcionalComVazio(z.string().transform((v) => v.replace(/\s+/g, "")).pipe(z.string().regex(/^\d{9}$/, "NUIT: 9 dígitos"))),
});

export type StepPersonalInput = z.input<typeof stepPersonalSchema>;
export type StepPersonalParsed = z.output<typeof stepPersonalSchema>;

/** Passo 2 — contactos. */
export const stepContactsSchema = z.object({
  phone: phoneMzSchema,
  phoneAlt: opcionalComVazio(phoneAltMzSchema),
  province: z.enum(PROVINCES),
  city: z.string().trim().min(2).max(80),
  neighbourhood: opcionalComVazio(z.string().trim().min(1).max(80)),
});

export type StepContactsInput = z.input<typeof stepContactsSchema>;
export type StepContactsParsed = z.output<typeof stepContactsSchema>;

/**
 * Passo 3 — formação: instituição e curso do catálogo, ou "Outra"/"Outro"
 * com nome (gera elegibilidade TO_CONFIRM no incremento de elegibilidade);
 * data de conclusão conforme o estatuto (RN-ELG-02 e RN-ELG-03).
 */
export const stepEducationSchema = z
  .object({
    institutionId: idCurto.optional(),
    institutionOther: z.string().trim().min(1).max(150).optional(),
    courseId: idCurto.optional(),
    courseOther: z.string().trim().min(1).max(150).optional(),
    academicStatus: z.enum(ACADEMIC_STATUSES),
    graduationDate: z.coerce.date(),
    declaredAverage: z
      .number()
      .min(0)
      .max(20)
      .refine((v) => Math.round(v * 100) === v * 100, "Até duas casas decimais"),
  })
  .refine((d) => Boolean(d.institutionId) !== Boolean(d.institutionOther), "Indica a instituição do catálogo ou marca Outra com o nome")
  .refine((d) => Boolean(d.courseId) !== Boolean(d.courseOther), "Indica o curso do catálogo ou marca Outro com o nome")
  .refine(
    (d) => {
      const hoje = new Date();
      if (d.academicStatus === "FINALIST") {
        const primeiroDiaDoMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
        return d.graduationDate.getTime() >= primeiroDiaDoMes.getTime();
      }
      return d.graduationDate.getTime() <= hoje.getTime();
    },
    {
      message: "Finalista: conclusão prevista a partir do mês corrente; graduado: conclusão real até hoje (RN-ELG-02/03)",
    },
  );

export type StepEducationInput = z.input<typeof stepEducationSchema>;
export type StepEducationParsed = z.output<typeof stepEducationSchema>;

/** Passo 4 — idiomas, competências e disponibilidade. */
export const stepSkillsSchema = z.object({
  languages: z
    .array(z.object({ language: z.string().trim().min(1).max(50), level: z.enum(LANGUAGE_LEVELS) }))
    .optional()
    .default([]),
  skillIds: z.array(idCurto).max(20, "Até 20 competências do catálogo").optional().default([]),
  availableLocationIds: z.array(idCurto).min(1, "Pelo menos um local de disponibilidade"),
});

export type StepSkillsInput = z.input<typeof stepSkillsSchema>;
export type StepSkillsParsed = z.output<typeof stepSkillsSchema>;

/** Passos do perfil (RF-CAN-01), pela ordem do indicador de progresso. */
export const PROFILE_STEPS = ["pessoais", "contactos", "formacao", "competencias", "documentos"] as const;

export type ProfileStep = (typeof PROFILE_STEPS)[number];

/**
 * Passos já concluídos a partir do perfil guardado — alimenta o indicador de
 * progresso (RF-CAN-01). Documentos conta quando houver documentos válidos
 * (incremento de documentos).
 */
export function completedSteps(perfil: {
  fullName?: string | null;
  birthDate?: Date | null;
  biNumberHash?: string | null;
  phoneE164?: string | null;
  province?: string | null;
  institutionId?: string | null;
  institutionOther?: string | null;
  courseId?: string | null;
  courseOther?: string | null;
  academicStatus?: string | null;
  graduationDate?: Date | null;
  declaredAverage?: unknown;
  availableLocationsJson?: string | null;
  documentsValidated?: number;
}): ProfileStep[] {
  const concluidos: ProfileStep[] = [];
  if (perfil.fullName && perfil.birthDate && perfil.biNumberHash) concluidos.push("pessoais");
  if (perfil.phoneE164 && perfil.province) concluidos.push("contactos");
  if ((perfil.institutionId || perfil.institutionOther) && (perfil.courseId || perfil.courseOther) && perfil.academicStatus && perfil.graduationDate && perfil.declaredAverage != null) {
    concluidos.push("formacao");
  }
  const locais = perfil.availableLocationsJson ? (JSON.parse(perfil.availableLocationsJson) as string[]) : [];
  if (locais.length > 0) concluidos.push("competencias");
  if ((perfil.documentsValidated ?? 0) > 0) concluidos.push("documentos");
  return concluidos;
}
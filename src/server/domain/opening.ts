import { z } from "zod";

/**
 * RF-VAG-01: pedido de vaga (criação em rascunho e edição enquanto não
 * publicado). RN-VAG-02: os pesos do score são inteiros que somam 100 —
 * quando a vaga não tiver disciplinas-chave ou competências, o peso
 * correspondente é ignorado e os restantes normalizam-se (RN-TRI-02).
 * RF-VAG-06: depois de publicada só a descrição e o prazo mudam; o perfil de
 * score pode mudar até ao fecho.
 */

const idCurto = z.string().min(1).max(30);

export const scoringWeightsSchema = z.object({
  academic: z.number().int().min(0).max(100),
  keySubjects: z.number().int().min(0).max(100),
  skills: z.number().int().min(0).max(100),
});

/** Pesos do score: inteiros que somam 100 (RN-VAG-02). */
export const scoringWeightsSumSchema = scoringWeightsSchema.refine(
  (w) => w.academic + w.keySubjects + w.skills === 100,
  { message: "Os pesos do score devem somar 100 (RN-VAG-02)" },
);

/** Pedido de vaga em rascunho (RF-VAG-01). */
export const openingDraftSchema = z.object({
  title: z.string().trim().min(1).max(150),
  departmentId: idCurto,
  locationId: idCurto,
  cycleId: idCurto.optional(),
  positions: z.number().int().min(1).max(20),
  description: z.string().trim().min(1).max(4000),
  requirements: z.string().trim().min(1).max(4000),
  acceptsFinalists: z.boolean(),
  acceptsGraduates: z.boolean(),
  /** RF-VAG-01: cursos ou áreas aceites — pelo menos um entre os dois. */
  courseIds: z.array(idCurto).max(50),
  fieldOfStudyIds: z.array(idCurto).max(50),
  durationMonths: z.number().int().min(1).max(12),
  expectedStartDate: z.coerce.date(),
  stipendAmount: z.number().min(0).max(1_000_000).optional(),
  stipendVisible: z.boolean().optional().default(false),
  proposedTutorUserId: idCurto.optional(),
  keySubjects: z.array(z.object({ keySubjectId: idCurto, weight: z.number().int().min(1).max(5) })).max(10),
  skills: z
    .array(z.object({ skillId: idCurto, required: z.boolean(), weight: z.number().int().min(1).max(5) }))
    .max(15),
  scoringWeights: scoringWeightsSumSchema,
});

/** RF-VAG-01: estatutos aceites (pelo menos um) e cursos ou áreas (pelo menos um). */
export const openingDraftCompleteSchema = openingDraftSchema
  .refine((d) => d.acceptsFinalists || d.acceptsGraduates, {
    message: "Aceita finalistas, graduados ou ambos (RF-VAG-01)",
  })
  .refine((d) => d.courseIds.length + d.fieldOfStudyIds.length > 0, {
    message: "Pelo menos um curso ou área aceite (RF-VAG-01)",
  });

export type OpeningDraftInput = z.infer<typeof openingDraftSchema>;

/** Edição de vaga publicada (RF-VAG-06): só descrição e prazo. */
export const openingPublishedEditSchema = z.object({
  description: z.string().trim().min(1).max(4000).optional(),
  applicationCloseAt: z.coerce.date().optional(),
});

export type OpeningPublishedEditInput = z.infer<typeof openingPublishedEditSchema>;

/**
 * Perfil de score editável até ao fecho (RF-VAG-06): disciplinas-chave,
 * competências e pesos. A alteração dispara o recálculo (RF-TRI-04, M3).
 */
export const openingScoringSchema = z.object({
  keySubjects: z.array(z.object({ keySubjectId: idCurto, weight: z.number().int().min(1).max(5) })).max(10),
  skills: z
    .array(z.object({ skillId: idCurto, required: z.boolean(), weight: z.number().int().min(1).max(5) }))
    .max(15),
  scoringWeights: scoringWeightsSumSchema,
});

export type OpeningScoringInput = z.infer<typeof openingScoringSchema>;

/** Publicação (RF-VAG-03): janela de candidatura coerente. */
export const openingPublicationSchema = z
  .object({
    applicationOpenAt: z.coerce.date(),
    applicationCloseAt: z.coerce.date(),
  })
  .refine((w) => w.applicationOpenAt.getTime() < w.applicationCloseAt.getTime(), {
    message: "A abertura deve ser anterior ao fecho (RF-VAG-03)",
  });

export type OpeningPublicationInput = z.infer<typeof openingPublicationSchema>;

/** Pesos por omissão (P-36, ver docs/PERGUNTAS.md): 60/20/20. */
export const DEFAULT_SCORING_WEIGHTS = { academic: 60, keySubjects: 20, skills: 20 } as const;
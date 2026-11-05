/**
 * Máquina de estados da vaga (D.2) como dados: a única fonte usada pelo
 * serviço (RF-VAG-02). Cada mudança de estado DEVE verificar a transição
 * contra esta tabela, a permissão (C.3), gravar auditoria e enfileirar as
 * notificações — tudo na mesma transacção. Os testes tentam todas as
 * transições não permitidas.
 */

export const OPENING_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "PUBLISHED",
  "CLOSED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OpeningStatus = (typeof OPENING_STATUSES)[number];

/** Actores da D.2 — os mesmos papéis da matriz C.3, mais o agendador. */
export type OpeningActor = "DEPARTMENT_HEAD" | "HR_OFFICER" | "HR_MANAGER" | "SYSTEM";

/** Condições declaradas na D.2; a validação concreta é feita no serviço. */
export type OpeningCondition =
  | "fieldsComplete" // RF-VAG-01
  | "commentRequired" // devolução com comentário visível ao chefe
  | "publicationWindow" // applicationOpenAt < applicationCloseAt ≤ futuro
  | "reopenReason" // novo prazo no futuro + motivo (auditado)
  | "applicationsTerminal" // todas as candidaturas em estado terminal
  | "cancelReason"; // motivo obrigatório

export type OpeningTransition = {
  /** Estado de origem; `null` = criação, X */
  from: OpeningStatus | "ANY" | null;
  to: OpeningStatus;
  actors: OpeningActor[];
  conditions: OpeningCondition[];
};

export const OPENING_TRANSITIONS: OpeningTransition[] = [
  { from: null, to: "DRAFT", actors: ["DEPARTMENT_HEAD", "HR_OFFICER", "HR_MANAGER"], conditions: [] },
  {
    from: "DRAFT",
    to: "SUBMITTED",
    actors: ["DEPARTMENT_HEAD", "HR_OFFICER", "HR_MANAGER"],
    conditions: ["fieldsComplete"],
  },
  { from: "SUBMITTED", to: "DRAFT", actors: ["HR_MANAGER"], conditions: ["commentRequired"] },
  { from: "SUBMITTED", to: "APPROVED", actors: ["HR_MANAGER"], conditions: [] },
  {
    from: "APPROVED",
    to: "PUBLISHED",
    actors: ["HR_OFFICER", "HR_MANAGER"],
    conditions: ["publicationWindow"],
  },
  { from: "PUBLISHED", to: "CLOSED", actors: ["SYSTEM", "HR_OFFICER", "HR_MANAGER"], conditions: [] },
  {
    from: "CLOSED",
    to: "PUBLISHED",
    actors: ["HR_MANAGER"],
    conditions: ["reopenReason"],
  },
  {
    from: "CLOSED",
    to: "COMPLETED",
    actors: ["HR_OFFICER", "HR_MANAGER"],
    conditions: ["applicationsTerminal"],
  },
  {
    from: "ANY",
    to: "CANCELLED",
    actors: ["HR_MANAGER"],
    conditions: ["cancelReason"],
  },
];

/** Estados terminais: nenhuma transição parte deles (excepto o próprio ANY). */
export const OPENING_TERMINAL_STATUSES: readonly OpeningStatus[] = ["COMPLETED", "CANCELLED"];

/**
 * Verifica se a transição é permitida para o actor. `from = null` é a
 * criação; `ANY` cobre todos os estados excepto `COMPLETED` e `CANCELLED` (D.2).
 */
export function canTransition(
  from: OpeningStatus | null,
  to: OpeningStatus,
  actor: OpeningActor,
): boolean {
  return OPENING_TRANSITIONS.some((t) => {
    const fromMatches =
      t.from === from || (t.from === "ANY" && from !== null && from !== "COMPLETED" && from !== "CANCELLED");
    return fromMatches && t.to === to && t.actors.includes(actor);
  });
}

/** Lança `TransitionError` se a transição não for permitida (D.2). */
export function assertTransition(
  from: OpeningStatus | null,
  to: OpeningStatus,
  actor: OpeningActor,
): void {
  if (!canTransition(from, to, actor)) {
    throw new TransitionError(
      `Transição de vaga ${from ?? "(nova)"} → ${to} não permitida para ${actor} (D.2)`,
    );
  }
}

/** Condições exigidas pela transição (o serviço valida o concreto). */
export function requiredConditions(from: OpeningStatus | null, to: OpeningStatus): OpeningCondition[] {
  return OPENING_TRANSITIONS.filter(
    (t) =>
      (t.from === from || (t.from === "ANY" && from !== null && from !== "COMPLETED" && from !== "CANCELLED")) &&
      t.to === to,
  ).flatMap((t) => t.conditions);
}

/** Actores que podem partir de um estado (para a interface). */
export function transitionsFrom(from: OpeningStatus | null): Array<{ to: OpeningStatus; actors: OpeningActor[] }> {
  return OPENING_TRANSITIONS.filter(
    (t) => t.from === from || (t.from === "ANY" && from !== null && from !== "COMPLETED" && from !== "CANCELLED"),
  ).map((t) => ({ to: t.to, actors: t.actors }));
}

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}
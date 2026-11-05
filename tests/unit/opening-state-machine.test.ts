import { describe, expect, it } from "vitest";

import {
  OPENING_STATUSES,
  OPENING_TRANSITIONS,
  assertTransition,
  canTransition,
  requiredConditions,
  transitionsFrom,
  TransitionError,
  type OpeningActor,
} from "@/server/domain/state-machines/opening";

/**
 * Máquina de estados da vaga (D.2, RF-VAG-02): tenta TODAS as transições
 * (incluindo as não listadas) e verifica quem as pode fazer.
 */

const ACTORES: OpeningActor[] = ["DEPARTMENT_HEAD", "HR_OFFICER", "HR_MANAGER", "SYSTEM"];

/** Transições permitidas da D.2, com os actores de cada linha. */
const PERMITIDAS: Array<{ from: string | null; to: string; actors: OpeningActor[] }> = [
  { from: null, to: "DRAFT", actors: ["DEPARTMENT_HEAD", "HR_OFFICER", "HR_MANAGER"] },
  { from: "DRAFT", to: "SUBMITTED", actors: ["DEPARTMENT_HEAD", "HR_OFFICER", "HR_MANAGER"] },
  { from: "SUBMITTED", to: "DRAFT", actors: ["HR_MANAGER"] },
  { from: "SUBMITTED", to: "APPROVED", actors: ["HR_MANAGER"] },
  { from: "APPROVED", to: "PUBLISHED", actors: ["HR_OFFICER", "HR_MANAGER"] },
  { from: "PUBLISHED", to: "CLOSED", actors: ["SYSTEM", "HR_OFFICER", "HR_MANAGER"] },
  { from: "CLOSED", to: "PUBLISHED", actors: ["HR_MANAGER"] },
  { from: "CLOSED", to: "COMPLETED", actors: ["HR_OFFICER", "HR_MANAGER"] },
  {
    from: "ANY",
    to: "CANCELLED",
    actors: ["HR_MANAGER"],
  },
];

function permitida(from: string | null, to: string, actor: OpeningActor): boolean {
  return PERMITIDAS.some(
    (t) =>
      (t.from === from ||
        (t.from === "ANY" && from !== null && from !== "COMPLETED" && from !== "CANCELLED")) &&
      t.to === to &&
      t.actors.includes(actor),
  );
}

describe("máquina de estados da vaga (D.2, RF-VAG-02)", () => {
  it("tenta todas as combinações: só as linhas da D.2 passam", () => {
    const estados: Array<string | null> = [...OPENING_STATUSES, null];
    for (const from of estados) {
      for (const to of OPENING_STATUSES) {
        for (const actor of ACTORES) {
          const esperado = permitida(from, to, actor);
          expect(canTransition(from as never, to, actor), `${from} → ${to} (${actor})`).toBe(esperado);
        }
      }
    }
  });

  it("estados terminais não têm saída", () => {
    for (const to of OPENING_STATUSES) {
      for (const actor of ACTORES) {
        expect(canTransition("COMPLETED", to, actor)).toBe(false);
        expect(canTransition("CANCELLED", to, actor)).toBe(false);
      }
    }
    // Nem o self-loop em CANCELLED: a D.2 diz "qualquer excepto COMPLETED",
    // mas um pedido já cancelado não se cancela outra vez.
    expect(canTransition("CANCELLED", "CANCELLED", "HR_MANAGER")).toBe(false);
  });

  it("o sistema só fecha (PUBLISHED → CLOSED), como agendador", () => {
    expect(canTransition("PUBLISHED", "CLOSED", "SYSTEM")).toBe(true);
    expect(canTransition("DRAFT", "SUBMITTED", "SYSTEM")).toBe(false);
    expect(canTransition("APPROVED", "PUBLISHED", "SYSTEM")).toBe(false);
  });

  it("a devolução e a aprovação são só do Gestor de RH", () => {
    expect(canTransition("SUBMITTED", "DRAFT", "HR_OFFICER")).toBe(false);
    expect(canTransition("SUBMITTED", "APPROVED", "HR_OFFICER")).toBe(false);
    expect(canTransition("SUBMITTED", "DRAFT", "HR_MANAGER")).toBe(true);
    expect(canTransition("SUBMITTED", "APPROVED", "HR_MANAGER")).toBe(true);
  });

  it("a reabertura é só do Gestor de RH; o fecho manual também cabe ao RH", () => {
    expect(canTransition("CLOSED", "PUBLISHED", "HR_MANAGER")).toBe(true);
    expect(canTransition("CLOSED", "PUBLISHED", "HR_OFFICER")).toBe(false);
    expect(canTransition("PUBLISHED", "CLOSED", "HR_OFFICER")).toBe(true);
  });

  it("assertTransition lança nas não permitidas e passa nas permitidas", () => {
    expect(() => assertTransition("DRAFT", "PUBLISHED", "HR_OFFICER")).toThrow(TransitionError);
    expect(() => assertTransition("DRAFT", "SUBMITTED", "DEPARTMENT_HEAD")).not.toThrow();
  });

  it("condições exigidas por transição (D.2)", () => {
    expect(requiredConditions("DRAFT", "SUBMITTED")).toEqual(["fieldsComplete"]);
    expect(requiredConditions("SUBMITTED", "DRAFT")).toEqual(["commentRequired"]);
    expect(requiredConditions("APPROVED", "PUBLISHED")).toEqual(["publicationWindow"]);
    expect(requiredConditions("CLOSED", "PUBLISHED")).toEqual(["reopenReason"]);
    expect(requiredConditions("CLOSED", "COMPLETED")).toEqual(["applicationsTerminal"]);
    expect(requiredConditions("DRAFT", "CANCELLED")).toEqual(["cancelReason"]);
  });

  it("transitionsFrom lista as saídas úteis para a interface", () => {
    const de = transitionsFrom("APPROVED");
    expect(de).toHaveLength(2);
    expect(de.map((t) => t.to).sort()).toEqual(["CANCELLED", "PUBLISHED"]);
  });

  it("a tabela não tem linhas duplicadas nem estados fora do catálogo", () => {
    const chaves = new Set(
      OPENING_TRANSITIONS.map((t) => `${t.from ?? "null"}→${t.to}`),
    );
    expect(chaves.size).toBe(OPENING_TRANSITIONS.length);
    for (const t of OPENING_TRANSITIONS) {
      expect(OPENING_STATUSES).toContain(t.to);
    }
  });
});
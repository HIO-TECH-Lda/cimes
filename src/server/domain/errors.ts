/**
 * Erros de domínio partilhados (G.5, R-04). Sem permissão sobre um registo é 404,
 * nunca 403 — não revelar a existência do registo.
 */
export class NotFoundError extends Error {
  constructor(message = "Registo não encontrado") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Acesso negado") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Conflito com o estado actual (ex.: BI já noutra conta, RF-CAN-03) — 409. */
export class ConflictError extends Error {
  constructor(message = "Conflito com o estado actual") {
    super(message);
    this.name = "ConflictError";
  }
}
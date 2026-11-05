/**
 * Código sequencial `PREFIXO-AAAA-NNNN` (RF-VAG-05): o contador por ano vive
 * na tabela `SequenceCounter` (Anexo A); a formatação é função pura aqui.
 */

export type SequencePrefix = "VAG" | "CAN" | "APP";

/** Formata `VAG-2027-0001`; o número vem de `SequenceCounter`. */
export function formatSequenceCode(prefix: SequencePrefix, year: number, value: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error(`Ano inválido para código de sequência: ${year}`);
  }
  if (!Number.isInteger(value) || value < 0 || value > 9999) {
    throw new Error(`Valor inválido para código de sequência: ${value}`);
  }
  return `${prefix}-${year}-${String(value).padStart(4, "0")}`;
}

/** Chave do contador (`VAG-2027`), sequencial por ano de criação. */
export function sequenceKey(prefix: SequencePrefix, year: number): string {
  return `${prefix}-${year}`;
}
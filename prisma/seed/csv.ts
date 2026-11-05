/**
 * Leitor de CSV dos seeds (Anexo F): separador `;`, sem aspas (os dados
 * iniciais não contêm ponto-e-vírgula); colunas por cabeçalho; listas internas
 * usam `|`. Erro claro se faltar uma coluna.
 */

export type CsvRow = Record<string, string>;

export function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0]?.split(";").map((h) => h.trim()) ?? [];
  if (headers.some((h) => h.length === 0)) {
    throw new Error("CSV com cabeçalho vazio");
  }
  return lines.slice(1).map((line) => {
    const values = line.split(";");
    if (values.length !== headers.length) {
      throw new Error(`CSV: linha com ${values.length} colunas, esperadas ${headers.length}: ${line.slice(0, 60)}`);
    }
    const row: CsvRow = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").trim();
    });
    return row;
  });
}

/** Sinónimos de uma célula com `|` para JSON do modelo. */
export function synonymsToJson(cell: string): string {
  const synonyms = cell
    .split("|")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return JSON.stringify(synonyms);
}
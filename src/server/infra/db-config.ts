/**
 * Analisa o URL `sqlserver://` no formato do Anexo I (Prisma) e devolve a configuração
 * do `PrismaMssql` (G.4). Formato: `sqlserver://[utilizador:senha@]servidor[:porta];database=…;user=…;password=…`
 * As opções do construtor foram confirmadas na documentação oficial da versão fixada
 * (R-20, ADR-0001).
 */
export type MssqlConnectionConfig = {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  options: { encrypt: boolean; trustServerCertificate: boolean; maxPoolSize: number };
};

export class DbUrlError extends Error {}

export function parseSqlserverUrl(rawUrl: string, poolMax = 10): MssqlConnectionConfig {
  // O formato do Prisma usa `;` após a autoridade, o que `new URL()` não consegue
  // analisar; separar manualmente a autoridade e os parâmetros separados por `;`.
  if (!rawUrl.startsWith("sqlserver://")) {
    throw new DbUrlError("DATABASE_URL não é um URL sqlserver:// válido");
  }
  const rest = rawUrl.slice("sqlserver://".length);
  const [authorityPart = "", ...paramSegmentsRaw] = rest.split(";").map((s) => s.trim());
  const paramSegments = paramSegmentsRaw.filter((s) => s.length > 0);

  // Userinfo opcional: utilizador:senha@servidor[:porta]
  let user = "";
  let password = "";
  let authority = authorityPart;
  const atIndex = authorityPart.lastIndexOf("@");
  if (atIndex !== -1) {
    const userinfo = decodeURIComponent(authorityPart.slice(0, atIndex));
    authority = authorityPart.slice(atIndex + 1);
    const colon = userinfo.indexOf(":");
    user = colon === -1 ? userinfo : userinfo.slice(0, colon);
    password = colon === -1 ? "" : userinfo.slice(colon + 1);
  }

  const params = new Map<string, string>();
  for (const segment of paramSegments) {
    const eq = segment.indexOf("=");
    const key = (eq === -1 ? segment : segment.slice(0, eq)).toLowerCase();
    params.set(key, eq === -1 ? "" : decodeURIComponent(segment.slice(eq + 1)));
  }

  // `;user=` e `;password=` têm prioridade sobre o userinfo (formato Prisma).
  user = params.get("user") ?? user;
  password = params.get("password") ?? password;

  const database = params.get("database");
  if (!database) throw new DbUrlError("DATABASE_URL sem ;database=");
  if (user.length === 0 || password.length === 0) {
    throw new DbUrlError("DATABASE_URL sem utilizador ou senha");
  }

  // Servidor[:porta]; porta por omissão 1433.
  const colonIndex = authority.lastIndexOf(":");
  let server = authority;
  let port = 1433;
  if (colonIndex !== -1) {
    const portText = authority.slice(colonIndex + 1);
    const parsedPort = Number(portText);
    if (portText.length > 0 && Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535) {
      server = authority.slice(0, colonIndex);
      port = parsedPort;
    }
  }
  if (server.length === 0) throw new DbUrlError("DATABASE_URL sem servidor");

  return {
    server,
    port,
    database,
    user,
    password,
    options: {
      encrypt: params.get("encrypt") !== "false",
      trustServerCertificate: params.get("trustServerCertificate") === "true",
      maxPoolSize: poolMax,
    },
  };
}
import { describe, expect, it } from "vitest";

import { DbUrlError, parseSqlserverUrl } from "@/server/infra/db-config";

describe("parseSqlserverUrl (G.4)", () => {
  it("analisa o formato do Anexo I", () => {
    const cfg = parseSqlserverUrl(
      "sqlserver://HOST:1433;database=cimes;user=cimes_app;password=s3gredo;encrypt=true;trustServerCertificate=false",
      12,
    );
    expect(cfg).toEqual({
      server: "HOST",
      port: 1433,
      database: "cimes",
      user: "cimes_app",
      password: "s3gredo",
      options: { encrypt: true, trustServerCertificate: false, maxPoolSize: 12 },
    });
  });

  it("usa a porta 1433 e encrypt=true por omissão", () => {
    const cfg = parseSqlserverUrl("sqlserver://db;database=cimes;user=u;password=p");
    expect(cfg.port).toBe(1433);
    expect(cfg.options.encrypt).toBe(true);
    expect(cfg.options.maxPoolSize).toBe(10);
  });

  it("rejeita URLs sem utilizador, senha ou base de dados", () => {
    expect(() => parseSqlserverUrl("sqlserver://db:1433;database=cimes")).toThrow(DbUrlError);
    expect(() => parseSqlserverUrl("sqlserver://u:p@db:1433")).toThrow(DbUrlError);
    expect(() => parseSqlserverUrl("https://db:1433;database=cimes")).toThrow(DbUrlError);
    expect(() => parseSqlserverUrl("não é um url")).toThrow(DbUrlError);
  });
});
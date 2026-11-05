import { describe, expect, it } from "vitest";

import { loadConfig } from "@/server/infra/config";

const KEY = Buffer.alloc(32, 7).toString("base64");

const validEnv = {
  PUBLIC_BASE_URL: "https://estagios.test",
  DATABASE_URL: "sqlserver://db:1433;database=cimes;user=app;password=s3gredo;encrypt=true;trustServerCertificate=false",
  BETTER_AUTH_SECRET: "s".repeat(32),
  FILE_STORAGE_PATH: "C:/tmp/storage",
  FILE_ENCRYPTION_KEYS: JSON.stringify({ k1: KEY }),
  FILE_ENCRYPTION_ACTIVE_KEY_ID: "k1",
  PII_ENCRYPTION_KEYS: JSON.stringify({ p1: KEY }),
  PII_ENCRYPTION_ACTIVE_KEY_ID: "p1",
  PII_HMAC_KEY: KEY,
  MAIL_TRANSPORT: "memory",
};

describe("RNF-05 validação de variáveis de ambiente", () => {
  it("aceita um ambiente completo e aplica os valores por omissão", () => {
    const cfg = loadConfig(validEnv);
    expect(cfg.publicBaseUrl).toBe("https://estagios.test");
    expect(cfg.databasePoolMax).toBe(10);
    expect(cfg.logLevel).toBe("info");
    expect(cfg.aiProvider).toBe("disabled");
    expect(cfg.aiFeatures).toEqual({ transcript: false, cv: false, nlq: false });
    expect(cfg.avScan).toBe("none");
    expect(cfg.internalAllowedCidrs).toEqual(["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]);
  });

  it("rejeita um ambiente sem variáveis obrigatórias, com mensagem clara", () => {
    expect(() => loadConfig({})).toThrow(/Configuração inválida/);
  });

  it("rejeita segredos curtos (BETTER_AUTH_SECRET < 32)", () => {
    expect(() => loadConfig({ ...validEnv, BETTER_AUTH_SECRET: "curto" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejeita chaves de cifra que não tenham 32 bytes", () => {
    const short = Buffer.alloc(16, 1).toString("base64");
    expect(() => loadConfig({ ...validEnv, PII_HMAC_KEY: short })).toThrow(/32 bytes/);
  });

  it("rejeita FILE_ENCRYPTION_KEYS inválido (JSON avariado)", () => {
    expect(() => loadConfig({ ...validEnv, FILE_ENCRYPTION_KEYS: "{não é json}" })).toThrow(/Configuração inválida/);
  });

  it("rejeita uma chave activa que não existe no anel", () => {
    expect(() => loadConfig({ ...validEnv, FILE_ENCRYPTION_ACTIVE_KEY_ID: "inexistente" })).toThrow(
      /FILE_ENCRYPTION_ACTIVE_KEY_ID/,
    );
  });

  it("rejeita um URL de base de dados que não seja sqlserver://", () => {
    expect(() =>
      loadConfig({ ...validEnv, DATABASE_URL: "postgres://db/cimes" }),
    ).toThrow(/sqlserver:\/\//);
  });
});
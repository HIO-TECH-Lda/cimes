import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decryptPii, encryptPii, piiHmac } from "@/server/infra/pii";

/**
 * Campos sensíveis (G.7, RF-CAN-03): formato `v1:keyId:iv:cifra:tag`,
 * ida-e-volta, detecção de adulteração pela etiqueta GCM, HMAC determinístico.
 * As chaves vêm do ambiente (mesmo padrão dos testes de integração).
 */

const KEY = Buffer.alloc(32, 9).toString("base64");

process.env.PUBLIC_BASE_URL ??= "http://localhost:3100";
process.env.BETTER_AUTH_SECRET ??= "s".repeat(32);
process.env.FILE_STORAGE_PATH ??= ".tmp-storage";
process.env.FILE_ENCRYPTION_KEYS ??= JSON.stringify({ ktest: KEY });
process.env.FILE_ENCRYPTION_ACTIVE_KEY_ID ??= "ktest";
process.env.PII_ENCRYPTION_KEYS ??= JSON.stringify({ ptest: KEY, pvelha: Buffer.alloc(32, 3).toString("base64") });
process.env.PII_ENCRYPTION_ACTIVE_KEY_ID ??= "ptest";
process.env.PII_HMAC_KEY ??= Buffer.alloc(32, 5).toString("base64");
process.env.MAIL_TRANSPORT ??= "memory";
process.env.DATABASE_URL ??= "sqlserver://localhost:1433;database=piitest;user=sa;password=x;encrypt=false;trustServerCertificate=true";

describe("cifra PII (BI/ NUIT, `v1:keyId:iv:cifra:tag`)", () => {
  it("cifra e abre com ida-e-volta; IV aleatório produz cifras distintas", () => {
    const a = encryptPii("110100123456B");
    const b = encryptPii("110100123456B");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:ptest:")).toBe(true);
    expect(decryptPii(a)).toBe("110100123456B");
    expect(decryptPii(b)).toBe("110100123456B");
  });

  it("abre valores cifrados com uma chave antiga do anel (rotação)", () => {
    const key = Buffer.alloc(32, 3);
    const iv = randomBytes(12);
    const cifra = createCipheriv("aes-256-gcm", key, iv);
    const texto = Buffer.concat([cifra.update("100456789", "utf8"), cifra.final()]);
    const payload = `v1:pvelha:${iv.toString("base64")}:${texto.toString("base64")}:${cifra.getAuthTag().toString("base64")}`;
    expect(decryptPii(payload)).toBe("100456789");
  });

  it("recusa valor adulterado (etiqueta GCM) e chave desconhecida", () => {
    const payload = encryptPii("110100123456B");
    const partes = payload.split(":");
    const adulterado = [partes[0], partes[1], partes[2], Buffer.from("x").toString("base64"), partes[4]].join(":");
    expect(() => decryptPii(adulterado)).toThrow();
    const chaveEstranha = payload.replace(/^v1:ptest:/, "v1:fora:");
    expect(() => decryptPii(chaveEstranha)).toThrow(/anel/);
    expect(() => decryptPii("texto-livre")).toThrow(/Formato/);
  });

  it("HMAC do BI é determinístico e distingue valores", () => {
    expect(piiHmac("110100123456B")).toBe(piiHmac("110100123456B"));
    expect(piiHmac("110100123456B")).not.toBe(piiHmac("110100123456C"));
    expect(piiHmac("x")).toHaveLength(64);
  });
});
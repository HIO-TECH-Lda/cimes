import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Captcha local ALTCHA (RF-AUT-03, P-…: prova de trabalho, sem serviço externo).
 * Esquema SHA-256: o cliente recebe `{algorithm, challenge, salt, signature}` e
 * procura o `number` tal que `sha256(salt + number) === challenge`; a resposta
 * (payload JSON em base64) volta ao servidor, que confirma a assinatura HMAC
 * do desafio e o número encontrado. O `salt` inclui o instante de expiração
 * (`expiry=<ms>?r=<aleatório>`), ao mesmo tempo guard contra repetição tardia.
 */

export type AltchaChallenge = {
  algorithm: "SHA-256";
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
};

export type AltchaPayload = {
  algorithm: string;
  challenge: string;
  number: number;
  salt: string;
  signature: string;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutos de validade do desafio
const DEFAULT_MAX_NUMBER = 100_000; // custo da prova de trabalho

function hmacSign(hmacKey: string, value: string): string {
  return createHmac("sha256", hmacKey).update(value).digest("hex");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Gera um desafio novo (server-side). */
export function createChallenge(
  hmacKey: string,
  options?: { now?: Date; ttlMs?: number; maxnumber?: number },
): AltchaChallenge {
  const now = options?.now ?? new Date();
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const maxnumber = options?.maxnumber ?? DEFAULT_MAX_NUMBER;
  const salt = `expiry:${now.getTime() + ttlMs}?r=${randomBytes(8).toString("hex")}`;
  const number = Math.floor(Math.random() * maxnumber);
  const challenge = sha256(`${salt}${number}`);
  return {
    algorithm: "SHA-256",
    challenge,
    maxnumber,
    salt,
    signature: hmacSign(hmacKey, challenge),
  };
}

/** Verifica um payload ALTCHA (base64 do JSON submetido pelo formulário). */
export function verifySolution(
  base64Payload: string,
  hmacKey: string,
  options?: { now?: Date },
): { ok: boolean; reason?: "MALFORMED" | "ALGORITHM" | "SIGNATURE" | "CHALLENGE" | "EXPIRED" } {
  let payload: AltchaPayload;
  try {
    payload = JSON.parse(Buffer.from(base64Payload, "base64").toString("utf8")) as AltchaPayload;
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (payload.algorithm !== "SHA-256") return { ok: false, reason: "ALGORITHM" };

  const expectedSignature = hmacSign(hmacKey, payload.challenge);
  const given = Buffer.from(payload.signature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "SIGNATURE" };
  }
  if (sha256(`${payload.salt}${payload.number}`) !== payload.challenge) {
    return { ok: false, reason: "CHALLENGE" };
  }
  const expiryMatch = /^expiry:(\d+)/.exec(payload.salt);
  if (expiryMatch) {
    const expiry = Number(expiryMatch[1]);
    if (!Number.isFinite(expiry)) return { ok: false, reason: "MALFORMED" };
    const now = options?.now?.getTime() ?? Date.now();
    if (now > expiry) return { ok: false, reason: "EXPIRED" };
  }
  return { ok: true };
}
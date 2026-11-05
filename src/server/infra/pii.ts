import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

import { getConfig } from "./config";

/**
 * Campos sensíveis (BI e NUIT, linha "Campos sensíveis" da especificação):
 * AES-256-GCM com o anel `PII_ENCRYPTION_KEYS`, formato
 * `v1:keyId:iv:cifra:tag` em Base64, e HMAC-SHA-256 com `PII_HMAC_KEY`
 * para unicidade e pesquisa do BI (RF-CAN-03). A chave activa cifra;
 * a leitura resolve a chave pelo id no anel (rotação sem re-escrever).
 */

const FORMATO = /^v1:([A-Za-z0-9_-]+):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/;

function chaveActiva(): { keyId: string; key: Buffer } {
  const cfg = getConfig();
  const base64 = cfg.piiEncryptionKeys[cfg.piiEncryptionActiveKeyId];
  if (!base64) {
    throw new Error(`Chave PII activa "${cfg.piiEncryptionActiveKeyId}" nao existe no anel`);
  }
  return { keyId: cfg.piiEncryptionActiveKeyId, key: Buffer.from(base64, "base64") };
}

function chavePorId(keyId: string): Buffer | null {
  const cfg = getConfig();
  const base64 = cfg.piiEncryptionKeys[keyId];
  return base64 ? Buffer.from(base64, "base64") : null;
}

/** Cifra um valor sensível; devolve `v1:keyId:iv:cifra:tag`. */
export function encryptPii(plain: string): string {
  const { keyId, key } = chaveActiva();
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", key, iv);
  const texto = Buffer.concat([cifra.update(plain, "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();
  return `v1:${keyId}:${iv.toString("base64")}:${texto.toString("base64")}:${tag.toString("base64")}`;
}

/** Abre um valor cifrado; falha se a chave nao existir ou a etiqueta nao bater certo. */
export function decryptPii(payload: string): string {
  const match = FORMATO.exec(payload);
  if (!match) throw new Error("Formato PII desconhecido");
  const [, keyId, ivB64, textoB64, tagB64] = match;
  if (!keyId || !ivB64 || !textoB64 || !tagB64) throw new Error("Formato PII desconhecido");
  const key = chavePorId(keyId);
  if (!key) throw new Error(`Chave PII "${keyId}" nao existe no anel`);
  const abertura = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  abertura.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([abertura.update(Buffer.from(textoB64, "base64")), abertura.final()]).toString("utf8");
}

/** HMAC-SHA-256 hex de um valor sensível normalizado (unicidade do BI, RF-CAN-03). */
export function piiHmac(value: string): string {
  return createHmac("sha256", getConfig().piiHmacKey).update(value).digest("hex");
}
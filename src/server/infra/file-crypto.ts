import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";

import { getConfig } from "./config";

/**
 * Cifra por envelope dos ficheiros guardados (G.6, linha "Cifra por envelope"
 * da especificação): cada ficheiro tem uma DEK aleatória de 256 bits; o
 * conteúdo é cifrado com AES-256-GCM e a DEK é cifrada com a chave mestra
 * activa (`FILE_ENCRYPTION_KEYS`, `FILE_ENCRYPTION_ACTIVE_KEY_ID`). Cabeçalho
 * `CIMES1` com keyId, IV do conteúdo e DEK cifrada (com o seu IV e etiqueta);
 * a etiqueta de autenticação do conteúdo fica no fim. `rewrapEnvelope`
 * volta a cifrar a DEK com outra chave mestra sem tocar no conteúdo
 * (`npm run keys:rewrap`).
 *
 * Layout: `CIMES1` (6) · keyIdLen (1) · keyId · contentIv (12) · dekIv (12) ·
 * dekTag (16) · wrappedDek (32) · cifra · contentTag (16, no fim).
 */

const MAGIA = Buffer.from("CIMES1", "ascii");

function chaveMestra(keyId: string): Buffer {
  const cfg = getConfig();
  const base64 = cfg.fileEncryptionKeys[keyId];
  if (!base64) throw new Error(`Chave mestra "${keyId}" não existe no anel`);
  return Buffer.from(base64, "base64");
}

/** Cifra um ficheiro com envelope; devolve o buffer completo a guardar. */
export function encryptFileToBuffer(plaintext: Buffer): Buffer {
  const cfg = getConfig();
  const keyId = cfg.fileEncryptionActiveKeyId;
  const mestra = chaveMestra(keyId);

  const dek = randomBytes(32);
  const contentIv = randomBytes(12);
  const dekIv = randomBytes(12);

  const wrap = createCipheriv("aes-256-gcm", mestra, dekIv);
  const wrappedDek = Buffer.concat([wrap.update(dek), wrap.final()]);
  const dekTag = wrap.getAuthTag();

  const cifra = createCipheriv("aes-256-gcm", dek, contentIv);
  const corpo = Buffer.concat([cifra.update(plaintext), cifra.final()]);
  const contentTag = cifra.getAuthTag();

  const keyIdBytes = Buffer.from(keyId, "utf8");
  if (keyIdBytes.length > 255) throw new Error("keyId demasiado longo");

  return Buffer.concat([
    MAGIA,
    Buffer.from([keyIdBytes.length]),
    keyIdBytes,
    contentIv,
    dekIv,
    dekTag,
    wrappedDek,
    corpo,
    contentTag,
  ]);
}

function partirEnvelope(payload: Buffer): { keyId: string; contentIv: Buffer; dekIv: Buffer; dekTag: Buffer; wrappedDek: Buffer; corpo: Buffer; contentTag: Buffer } {
  if (payload.length < 6 + 1 + 12 + 12 + 16 + 32 + 16 || !payload.subarray(0, 6).equals(MAGIA)) {
    throw new Error("Ficheiro cifrado: formato CIMES1 desconhecido");
  }
  const keyIdLen = payload[6]!;
  let pos = 7;
  const keyId = payload.subarray(pos, pos + keyIdLen).toString("utf8");
  pos += keyIdLen;
  const contentIv = payload.subarray(pos, pos + 12);
  pos += 12;
  const dekIv = payload.subarray(pos, pos + 12);
  pos += 12;
  const dekTag = payload.subarray(pos, pos + 16);
  pos += 16;
  const wrappedDek = payload.subarray(pos, pos + 32);
  pos += 32;
  const corpo = payload.subarray(pos, payload.length - 16);
  const contentTag = payload.subarray(payload.length - 16);
  return { keyId, contentIv, dekIv, dekTag, wrappedDek, corpo, contentTag };
}

function dekDe(payload: Buffer, chave: Buffer): Buffer {
  const { dekIv, dekTag, wrappedDek } = partirEnvelope(payload);
  const abertura = createDecipheriv("aes-256-gcm", chave, dekIv);
  abertura.setAuthTag(dekTag);
  return Buffer.concat([abertura.update(wrappedDek), abertura.final()]);
}

/** Abre um ficheiro cifrado; falha se a etiqueta não bater certo ou a chave não existir. */
export function decryptFileToBuffer(payload: Buffer): Buffer {
  const { keyId, contentIv, corpo, contentTag } = partirEnvelope(payload);
  const dek = dekDe(payload, chaveMestra(keyId));
  const abertura = createDecipheriv("aes-256-gcm", dek, contentIv);
  abertura.setAuthTag(contentTag);
  return Buffer.concat([abertura.update(corpo), abertura.final()]);
}

/**
 * Volta a cifrar a DEK com a chave mestra activa, sem tocar no conteúdo
 * (útil na rotação de `FILE_ENCRYPTION_ACTIVE_KEY_ID`). A chave antiga tem de
 * continuar no anel.
 */
export function rewrapEnvelope(payload: Buffer): Buffer {
  const cfg = getConfig();
  const { keyId, contentIv, dekIv, corpo, contentTag } = partirEnvelope(payload);
  if (keyId === cfg.fileEncryptionActiveKeyId) return payload;
  const dek = dekDe(payload, chaveMestra(keyId));
  const wrap = createCipheriv("aes-256-gcm", chaveMestra(cfg.fileEncryptionActiveKeyId), dekIv);
  const novoWrapped = Buffer.concat([wrap.update(dek), wrap.final()]);
  const novoTag = wrap.getAuthTag();
  const novoKeyId = Buffer.from(cfg.fileEncryptionActiveKeyId, "utf8");
  if (novoKeyId.length > 255) throw new Error("keyId demasiado longo");
  return Buffer.concat([
    MAGIA,
    Buffer.from([novoKeyId.length]),
    novoKeyId,
    contentIv,
    dekIv,
    novoTag,
    novoWrapped,
    corpo,
    contentTag,
  ]);
}

/** storageKey novo para um ficheiro guardado: aaaa/mm/uuid. */
export function novoStorageKey(agora: Date): string {
  const ano = agora.getUTCFullYear();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, "0");
  return `${ano}/${mes}/${randomUUID()}`;
}
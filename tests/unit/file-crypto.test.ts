import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import {
  MAX_PDF_PAGES,
  MIME_JPEG,
  MIME_PDF,
  MIME_PNG,
  rebuildPdf,
  reencodeImage,
  sniffMime,
} from "@/server/domain/document";
import { DocumentValidationError } from "@/server/domain/errors";
import { decryptFileToBuffer, encryptFileToBuffer, rewrapEnvelope } from "@/server/infra/file-crypto";
import { resetConfigCache } from "@/server/infra/config";
import { deleteEncryptedFile, readEncryptedFile, saveEncryptedFile } from "@/server/infra/storage";

/**
 * G.6 + RF-DOC-05: envelope CIMES1 (ida-e-volta, adulteração, rotação), e
 * validação do conteúdo real (sniffing por bytes, reconstrução do PDF,
 * recodificação de imagens sem EXIF).
 */

const MASTER = Buffer.alloc(32, 11).toString("base64");
const MASTER_NOVA = Buffer.alloc(32, 12).toString("base64");

process.env.PUBLIC_BASE_URL ??= "http://localhost:3100";
process.env.BETTER_AUTH_SECRET ??= "s".repeat(32);
process.env.MAIL_TRANSPORT ??= "memory";
process.env.DATABASE_URL ??= "sqlserver://localhost:1433;database=filetest;user=sa;password=x;encrypt=false;trustServerCertificate=true";

const raizTeste = mkdtempSync(join(tmpdir(), "cimes-files-"));
process.env.FILE_STORAGE_PATH ??= raizTeste;
process.env.FILE_ENCRYPTION_KEYS ??= JSON.stringify({ ktest: MASTER, knova: MASTER_NOVA });
process.env.FILE_ENCRYPTION_ACTIVE_KEY_ID ??= "ktest";
process.env.PII_ENCRYPTION_KEYS ??= process.env.FILE_ENCRYPTION_KEYS;
process.env.PII_ENCRYPTION_ACTIVE_KEY_ID ??= "ktest";
process.env.PII_HMAC_KEY ??= MASTER;

async function pdfPequeno(paginas = 2): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i += 1) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

afterAll(() => {
  rmSync(raizTeste, { recursive: true, force: true });
});

describe("envelope CIMES1 (G.6)", () => {
  it("cifra e abre com ida-e-volta; conteúdo aleatório e tamanho sane", () => {
    const conteudo = randomBytes(4096);
    const envelope = encryptFileToBuffer(conteudo);
    expect(envelope.subarray(0, 6).toString("ascii")).toBe("CIMES1");
    expect(envelope.length).toBeGreaterThan(conteudo.length);
    expect(decryptFileToBuffer(envelope).equals(conteudo)).toBe(true);
  });

  it("recusa adulteração no corpo e chave fora do anel", () => {
    const envelope = encryptFileToBuffer(Buffer.from("documento sintético"));
    const adulterado = Buffer.from(envelope);
    const alvo = adulterado.length - 20;
    if (alvo < 0) throw new Error("envelope demasiado curto");
    adulterado[alvo] = (adulterado[alvo] ?? 0) ^ 0xff;
    expect(() => decryptFileToBuffer(adulterado)).toThrow();

    // um envelope cujo keyId aponta para chave ausente lança
    const outro = encryptFileToBuffer(Buffer.from("x"));
    if (outro[7] === undefined) throw new Error("envelope demasiado curto");
    outro[7] = 0x7a; // corrompe o primeiro byte do keyId -> chave inexistente
    expect(() => decryptFileToBuffer(outro)).toThrow(/anel|etiqueta/i);
  });

  it("rewrap muda a chave mestra da DEK sem tocar no conteúdo", () => {
    const conteudo = randomBytes(1000);
    const original = encryptFileToBuffer(conteudo);
    process.env.FILE_ENCRYPTION_ACTIVE_KEY_ID = "knova";
    resetConfigCache();
    try {
      const novo = rewrapEnvelope(original);
      expect(novo.equals(original)).toBe(false);
      expect(decryptFileToBuffer(novo).equals(conteudo)).toBe(true);
      expect(rewrapEnvelope(novo).equals(novo)).toBe(true);
      expect(new TextDecoder().decode(novo.subarray(7, 7 + 5))).toBe("knova");
    } finally {
      process.env.FILE_ENCRYPTION_ACTIVE_KEY_ID = "ktest";
      resetConfigCache();
    }
  });
});

describe("armazenamento cifrado (G.6)", () => {
  it("grava, lê e apaga; sha256 do conteúdo claro", async () => {
    const conteudo = await pdfPequeno(1);
    const meta = saveEncryptedFile({
      data: conteudo,
      originalName: "bi.pdf",
      mimeType: MIME_PDF,
      purpose: "CANDIDATE_DOCUMENT",
      pageCount: 1,
      agora: new Date("2026-11-05T10:00:00Z"),
    });
    expect(meta.sha256).toHaveLength(64);
    expect(meta.storageKey).toMatch(/^2026\/11\//);
    expect(readEncryptedFile(meta.storageKey).equals(conteudo)).toBe(true);
    deleteEncryptedFile(meta.storageKey);
    expect(() => readEncryptedFile(meta.storageKey)).toThrow();
  });
});

describe("tipo real e validação de conteúdo (RF-DOC-05)", () => {
  it("sniffing pelos primeiros bytes, não pela extensão", () => {
    expect(sniffMime(Buffer.from("%PDF-1.7 resto"))).toBe(MIME_PDF);
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(MIME_JPEG);
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(MIME_PNG);
    expect(sniffMime(Buffer.from("<html>fake pdf</html>"))).toBeNull();
  });

  it("reconstrói PDF copiando páginas e conta-as", async () => {
    const { data, pages } = await rebuildPdf(await pdfPequeno(3));
    expect(pages).toBe(3);
    expect(sniffMime(data)).toBe(MIME_PDF);
    const reaberto = await PDFDocument.load(data);
    expect(reaberto.getPageCount()).toBe(3);
  });

  it("recusa ficheiro que não é PDF legível e PDF acima de 40 páginas", async () => {
    await expect(rebuildPdf(Buffer.from("isto não é pdf"))).rejects.toThrow(DocumentValidationError);
    const demais = await pdfPequeno(MAX_PDF_PAGES + 1);
    await expect(rebuildPdf(demais)).rejects.toThrow(/40 páginas/);
  });

  it("re-codifica JPEG e PNG sem EXIF (GPS incluído)", async () => {
    const comExif = await sharp({
      create: { width: 30, height: 20, channels: 3, background: { r: 10, g: 200, b: 30 } },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { ImageDescription: "GPS: -19.8, 34.9" } } })
      .toBuffer();
    const { data, mime } = await reencodeImage(comExif, MIME_JPEG);
    const meta = await sharp(data).metadata();
    expect(mime).toBe(MIME_JPEG);
    expect(meta.exif).toBeUndefined();

    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } }).png().toBuffer();
    const pngNovo = await reencodeImage(png, MIME_PNG);
    expect(pngNovo.mime).toBe(MIME_PNG);
    expect((await sharp(pngNovo.data).metadata()).format).toBe("png");
  });

  it("usa createCipheriv só para provar que o módulo de crypto está disponível no teste", () => {
    expect(typeof createCipheriv).toBe("function");
  });
});
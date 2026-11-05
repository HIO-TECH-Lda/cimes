import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { DocumentValidationError } from "./errors";

/**
 * Validação do conteúdo real dos documentos (RF-DOC-05): o tipo é detectado
 * pelos primeiros bytes (não pela extensão); o PDF é reconstruído copiando as
 * páginas para um documento novo (remove JavaScript, anexos e formulários);
 * imagens re-codificadas com sharp sem metadados EXIF (incluindo GPS).
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 40;

export const MIME_PDF = "application/pdf";
export const MIME_JPEG = "image/jpeg";
export const MIME_PNG = "image/png";

/** Tipos de documento do candidato (Anexo, CandidateDocumentType). */
export const DOCUMENT_TYPES = ["BI", "CV", "TRANSCRIPT", "CERTIFICATE", "ENROLMENT_PROOF", "OTHER"] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Tipo real a partir dos primeiros bytes; null se não for PDF/JPG/PNG. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-") return MIME_PDF;
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return MIME_JPEG;
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return MIME_PNG;
  }
  return null;
}

/**
 * Reconstrói o PDF: páginas copiadas para um documento novo (sem JavaScript,
 * anexos nem formulários). PDF protegido por senha é recusado com mensagem
 * explicativa (RF-DOC-02).
 */
export async function rebuildPdf(buf: Buffer): Promise<{ data: Buffer; pages: number }> {
  let origem: PDFDocument;
  try {
    origem = await PDFDocument.load(buf, { ignoreEncryption: false, updateMetadata: false });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (/encrypt|password/i.test(mensagem)) {
      throw new DocumentValidationError(
        "O PDF está protegido por senha. Remove a protecção e volta a carregá-lo.",
      );
    }
    throw new DocumentValidationError("O ficheiro não é um PDF legível.");
  }
  if (origem.getPageCount() > MAX_PDF_PAGES) {
    throw new DocumentValidationError(`O PDF tem mais de ${MAX_PDF_PAGES} páginas (RF-DOC-02).`);
  }
  const destino = await PDFDocument.create();
  const paginas = await destino.copyPages(origem, origem.getPageIndices());
  for (const pagina of paginas) destino.addPage(pagina);
  destino.setTitle("");
  destino.setAuthor("");
  destino.setSubject("");
  destino.setKeywords([]);
  return { data: Buffer.from(await destino.save()), pages: destino.getPageCount() };
}

/**
 * Re-codifica a imagem com sharp: EXIF (incluindo GPS) removido, orientação
 * aplicada. JPG sai JPEG (qualidade 80); PNG mantém formato.
 */
export async function reencodeImage(buf: Buffer, mime: string): Promise<{ data: Buffer; mime: string }> {
  try {
    if (mime === MIME_PNG) {
      return { data: await sharp(buf).rotate().png().toBuffer(), mime: MIME_PNG };
    }
    return { data: await sharp(buf).rotate().jpeg({ quality: 80 }).toBuffer(), mime: MIME_JPEG };
  } catch {
    throw new DocumentValidationError("A imagem não pôde ser lida ou re-codificada.");
  }
}
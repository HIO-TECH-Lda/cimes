import { assertCan, canAct } from "@/server/auth/assert-can";
import type { Principal } from "@/server/auth/principal";
import {
  DOCUMENT_TYPES,
  MAX_FILE_BYTES,
  MIME_PDF,
  rebuildPdf,
  reencodeImage,
  sniffMime,
  type DocumentType,
} from "@/server/domain/document";
import { ConflictError, DocumentValidationError, ForbiddenError, NotFoundError } from "@/server/domain/errors";
import type { Clock } from "@/server/infra/clock";
import type { Logger } from "@/server/infra/logger";
import { saveEncryptedFile, readEncryptedFile } from "@/server/infra/storage";
import type { DbClient, PrismaClient } from "@/server/repositories/db";
import { createAuditService, type AuditService } from "@/server/services/audit";
import { createNotificationRepository, type NotificationRepository } from "@/server/repositories/notification-repository";

/**
 * Documentos do candidato (M04, RF-DOC-01 a 08): carregamento com validação do
 * conteúdo real no servidor (tipo pelos bytes, PDF reconstruído, imagens
 * re-codificadas sem EXIF), ficheiros cifrados em disco (G.6), estados
 * UPLOADED → VALIDATED | REJECTED com substituição (RF-DOC-07), aviso N-09 ao
 * candidato e auditoria DOCUMENT_UPLOADED / DOCUMENT_VALIDATED /
 * DOCUMENT_REJECTED / SENSITIVE_DATA_VIEWED (RF-AUD-03, RF-DOC-08).
 */

export type CandidateDocumentService = ReturnType<typeof createCandidateDocumentService>;

type DocumentRow = {
  id: string;
  candidateId: string;
  type: string;
  fileId: string;
  status: string;
  rejectionReason: string | null;
  validatedById: string | null;
  validatedAt: Date | null;
  file: { originalName: string; mimeType: string; sizeBytes: number; pageCount: number | null };
};

const OUTROS_MAX = 5;

export function createCandidateDocumentService(deps: {
  prisma: PrismaClient;
  audit: AuditService;
  clock: Clock;
  logger?: Logger;
  /** Fábrica de auditoria (para gravar na mesma transacção; injectável em testes). */
  createAudit?: (client: DbClient) => AuditService;
}) {
  const client = deps.prisma;
  const novoAudit = deps.createAudit ?? ((c: DbClient) => createAuditService(c));

  function actor(principal: Principal) {
    return { userId: principal.userId, roles: [...new Set(principal.roles.map((r) => r.role))] };
  }

  /** Documento por id com ficheiro; 404 fora do âmbito (R-04). */
  async function loadDocument(principal: Principal, documentId: string): Promise<DocumentRow> {
    const documento = (await client.candidateDocument.findUnique({
      where: { id: documentId },
      include: { file: { select: { originalName: true, mimeType: true, sizeBytes: true, pageCount: true } } },
    })) as DocumentRow | null;
    if (!documento) throw new NotFoundError();
    const dono = await client.candidateProfile.findUnique({
      where: { id: documento.candidateId },
      select: { userId: true },
    });
    if (dono?.userId === principal.userId) return documento;
    assertCan(principal, "document.download");
    return documento;
  }

  /** Lista dos documentos do próprio candidato. */
  async function listOwn(principal: Principal) {
    assertCan(principal, "own.documentManage", { ownerUserId: principal.userId });
    const perfil = await client.candidateProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!perfil) return [];
    const documentos = (await client.candidateDocument.findMany({
      where: { candidateId: perfil.id, status: { not: "REPLACED" } },
      include: { file: { select: { originalName: true, mimeType: true, sizeBytes: true, pageCount: true } } },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    })) as DocumentRow[];
    return documentos;
  }

  /**
   * RF-DOC-01/02/05: valida o conteúdo real (tipo pelos bytes, tamanho,
   * reconstrução de PDF ou re-codificação de imagem), guarda cifrado e cria o
   * documento. Um carregamento novo do mesmo tipo marca os anteriores
   * UPLOADED/REJECTED como REPLACED (RF-DOC-07). "Outros" limitado a 5.
   */
  async function upload(
    principal: Principal,
    input: { type: DocumentType; originalName: string; data: Buffer },
  ) {
    assertCan(principal, "own.documentManage", { ownerUserId: principal.userId });
    if (!DOCUMENT_TYPES.includes(input.type)) throw new NotFoundError("Tipo de documento desconhecido");
    if (input.data.length === 0) throw new DocumentValidationError("O ficheiro está vazio.");
    if (input.data.length > MAX_FILE_BYTES) {
      throw new DocumentValidationError("O ficheiro excede o máximo de 10 MB (RF-DOC-02).");
    }
    const bruto = sniffMime(input.data);
    if (!bruto) {
      throw new DocumentValidationError("Formato não suportado: usa PDF, JPG ou PNG (RF-DOC-02).");
    }

    let data = input.data;
    let mime = bruto;
    let pageCount: number | null = null;
    if (bruto === MIME_PDF) {
      const reconstruido = await rebuildPdf(input.data);
      data = reconstruido.data;
      pageCount = reconstruido.pages;
    } else {
      const recodificada = await reencodeImage(input.data, bruto);
      data = recodificada.data;
      mime = recodificada.mime;
    }

    const agora = deps.clock.now();
    const perfil = await client.candidateProfile.findUnique({ where: { userId: principal.userId }, select: { id: true } });
    if (!perfil) throw new NotFoundError("Perfil não iniciado: preenche primeiro os dados pessoais");

    return client.$transaction(async (tx) => {
      const db = tx as PrismaClient;
      if (input.type === "OTHER") {
        // RF-DOC-01: "Outros: até 5" — sem substituição automática.
        const activos = await db.candidateDocument.count({
          where: { candidateId: perfil.id, type: "OTHER", status: { not: "REPLACED" } },
        });
        if (activos >= OUTROS_MAX) {
          throw new ConflictError(`Podes manter até ${OUTROS_MAX} documentos do tipo Outro (RF-DOC-01).`);
        }
      } else {
        // Documentos tipados: um por tipo; o novo substitui os anteriores (RF-DOC-07).
        await db.candidateDocument.updateMany({
          where: { candidateId: perfil.id, type: input.type, status: { in: ["UPLOADED", "REJECTED"] } },
          data: { status: "REPLACED" },
        });
      }
      const ficheiro = saveEncryptedFile({
        data,
        originalName: input.originalName.slice(0, 255),
        mimeType: mime,
        purpose: "CANDIDATE_DOCUMENT",
        uploadedById: principal.userId,
        pageCount,
        agora,
      });
      const stored = await db.storedFile.create({
        data: {
          storageKey: ficheiro.storageKey,
          purpose: "CANDIDATE_DOCUMENT",
          originalName: input.originalName.slice(0, 255),
          mimeType: mime,
          sizeBytes: ficheiro.sizeBytes,
          sha256: ficheiro.sha256,
          keyId: ficheiro.keyId,
          pageCount,
          uploadedById: principal.userId,
        },
      });
      const documento = await db.candidateDocument.create({
        data: { candidateId: perfil.id, type: input.type, fileId: stored.id },
      });
      await novoAudit(tx).record({
        actor: actor(principal),
        action: "DOCUMENT_UPLOADED",
        entityType: "candidateDocument",
        entityId: documento.id,
        summary: `Documento ${input.type} carregado (${mime}, ${ficheiro.sizeBytes} bytes)`,
        diff: null,
      });
      return documento;
    });
  }

  /** RF-DOC-07: RH valida. Auditoria DOCUMENT_VALIDATED. */
  async function validate(principal: Principal, documentId: string) {
    assertCan(principal, "application.validate");
    const documento = (await client.candidateDocument.findUnique({
      where: { id: documentId },
      include: { file: { select: { originalName: true } } },
    })) as DocumentRow | null;
    if (!documento) throw new NotFoundError();
    if (documento.status !== "UPLOADED") {
      throw new ConflictError(`Só um documento UPLOADED pode ser validado (estado actual: ${documento.status})`);
    }
    const agora = deps.clock.now();
    const actualizado = await client.candidateDocument.update({
      where: { id: documentId },
      data: { status: "VALIDATED", validatedById: principal.userId, validatedAt: agora, rejectionReason: null },
    });
    await novoAudit(client).record({
      actor: actor(principal),
      action: "DOCUMENT_VALIDATED",
      entityType: "candidateDocument",
      entityId: documentId,
      summary: `Documento ${documento.type} validado`,
      diff: { status: { antigo: "UPLOADED", novo: "VALIDATED" } },
    });
    return actualizado;
  }

  /** RF-DOC-07: RH rejeita com motivo; N-09 ao candidato. Auditoria DOCUMENT_REJECTED. */
  async function reject(principal: Principal, documentId: string, reason: string) {
    assertCan(principal, "application.validate");
    const motivo = reason.trim();
    if (motivo.length === 0) throw new DocumentValidationError("Indica o motivo da rejeição.");
    const documento = (await client.candidateDocument.findUnique({
      where: { id: documentId },
      include: { file: { select: { originalName: true } } },
    })) as DocumentRow | null;
    if (!documento) throw new NotFoundError();
    if (documento.status !== "UPLOADED") {
      throw new ConflictError(`Só um documento UPLOADED pode ser rejeitado (estado actual: ${documento.status})`);
    }
    const agora = deps.clock.now();
    return client.$transaction(async (tx) => {
      const db = tx as PrismaClient;
      const actualizado = await db.candidateDocument.update({
        where: { id: documentId },
        data: { status: "REJECTED", validatedById: principal.userId, validatedAt: agora, rejectionReason: motivo.slice(0, 500) },
      });
      await novoAudit(tx).record({
        actor: actor(principal),
        action: "DOCUMENT_REJECTED",
        entityType: "candidateDocument",
        entityId: documentId,
        summary: `Documento ${documento.type} rejeitado; motivo: ${motivo.slice(0, 200)}`,
        diff: { status: { antigo: "UPLOADED", novo: "REJECTED" } },
      });
      // N-09 ao candidato (Anexo E) — repetível a cada rejeição.
      const dono = await db.candidateProfile.findUnique({
        where: { id: documento.candidateId },
        select: { user: { select: { id: true, email: true } } },
      });
      if (dono) {
        const notifications: NotificationRepository = createNotificationRepository(tx);
        await notifications.create({
          templateCode: "N-09",
          recipientUserId: dono.user.id,
          recipientEmail: dono.user.email,
          payload: { motivo },
          idempotencyKey: `N-09::DOCUMENT:${documentId}:REJECTED:${Date.now()}`,
        });
      }
      return actualizado;
    });
  }

  /**
   * Conteúdo do ficheiro para pré-visualização (RF-DOC-06): o dono, ou quem
   * tem document.download. Abrir o BI de outro candidato grava
   * SENSITIVE_DATA_VIEWED (RF-DOC-08).
   */
  async function readFile(principal: Principal, fileId: string) {
    const documento = (await client.candidateDocument.findUnique({
      where: { fileId },
      include: { file: { select: { originalName: true, mimeType: true, sizeBytes: true, pageCount: true, storageKey: true, deletedAt: true } } },
    })) as (DocumentRow & { file: { storageKey: string; deletedAt: Date | null } }) | null;
    if (!documento || documento.file.deletedAt) throw new NotFoundError();
    const dono = await client.candidateProfile.findUnique({
      where: { id: documento.candidateId },
      select: { userId: true },
    });
    const proprio = dono?.userId === principal.userId;
    if (!proprio) {
      assertCan(principal, "document.download");
      if (documento.type === "BI") {
        // RF-DOC-08: abrir o BI de um candidato grava auditoria.
        await novoAudit(client).record({
          actor: actor(principal),
          action: "SENSITIVE_DATA_VIEWED",
          entityType: "candidateDocument",
          entityId: documento.id,
          summary: "BI do candidato aberto",
        });
      }
    }
    if (!proprio && !canAct(principal, "document.download")) throw new ForbiddenError();
    return {
      data: readEncryptedFile(documento.file.storageKey),
      mime: documento.file.mimeType,
      originalName: documento.file.originalName,
    };
  }

  deps.logger?.debug("servico de documentos do candidato criado");

  return { listOwn, upload, validate, reject, readFile, loadDocument };
}
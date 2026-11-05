import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { principalWithRole, type Principal } from "@/server/auth/principal";
import { ConflictError, DocumentValidationError, ForbiddenError } from "@/server/domain/errors";
import type { AuditService } from "@/server/services/audit";
import type { Clock } from "@/server/infra/clock";
import { readEncryptedFile } from "@/server/infra/storage";
import { createCandidateDocumentService, type CandidateDocumentService } from "@/server/services/candidate-documents";

/**
 * Documentos do candidato (RF-DOC-01 a 08) com prisma falso: pipeline de
 * validação do conteúdo, substituição, limite de "Outros", validação/rejeição
 * com N-09 e SENSITIVE_DATA_VIEWED na abertura do BI.
 */

const MASTER = Buffer.alloc(32, 11).toString("base64");
const raizTeste = mkdtempSync(join(tmpdir(), "cimes-docs-"));

process.env.PUBLIC_BASE_URL ??= "http://localhost:3100";
process.env.BETTER_AUTH_SECRET ??= "s".repeat(32);
process.env.MAIL_TRANSPORT ??= "memory";
process.env.DATABASE_URL ??= "sqlserver://localhost:1433;database=doctest;user=sa;password=x;encrypt=false;trustServerCertificate=true";
process.env.FILE_STORAGE_PATH ??= raizTeste;
process.env.FILE_ENCRYPTION_KEYS ??= JSON.stringify({ kdoc: MASTER });
process.env.FILE_ENCRYPTION_ACTIVE_KEY_ID ??= "kdoc";
process.env.PII_ENCRYPTION_KEYS ??= process.env.FILE_ENCRYPTION_KEYS;
process.env.PII_ENCRYPTION_ACTIVE_KEY_ID ??= "kdoc";
process.env.PII_HMAC_KEY ??= MASTER;

let AGORA = new Date("2026-11-05T10:00:00Z");
const clock: Clock = { now: () => AGORA };

const db = {
  profiles: [] as Array<Record<string, unknown>>,
  documents: [] as Array<Record<string, unknown>>,
  files: [] as Array<Record<string, unknown>>,
  notifications: [] as Array<Record<string, unknown>>,
  auditLogs: [] as Array<Record<string, unknown>>,
};

const auditFake: AuditService = {
  record: async (input: Parameters<AuditService["record"]>[0]) => {
    db.auditLogs.push({ ...input });
    return { id: "audit-1" };
  },
} as unknown as AuditService;

function clonar<T>(row: T): T {
  if (row === null || typeof row !== "object") return row;
  if (row instanceof Date) return new Date(row.getTime()) as unknown as T;
  if (Array.isArray(row)) return row.map((x) => clonar(x)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) out[k] = clonar(v);
  return out as T;
}

const prisma = {
  candidateProfile: {
    async findUnique({ where, select }: { where: { userId?: string; id?: string }; select?: Record<string, boolean> }) {
      const row = db.profiles.find((p) => (where.userId ? p.userId === where.userId : p.id === where.id));
      if (!row) return null;
      if (select?.user) {
        const dono = db.profiles.find((p) => p.id === row.id)!;
        return clonar({ ...row, user: { id: dono.userId, email: `${dono.userId}@sintetico.mz` } });
      }
      return clonar(row);
    },
  },
  candidateDocument: {
    async findUnique({ where }: { where: { id?: string; fileId?: string } }) {
      const row = db.documents.find((d) => (where.id ? d.id === where.id : d.fileId === where.fileId));
      if (!row) return null;
      const file = db.files.find((f) => f.id === row.fileId)!;
      return clonar({ ...row, file });
    },
    async findMany({ where }: { where: Record<string, unknown> }) {
      const estado = where.status as { not: string };
      return db.documents
        .filter((d) => d.candidateId === where.candidateId && d.status !== estado.not)
        .sort((a, b) => String(a.type).localeCompare(String(b.type)))
        .map((d) => ({ ...clonar(d), file: db.files.find((f) => f.id === d.fileId)! }));
    },
    async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      let count = 0;
      for (const row of db.documents) {
        if (row.candidateId === where.candidateId && row.type === where.type && (where.status as { in: string[] }).in.includes(row.status as string)) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const row = {
        id: `doc-${db.documents.length + 1}`,
        status: "UPLOADED",
        rejectionReason: null,
        validatedById: null,
        validatedAt: null,
        ...data,
      };
      db.documents.push(row);
      return clonar(row);
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const row = db.documents.find((d) => d.id === where.id)!;
      Object.assign(row, data);
      return clonar(row);
    },
    async count({ where }: { where: Record<string, unknown> }) {
      return db.documents.filter((d) => d.candidateId === where.candidateId && d.type === where.type && d.status !== "REPLACED").length;
    },
  },
  storedFile: {
    async create({ data }: { data: Record<string, unknown> }) {
      const row = { id: `file-${db.files.length + 1}`, scanStatus: "NOT_SCANNED", deletedAt: null, ...data };
      db.files.push(row);
      return clonar(row);
    },
  },
  notification: {
    async create({ data }: { data: Record<string, unknown> }) {
      const row = { id: `n-${db.notifications.length + 1}`, ...data };
      db.notifications.push(row);
      return clonar(row);
    },
  },
  inAppNotification: {
    async create({ data }: { data: Record<string, unknown> }) {
      return clonar(data);
    },
  },
  async $transaction<T>(this: unknown, fn: (tx: unknown) => Promise<T>) {
    return fn(this);
  },
};

function criarServico(): CandidateDocumentService {
  return createCandidateDocumentService({
    prisma: prisma as never,
    audit: auditFake,
    clock,
    createAudit: () => auditFake,
  });
}

function candidato(userId = "user-2"): Principal {
  const p = principalWithRole("CANDIDATE");
  p.userId = userId;
  return p;
}

async function pdfPequeno(paginas = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i += 1) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

async function pngPequeno(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 20, channels: 3, background: "#224466" } }).png().toBuffer();
}

beforeEach(() => {
  AGORA = new Date("2026-11-05T10:00:00Z");
  db.profiles = [{ id: "cp-1", userId: "user-2" }];
  db.documents = [];
  db.files = [];
  db.notifications = [];
  db.auditLogs = [];
});

afterAll(() => {
  rmSync(raizTeste, { recursive: true, force: true });
});

describe("carregamento (RF-DOC-01/02/05)", () => {
  it("valida, reconstrói e guarda cifrado; DOCUMENT_UPLOADED auditado", async () => {
    const service = criarServico();
    const pdf = await pdfPequeno(2);
    const doc = await service.upload(candidato(), { type: "CV", originalName: "cv.pdf", data: pdf });
    expect(doc.status).toBe("UPLOADED");
    const stored = db.files[0]!;
    expect(stored.pageCount).toBe(2);
    expect(stored.mimeType).toBe("application/pdf");
    expect(String(stored.storageKey)).toMatch(/^2026\/11\//);
    // o conteúdo guardado abre e é um PDF reconstruído (pode diferir do original)
    const lido = readEncryptedFile(String(stored.storageKey));
    expect(lido.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(db.auditLogs.map((a) => a.action)).toContain("DOCUMENT_UPLOADED");
  });

  it("recusa formato não suportado, ficheiro vazio e acima de 10 MB", async () => {
    const service = criarServico();
    await expect(service.upload(candidato(), { type: "CV", originalName: "x.txt", data: Buffer.from("texto") })).rejects.toThrow(DocumentValidationError);
    await expect(service.upload(candidato(), { type: "CV", originalName: "vazio.pdf", data: Buffer.alloc(0) })).rejects.toThrow(/vazio/);
    await expect(
      service.upload(candidato(), { type: "CV", originalName: "grande.pdf", data: Buffer.alloc(10 * 1024 * 1024 + 1) }),
    ).rejects.toThrow(/10 MB/);
  });

  it("carregamento novo do mesmo tipo marca o anterior como REPLACED (RF-DOC-07)", async () => {
    const service = criarServico();
    await service.upload(candidato(), { type: "BI", originalName: "bi.pdf", data: await pdfPequeno() });
    await service.upload(candidato(), { type: "BI", originalName: "bi2.pdf", data: await pdfPequeno() });
    const estados = db.documents.map((d) => d.status);
    expect(estados).toEqual(["REPLACED", "UPLOADED"]);
    const lista = await service.listOwn(candidato());
    expect(lista).toHaveLength(1);
  });

  it("aceita imagem e re-codifica sem EXIF", async () => {
    const service = criarServico();
    const png = await pngPequeno();
    await service.upload(candidato(), { type: "OTHER", originalName: "foto.png", data: png });
    expect(db.files[0]!.mimeType).toBe("image/png");
  });

  it("'Outros' limitado a 5 activos (RF-DOC-01)", async () => {
    const service = criarServico();
    const png = await pngPequeno();
    for (let i = 0; i < 5; i += 1) {
      await service.upload(candidato(), { type: "OTHER", originalName: `o${i}.png`, data: png });
    }
    await expect(service.upload(candidato(), { type: "OTHER", originalName: "o6.png", data: png })).rejects.toThrow(ConflictError);
    // rejeitar um libera espaço? não: REJECTED ainda conta como activo — mas REPLACED não
    await service.upload(candidato(), { type: "BI", originalName: "bi.png", data: png });
    expect(db.documents).toHaveLength(6);
  });

  it("sem perfil iniciado recusa o carregamento", async () => {
    db.profiles = [];
    const service = criarServico();
    await expect(service.upload(candidato(), { type: "CV", originalName: "cv.pdf", data: await pdfPequeno() })).rejects.toThrow(/dados pessoais/);
  });
});

describe("validação e rejeição (RF-DOC-07, N-09)", () => {
  it("RH valida e rejeita com motivo; candidato não pode", async () => {
    const service = criarServico();
    const doc = await service.upload(candidato(), { type: "TRANSCRIPT", originalName: "notas.pdf", data: await pdfPequeno() });
    const rh = principalWithRole("HR_OFFICER");
    await service.validate(rh, String(doc.id));
    expect(db.documents[0]!.status).toBe("VALIDATED");
    await expect(service.validate(rh, String(doc.id))).rejects.toThrow(ConflictError);
    await expect(service.validate(candidato(), String(doc.id))).rejects.toThrow(ForbiddenError);
  });

  it("rejeição grava motivo, audita e enfileira N-09 ao candidato", async () => {
    const service = criarServico();
    const doc = await service.upload(candidato(), { type: "BI", originalName: "bi.pdf", data: await pdfPequeno() });
    await service.reject(principalWithRole("HR_OFFICER"), String(doc.id), "  Ilegível  ");
    expect(db.documents[0]!.status).toBe("REJECTED");
    expect(db.documents[0]!.rejectionReason).toBe("Ilegível");
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0]!.templateCode).toBe("N-09");
    expect(db.notifications[0]!.recipientUserId).toBe("user-2");
    expect((JSON.parse(String(db.notifications[0]!.payloadJson)) as { motivo: string }).motivo).toBe("Ilegível");
    expect(db.auditLogs.map((a) => a.action)).toContain("DOCUMENT_REJECTED");
  });

  it("rejeição sem motivo é recusada", async () => {
    const service = criarServico();
    const doc = await service.upload(candidato(), { type: "CV", originalName: "cv.pdf", data: await pdfPequeno() });
    await expect(service.reject(principalWithRole("HR_OFFICER"), String(doc.id), "   ")).rejects.toThrow(/motivo/);
  });

  it("após rejeição, novo carregamento substitui (REPLACED)", async () => {
    const service = criarServico();
    const doc = await service.upload(candidato(), { type: "CV", originalName: "cv.pdf", data: await pdfPequeno() });
    await service.reject(principalWithRole("HR_OFFICER"), String(doc.id), "ilegível");
    await service.upload(candidato(), { type: "CV", originalName: "cv2.pdf", data: await pdfPequeno() });
    expect(db.documents.map((d) => d.status)).toEqual(["REPLACED", "UPLOADED"]);
    void doc;
  });
});

describe("leitura do ficheiro (RF-DOC-06/08)", () => {
  it("o dono lê sem auditoria; HR lê com SENSITIVE_DATA_VIEWED no BI", async () => {
    const service = criarServico();
    const pdf = await pdfPequeno();
    const bi = await service.upload(candidato(), { type: "BI", originalName: "bi.pdf", data: pdf });
    const cv = await service.upload(candidato(), { type: "CV", originalName: "cv.pdf", data: pdf });
    const lido = await service.readFile(candidato(), String(bi.fileId));
    expect(lido.mime).toBe("application/pdf");
    expect(lido.data.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const antes = db.auditLogs.length;
    await service.readFile(principalWithRole("HR_OFFICER"), String(bi.fileId));
    expect(db.auditLogs[antes]!.action).toBe("SENSITIVE_DATA_VIEWED");
    await service.readFile(principalWithRole("HR_OFFICER"), String(cv.fileId));
    expect(db.auditLogs).toHaveLength(antes + 1); // CV não é sensível
  });

  it("outro candidato não lê (sem document.download) — 403", async () => {
    const service = criarServico();
    const doc = await service.upload(candidato(), { type: "CV", originalName: "cv.pdf", data: await pdfPequeno() });
    const outro = principalWithRole("CANDIDATE");
    outro.userId = "user-9";
    await expect(service.readFile(outro, String(doc.fileId))).rejects.toThrow(ForbiddenError);
  });
});
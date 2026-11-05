import { beforeEach, describe, expect, it } from "vitest";

import { principalWithRole } from "@/server/auth/principal";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/domain/errors";
import type { Clock } from "@/server/infra/clock";
import { decryptPii } from "@/server/infra/pii";
import { createProfileService, type ProfileService } from "@/server/services/candidate-profile";

/**
 * Serviço do perfil (RF-CAN-01 a 03) com prisma falso em memória: cifra/hmac
 * do BI, unicidade por hash, passos por ordem (fullName obrigatório na
 * criação) e indicador de progresso com profileCompletedAt.
 */

const KEY = Buffer.alloc(32, 9).toString("base64");

process.env.PUBLIC_BASE_URL ??= "http://localhost:3100";
process.env.BETTER_AUTH_SECRET ??= "s".repeat(32);
process.env.FILE_STORAGE_PATH ??= ".tmp-storage";
process.env.FILE_ENCRYPTION_KEYS ??= JSON.stringify({ ktest: KEY });
process.env.FILE_ENCRYPTION_ACTIVE_KEY_ID ??= "ktest";
process.env.PII_ENCRYPTION_KEYS ??= JSON.stringify({ ptest: KEY });
process.env.PII_ENCRYPTION_ACTIVE_KEY_ID ??= "ptest";
process.env.PII_HMAC_KEY ??= Buffer.alloc(32, 5).toString("base64");
process.env.MAIL_TRANSPORT ??= "memory";
process.env.DATABASE_URL ??= "sqlserver://localhost:1433;database=perfiltest;user=sa;password=x;encrypt=false;trustServerCertificate=true";

type ProfileRow = Record<string, unknown>;

let AGORA = new Date("2026-11-05T10:00:00Z");
const clock: Clock = { now: () => AGORA };

const db = {
  profiles: [] as ProfileRow[],
  competencias: [] as Array<{ candidateId: string; skillId: string; source: string }>,
  institutions: [
    { id: "inst-1", name: "Universidade Sintética", active: true },
    { id: "inst-2", name: "Instituto Inactivo", active: false },
  ],
  courses: [
    { id: "course-1", name: "Informática", active: true },
    { id: "course-2", name: "Curso Inactivo", active: false },
  ],
  locations: [
    { id: "loc-1", name: "Beira", active: true },
    { id: "loc-2", name: "Chimoio", active: true },
    { id: "loc-3", name: "Inactivo", active: false },
  ],
  skillsCatalog: [
    { id: "sk-1", name: "Excel", active: true },
    { id: "sk-2", name: "SQL", active: true },
    { id: "sk-3", name: "Inactiva", active: false },
  ],
};

function clonar<T>(row: T): T {
  if (row === null || typeof row !== "object") return row;
  if (row instanceof Date) return new Date(row.getTime()) as unknown as T;
  if (Array.isArray(row)) return row.map((x) => clonar(x)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) out[k] = clonar(v);
  return out as T;
}

const COLUNAS_NULAS = [
  "birthDate",
  "sex",
  "biNumberEnc",
  "biNumberHash",
  "biExpiryDate",
  "nuitEnc",
  "phoneE164",
  "phoneAltE164",
  "province",
  "city",
  "neighbourhood",
  "institutionId",
  "institutionOther",
  "courseId",
  "courseOther",
  "academicStatus",
  "graduationDate",
  "declaredAverage",
  "languagesJson",
  "availableLocationsJson",
  "profileCompletedAt",
  "lastActivityAt",
];

const prisma = {
  candidateProfile: {
    async findUnique({ where }: { where: { userId: string } }) {
      const row = db.profiles.find((p) => p.userId === where.userId);
      if (!row) return null;
      return {
        ...clonar(row),
        skills: db.competencias
          .filter((s) => s.candidateId === row.id)
          .map((s) => ({ skillId: s.skillId })),
      };
    },
    async findFirst({ where }: { where: { biNumberHash?: string; userId?: { not: string } } }) {
      const row = db.profiles.find(
        (p) =>
          (!where.biNumberHash || p.biNumberHash === where.biNumberHash) &&
          (!where.userId?.not || p.userId !== where.userId.not),
      );
      return row ? clonar(row) : null;
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const row: ProfileRow = {
        id: `cp-${db.profiles.length + 1}`,
        userId: data.userId,
        talentPoolConsent: false,
        legalHold: false,
        ...COLUNAS_NULAS.reduce((acc, c) => ({ ...acc, [c]: null }), {}),
        ...data,
      };
      db.profiles.push(row);
      return clonar(row);
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const row = db.profiles.find((p) => p.id === where.id)!;
      Object.assign(row, data);
      return clonar(row);
    },
  },
  institution: {
    async findFirst({ where }: { where: { id: string; active: boolean } }) {
      const row = db.institutions.find((i) => i.id === where.id && i.active === where.active);
      return row ? clonar(row) : null;
    },
  },
  course: {
    async findFirst({ where }: { where: { id: string; active: boolean } }) {
      const row = db.courses.find((c) => c.id === where.id && c.active === where.active);
      return row ? clonar(row) : null;
    },
  },
  location: {
    async count({ where }: { where: { id: { in: string[] }; active: boolean } }) {
      return db.locations.filter((l) => where.id.in.includes(l.id) && l.active === where.active).length;
    },
  },
  skill: {
    async count({ where }: { where: { id: { in: string[] }; active: boolean } }) {
      return db.skillsCatalog.filter((s) => where.id.in.includes(s.id) && s.active === where.active).length;
    },
  },
  candidateSkill: {
    async deleteMany({ where }: { where: { candidateId: string } }) {
      const antes = db.competencias.length;
      db.competencias = db.competencias.filter((s) => s.candidateId !== where.candidateId);
      return { count: antes - db.competencias.length };
    },
    async createMany({ data }: { data: Array<{ candidateId: string; skillId: string; source: string }> }) {
      for (const linha of data) db.competencias.push({ ...linha });
      return { count: data.length };
    },
  },
  async $transaction<T>(this: unknown, fn: (tx: unknown) => Promise<T>) {
    return fn(this);
  },
};

function criarServico(): ProfileService {
  return createProfileService({ prisma: prisma as never, clock });
}

const dadosPessoais = {
  fullName: "  Ana   Paula  Silva ",
  birthDate: "2000-05-10",
  biNumber: " 1101 0012 3456b ",
  biExpiryDate: "2030-12-31",
  sex: "",
  nuit: "",
};

const dadosFormacao = {
  institutionId: "inst-1",
  courseId: "course-1",
  academicStatus: "FINALIST",
  graduationDate: "2027-06-15",
  declaredAverage: 14.5,
};

const dadosCompetencias = {
  skillIds: ["sk-1", "sk-2"],
  availableLocationIds: ["loc-1", "loc-2"],
  languages: [{ language: "Português", level: "NATIVE" }],
};

beforeEach(() => {
  AGORA = new Date("2026-11-05T10:00:00Z");
  db.profiles = [];
  db.competencias = [];
});

describe("passo 1 — dados pessoais (RF-CAN-02, P-06, RF-CAN-03)", () => {
  it("cria a fila com nome normalizado, BI cifrado e hash HMAC", async () => {
    const service = criarServico();
    const { perfil, passos } = await service.saveStepPersonal(principalWithRole("CANDIDATE"), dadosPessoais);
    expect(perfil.fullName).toBe("Ana Paula Silva");
    expect(decryptPii(perfil.biNumberEnc as string)).toBe("110100123456B");
    expect(perfil.biNumberHash).toHaveLength(64);
    expect(perfil.nuitEnc).toBeNull();
    expect(perfil.lastActivityAt).toEqual(AGORA);
    expect(passos).toEqual(["pessoais"]);
  });

  it("grava NUIT cifrado quando presente", async () => {
    const service = criarServico();
    const { perfil } = await service.saveStepPersonal(principalWithRole("CANDIDATE"), { ...dadosPessoais, nuit: " 100456789 " });
    expect(decryptPii(perfil.nuitEnc as string)).toBe("100456789");
  });

  it("rejeita BI já usado noutra conta com a mensagem de RF-CAN-03", async () => {
    const service = criarServico();
    await service.saveStepPersonal(principalWithRole("CANDIDATE"), dadosPessoais);
    const outro = principalWithRole("CANDIDATE");
    outro.userId = "user-2";
    await expect(service.saveStepPersonal(outro, dadosPessoais)).rejects.toThrow(ConflictError);
    await expect(service.saveStepPersonal(outro, dadosPessoais)).rejects.toThrow(/recupere o acesso ou contacte o RH/);
  });

  it("permite à própria conta regravar o mesmo BI (sem conflito consigo)", async () => {
    const service = criarServico();
    await service.saveStepPersonal(principalWithRole("CANDIDATE"), dadosPessoais);
    const { perfil } = await service.saveStepPersonal(principalWithRole("CANDIDATE"), {
      ...dadosPessoais,
      fullName: "Ana Paula Macuácua",
    });
    expect(perfil.fullName).toBe("Ana Paula Macuácua");
    expect(db.profiles).toHaveLength(1);
  });

  it("exige own.profileManage — outro papel não escreve perfil", async () => {
    const service = criarServico();
    await expect(service.saveStepPersonal(principalWithRole("DEPARTMENT_HEAD"), dadosPessoais)).rejects.toThrow(ForbiddenError);
  });

  it("conflict P2002 do índice único vira ConflictError (última defesa)", async () => {
    const frágil = {
      ...prisma,
      candidateProfile: {
        ...prisma.candidateProfile,
        async update() {
          throw Object.assign(new Error("índice único"), { code: "P2002" });
        },
      },
    };
    const service = createProfileService({ prisma: frágil as never, clock });
    await expect(service.saveStepPersonal(principalWithRole("CANDIDATE"), dadosPessoais)).rejects.toThrow(ConflictError);
  });
});

describe("passos seguintes", () => {
  it("contactos/formação/competências sem a fila iniciada são recusados", async () => {
    const service = criarServico();
    await expect(
      service.saveStepContacts(principalWithRole("CANDIDATE"), { phone: "+258823456789", province: "SOFALA", city: "Beira" }),
    ).rejects.toThrow(NotFoundError);
    await expect(service.saveStepEducation(principalWithRole("CANDIDATE"), dadosFormacao)).rejects.toThrow(NotFoundError);
    await expect(service.saveStepSkills(principalWithRole("CANDIDATE"), dadosCompetencias)).rejects.toThrow(NotFoundError);
  });

  it("formação valida instituição e curso activos do catálogo", async () => {
    const service = criarServico();
    await service.saveStepPersonal(principalWithRole("CANDIDATE"), dadosPessoais);
    await expect(
      service.saveStepEducation(principalWithRole("CANDIDATE"), { ...dadosFormacao, institutionId: "inst-2" }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      service.saveStepEducation(principalWithRole("CANDIDATE"), { ...dadosFormacao, courseId: "course-2" }),
    ).rejects.toThrow(NotFoundError);
    const { perfil } = await service.saveStepEducation(principalWithRole("CANDIDATE"), dadosFormacao);
    expect(perfil.institutionId).toBe("inst-1");
    expect(perfil.declaredAverage).toBe(14.5);
  });

  it("formação aceita Outra/Outro com nome, sem validação de catálogo", async () => {
    const service = criarServico();
    await service.saveStepPersonal(principalWithRole("CANDIDATE"), dadosPessoais);
    const { perfil } = await service.saveStepEducation(principalWithRole("CANDIDATE"), {
      institutionOther: "Instituto Sintético",
      courseOther: "Curso Sintético",
      ...dadosFormacao,
      institutionId: undefined,
      courseId: undefined,
    });
    expect(perfil.institutionOther).toBe("Instituto Sintético");
    expect(perfil.courseOther).toBe("Curso Sintético");
  });

  it("competências substitui as declaradas (fonte SELF) e valida catálogo", async () => {
    const service = criarServico();
    const principal = principalWithRole("CANDIDATE");
    await service.saveStepPersonal(principal, dadosPessoais);
    await service.saveStepSkills(principal, dadosCompetencias);
    expect(db.competencias).toHaveLength(2);
    expect(db.competencias.every((s) => s.source === "SELF")).toBe(true);
    await service.saveStepSkills(principal, { ...dadosCompetencias, skillIds: [] });
    expect(db.competencias).toHaveLength(0);
    await expect(
      service.saveStepSkills(principal, { ...dadosCompetencias, availableLocationIds: ["loc-3"] }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      service.saveStepSkills(principal, { ...dadosCompetencias, skillIds: ["sk-3"] }),
    ).rejects.toThrow(NotFoundError);
  });

  it("profileCompletedAt fica marcado quando os quatro passos de dados estão completos", async () => {
    const service = criarServico();
    const principal = principalWithRole("CANDIDATE");
    await service.saveStepPersonal(principal, dadosPessoais);
    await service.saveStepContacts(principal, {
      phone: "+258823456789",
      province: "SOFALA",
      city: "Beira",
    });
    await service.saveStepEducation(principal, dadosFormacao);
    AGORA = new Date("2026-11-05T11:00:00Z");
    const { perfil, passos } = await service.saveStepSkills(principal, dadosCompetencias);
    expect(passos).toEqual(["pessoais", "contactos", "formacao", "competencias"]);
    expect(perfil.profileCompletedAt).toEqual(AGORA);
    // gravar de novo não muda o instante de conclusão
    AGORA = new Date("2026-11-05T12:00:00Z");
    const { perfil: depois } = await service.saveStepSkills(principal, dadosCompetencias);
    expect(depois.profileCompletedAt).toEqual(new Date("2026-11-05T11:00:00Z"));
  });
});

describe("getOwn", () => {
  it("devolve o perfil com BI/NUIT decifrados e os passos", async () => {
    const service = criarServico();
    const principal = principalWithRole("CANDIDATE");
    expect((await service.getOwn(principal)).perfil).toBeNull();
    await service.saveStepPersonal(principal, { ...dadosPessoais, nuit: "100456789" });
    const leitura = await service.getOwn(principal);
    expect(leitura.biNumber).toBe("110100123456B");
    expect(leitura.nuit).toBe("100456789");
    expect(leitura.passos).toEqual(["pessoais"]);
  });

  it("não deixa outro papel ler o perfil de outrem", async () => {
    const service = criarServico();
    await expect(service.getOwn(principalWithRole("HR_OFFICER"))).rejects.toThrow(ForbiddenError);
  });
});
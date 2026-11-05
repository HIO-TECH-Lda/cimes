import { assertCan } from "@/server/auth/assert-can";
import type { Principal } from "@/server/auth/principal";
import {
  completedSteps,
  stepContactsSchema,
  stepEducationSchema,
  stepPersonalSchema,
  stepSkillsSchema,
  type ProfileStep,
} from "@/server/domain/candidate-profile";
import { ConflictError, NotFoundError } from "@/server/domain/errors";
import type { Clock } from "@/server/infra/clock";
import type { Logger } from "@/server/infra/logger";
import { decryptPii, encryptPii, piiHmac } from "@/server/infra/pii";
import type { DbClient, Prisma, PrismaClient } from "@/server/repositories/db";

/**
 * Perfil do candidato (M04, RF-CAN-01 a 03): gravação por passos, com os
 * esquemas Zod partilhados como autoridade no servidor (RF-CAN-02). BI e NUIT
 * são cifrados (AES-256-GCM) e o BI leva hash HMAC para unicidade entre
 * contas (RF-CAN-03, P-06). O candidato só escreve no próprio perfil
 * (`own.profileManage`, scope OWN). Gravação de perfil não consta do catálogo
 * de auditoria RF-AUD-03 — não se audita aqui. A fila só nasce no passo
 * "Dados pessoais": `fullName` é obrigatório no modelo.
 */

export type ProfileService = ReturnType<typeof createProfileService>;

type ProfileRow = {
  id: string;
  userId: string;
  fullName: string | null;
  birthDate: Date | null;
  sex: string | null;
  biNumberEnc: string | null;
  biNumberHash: string | null;
  biExpiryDate: Date | null;
  nuitEnc: string | null;
  phoneE164: string | null;
  phoneAltE164: string | null;
  province: string | null;
  city: string | null;
  neighbourhood: string | null;
  institutionId: string | null;
  institutionOther: string | null;
  courseId: string | null;
  courseOther: string | null;
  academicStatus: string | null;
  graduationDate: Date | null;
  declaredAverage: number | null;
  languagesJson: string | null;
  availableLocationsJson: string | null;
  profileCompletedAt: Date | null;
  lastActivityAt: Date | null;
};

/** Campos que um passo pode gravar (nunca id/userId/timestamps de sistema). */
type ProfileData = Prisma.CandidateProfileUncheckedUpdateInput;

const BI_EM_OUTRA_CONTA =
  "Este BI já está associado a uma conta. Se é seu, recupere o acesso ou contacte o RH.";

function passosDeDados(perfil: ProfileRow): ProfileStep[] {
  const locais = perfil.availableLocationsJson ? (JSON.parse(perfil.availableLocationsJson) as string[]) : [];
  return completedSteps({
    fullName: perfil.fullName,
    birthDate: perfil.birthDate,
    biNumberHash: perfil.biNumberHash,
    phoneE164: perfil.phoneE164,
    province: perfil.province,
    institutionId: perfil.institutionId,
    institutionOther: perfil.institutionOther,
    courseId: perfil.courseId,
    courseOther: perfil.courseOther,
    academicStatus: perfil.academicStatus,
    graduationDate: perfil.graduationDate,
    declaredAverage: perfil.declaredAverage,
    availableLocationsJson: locais.length > 0 ? perfil.availableLocationsJson : null,
  });
}

function codigoP2002(erro: unknown): boolean {
  return (erro as { code?: string } | null)?.code === "P2002";
}

export function createProfileService(deps: { prisma: DbClient; clock: Clock; logger?: Logger }) {
  const client = deps.prisma as PrismaClient;

  /**
   * Grava um passo na transacção. `criar` só existe no passo 1 (a fila nasce
   * aí — `fullName` é obrigatório no modelo); os restantes passos exigem a
   * fila existente. O índice único filtrado do `biNumberHash` é a última
   * defesa contra corridas (RF-CAN-03).
   */
  async function guarda(
    principal: Principal,
    passo: {
      criar?: (tx: DbClient, userId: string) => Promise<Prisma.CandidateProfileUncheckedCreateInput>;
      gravar: (tx: DbClient, perfil: ProfileRow) => Promise<{
        dados: ProfileData;
        depois?: (tx: DbClient, perfilId: string) => Promise<void>;
      }>;
    },
  ) {
    assertCan(principal, "own.profileManage", { ownerUserId: principal.userId });
    const agora = deps.clock.now();
    try {
      return await client.$transaction(async (tx) => {
        const db = tx as PrismaClient;
        let perfil = (await db.candidateProfile.findUnique({ where: { userId: principal.userId } })) as ProfileRow | null;
        if (!perfil) {
          if (!passo.criar) {
            throw new NotFoundError("Perfil não iniciado: preenche primeiro os dados pessoais");
          }
          try {
            perfil = (await db.candidateProfile.create({
              data: await passo.criar(tx, principal.userId),
            })) as ProfileRow;
          } catch (erro) {
            if (!codigoP2002(erro)) throw erro;
            // Corrida: o mesmo utilizador criou a fila noutro pedido, ou o BI
            // colidiu com outra conta. Distinguir pelo hash da fila existente.
            perfil = (await db.candidateProfile.findUnique({ where: { userId: principal.userId } })) as ProfileRow | null;
            if (!perfil) throw new ConflictError(BI_EM_OUTRA_CONTA);
          }
        }
        const { dados, depois } = await passo.gravar(tx, perfil);
        const unificado = { ...perfil, ...dados } as ProfileRow;
        const passos = passosDeDados(unificado);
        const completo = (["pessoais", "contactos", "formacao", "competencias"] as const).every((p) => passos.includes(p));
        const actualizado = (await db.candidateProfile.update({
          where: { id: perfil.id },
          data: {
            ...dados,
            lastActivityAt: agora,
            profileCompletedAt: completo ? (perfil.profileCompletedAt ?? agora) : perfil.profileCompletedAt,
          },
        })) as ProfileRow;
        if (depois) await depois(tx, perfil.id);
        return { perfil: actualizado, passos: passosDeDados(unificado) };
      });
    } catch (erro) {
      if (codigoP2002(erro)) throw new ConflictError(BI_EM_OUTRA_CONTA);
      throw erro;
    }
  }

  /** Leitura do próprio perfil, com BI/NUIT decifrados para preencher o formulário. */
  async function getOwn(principal: Principal) {
    assertCan(principal, "own.profileManage", { ownerUserId: principal.userId });
    const perfil = (await client.candidateProfile.findUnique({
      where: { userId: principal.userId },
      include: { skills: { select: { skillId: true } } },
    })) as (ProfileRow & { skills: Array<{ skillId: string }> }) | null;
    if (!perfil) return { perfil: null, biNumber: null, nuit: null, skillIds: [] as string[], passos: [] as ProfileStep[] };
    return {
      perfil,
      biNumber: perfil.biNumberEnc ? decryptPii(perfil.biNumberEnc) : null,
      nuit: perfil.nuitEnc ? decryptPii(perfil.nuitEnc) : null,
      skillIds: perfil.skills.map((s) => s.skillId),
      passos: passosDeDados(perfil),
    };
  }

  async function saveStepPersonal(principal: Principal, input: unknown) {
    const dados = stepPersonalSchema.parse(input);
    const hash = piiHmac(dados.biNumber);
    const campos = {
      fullName: dados.fullName,
      birthDate: dados.birthDate,
      sex: dados.sex ?? null,
      biNumberEnc: encryptPii(dados.biNumber),
      biNumberHash: hash,
      biExpiryDate: dados.biExpiryDate,
      nuitEnc: dados.nuit ? encryptPii(dados.nuit) : null,
    };
    async function verificarBiUnico(tx: DbClient) {
      const duplicado = await (tx as PrismaClient).candidateProfile.findFirst({
        where: { biNumberHash: hash, userId: { not: principal.userId } },
        select: { id: true },
      });
      if (duplicado) throw new ConflictError(BI_EM_OUTRA_CONTA);
    }
    return guarda(principal, {
      criar: async (tx) => {
        await verificarBiUnico(tx);
        return { userId: principal.userId, ...campos };
      },
      gravar: async (tx) => {
        await verificarBiUnico(tx);
        return { dados: campos };
      },
    });
  }

  async function saveStepContacts(principal: Principal, input: unknown) {
    const dados = stepContactsSchema.parse(input);
    return guarda(principal, {
      gravar: async () => ({
        dados: {
          phoneE164: dados.phone,
          phoneAltE164: dados.phoneAlt ?? null,
          province: dados.province,
          city: dados.city,
          neighbourhood: dados.neighbourhood ?? null,
        },
      }),
    });
  }

  async function saveStepEducation(principal: Principal, input: unknown) {
    const dados = stepEducationSchema.parse(input);
    return guarda(principal, {
      gravar: async (tx) => {
        if (dados.institutionId) {
          const instituicao = await (tx as PrismaClient).institution.findFirst({
            where: { id: dados.institutionId, active: true },
            select: { id: true },
          });
          if (!instituicao) throw new NotFoundError("Instituição não encontrada");
        }
        if (dados.courseId) {
          const curso = await (tx as PrismaClient).course.findFirst({
            where: { id: dados.courseId, active: true },
            select: { id: true },
          });
          if (!curso) throw new NotFoundError("Curso não encontrado");
        }
        return {
          dados: {
            institutionId: dados.institutionId ?? null,
            institutionOther: dados.institutionOther ?? null,
            courseId: dados.courseId ?? null,
            courseOther: dados.courseOther ?? null,
            academicStatus: dados.academicStatus,
            graduationDate: dados.graduationDate,
            declaredAverage: dados.declaredAverage,
          },
        };
      },
    });
  }

  async function saveStepSkills(principal: Principal, input: unknown) {
    const dados = stepSkillsSchema.parse(input);
    return guarda(principal, {
      gravar: async (tx) => {
        const db = tx as PrismaClient;
        const locaisUnicos = [...new Set(dados.availableLocationIds)];
        const locais = await db.location.count({ where: { id: { in: locaisUnicos }, active: true } });
        if (locais !== locaisUnicos.length) throw new NotFoundError("Local de disponibilidade não encontrado");
        const unicos = [...new Set(dados.skillIds)];
        if (unicos.length > 0) {
          const competencias = await db.skill.count({ where: { id: { in: unicos }, active: true } });
          if (competencias !== unicos.length) throw new NotFoundError("Competência não encontrada");
        }
        return {
          dados: {
            languagesJson: JSON.stringify(dados.languages),
            availableLocationsJson: JSON.stringify(locaisUnicos),
          },
          // Competências declaradas na tabela de junção (fonte SELF): substituição total.
          depois: async (tx2, perfilId) => {
            const db2 = tx2 as PrismaClient;
            await db2.candidateSkill.deleteMany({ where: { candidateId: perfilId } });
            if (unicos.length > 0) {
              await db2.candidateSkill.createMany({
                data: unicos.map((skillId) => ({ candidateId: perfilId, skillId, source: "SELF" })),
              });
            }
          },
        };
      },
    });
  }

  deps.logger?.debug("servico de perfil criado");

  return { getOwn, saveStepPersonal, saveStepContacts, saveStepEducation, saveStepSkills, listFormCatalog };

  /** Catálogos activos para os selectores do formulário do perfil (RF-CAN-01). */
  async function listFormCatalog() {
    const [instituicoes, cursos, competencias, locais] = await Promise.all([
      client.institution.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      client.course.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      client.skill.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      client.location.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return { instituicoes, cursos, competencias, locais };
  }
}
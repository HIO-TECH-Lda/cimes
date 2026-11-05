import { assertCan, canAct, coveredScopes } from "@/server/auth/assert-can";
import type { Principal } from "@/server/auth/principal";
import { principalHeadDepartments, principalRoles } from "@/server/auth/principal";
import type { Clock } from "@/server/infra/clock";
import { ForbiddenError, NotFoundError } from "@/server/domain/errors";
import {
  openingDraftCompleteSchema,
  openingPublicationSchema,
  openingPublishedEditSchema,
  openingScoringSchema,
  type OpeningDraftInput,
  type OpeningPublicationInput,
  type OpeningPublishedEditInput,
  type OpeningScoringInput,
} from "@/server/domain/opening";
import { formatSequenceCode, sequenceKey, type SequencePrefix } from "@/server/domain/sequence";
import { canTransition, TransitionError, type OpeningActor, type OpeningStatus } from "@/server/domain/state-machines/opening";
import { createAuditService, type AuditService } from "@/server/services/audit";
import type { SettingService } from "@/server/services/settings";
import { createNotificationRepository, type NotificationRepository } from "@/server/repositories/notification-repository";
import { createOpeningRepository, type OpeningRepository } from "@/server/repositories/opening-repository";
import { createRoleAssignmentRepository } from "@/server/repositories/role-assignment-repository";
import { createSequenceRepository } from "@/server/repositories/sequence-repository";
import type { Prisma, PrismaClient } from "@/server/repositories/db";
import type { DbClient } from "@/server/repositories/db";
import type { Logger } from "@/server/infra/logger";

/**
 * Vagas (M03, RF-VAG-01 a 07): pedido do chefe (D) ou do RH, aprovação pelo
 * Gestor de RH (D.2), publicação com janela de candidatura (RF-VAG-03) e
 * fecho — pela tarefa a cada 5 minutos ou pelo RH. Toda a mudança de estado
 * verifica a máquina D.2, a permissão (C.3), grava auditoria e enfileira as
 * notificações (N-21 ao RH, N-22 ao chefe, N-04 nos cancelamentos), tudo na
 * mesma transacção. Falta de permissão sobre um registo é 404 (R-04).
 */

export type OpeningService = ReturnType<typeof createOpeningService>;

type OpeningRow = NonNullable<Awaited<ReturnType<OpeningRepository["findById"]>>>;

/** Actores D.2 correspondentes aos papéis do principal. */
function openingActors(principal: Principal): OpeningActor[] {
  const roles = principalRoles(principal);
  const actors: OpeningActor[] = [];
  if (roles.includes("DEPARTMENT_HEAD")) actors.push("DEPARTMENT_HEAD");
  if (roles.includes("HR_OFFICER")) actors.push("HR_OFFICER");
  if (roles.includes("HR_MANAGER")) actors.push("HR_MANAGER");
  return actors;
}

function assertAnyTransition(
  from: OpeningStatus,
  to: OpeningStatus,
  actors: OpeningActor[],
): void {
  if (!actors.some((a) => canTransition(from, to, a))) {
    throw new TransitionError(`Transição ${from} → ${to} não permitida para estes papéis (D.2)`);
  }
}

/** Estados terminais da candidatura (D.2) para as condições da vaga. */
export const APPLICATION_TERMINAL_STATUSES = ["ACCEPTED", "DECLINED", "NOT_SELECTED", "WITHDRAWN"] as const;

export function createOpeningService(deps: {
  prisma: PrismaClient;
  audit: AuditService;
  settings: SettingService;
  clock: Clock;
  logger?: Logger;
  /** Fábrica de auditoria (para gravar na mesma transacção; injectável em testes). */
  createAudit?: (client: DbClient) => AuditService;
}) {
  const { prisma, clock, logger } = deps;
  const novoAudit = deps.createAudit ?? ((client: DbClient) => createAuditService(client));
  const openings = createOpeningRepository(prisma);

  /** Lista do back-office com âmbito (RF-VAG-07): RH vê tudo; chefe, o seu. */
  function departmentFilter(principal: Principal): string[] | null {
    const scopes = coveredScopes(principal, "opening.view");
    if (scopes.includes("ALL")) return null;
    const departamentos = principalHeadDepartments(principal);
    if (departamentos.length === 0) throw new ForbiddenError("Acesso negado a vagas");
    return departamentos;
  }

  /** Carrega uma vaga com verificação de âmbito (fora do âmbito → 404, R-04). */
  async function loadScoped(principal: Principal, openingId: string): Promise<OpeningRow> {
    const opening = await openings.findById(openingId);
    if (!opening) throw new NotFoundError();
    assertCan(principal, "opening.view", { departmentId: opening.departmentId });
    return opening;
  }

  /** RF-VAG-01: campos obrigatórios presentes (condição da D.2). */
  function isFieldsComplete(opening: OpeningRow): boolean {
    const rascunho = openingDraftCompleteSchema.safeParse({
      title: opening.title,
      departmentId: opening.departmentId,
      locationId: opening.locationId,
      positions: opening.positions,
      description: opening.description,
      requirements: opening.requirements,
      acceptsFinalists: opening.acceptsFinalists,
      acceptsGraduates: opening.acceptsGraduates,
      courseIds: opening.courses.map((c) => c.courseId),
      fieldOfStudyIds: opening.fields.map((f) => f.fieldOfStudyId),
      durationMonths: opening.durationMonths,
      expectedStartDate: opening.expectedStartDate,
      keySubjects: opening.keySubjects.map((k) => ({ keySubjectId: k.keySubjectId, weight: k.weight })),
      skills: opening.skills.map((s) => ({ skillId: s.skillId, required: s.required, weight: s.weight })),
      scoringWeights: JSON.parse(opening.scoringWeightsJson ?? "{}") as Record<string, number>,
    });
    return rascunho.success;
  }

  function actorFor(principal: Principal): { userId: string; roles: string[] } {
    return { userId: principal.userId, roles: [...new Set(principal.roles.map((r) => r.role))] };
  }

  /**
   * Mudança de estado na mesma transacção: valida D.2 (com actor SYSTEM
   * opcional), condição única contra o estado visto, grava auditoria e
   * corre o efeito (notificações) — R-11 e D.2.
   */
  async function transition(input: {
    principal: Principal | null;
    systemActor?: boolean;
    openingId: string;
    to: OpeningStatus;
    data: Record<string, unknown>;
    summary: string;
    effects?: (ctx: { tx: Prisma.TransactionClient; opening: OpeningRow }) => Promise<void>;
  }) {
    const opening = await openings.findById(input.openingId);
    if (!opening) throw new NotFoundError();
    if (input.principal) {
      assertCan(input.principal, "opening.view", { departmentId: opening.departmentId });
    }
    const actors: OpeningActor[] = input.systemActor
      ? ["SYSTEM"]
      : openingActors(input.principal ?? { userId: "", userType: "STAFF", roles: [] });
    if (!actors.some((a) => canTransition(opening.status as OpeningStatus, input.to, a))) {
      throw new TransitionError(
        `Transição ${opening.status} → ${input.to} não permitida (D.2)`,
      );
    }
    // A condição é validada fora da transacção contra o estado visto; a
    // mudança em si é condicional ao estado (nada de corridas).
    return prisma.$transaction(async (tx) => {
      const count = await tx.opening.updateMany({
        where: { id: input.openingId, status: opening.status },
        data: { ...input.data, status: input.to, version: { increment: 1 } } as Record<string, unknown>,
      });
      if (count.count === 0) {
        throw new TransitionError("A vaga mudou de estado entretanto; repita a operação");
      }
      const audit = novoAudit(tx);
      await audit.record({
        actor: input.principal ? actorFor(input.principal) : { userId: null, roles: ["SYSTEM"] },
        action: "OPENING_STATUS_CHANGED",
        entityType: "opening",
        entityId: input.openingId,
        summary: input.summary,
        diff: { status: { antigo: opening.status, novo: input.to } },
      });
      if (input.effects) {
        await input.effects({ tx, opening: { ...opening, status: input.to } });
      }
      return (await tx.opening.findUnique({
        where: { id: input.openingId },
      })) as unknown as OpeningRow;
    });
  }

  /** Notificações N-21 (ao RH) na submissão — Anexo E. */
  async function notifyReviewers(tx: Prisma.TransactionClient, opening: OpeningRow, autorNome: string) {
    const notifications: NotificationRepository = createNotificationRepository(tx);
    const roles = createRoleAssignmentRepository(tx);
    const now = clock.now();
    const destinatarios = await roles.findValidRecipients(["HR_OFFICER", "HR_MANAGER"], now);
    for (const r of destinatarios) {
      await notifications.create({
        templateCode: "N-21",
        recipientUserId: r.userId,
        recipientEmail: r.email,
        payload: { codigo: opening.code, titulo: opening.title, autor: autorNome },
        idempotencyKey: `N-21::OPENING:${opening.id}:${r.userId}:SUBMITTED`,
      });
    }
  }

  /** N-22 (aprovado ou devolvido) ao autor do pedido — Anexo E. */
  async function notifyAuthor(
    tx: Prisma.TransactionClient,
    opening: OpeningRow,
    devolvido: boolean,
    comentario: string | null,
  ) {
    const notifications: NotificationRepository = createNotificationRepository(tx);
    const autor = await tx.user.findUnique({
      where: { id: opening.createdById },
      select: { id: true, email: true },
    });
    if (!autor) return;
    await notifications.create({
      templateCode: "N-22",
      recipientUserId: autor.id,
      recipientEmail: autor.email,
      payload: { codigo: opening.code, titulo: opening.title, devolvido, comentario: comentario ?? "" },
      idempotencyKey: `N-22::OPENING:${opening.id}:${autor.id}:${devolvido ? "DEVOLVIDO" : "APROVADO"}:${Date.now()}`,
    });
  }

  /** N-04 (OPENING_CANCELLED) a cada candidato afectado — Anexo E. */
  async function notifyCancelledCandidates(
    tx: Prisma.TransactionClient,
    opening: OpeningRow,
    candidatos: Array<{ userId: string; email: string }>,
  ) {
    const notifications: NotificationRepository = createNotificationRepository(tx);
    for (const c of candidatos) {
      await notifications.create({
        templateCode: "N-04",
        variant: "OPENING_CANCELLED",
        recipientUserId: c.userId,
        recipientEmail: c.email,
        payload: { codigoVaga: opening.code, titulo: opening.title },
        idempotencyKey: `N-04:OPENING_CANCELLED:OPENING:${opening.id}:${c.userId}`,
      });
    }
  }

  return {
    /**
     * RF-VAG-01/05: cria o pedido em rascunho com código `VAG-AAAA-NNNN`
     * (contadores atómicos por ano). O chefe (D) só pode pedir para o seu
     * departamento (C.3, DEPARTMENT scope).
     */
    async create(principal: Principal, input: OpeningDraftInput) {
      if (!canAct(principal, "opening.requestCreate")) throw new ForbiddenError("Acesso negado para esta acção");
      const parsed = openingDraftCompleteSchema.parse(input);
      const scopes = coveredScopes(principal, "opening.requestCreate");
      if (!scopes.includes("ALL") && !principalHeadDepartments(principal).includes(parsed.departmentId)) {
        throw new ForbiddenError("Só pode pedir vagas para o seu departamento");
      }
      const now = clock.now();
      const ano = now.getUTCFullYear();

      // Validação de catálogos no servidor (R-06): ids têm de existir.
      const [departamento, local] = await Promise.all([
        prisma.department.findUnique({ where: { id: parsed.departmentId }, select: { id: true } }),
        prisma.location.findUnique({ where: { id: parsed.locationId }, select: { id: true } }),
      ]);
      if (!departamento) throw new NotFoundError();
      if (!local) throw new NotFoundError();
      const maxMeses = Number(await deps.settings.get("internship.durationMaxMonths") ?? 12);
      if (parsed.durationMonths > maxMeses) {
        throw new ForbiddenError(`A duração máxima permitida é ${maxMeses} meses`);
      }
      if (parsed.proposedTutorUserId) {
        const tutor = await prisma.user.findUnique({
          where: { id: parsed.proposedTutorUserId },
          select: { id: true, userType: true },
        });
        if (!tutor || tutor.userType !== "STAFF") throw new NotFoundError();
      }
      await assertCatalogIds(prisma, parsed);

      return prisma.$transaction(async (tx) => {
        const valor = await createSequenceRepository(tx).nextValue(sequenceKey("VAG" as SequencePrefix, ano));
        const code = formatSequenceCode("VAG", ano, valor);
        const audit = novoAudit(tx);
        const created = await createOpeningRepository(tx).create({
          code,
          title: parsed.title,
          departmentId: parsed.departmentId,
          locationId: parsed.locationId,
          cycleId: parsed.cycleId ?? null,
          positions: parsed.positions,
          description: parsed.description,
          requirements: parsed.requirements,
          acceptsFinalists: parsed.acceptsFinalists,
          acceptsGraduates: parsed.acceptsGraduates,
          maxMonthsSinceGraduation: 24,
          durationMonths: parsed.durationMonths,
          expectedStartDate: parsed.expectedStartDate,
          stipendAmount: parsed.stipendAmount ?? null,
          stipendVisible: parsed.stipendVisible ?? false,
          proposedTutorUserId: parsed.proposedTutorUserId ?? null,
          scoringWeightsJson: JSON.stringify(parsed.scoringWeights),
          status: "DRAFT",
          createdById: principal.userId,
          courses: { create: parsed.courseIds.map((courseId) => ({ courseId })) },
          fields: { create: parsed.fieldOfStudyIds.map((fieldOfStudyId) => ({ fieldOfStudyId })) },
          keySubjects: { create: parsed.keySubjects.map((k) => ({ keySubjectId: k.keySubjectId, weight: k.weight })) },
          skills: {
            create: parsed.skills.map((s) => ({ skillId: s.skillId, required: s.required, weight: s.weight })),
          },
        });
        await audit.record({
          actor: actorFor(principal),
          action: "OPENING_STATUS_CHANGED",
          entityType: "opening",
          entityId: created.id,
          summary: `Pedido de vaga ${code} criado em rascunho`,
          diff: null,
        });
        return created;
      });
    },

    /** Vaga por id, com âmbito (R-04). */
    async get(principal: Principal, openingId: string) {
      return loadScoped(principal, openingId);
    },

    /** Lista do back-office com contadores de candidaturas (RF-VAG-07). */
    async list(principal: Principal, filters: { status?: string; page?: number; pageSize?: number } = {}) {
      if (!canAct(principal, "opening.view")) throw new ForbiddenError("Acesso negado a vagas");
      const page = Math.max(1, filters.page ?? 1);
      const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
      const departmentIds = departmentFilter(principal);
      const { total, rows } = await openings.listForBackoffice({ departmentIds, status: filters.status, page, pageSize });
      const contadores = await openings.applicationCountsByStatus(rows.map((r) => r.id));
      return {
        total,
        page,
        pageSize,
        rows: rows.map((r) => ({ ...r, applicationCounts: contadores.get(r.id) ?? {} })),
      };
    },

    /** DRAFT → SUBMITTED: valida campos (RF-VAG-01) e notifica o RH (N-21). */
    async submit(principal: Principal, openingId: string) {
      const opening = await loadScoped(principal, openingId);
      if (!canAct(principal, "opening.submit")) throw new ForbiddenError("Acesso negado para esta acção");
      assertCan(principal, "opening.submit", { departmentId: opening.departmentId });
      assertAnyTransition(opening.status as OpeningStatus, "SUBMITTED", openingActors(principal));
      if (!isFieldsComplete(opening)) {
        throw new ForbiddenError("Campos obrigatórios do pedido em falta (RF-VAG-01)");
      }
      return transition({
        principal,
        openingId,
        to: "SUBMITTED",
        data: { submittedAt: clock.now() },
        summary: `Pedido de vaga ${opening.code} submetido para aprovação`,
        effects: async ({ tx, opening: recarregada }) => {
          const autor = await tx.user.findUnique({
            where: { id: recarregada.createdById },
            select: { name: true },
          });
          await notifyReviewers(tx, recarregada, autor?.name ?? "autor do pedido");
        },
      });
    },

    /** SUBMITTED → DRAFT: devolução com comentário obrigatório (N-22). */
    async returnToDraft(principal: Principal, openingId: string, comment: string) {
      const trimmed = comment.trim();
      if (!trimmed) throw new ForbiddenError("Comentário obrigatório na devolução (D.2)");
      const opening = await loadScoped(principal, openingId);
      assertAnyTransition(opening.status as OpeningStatus, "DRAFT", openingActors(principal));
      assertCan(principal, "opening.requestReview");
      return transition({
        principal,
        openingId,
        to: "DRAFT",
        data: { reviewComment: trimmed },
        summary: `Pedido de vaga ${opening.code} devolvido: ${trimmed.slice(0, 100)}`,
        effects: async ({ tx, opening: recarregada }) => {
          await notifyAuthor(tx, recarregada, true, trimmed);
        },
      });
    },

    /** SUBMITTED → APPROVED (N-22 ao chefe). */
    async approve(principal: Principal, openingId: string) {
      const opening = await loadScoped(principal, openingId);
      assertAnyTransition(opening.status as OpeningStatus, "APPROVED", openingActors(principal));
      assertCan(principal, "opening.requestReview");
      return transition({
        principal,
        openingId,
        to: "APPROVED",
        data: { approvedById: principal.userId, approvedAt: clock.now() },
        summary: `Pedido de vaga ${opening.code} aprovado pelo Gestor de RH`,
        effects: async ({ tx, opening: recarregada }) => {
          await notifyAuthor(tx, recarregada, false, null);
        },
      });
    },

    /** APPROVED → PUBLISHED com janela de candidatura (RF-VAG-03). */
    async publish(principal: Principal, openingId: string, janela: OpeningPublicationInput) {
      const opening = await loadScoped(principal, openingId);
      assertCan(principal, "opening.publish", { departmentId: opening.departmentId });
      assertAnyTransition(opening.status as OpeningStatus, "PUBLISHED", openingActors(principal));
      const parsed = openingPublicationSchema.parse(janela);
      const now = clock.now();
      if (parsed.applicationCloseAt.getTime() <= now.getTime()) {
        throw new ForbiddenError("O prazo de candidatura tem de ser no futuro (RF-VAG-03)");
      }
      return transition({
        principal,
        openingId,
        to: "PUBLISHED",
        data: {
          applicationOpenAt: parsed.applicationOpenAt,
          applicationCloseAt: parsed.applicationCloseAt,
          publishedAt: now,
        },
        summary: `Vaga ${opening.code} publicada com candidaturas até ${parsed.applicationCloseAt.toISOString()}`,
      });
    },

    /** RF-VAG-06 (parte 1): descrição e prazo, com prorrogação auditada. */
    async editPublished(principal: Principal, openingId: string, input: OpeningPublishedEditInput) {
      const opening = await loadScoped(principal, openingId);
      assertCan(principal, "opening.editPublished", { departmentId: opening.departmentId });
      if (opening.status !== "PUBLISHED") {
        throw new TransitionError("Só uma vaga publicada se edita por aqui (RF-VAG-06)");
      }
      const parsed = openingPublishedEditSchema.parse(input);
      if (!parsed.description && !parsed.applicationCloseAt) return opening;
      const agora = clock.now();
      const prorroga =
        parsed.applicationCloseAt != null &&
        opening.applicationCloseAt != null &&
        parsed.applicationCloseAt.getTime() > opening.applicationCloseAt.getTime();
      if (parsed.applicationCloseAt != null && parsed.applicationCloseAt.getTime() <= agora.getTime()) {
        throw new ForbiddenError("O novo prazo tem de ser no futuro (RF-VAG-06)");
      }
      return prisma.$transaction(async (tx) => {
        const audit = novoAudit(tx);
        await tx.opening.update({
          where: { id: openingId },
          data: {
            description: parsed.description ?? undefined,
            applicationCloseAt: parsed.applicationCloseAt ?? undefined,
            version: { increment: 1 },
          },
        });
        await audit.record({
          actor: actorFor(principal),
          action: "OPENING_STATUS_CHANGED",
          entityType: "opening",
          entityId: openingId,
          summary: prorroga
            ? `Vaga ${opening.code} prorrogada até ${parsed.applicationCloseAt?.toISOString()}`
            : `Vaga ${opening.code} editada após publicação`,
          diff: {
            ...(parsed.description ? { description: { antigo: "anterior", novo: "actualizada" } } : {}),
            ...(parsed.applicationCloseAt
              ? { applicationCloseAt: { antigo: opening.applicationCloseAt?.toISOString() ?? "", novo: parsed.applicationCloseAt.toISOString() } }
              : {}),
          },
        });
        return (await tx.opening.findUnique({ where: { id: openingId } })) as unknown as OpeningRow;
      });
    },

    /** RF-VAG-06 (parte 2): perfil de score editável até ao fecho. */
    async editScoring(principal: Principal, openingId: string, input: OpeningScoringInput) {
      const opening = await loadScoped(principal, openingId);
      assertCan(principal, "opening.editScoring", { departmentId: opening.departmentId });
      if (opening.status === "COMPLETED" || opening.status === "CANCELLED") {
        throw new TransitionError("Vaga terminada: o perfil de score não muda");
      }
      const parsed = openingScoringSchema.parse(input);
      await assertCatalogIds(prisma, {
        courseIds: [],
        fieldOfStudyIds: [],
        keySubjects: parsed.keySubjects,
        skills: parsed.skills,
      });
      return prisma.$transaction(async (tx) => {
        await tx.openingKeySubject.deleteMany({ where: { openingId } });
        await tx.openingSkill.deleteMany({ where: { openingId } });
        await tx.opening.update({
          where: { id: openingId },
          data: {
            scoringWeightsJson: JSON.stringify(parsed.scoringWeights),
            keySubjects: { create: parsed.keySubjects.map((k) => ({ keySubjectId: k.keySubjectId, weight: k.weight })) },
            skills: {
              create: parsed.skills.map((s) => ({ skillId: s.skillId, required: s.required, weight: s.weight })),
            },
            version: { increment: 1 },
          },
        });
        const audit = novoAudit(tx);
        await audit.record({
          actor: actorFor(principal),
          action: "OPENING_STATUS_CHANGED",
          entityType: "opening",
          entityId: openingId,
          summary: `Perfil de score da vaga ${opening.code} actualizado (recálculo na triagem, RF-TRI-04)`,
          diff: null,
        });
        return (await tx.opening.findUnique({ where: { id: openingId } })) as unknown as OpeningRow;
      });
    },

    /** PUBLISHED → CLOSED (RH manual; o sistema usa `closeExpired`). */
    async close(principal: Principal, openingId: string) {
      const opening = await loadScoped(principal, openingId);
      assertCan(principal, "opening.close", { departmentId: opening.departmentId });
      assertAnyTransition(opening.status as OpeningStatus, "CLOSED", openingActors(principal));
      return transition({
        principal,
        openingId,
        to: "CLOSED",
        data: { closedAt: clock.now() },
        summary: `Vaga ${opening.code} fechada pelo RH`,
      });
    },

    /** CLOSED → PUBLISHED: reabertura com novo prazo e motivo (auditada). */
    async reopen(principal: Principal, openingId: string, applicationCloseAt: Date, motivo: string) {
      const trimmed = motivo.trim();
      if (!trimmed) throw new ForbiddenError("Motivo obrigatório na reabertura (D.2)");
      const opening = await loadScoped(principal, openingId);
      assertAnyTransition(opening.status as OpeningStatus, "PUBLISHED", openingActors(principal));
      assertCan(principal, "opening.reopen");
      if (applicationCloseAt.getTime() <= clock.now().getTime()) {
        throw new ForbiddenError("O novo prazo tem de ser no futuro (D.2)");
      }
      return transition({
        principal,
        openingId,
        to: "PUBLISHED",
        data: { applicationCloseAt, applicationOpenAt: opening.applicationOpenAt ?? clock.now(), closedAt: null },
        summary: `Vaga ${opening.code} reaberta até ${applicationCloseAt.toISOString()}: ${trimmed.slice(0, 100)}`,
      });
    },

    /** CLOSED → COMPLETED: todas as candidaturas em estado terminal. */
    async complete(principal: Principal, openingId: string) {
      const opening = await loadScoped(principal, openingId);
      assertCan(principal, "opening.complete", { departmentId: opening.departmentId });
      assertAnyTransition(opening.status as OpeningStatus, "COMPLETED", openingActors(principal));
      const naoterminais = await prisma.application.count({
        where: { openingId, status: { notIn: [...APPLICATION_TERMINAL_STATUSES] } },
      });
      if (naoterminais > 0) {
        throw new ForbiddenError(
          `Há ${naoterminais} candidaturas fora de estado terminal (D.2)`,
        );
      }
      return transition({
        principal,
        openingId,
        to: "COMPLETED",
        data: { completedAt: clock.now() },
        summary: `Vaga ${opening.code} concluída`,
      });
    },

    /** → CANCELLED (Gestor de RH, motivo obrigatório): N-04 aos candidatos. */
    async cancel(principal: Principal, openingId: string, motivo: string) {
      const trimmed = motivo.trim();
      if (!trimmed) throw new ForbiddenError("Motivo obrigatório no cancelamento (D.2)");
      const opening = await loadScoped(principal, openingId);
      assertCan(principal, "opening.cancel");
      assertAnyTransition(opening.status as OpeningStatus, "CANCELLED", openingActors(principal));
      const naoterminais = await prisma.application.findMany({
        where: { openingId, status: { notIn: [...APPLICATION_TERMINAL_STATUSES] } },
        select: { id: true, candidate: { select: { userId: true, user: { select: { email: true } } } } },
      });
      return transition({
        principal,
        openingId,
        to: "CANCELLED",
        data: { cancelReason: trimmed, cancelledAt: clock.now() },
        summary: `Vaga ${opening.code} cancelada: ${trimmed.slice(0, 100)}`,
        effects: async ({ tx }) => {
          if (naoterminais.length > 0) {
            await tx.application.updateMany({
              where: { id: { in: naoterminais.map((a) => a.id) } },
              data: { status: "NOT_SELECTED", decisionReason: "OPENING_CANCELLED", decidedAt: clock.now() },
            });
            await notifyCancelledCandidates(
              tx,
              { ...opening, status: "CANCELLED" },
              naoterminais.map((a) => ({ userId: a.candidate.userId, email: a.candidate.user.email })),
            );
          }
        },
      });
    },

    /**
     * RF-VAG-03: fecha as vagas publicadas cujo prazo venceu — corre na
     * tarefa `openings.closeExpired` a cada 5 minutos; a submissão verifica
     * a hora no servidor independentemente disto (RN-VAG-01).
     */
    async closeExpired(): Promise<string[]> {
      const agora = clock.now();
      const vencidas = await openings.findExpired(agora);
      const fechadas: string[] = [];
      for (const vaga of vencidas) {
        try {
          await transition({
            principal: null,
            systemActor: true,
            openingId: vaga.id,
            to: "CLOSED",
            data: { closedAt: agora },
            summary: `Vaga ${vaga.code} fechada automaticamente (prazo vencido)`,
          });
          fechadas.push(vaga.code);
        } catch (error) {
          logger?.warn({ openingId: vaga.id, err: error instanceof Error ? error.message : String(error) }, "fecho automático falhou");
        }
      }
      return fechadas;
    },

    /** Portal público (RF-VAG-04): lista e detalhe, sem autenticação. */
    async publicList(filters: { locationCode?: string; fieldOfStudyId?: string } = {}) {
      return openings.listPublished({ now: clock.now(), locationCode: filters.locationCode, fieldOfStudyId: filters.fieldOfStudyId });
    },

    async publicDetail(code: string) {
      const opening = await openings.findPublishedByCode(code, clock.now());
      if (!opening) throw new NotFoundError();
      return opening;
    },
  };
}

/** Verifica que todos os ids de catálogo referenciados existem (R-06). */
async function assertCatalogIds(
  prisma: PrismaClient,
  parsed: Pick<OpeningDraftInput, "courseIds" | "fieldOfStudyIds" | "keySubjects" | "skills">,
) {
  const [cursos, areas, disciplinas, competencias] = await Promise.all([
    parsed.courseIds.length > 0
      ? prisma.course.count({ where: { id: { in: parsed.courseIds }, active: true } })
      : Promise.resolve(0),
    parsed.fieldOfStudyIds.length > 0
      ? prisma.fieldOfStudy.count({ where: { id: { in: parsed.fieldOfStudyIds }, active: true } })
      : Promise.resolve(0),
    parsed.keySubjects.length > 0
      ? prisma.keySubject.count({ where: { id: { in: parsed.keySubjects.map((k) => k.keySubjectId) }, active: true } })
      : Promise.resolve(0),
    parsed.skills.length > 0
      ? prisma.skill.count({ where: { id: { in: parsed.skills.map((s) => s.skillId) }, active: true } })
      : Promise.resolve(0),
  ]);
  if (cursos !== parsed.courseIds.length) throw new NotFoundError();
  if (areas !== parsed.fieldOfStudyIds.length) throw new NotFoundError();
  if (disciplinas !== parsed.keySubjects.length) throw new NotFoundError();
  if (competencias !== parsed.skills.length) throw new NotFoundError();
}
import Link from "next/link";
import { notFound } from "next/navigation";

import { pt } from "@/i18n/pt-MZ";
import { createAuditService } from "@/server/services/audit";
import { createOpeningService } from "@/server/services/openings";
import { createSettingService } from "@/server/services/settings";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Portal público — detalhe da vaga publicada (RF-VAG-04): título, departamento,
 * local, descrição, requisitos, estatutos, cursos aceites, duração, início
 * previsto, prazo e subsídio (só se visível). SSR, funciona sem JavaScript;
 * vaga inexistente, não publicada ou com janela fechada é 404 (RN-VAG-01).
 */
export default async function VagaDetalhePage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const prisma = getPrismaClient();
  const service = createOpeningService({
    prisma,
    audit: createAuditService(prisma),
    settings: createSettingService({ prisma, audit: createAuditService(prisma) }),
    clock: { now: () => new Date() },
  });

  let vaga: Awaited<ReturnType<typeof service.publicDetail>>;
  try {
    vaga = await service.publicDetail(codigo);
  } catch {
    notFound();
  }

  const fmt = new Intl.DateTimeFormat("pt-MZ", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
  const estatutos = [
    vaga.acceptsFinalists ? pt.vagas.finalistas : null,
    vaga.acceptsGraduates ? pt.vagas.graduados : null,
  ].filter(Boolean);
  const cursos = vaga.courses.map((c) => c.course.name);
  const areas = vaga.fields.map((f) => f.fieldOfStudy.name);

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/vagas" className="text-sm underline">
        ← {pt.vagas.titulo}
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{vaga.title}</h1>
      <p className="text-muted-foreground mt-2">
        {vaga.code} · {vaga.department.name} · {vaga.location.name}
      </p>

      <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium">{pt.vagas.candidaturasAte}</dt>
          <dd className="text-sm text-muted-foreground">{vaga.applicationCloseAt ? fmt.format(vaga.applicationCloseAt) : ""}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium">{pt.vagas.posicoes}</dt>
          <dd className="text-sm text-muted-foreground">{vaga.positions}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium">{pt.vagas.duracao}</dt>
          <dd className="text-sm text-muted-foreground">
            {vaga.durationMonths} {pt.vagas.meses}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium">{pt.vagas.inicioPrevisto}</dt>
          <dd className="text-sm text-muted-foreground">{vaga.expectedStartDate ? fmt.format(vaga.expectedStartDate) : ""}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium">{pt.vagas.estatutos}</dt>
          <dd className="text-sm text-muted-foreground">{estatutos.join(" · ")}</dd>
        </div>
        {vaga.stipendVisible && vaga.stipendAmount != null && (
          <div>
            <dt className="text-sm font-medium">{pt.vagas.subsidio}</dt>
            <dd className="text-sm text-muted-foreground">
              {vaga.stipendAmount != null &&
                new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN" }).format(Number(vaga.stipendAmount))}
            </dd>
          </div>
        )}
      </dl>

      {(cursos.length > 0 || areas.length > 0) && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">{pt.vagas.cursosAceites}</h2>
          <p className="text-sm text-muted-foreground mt-1">{[...cursos, ...areas].join(", ")}</p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{pt.vagas.descricao}</h2>
        <p className="mt-1 whitespace-pre-line text-sm leading-6">{vaga.description}</p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">{pt.vagas.requisitos}</h2>
        <p className="mt-1 whitespace-pre-line text-sm leading-6">{vaga.requirements}</p>
      </section>

      <div className="mt-10 rounded-lg border p-5">
        <p className="text-sm">{pt.vagas.entrarParaCandidatar}</p>
        <a href="/entrar" className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          {pt.nav.entrar}
        </a>
      </div>
    </article>
  );
}
import Link from "next/link";

import { pt } from "@/i18n/pt-MZ";
import { createAuditService } from "@/server/services/audit";
import { createOpeningService } from "@/server/services/openings";
import { createSettingService } from "@/server/services/settings";
import { getPrismaClient } from "@/server/repositories/db";

/**
 * Portal público — lista das vagas publicadas (RF-VAG-04): filtros por local e
 * área (formulário GET, sem JavaScript), ordenação pelo fecho mais próximo.
 * Anónimo lê; só aparecem PUBLISHED com janela aberta no servidor (RN-VAG-01).
 */
export default async function VagasPage({
  searchParams,
}: {
  searchParams: Promise<{ local?: string; area?: string }>;
}) {
  const params = await searchParams;
  const prisma = getPrismaClient();
  const service = createOpeningService({
    prisma,
    audit: createAuditService(prisma),
    settings: createSettingService({ prisma, audit: createAuditService(prisma) }),
    clock: { now: () => new Date() },
  });
  const [vagas, filtros] = await Promise.all([
    service.publicList({ locationCode: params.local, fieldOfStudyId: params.area }),
    service.publicFilters(),
  ]);

  const fmt = new Intl.DateTimeFormat("pt-MZ", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{pt.vagas.titulo}</h1>
      <p className="text-muted-foreground mt-2">{pt.vagas.introducao}</p>

      {/* Filtros: formulário GET simples — funciona sem JavaScript (RF-VAG-04). */}
      <form method="get" className="mt-6 flex flex-wrap items-end gap-3" aria-label={pt.vagas.filtrar}>
        <div>
          <label htmlFor="local" className="text-sm font-medium">
            {pt.vagas.local}
          </label>
          <select
            id="local"
            name="local"
            defaultValue={params.local ?? ""}
            className="mt-1 block w-56 rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">{pt.vagas.todos}</option>
            {filtros.locais.map((l) => (
              <option key={l.id} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="area" className="text-sm font-medium">
            {pt.vagas.area}
          </label>
          <select
            id="area"
            name="area"
            defaultValue={params.area ?? ""}
            className="mt-1 block w-56 rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">{pt.vagas.todos}</option>
            {filtros.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          {pt.vagas.aplicar}
        </button>
        {(params.local || params.area) && (
          <Link href="/vagas" className="text-sm underline">
            {pt.vagas.limpar}
          </Link>
        )}
      </form>

      {vagas.length === 0 ? (
        <p className="text-muted-foreground mt-10">{pt.vagas.semVagas}</p>
      ) : (
        <ul className="mt-8 grid gap-4">
          {vagas.map((vaga) => (
            <li key={vaga.id}>
              <Link
                href={`/vagas/${vaga.code}`}
                className="block rounded-lg border p-5 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">{vaga.title}</h2>
                  <span className="text-sm text-muted-foreground">
                    {pt.vagas.candidaturasAte}{" "}
                    {vaga.applicationCloseAt ? fmt.format(vaga.applicationCloseAt) : ""}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {vaga.department.name} · {vaga.location.name} · {vaga.positions} {pt.vagas.posicoes.toLowerCase()} ·{" "}
                  {vaga.durationMonths} {pt.vagas.meses}
                </p>
                <p className="mt-2 text-sm">
                  {vaga.fields.map((f) => f.fieldOfStudy.name).join(", ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
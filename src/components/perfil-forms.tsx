"use client";

import Link from "next/link";
import { useState } from "react";
import type { z } from "zod";

import { pt } from "@/i18n/pt-MZ";
import { DocumentosForms, type DocumentoVista } from "@/components/documentos-forms";
import {
  ACADEMIC_STATUSES,
  LANGUAGE_LEVELS,
  PROFILE_STEPS,
  PROVINCES,
  SEXES,
  stepContactsSchema,
  stepEducationSchema,
  stepPersonalSchema,
  stepSkillsSchema,
  type ProfileStep,
} from "@/server/domain/candidate-profile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Assistente do perfil por passos (RF-CAN-01): os mesmos esquemas Zod do
 * servidor validam no cliente (RF-CAN-02) antes de gravar cada passo; a 360 px
 * o layout colapsa para uma coluna.
 */

export type PerfilVista = {
  fullName: string | null;
  birthDate: Date | string | null;
  sex: string | null;
  biExpiryDate: Date | string | null;
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
  graduationDate: Date | string | null;
  declaredAverage: number | string | null;
  languagesJson: string | null;
  availableLocationsJson: string | null;
} | null;

export type CatalogoPerfil = {
  instituicoes: Array<{ id: string; name: string }>;
  cursos: Array<{ id: string; name: string }>;
  competencias: Array<{ id: string; name: string }>;
  locais: Array<{ id: string; name: string }>;
};

function dataISO(valor: Date | string | null | undefined): string {
  if (!valor) return "";
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function parseJsonArray(valor: string | null): string[] {
  if (!valor) return [];
  try {
    const parsed = JSON.parse(valor);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

type Issues = Record<string, string>;

function problemasParaCampos(issues: Array<{ campo: string; mensagem: string }>): Issues {
  const saida: Issues = {};
  for (const i of issues) saida[i.campo || "_"] = i.mensagem;
  return saida;
}

function problemasZod(erro: z.ZodError): Issues {
  const saida: Issues = {};
  for (const issue of erro.issues) saida[issue.path.join(".") || "_"] = issue.message;
  return saida;
}

export function PerfilForms({
  email,
  passosIniciais,
  perfil,
  biNumber,
  nuit,
  skillIds,
  catalogo,
  documentos,
}: {
  email: string;
  passosIniciais: ProfileStep[];
  perfil: PerfilVista;
  biNumber: string | null;
  nuit: string | null;
  skillIds: string[];
  catalogo: CatalogoPerfil;
  documentos: DocumentoVista[];
}) {
  const inicial: ProfileStep = (() => {
    for (const p of ["pessoais", "contactos", "formacao", "competencias"] as ProfileStep[]) {
      if (!passosIniciais.includes(p)) return p;
    }
    return "documentos";
  })();

  const [passo, setPasso] = useState<ProfileStep>(inicial);
  const [concluidos, setConcluidos] = useState<Set<string>>(new Set(passosIniciais));
  const [problemas, setProblemas] = useState<Issues>({});
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  // valores do formulário (pré-preenchidos com o que já está guardado)
  const [fullName, setFullName] = useState(perfil?.fullName ?? "");
  const [birthDate, setBirthDate] = useState(dataISO(perfil?.birthDate));
  const [sex, setSex] = useState(perfil?.sex ?? "");
  const [biNum, setBiNum] = useState(biNumber ?? "");
  const [biExpiryDate, setBiExpiryDate] = useState(dataISO(perfil?.biExpiryDate));
  const [nuitValor, setNuitValor] = useState(nuit ?? "");
  const [phone, setPhone] = useState(perfil?.phoneE164 ?? "");
  const [phoneAlt, setPhoneAlt] = useState(perfil?.phoneAltE164 ?? "");
  const [province, setProvince] = useState(perfil?.province ?? "");
  const [city, setCity] = useState(perfil?.city ?? "");
  const [neighbourhood, setNeighbourhood] = useState(perfil?.neighbourhood ?? "");
  const [instituicaoId, setInstituicaoId] = useState(perfil?.institutionId ?? "");
  const [outraInstituicao, setOutraInstituicao] = useState(Boolean(perfil?.institutionOther));
  const [institutionOther, setInstitutionOther] = useState(perfil?.institutionOther ?? "");
  const [cursoId, setCursoId] = useState(perfil?.courseId ?? "");
  const [outroCurso, setOutroCurso] = useState(Boolean(perfil?.courseOther));
  const [courseOther, setCourseOther] = useState(perfil?.courseOther ?? "");
  const [academicStatus, setAcademicStatus] = useState(perfil?.academicStatus ?? "");
  const [graduationDate, setGraduationDate] = useState(dataISO(perfil?.graduationDate));
  const [declaredAverage, setDeclaredAverage] = useState(
    perfil?.declaredAverage != null ? String(perfil.declaredAverage) : "",
  );
  const [languages, setLanguages] = useState<Array<{ language: string; level: string }>>(() => {
    try {
      const pares = JSON.parse(perfil?.languagesJson ?? "[]") as Array<{ language: string; level: string }>;
      return Array.isArray(pares) ? pares : [];
    } catch {
      return [];
    }
  });
  const [skillIdsSel, setSkillIdsSel] = useState<Set<string>>(new Set(skillIds));
  const [locaisSel, setLocaisSel] = useState<Set<string>>(new Set(parseJsonArray(perfil?.availableLocationsJson ?? null)));

  async function gravar(alvo: Exclude<ProfileStep, "documentos">, corpo: unknown, seguinte: ProfileStep) {
    setAGravar(true);
    setMensagem(null);
    setProblemas({});
    try {
      const resposta = await fetch(`/api/candidato/perfil/${alvo}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const dados = (await resposta.json().catch(() => null)) as
        | { ok: boolean; passos?: string[]; issues?: Array<{ campo: string; mensagem: string }>; mensagem?: string; motivo?: string }
        | null;
      if (resposta.ok && dados?.ok && dados.passos) {
        setConcluidos(new Set(dados.passos));
        setPasso(seguinte);
        return;
      }
      if (dados?.motivo === "VALIDACAO" && dados.issues) {
        setProblemas(problemasParaCampos(dados.issues));
        setMensagem(pt.perfil.erroValidacao);
        return;
      }
      setMensagem(dados?.mensagem ?? pt.perfil.erroGenerico);
    } catch {
      setMensagem(pt.perfil.erroGenerico);
    } finally {
      setAGravar(false);
    }
  }

  function submeterPessoais() {
    const parsed = stepPersonalSchema.safeParse({
      fullName,
      birthDate,
      sex,
      biNumber: biNum,
      biExpiryDate,
      nuit: nuitValor,
    });
    if (!parsed.success) {
      setProblemas(problemasZod(parsed.error));
      setMensagem(pt.perfil.erroValidacao);
      return;
    }
    void gravar("pessoais", parsed.data, "contactos");
  }

  function submeterContactos() {
    const parsed = stepContactsSchema.safeParse({ phone, phoneAlt, province, city, neighbourhood });
    if (!parsed.success) {
      setProblemas(problemasZod(parsed.error));
      setMensagem(pt.perfil.erroValidacao);
      return;
    }
    void gravar("contactos", parsed.data, "formacao");
  }

  function submeterFormacao() {
    const parsed = stepEducationSchema.safeParse({
      institutionId: outraInstituicao ? undefined : instituicaoId || undefined,
      institutionOther: outraInstituicao ? institutionOther || undefined : undefined,
      courseId: outroCurso ? undefined : cursoId || undefined,
      courseOther: outroCurso ? courseOther || undefined : undefined,
      academicStatus: academicStatus || undefined,
      graduationDate,
      declaredAverage: declaredAverage === "" ? undefined : Number(declaredAverage),
    });
    if (!parsed.success) {
      setProblemas(problemasZod(parsed.error));
      setMensagem(pt.perfil.erroValidacao);
      return;
    }
    void gravar("formacao", parsed.data, "competencias");
  }

  function submeterCompetencias() {
    const parsed = stepSkillsSchema.safeParse({
      languages: languages.filter((l) => l.language.trim() !== ""),
      skillIds: [...skillIdsSel],
      availableLocationIds: [...locaisSel],
    });
    if (!parsed.success) {
      setProblemas(problemasZod(parsed.error));
      setMensagem(pt.perfil.erroValidacao);
      return;
    }
    void gravar("competencias", parsed.data, "documentos");
  }

  const erro = (campo: string) =>
    problemas[campo] ? (
      <p role="alert" className="mt-1 text-xs text-destructive">
        {problemas[campo]}
      </p>
    ) : null;

  function cabecalhoPasso(titulo: string, descricao: string) {
    return (
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
    );
  }

  function navegacao(aSubmeter: () => void, seguinte: ProfileStep | null) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {passo !== "pessoais" && (
          <Button type="button" variant="outline" onClick={() => setPasso(anteriorDe(passo))}>
            {pt.perfil.voltar}
          </Button>
        )}
        {seguinte && (
          <Button type="button" disabled={aGravar} onClick={aSubmeter}>
            {aGravar ? pt.perfil.aGravar : pt.perfil.gravarContinuar}
          </Button>
        )}
        <Link href="/candidato" className="text-sm underline">
          {pt.perfil.voltarPainel}
        </Link>
      </div>
    );
  }

  function anteriorDe(actual: ProfileStep): ProfileStep {
    const i = PROFILE_STEPS.indexOf(actual);
    return PROFILE_STEPS[Math.max(0, i - 1)] ?? "pessoais";
  }

  return (
    <div className="mt-6">
      {/* Indicador de progresso (RF-CAN-01) */}
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={pt.perfil.progresso}>
        {PROFILE_STEPS.map((p, i) => {
          const done = concluidos.has(p);
          const actual = p === passo;
          return (
            <li key={p} className={actual ? "font-semibold" : done ? "" : "text-muted-foreground"}>
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={() => setPasso(p)}
              >
                {done ? "✓ " : `${i + 1}. `}
                {pt.perfil.passos[p]}
              </button>
            </li>
          );
        })}
      </ol>

      {mensagem && (
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>{mensagem}</AlertDescription>
        </Alert>
      )}

      <Card className="mt-4">
        {passo === "pessoais" && (
          <>
            {cabecalhoPasso(pt.perfil.passos.pessoais, pt.perfil.pessoaisDescricao)}
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="fullName">{pt.perfil.nomeCompleto} *</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
                {erro("fullName")}
              </div>
              <div>
                <Label htmlFor="birthDate">{pt.perfil.dataNascimento} *</Label>
                <Input id="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                {erro("birthDate")}
              </div>
              <div>
                <Label htmlFor="sex">{pt.perfil.sexo}</Label>
                <select
                  id="sex"
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                  className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {SEXES.map((s) => (
                    <option key={s} value={s}>
                      {pt.perfil.sexos[s]}
                    </option>
                  ))}
                </select>
                {erro("sex")}
              </div>
              <div>
                <Label htmlFor="biNumber">{pt.perfil.biNumero} *</Label>
                <Input id="biNumber" value={biNum} onChange={(e) => setBiNum(e.target.value)} inputMode="numeric" />
                {erro("biNumber")}
              </div>
              <div>
                <Label htmlFor="biExpiryDate">{pt.perfil.biValidade} *</Label>
                <Input id="biExpiryDate" type="date" value={biExpiryDate} onChange={(e) => setBiExpiryDate(e.target.value)} />
                {erro("biExpiryDate")}
              </div>
              <div>
                <Label htmlFor="nuit">{pt.perfil.nuit}</Label>
                <Input id="nuit" value={nuitValor} onChange={(e) => setNuitValor(e.target.value)} inputMode="numeric" />
                {erro("nuit")}
              </div>
              <div className="text-muted-foreground self-end text-sm">
                {pt.perfil.emailFixo} {email}
              </div>
              {navegacao(submeterPessoais, "contactos")}
            </CardContent>
          </>
        )}

        {passo === "contactos" && (
          <>
            {cabecalhoPasso(pt.perfil.passos.contactos, pt.perfil.contactosDescricao)}
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="phone">{pt.perfil.celular} *</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+258 82 345 6789" />
                {erro("phone")}
              </div>
              <div>
                <Label htmlFor="phoneAlt">{pt.perfil.celularAlt}</Label>
                <Input id="phoneAlt" value={phoneAlt} onChange={(e) => setPhoneAlt(e.target.value)} inputMode="tel" />
                {erro("phoneAlt")}
              </div>
              <div>
                <Label htmlFor="province">{pt.perfil.provincia} *</Label>
                <select
                  id="province"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {PROVINCES.map((p) => (
                    <option key={p} value={p}>
                      {pt.perfil.provincias[p]}
                    </option>
                  ))}
                </select>
                {erro("province")}
              </div>
              <div>
                <Label htmlFor="city">{pt.perfil.cidade} *</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                {erro("city")}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="neighbourhood">{pt.perfil.bairro}</Label>
                <Input id="neighbourhood" value={neighbourhood} onChange={(e) => setNeighbourhood(e.target.value)} />
                {erro("neighbourhood")}
              </div>
              {navegacao(submeterContactos, "formacao")}
            </CardContent>
          </>
        )}

        {passo === "formacao" && (
          <>
            {cabecalhoPasso(pt.perfil.passos.formacao, pt.perfil.formacaoDescricao)}
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={outraInstituicao} onChange={(e) => setOutraInstituicao(e.target.checked)} />
                  {pt.perfil.outraInstituicao}
                </label>
              </div>
              {outraInstituicao ? (
                <div className="sm:col-span-2">
                  <Label htmlFor="institutionOther">{pt.perfil.nomeInstituicao} *</Label>
                  <Input id="institutionOther" value={institutionOther} onChange={(e) => setInstitutionOther(e.target.value)} />
                  {erro("institutionOther")}
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <Label htmlFor="institutionId">{pt.perfil.instituicao} *</Label>
                  <select
                    id="institutionId"
                    value={instituicaoId}
                    onChange={(e) => setInstituicaoId(e.target.value)}
                    className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {catalogo.instituicoes.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                  {erro("institutionId")}
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={outroCurso} onChange={(e) => setOutroCurso(e.target.checked)} />
                  {pt.perfil.outroCurso}
                </label>
              </div>
              {outroCurso ? (
                <div className="sm:col-span-2">
                  <Label htmlFor="courseOther">{pt.perfil.nomeCurso} *</Label>
                  <Input id="courseOther" value={courseOther} onChange={(e) => setCourseOther(e.target.value)} />
                  {erro("courseOther")}
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <Label htmlFor="courseId">{pt.perfil.curso} *</Label>
                  <select
                    id="courseId"
                    value={cursoId}
                    onChange={(e) => setCursoId(e.target.value)}
                    className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {catalogo.cursos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {erro("courseId")}
                </div>
              )}
              <div>
                <Label htmlFor="academicStatus">{pt.perfil.estatuto} *</Label>
                <select
                  id="academicStatus"
                  value={academicStatus}
                  onChange={(e) => setAcademicStatus(e.target.value)}
                  className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {ACADEMIC_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {pt.perfil.estatutos[s]}
                    </option>
                  ))}
                </select>
                {erro("academicStatus")}
              </div>
              <div>
                <Label htmlFor="graduationDate">{pt.perfil.dataConclusao} *</Label>
                <Input id="graduationDate" type="date" value={graduationDate} onChange={(e) => setGraduationDate(e.target.value)} />
                {erro("graduationDate")}
              </div>
              <div>
                <Label htmlFor="declaredAverage">{pt.perfil.media} *</Label>
                <Input
                  id="declaredAverage"
                  type="number"
                  min="0"
                  max="20"
                  step="0.01"
                  value={declaredAverage}
                  onChange={(e) => setDeclaredAverage(e.target.value)}
                />
                {erro("declaredAverage")}
              </div>
              {navegacao(submeterFormacao, "competencias")}
            </CardContent>
          </>
        )}

        {passo === "competencias" && (
          <>
            {cabecalhoPasso(pt.perfil.passos.competencias, pt.perfil.competenciasDescricao)}
            <CardContent className="grid gap-4">
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">{pt.perfil.idiomas}</legend>
                {languages.map((par, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <Input
                      aria-label={pt.perfil.idioma}
                      value={par.language}
                      onChange={(e) =>
                        setLanguages(languages.map((l, i) => (i === idx ? { ...l, language: e.target.value } : l)))
                      }
                      className="w-40"
                    />
                    <select
                      aria-label={pt.perfil.nivel}
                      value={par.level}
                      onChange={(e) => setLanguages(languages.map((l, i) => (i === idx ? { ...l, level: e.target.value } : l)))}
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      {LANGUAGE_LEVELS.map((n) => (
                        <option key={n} value={n}>
                          {pt.perfil.niveis[n]}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="outline" onClick={() => setLanguages(languages.filter((_, i) => i !== idx))}>
                      ✕
                    </Button>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLanguages([...languages, { language: "", level: "BASIC" }])}
                  >
                    {pt.perfil.acrescentarIdioma}
                  </Button>
                </div>
                {erro("languages")}
              </fieldset>

              <fieldset className="grid gap-1">
                <legend className="text-sm font-medium">{pt.perfil.competenciasCatalogo}</legend>
                {catalogo.competencias.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={skillIdsSel.has(c.id)}
                      onChange={(e) => {
                        const novo = new Set(skillIdsSel);
                        if (e.target.checked) novo.add(c.id);
                        else novo.delete(c.id);
                        setSkillIdsSel(novo);
                      }}
                    />
                    {c.name}
                  </label>
                ))}
                {erro("skillIds")}
              </fieldset>

              <fieldset className="grid gap-1">
                <legend className="text-sm font-medium">{pt.perfil.disponibilidade} *</legend>
                {catalogo.locais.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={locaisSel.has(l.id)}
                      onChange={(e) => {
                        const novo = new Set(locaisSel);
                        if (e.target.checked) novo.add(l.id);
                        else novo.delete(l.id);
                        setLocaisSel(novo);
                      }}
                    />
                    {l.name}
                  </label>
                ))}
                {erro("availableLocationIds")}
              </fieldset>

              {navegacao(submeterCompetencias, "documentos")}
            </CardContent>
          </>
        )}

        {passo === "documentos" && (
          <>
            {cabecalhoPasso(pt.perfil.passos.documentos, pt.perfil.documentosDescricao)}
            <CardContent>
              <DocumentosForms documentos={documentos} academicStatus={perfil?.academicStatus ?? null} />
              {navegacao(() => undefined, null)}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
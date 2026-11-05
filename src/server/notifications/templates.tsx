import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Text } from "@react-email/components";
import { render } from "@react-email/render";
import type { ReactNode } from "react";

/**
 * Modelos de notificação (Anexo E, RF-NOT-06, RF-NOT-07 — catálogo fechado):
 * React Email com versão em texto simples, assunto até 80 caracteres e
 * português de Moçambique. O corpo nunca contém BI, NUIT, notas nem
 * pontuações: só o necessário e o link para a aplicação (RNF-13).
 */

export type RenderedNotification = { subject: string; html: string; text: string };

const ACCENT = "#0f5132";

function Layout({ subject, children }: { subject: string; children: ReactNode }) {
  return (
    <Html lang="pt-MZ">
      <Head />
      <Preview>{subject}</Preview>
      <Body style={{ fontFamily: "Arial, Helvetica, sans-serif", backgroundColor: "#f4f4f5", margin: 0, padding: 24 }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 8, padding: 24, maxWidth: 560 }}>
          <Text style={{ color: ACCENT, fontSize: 12, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
            CIMES · CORNELDER
          </Text>
          {children}
          <Hr style={{ borderColor: "#e4e4e7", margin: "20px 0 12px" }} />
          <Text style={{ color: "#71717a", fontSize: 11, margin: 0 }}>
            Mensagem automática do sistema CIMES. Não responda a este e-mail.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function Paragrafo({ children }: { children: ReactNode }) {
  return <Text style={{ color: "#27272a", fontSize: 14, lineHeight: 1.5 }}>{children}</Text>;
}

function Botao({ url, label }: { url: string; label: string }) {
  return (
    <Link
      href={url}
      style={{
        backgroundColor: ACCENT,
        borderRadius: 6,
        color: "#ffffff",
        display: "inline-block",
        fontSize: 14,
        fontWeight: 600,
        margin: "8px 0 16px",
        padding: "10px 18px",
        textDecoration: "none",
      }}
    >
      {label}
    </Link>
  );
}

/** Cuidado defensivo: payload vem de JSON gravado na outbox. */
function str(payload: Record<string, unknown>, key: string, fallback: string | null = "—"): string | null {
  const v = payload[key];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

/** Aceita boolean ou a representação em texto gravada no JSON da outbox. */
function isTrue(payload: Record<string, unknown>, key: string): boolean {
  const v = payload[key];
  return v === true || v === "true";
}

type TemplateDefinition = {
  subject: string;
  /** Título curto e corpo para o aviso na aplicação (RF-NOT-04). */
  inApp: (payload: Record<string, unknown>) => { title: string; body: string; link: string | null };
  body: (payload: Record<string, unknown>) => ReactNode;
};

const LAYOUT: Record<string, TemplateDefinition> = {
  "N-01": {
    subject: "Confirma o teu e-mail — CIMES",
    inApp: (p) => ({ title: "Confirma o teu e-mail", body: "Abre o link para confirmar o teu endereço.", link: str(p, "url", null) }),
    body: (p) => (
      <>
        <Heading style={{ color: "#18181b", fontSize: 18 }}>Confirma o teu e-mail</Heading>
        <Paragrafo>Bem-vindo ao portal de estágios da Cornelder. Confirma o teu endereço de e-mail para activar a conta.</Paragrafo>
        <Paragrafo>O link é válido durante 24 horas.</Paragrafo>
        <Botao url={str(p, "url") ?? ""} label="Confirmar e-mail" />
      </>
    ),
  },
  "N-02": {
    subject: "Recupera a tua senha — CIMES",
    inApp: (p) => ({ title: "Recuperação de senha", body: "Abre o link para definir uma nova senha.", link: str(p, "url", null) }),
    body: (p) => (
      <>
        <Heading style={{ color: "#18181b", fontSize: 18 }}>Recupera a tua senha</Heading>
        <Paragrafo>Recebemos um pedido de recuperação de senha para a tua conta.</Paragrafo>
        <Paragrafo>O link é válido durante 60 minutos. Se não fizeste o pedido, ignora esta mensagem — a tua senha continua válida.</Paragrafo>
        <Botao url={str(p, "url") ?? ""} label="Definir nova senha" />
      </>
    ),
  },
  "N-03": {
    subject: "Candidatura submetida — CIMES",
    inApp: (p) => ({
      title: "Candidatura submetida",
      body: `A candidatura ${str(p, "codigoCandidatura")} à vaga ${str(p, "codigoVaga")} foi submetida.`,
      link: "/candidato",
    }),
    body: (p) => (
      <>
        <Heading style={{ color: "#18181b", fontSize: 18 }}>Candidatura submetida</Heading>
        <Paragrafo>
          A tua candidatura {str(p, "codigoCandidatura")} à vaga {str(p, "codigoVaga")} — {str(p, "titulo")} foi submetida com sucesso.
        </Paragrafo>
        <Paragrafo>Acompanha o estado no portal do candidato.</Paragrafo>
      </>
    ),
  },
  "N-04": {
    subject: "Actualização da candidatura — CIMES",
    inApp: (p) => ({
      title: "Actualização da candidatura",
      body: `A vaga ${str(p, "codigoVaga")} foi cancelada; a candidatura deixou de avançar neste ciclo.`,
      link: "/candidato",
    }),
    body: (p) => (
      <>
        <Heading style={{ color: "#18181b", fontSize: 18 }}>Actualização da candidatura</Heading>
        <Paragrafo>
          A vaga {str(p, "codigoVaga")} — {str(p, "titulo")} foi cancelada. A tua candidatura deixou de avançar neste ciclo de recrutamento.
        </Paragrafo>
        <Paragrafo>Podes candidatar-te a outras vagas publicadas no portal.</Paragrafo>
      </>
    ),
  },
  "N-09": {
    subject: "Documento rejeitado — CIMES",
    inApp: (p) => ({ title: "Documento rejeitado", body: `Motivo: ${str(p, "motivo")}`, link: "/candidato" }),
    body: (p) => (
      <>
        <Heading style={{ color: "#18181b", fontSize: 18 }}>Documento rejeitado</Heading>
        <Paragrafo>Um dos teus documentos foi rejeitado pelo serviço de Recursos Humanos.</Paragrafo>
        <Paragrafo>Motivo: {str(p, "motivo")}</Paragrafo>
        <Paragrafo>Podes substituir o documento no portal enquanto a candidatura estiver em análise.</Paragrafo>
      </>
    ),
  },
  "N-21": {
    subject: "Novo pedido de vaga — CIMES",
    inApp: (p) => ({
      title: "Novo pedido de vaga",
      body: `O pedido ${str(p, "codigo")} — ${str(p, "titulo")} aguarda aprovação.`,
      link: "/app/vagas",
    }),
    body: (p) => (
      <>
        <Heading style={{ color: "#18181b", fontSize: 18 }}>Novo pedido de vaga</Heading>
        <Paragrafo>
          O pedido de vaga {str(p, "codigo")} — {str(p, "titulo")}, criado por {str(p, "autor")}, aguarda a tua aprovação.
        </Paragrafo>
      </>
    ),
  },
  "N-22": {
    subject: "Pedido de vaga analisado — CIMES",
    inApp: (p) => ({
      title: isTrue(p, "devolvido") ? "Pedido de vaga devolvido" : "Pedido de vaga aprovado",
      body: `${str(p, "codigo")} — ${str(p, "titulo")}${str(p, "comentario", "") ? `: ${str(p, "comentario")}` : ""}`,
      link: "/app/vagas",
    }),
    body: (p) => (
      <>
        <Heading style={{ color: "#18181b", fontSize: 18 }}>
          {isTrue(p, "devolvido") ? "Pedido de vaga devolvido" : "Pedido de vaga aprovado"}
        </Heading>
        <Paragrafo>
          O pedido de vaga {str(p, "codigo")} — {str(p, "titulo")} foi{" "}
          {isTrue(p, "devolvido") ? "devolvido para correcção" : "aprovado pelo Gestor de Recursos Humanos"}.
        </Paragrafo>
        {str(p, "comentario") !== "—" ? <Paragrafo>Comentário: {str(p, "comentario")}</Paragrafo> : null}
      </>
    ),
  },
  "N-30": {
    subject: "Falha técnica persistente — CIMES",
    inApp: (p) => ({ title: "Falha técnica persistente", body: str(p, "contexto") ?? "Sem detalhes.", link: null }),
    body: (p) => (
      <>
        <Heading style={{ color: "#18181b", fontSize: 18 }}>Falha técnica persistente</Heading>
        <Paragrafo>
          A notificação ou tarefa {str(p, "contexto")} falhou após todas as retentativas. Verifica o worker e os registos de auditoria.
        </Paragrafo>
      </>
    ),
  },
};

/** Catálogo fechado (RF-NOT-07): devolve null para código/variante inexistente. */
export async function renderNotification(
  templateCode: string,
  variant: string | null,
  payload: Record<string, unknown>,
): Promise<RenderedNotification | null> {
  const template = LAYOUT[templateCode];
  if (!template) return null;
  const subject = template.subject;
  if (subject.length > 80) throw new Error(`Assunto de ${templateCode} excede 80 caracteres`);
  const html = await render(<Layout subject={subject}>{template.body(payload)}</Layout>);
  const text = await render(<Layout subject={subject}>{template.body(payload)}</Layout>, { plainText: true });
  return { subject, html, text };
}

/** Dados para o aviso na aplicação criado junto com o e-mail (RF-NOT-04). */
export function inAppContent(
  templateCode: string,
  payload: Record<string, unknown>,
): { title: string; body: string; link: string | null } | null {
  const template = LAYOUT[templateCode];
  if (!template) return null;
  return template.inApp(payload);
}
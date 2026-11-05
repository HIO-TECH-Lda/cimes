import { describe, expect, it } from "vitest";

import { inAppContent, renderNotification } from "@/server/notifications/templates";

/**
 * Modelos do Anexo E (RF-NOT-06, RF-NOT-07): assunto ≤ 80 caracteres,
 * português de Moçambique, versão em texto simples, e o corpo nunca contém
 * dados sensíveis — só o necessário e o link.
 */

const URL_VERIFICACAO = "https://cimes.exemplo.mz/api/auth/verify-email?token=tok";

describe("modelos de notificação (RF-NOT-06, RF-NOT-07)", () => {
  it("N-01 renderiza assunto curto, HTML e texto simples com o link", async () => {
    const r = await renderNotification("N-01", null, { url: URL_VERIFICACAO });
    expect(r).not.toBeNull();
    expect(r!.subject).toBe("Confirma o teu e-mail — CIMES");
    expect(r!.subject.length).toBeLessThanOrEqual(80);
    expect(r!.html).toContain(URL_VERIFICACAO);
    expect(r!.text).toContain(URL_VERIFICACAO);
    expect(r!.html).toContain("24 horas");
  });

  it("N-02 diz que o link vale 60 minutos e avisa quem não pediu", async () => {
    const r = await renderNotification("N-02", null, { url: URL_VERIFICACAO });
    expect(r!.subject).toContain("Recupera a tua senha");
    expect(r!.text).toContain("60 minutos");
    expect(r!.text).toContain("Se não fizeste o pedido");
  });

  it("N-03 usa os códigos da candidatura e da vaga", async () => {
    const r = await renderNotification("N-03", null, {
      codigoCandidatura: "CAN-2027-0001",
      codigoVaga: "VAG-2027-0002",
      titulo: "Estágio em Logística",
    });
    expect(r!.text).toContain("CAN-2027-0001");
    expect(r!.text).toContain("VAG-2027-0002");
  });

  it("N-22 distingue aprovação de devolução e mostra o comentário", async () => {
    const aprovado = await renderNotification("N-22", null, {
      codigo: "VAG-2027-0003",
      titulo: "Estágio em TI",
      devolvido: false,
    });
    expect(aprovado!.text).toContain("aprovado");
    const devolvido = await renderNotification("N-22", null, {
      codigo: "VAG-2027-0003",
      titulo: "Estágio em TI",
      devolvido: true,
      comentario: "Falta a duração em meses.",
    });
    expect(devolvido!.text).toContain("devolvido");
    expect(devolvido!.text).toContain("Falta a duração em meses.");
  });

  it("código fora do catálogo fechado devolve null (RF-NOT-07)", async () => {
    expect(await renderNotification("N-99", null, {})).toBeNull();
    expect(inAppContent("N-99", {})).toBeNull();
  });

  it("o conteúdo para o aviso na aplicação existe para os códigos do M2", () => {
    for (const code of ["N-01", "N-02", "N-03", "N-04", "N-09", "N-21", "N-22", "N-30"]) {
      expect(inAppContent(code, {}), code).not.toBeNull();
    }
  });
});
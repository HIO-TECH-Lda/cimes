import { describe, expect, it } from "vitest";
import { staffLastActivity } from "@/server/auth/session";

/**
 * RF-AUT-06: janela de inactividade de 30 minutos dos colaboradores.
 * O login é actividade: uma sessão recém-criada nunca é revogada por
 * inactividade, mesmo que o `lastSeenAt` anterior esteja caducado.
 */
describe("staffLastActivity", () => {
  it("sem lastSeenAt usa a criação da sessão", () => {
    const criada = new Date("2027-03-15T10:00:00Z");
    expect(staffLastActivity(null, criada)).toBe(criada);
  });

  it("lastSeenAt mais recente que a sessão prevalece", () => {
    const criada = new Date("2027-03-15T10:00:00Z");
    const actividade = new Date("2027-03-15T10:20:00Z");
    expect(staffLastActivity(actividade, criada)).toBe(actividade);
  });

  it("lastSeenAt caducado não invalida uma sessão nova (regra de regressão)", () => {
    // O utilizador voltou depois de >30 min de inactividade e voltou a entrar:
    // a sessão nova recomeça a janela em vez de revogar de imediato.
    const actividadeAntiga = new Date("2027-03-15T08:25:00Z");
    const sessaoNova = new Date("2027-03-15T10:00:00Z");
    expect(staffLastActivity(actividadeAntiga, sessaoNova)).toBe(sessaoNova);
  });
});
import { expect, test } from "@playwright/test";

/**
 * Jornadas E2E do M1 (H.2, RF-AUT-01/03/07/09, RF-ADM-11):
 * 1. entrada de colaborador em modo local com destino por papéis (RF-AUT-01/02);
 * 2. registo de candidato com aviso de privacidade e ALTCHA (RF-AUT-03);
 * 3. sem permissão para a área → acesso negado; anónimo → igual (G.5, R-04).
 * Requerem a base de desenvolvimento com seeds aplicados (npm run db:seed).
 */

const ADMIN = { email: "admin@exemplo.mz", password: "Cimes!Dev2026" };

test.describe("@smoke M1 - identidade e acesso", () => {
  test("colaborador entra em modo local e chega ao back-office", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByRole("tab", { name: "Colaboradores" }).click();
    await page.getByLabel("E-mail").fill(ADMIN.email);
    await page.getByLabel("Senha").fill(ADMIN.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Back-office");
    await expect(page.getByText("SYSTEM_ADMIN")).toBeVisible();
  });

  test("registo de candidato guarda consentimentos e pede verificação de e-mail", async ({ page }) => {
    const email = `candidato.e2e.${Date.now()}@exemplo.mz`;
    await page.goto("/registar");
    await page.getByLabel("Nome completo").fill("Candidato Sintético E2E");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill("E2e!Sintetic0#2026");
    await page.getByLabel("Confirmar senha").fill("E2e!Sintetic0#2026");
    await page.getByRole("checkbox", { name: /aceito o aviso de privacidade/i }).check();
    await page.getByRole("checkbox", { name: /bolsa de talentos/i }).check();
    // Captcha local: assinala a caixa e espera a prova de trabalho (RF-AUT-03).
    await page.getByRole("checkbox", { name: /não sou um robô/i }).check();
    await expect(page.getByText("Verificado", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Criar conta de candidato" }).click();

    await expect(page).toHaveURL(/\/registar\?ok=1/);
    await expect(page.getByText(/Enviámos um e-mail de verificação/)).toBeVisible();
  });

  test("sem permissão a área é negada; anónimo também é negado", async ({ page }) => {
    // Anónimo: /app/parametros exige sessão.
    await page.goto("/app/parametros");
    await expect(page.getByText("Acesso negado para esta área.")).toBeVisible();

    // SYSTEM_ADMIN tem roles.manage mas não settings.manage (C.3 → RH-G).
    await page.goto("/entrar");
    await page.getByRole("tab", { name: "Colaboradores" }).click();
    await page.getByLabel("E-mail").fill(ADMIN.email);
    await page.getByLabel("Senha").fill(ADMIN.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);

    await page.goto("/app/parametros");
    await expect(page.getByText("Acesso negado para esta área.")).toBeVisible();
  });
});
import { expect, test } from "@playwright/test";

/**
 * E2E de fumo do M0 (`npm run test:e2e:smoke`): o portal público responde, os
 * cabeçalhos de segurança (RNF-02) e a correlação (G.2) estão presentes, e uma
 * rota inexistente devolve 404 com a mensagem do R-04.
 */
test.describe("@smoke M0 — fundações", () => {
  test("a página pública renderiza sem JavaScript e mostra o título", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Programa de Estágios");
  });

  test("/api/health responde OK", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.app).toBe("cimes");
  });

  test("cabeçalhos de segurança e x-correlation-id estão presentes", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("geolocation=()");
    expect(headers["x-correlation-id"]).toBeTruthy();
  });

  test("uma rota inexistente devolve 404 com a mensagem neutra (R-04)", async ({ request }) => {
    const response = await request.get("/pagina-que-nao-existe");
    expect(response.status()).toBe(404);
    const body = await response.text();
    expect(body).toContain("Página não encontrada");
  });
});
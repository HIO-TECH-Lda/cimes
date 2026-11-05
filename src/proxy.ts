import { NextResponse, type NextRequest } from "next/server";

import { ipInAnyCidr } from "@/lib/cidr";
import { getConfig } from "@/server/infra/config";
import { getProcessLogger } from "@/server/infra/logger";

/**
 * G.2 / RNF-02: o proxy gera ou propaga `x-correlation-id`, aplica os cabeçalhos de
 * segurança e restringe as rotas internas (back-office) às redes configuradas
 * (INTERNAL_ALLOWED_CIDRS). Em produção, o IIS também as restringe (G.11).
 *
 * Confirmado na documentação oficial do Next.js 16.4 (R-20): `proxy.ts` substitui
 * `middleware.ts` e corre em Node.js; exporta-se `proxy` (nomeado ou por omissão).
 */

const INTERNAL_PREFIXES = ["/app"] as const;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  // Sem proxy à frente (desenvolvimento): considera-se rede interna.
  return "127.0.0.1";
}

export function proxy(request: NextRequest): NextResponse {
  const correlationId = request.headers.get("x-correlation-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-correlation-id", correlationId);

  const requestPath = request.nextUrl.pathname;
  const isInternal = INTERNAL_PREFIXES.some((p) => requestPath === p || requestPath.startsWith(`${p}/`));

  if (isInternal) {
    const cfg = getConfig();
    const ip = clientIp(request);
    if (cfg.internalAllowedCidrs.length > 0 && !ipInAnyCidr(ip, cfg.internalAllowedCidrs)) {
      // R-04: não revelar a existência da rota.
      getProcessLogger().warn({ correlationId, path: requestPath }, "rota interna bloqueada por CIDR");
      return new NextResponse(null, { status: 404 });
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Cabeçalhos RNF-02. CSP com nonce por pedido, sem `unsafe-inline` em scripts.
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const isDev = process.env.NODE_ENV === "development";
  const scriptSrc = `'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`;
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  response.headers.set("x-correlation-id", correlationId);
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-nonce", nonce);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export const config = {
  matcher: [
    // Corre em tudo excepto ficheiros estáticos e o Next internals.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
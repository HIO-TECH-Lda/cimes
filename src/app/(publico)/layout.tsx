import { pt } from "@/i18n/pt-MZ";

import { SiteFooter } from "@/components/site-footer";

/** Layout do portal público (vagas, aviso de privacidade, verificação). RN-ACC-12: sem sessão. */
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <span className="font-semibold">{pt.app.name}</span>
          <nav aria-label="principal" className="flex items-center gap-4 text-sm">
            <a href="/entrar" className="hover:underline">
              {pt.nav.entrar}
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
import { pt } from "@/i18n/pt-MZ";

import { SiteFooter } from "@/components/site-footer";

/** Layout do portal do estagiário (M5). */
export default function EstagiarioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="font-semibold">{pt.nav.estagiario}</span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
import Link from "next/link";

import { pt } from "@/i18n/pt-MZ";
import { SairButton } from "@/app/app/sair-button";

/**
 * Layout do back-office (chefias, RH, Direcção, ICT) — restrito por rede (G.12).
 * Cada página aplica a sua permissão da matriz C.3 (G.5).
 */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nav = [
    { href: "/app/utilizadores", label: pt.app.utilizadores },
    { href: "/app/parametros", label: pt.app.parametros },
    { href: "/app/catalogos", label: pt.app.catalogos },
    { href: "/app/feriados", label: pt.feriados.titulo },
    { href: "/app/documentos", label: pt.documentos.titulo },
    { href: "/app/auditoria", label: pt.app.auditoria },
    { href: "/app/saude", label: pt.app.saude },
    { href: "/conta", label: pt.conta.titulo },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/app" className="font-semibold">
              {pt.app.name}
            </Link>
            <nav className="text-muted-foreground flex gap-3 text-sm">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-foreground">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <SairButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
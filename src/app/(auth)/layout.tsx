import Link from "next/link";

import { pt } from "@/i18n/pt-MZ";

import { SiteFooter } from "@/components/site-footer";

/**
 * Layout da área de autenticação (entrar, registar, recuperar) — M1.
 */
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center px-4 py-3">
          <Link href="/" className="font-semibold">
            {pt.app.name}
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12">{children}</main>
      <SiteFooter />
    </div>
  );
}
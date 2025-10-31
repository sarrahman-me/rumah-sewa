import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rumah Sewa",
  description: "Manajemen sewa & air keluarga",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/water", label: "Air" },
    { href: "/payments", label: "Pembayaran" },
    { href: "/reports", label: "Laporan" },
    { href: "/repairs", label: "Perbaikan" },
    { href: "/rents", label: "Sewa" },
    { href: "/auth/login", label: "Login" },
  ];

  return (
    <html lang="id">
      <body className="min-h-screen">
        <header className="border-b border-[var(--border)] bg-transparent">
          <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-4 px-6 py-5">
            <a href="/dashboard" className="flex items-center gap-2 font-semibold text-[var(--primary)]">
              <span aria-hidden>🏠</span>
              <span>Rumah Sewa</span>
            </a>
            <nav className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-full px-3 py-1 transition-colors hover:bg-white hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--primary)]"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        </header>
        <main className="container-page">{children}</main>
      </body>
    </html>
  );
}

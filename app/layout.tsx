import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rumah Sewa",
  description: "Manajemen sewa & air keluarga",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-800">
        <header className="sticky top-0 z-10 border-b border-blue-100 bg-white/90 backdrop-blur">
          <nav className="container mx-auto flex max-w-7xl items-center gap-2 p-3 sm:gap-3 sm:p-4">
            <a
              href="/dashboard"
              className="rounded-full bg-blue-600 px-3 py-1 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:text-base"
            >
              🏠 Rumah Sewa
            </a>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1 text-xs font-medium text-blue-700 sm:gap-2 sm:text-sm">
              <a className="rounded-lg px-3 py-1 transition hover:bg-blue-50" href="/dashboard">
                Dashboard
              </a>
              <a className="rounded-lg px-3 py-1 transition hover:bg-blue-50" href="/water">
                Air
              </a>
              <a className="rounded-lg px-3 py-1 transition hover:bg-blue-50" href="/payments">
                Pembayaran
              </a>
              <a className="rounded-lg px-3 py-1 transition hover:bg-blue-50" href="/reports">
                Reports
              </a>
              <a className="rounded-lg px-3 py-1 transition hover:bg-blue-50" href="/repairs">
                Perbaikan
              </a>
              <a className="rounded-lg px-3 py-1 transition hover:bg-blue-50" href="/rents">
                Rents
              </a>
              <a className="rounded-lg px-3 py-1 transition hover:bg-blue-50" href="/auth/login">
                Login
              </a>
            </div>
          </nav>
        </header>
        <main className="container mx-auto max-w-7xl p-4 sm:p-6">
          <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm shadow-blue-100/40 sm:p-6">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}

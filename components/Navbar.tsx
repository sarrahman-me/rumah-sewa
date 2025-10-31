"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/water", label: "Air" },
  { href: "/payments", label: "Pembayaran" },
  { href: "/reports", label: "Laporan" },
  { href: "/repairs", label: "Perbaikan" },
  { href: "/rents", label: "Sewa" },
] as const;

export function Navbar() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, authSession) => {
        setSession(authSession ?? null);
      },
    );
    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const showLogin = session === null;

  const navLinks = session
    ? [...NAV_LINKS, { href: "/audits", label: "Audit" }]
    : NAV_LINKS;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-4 px-6 py-5">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 font-semibold text-[var(--primary)]"
      >
        <span aria-hidden>🏠</span>
        <span>Rumah Sewa</span>
      </Link>
      <nav className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full px-3 py-1 transition-colors hover:bg-white hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--primary)]"
          >
            {link.label}
          </Link>
        ))}
        {showLogin && (
          <Link
            href="/auth/login"
            className="rounded-full px-3 py-1 transition-colors hover:bg-white hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--primary)]"
          >
            Login
          </Link>
        )}
      </nav>
    </div>
  );
}

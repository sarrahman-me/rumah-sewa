"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useState } from "react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = e.currentTarget;
    const email = (form.email as HTMLInputElement).value;
    const password = (form.password as HTMLInputElement).value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else router.replace("/dashboard");
    setLoading(false);
  }

  return (
    <main className="flex h-screen flex-col items-center justify-center bg-slate-50">
      <form
        onSubmit={handleSubmit}
        className="w-80 space-y-4 rounded-lg bg-white p-6 shadow-md"
      >
        <h1 className="text-center text-xl font-semibold text-blue-700">
          Masuk
        </h1>
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full rounded border border-blue-200 p-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Kata Sandi"
          required
          className="w-full rounded border border-blue-200 p-2"
        />
        {error && (
          <p className="text-center text-sm text-red-500">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 p-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
      </form>
    </main>
  );
}

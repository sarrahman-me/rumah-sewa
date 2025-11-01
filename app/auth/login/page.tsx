'use client';

// Login page authenticates users via Supabase; formatting only, no behavior changes.

import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
    else router.replace('/dashboard');
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <Card className="w-full max-w-sm space-y-5">
        <div className="space-y-1 text-center">
          <h1>Masuk</h1>
          <p className="subtle">Kelola pembayaran sewa dan air keluarga.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="field-group">
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="nama@contoh.com"
              required
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="password">
              Kata sandi
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Masukkan kata sandi"
              required
            />
          </div>
          {error && <p className="text-center text-sm text-[var(--danger)]">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full" variant="primary">
            {loading ? 'Memeriksa...' : 'Masuk'}
          </Button>
        </form>
      </Card>
    </main>
  );
}

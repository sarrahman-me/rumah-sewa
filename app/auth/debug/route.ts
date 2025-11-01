// Auth debug route surfaces session insights; formatting only, no behavior changes.

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getAccessTokenOrNull } from '@/lib/server-auth';

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const cookieNames = allCookies.map((c) => c.name);
  const authCookieNameFound = cookieNames.some((name) => /^sb-.*-auth-token$/.test(name));

  const accessToken = await getAccessTokenOrNull();
  const tokenValue = typeof accessToken === 'string' ? accessToken : null;
  const accessTokenFirst8 =
    tokenValue && tokenValue.length > 0
      ? tokenValue.slice(0, Math.min(8, tokenValue.length))
      : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let userCheck: { status: number; ok: boolean } | null = null;
  if (supabaseUrl && accessToken) {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });
      userCheck = { status: res.status, ok: res.ok };
    } catch (error) {
      userCheck = { status: -1, ok: false };
    }
  }

  return NextResponse.json({
    cookieNames,
    authCookieNameFound,
    accessTokenFirst8,
    userCheck,
    envHasUrl: Boolean(supabaseUrl),
    path: req.url,
  });
}

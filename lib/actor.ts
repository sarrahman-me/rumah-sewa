import { supabase } from '@/lib/supabase';

/**
 * Derives the audit actor name from the authenticated user's email prefix.
 * No behavior changes; used for logging only.
 */
export async function getActorName(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email;
  if (!email) return '';
  return email.split('@')[0];
}

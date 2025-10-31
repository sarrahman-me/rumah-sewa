import { supabase } from "@/lib/supabase";

export async function getActorName(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email;
  if (!email) return "";
  return email.split("@")[0];
}

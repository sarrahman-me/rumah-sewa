import { supabase } from "@/lib/supabase";
import { getActorName } from "@/lib/actor";

type AuditAction =
  | "rent_full"
  | "water_full"
  | "rent_partial"
  | "water_partial"
  | "undo"
  | "occupancy_set"
  | "occupancy_clear"
  | "rent_price_change";

type AuditPayload = {
  action: AuditAction;
  house_id?: string | null;
  house_code?: string | null;
  period?: string | null;
  kind?: "rent" | "water" | null;
  amount?: number | null;
  note?: string | null;
};

export async function writeAudit(payload: AuditPayload) {
  const actor_name = await getActorName();
  if (!actor_name) return;

  const periodDate =
    payload.period && !Number.isNaN(new Date(payload.period).getTime())
      ? new Date(payload.period)
      : null;

  const { error } = await supabase.rpc("log_audit", {
    p_actor_name: actor_name,
    p_action: payload.action,
    p_house_id: payload.house_id ?? null,
    p_house_code: payload.house_code ?? null,
    p_period: periodDate,
    p_kind: payload.kind ?? null,
    p_amount: payload.amount ?? null,
    p_note: payload.note ?? null,
  });

  if (error) {
    console.error("[audit] rpc log_audit failed", { error, payload });
  }
}

-- Ensure audits table captures optional house_code for legacy records
alter table public.audits
  add column if not exists house_code text;

-- Drop existing insert policies to prevent direct writes from clients
do
$$
begin
  begin
    drop policy if exists audits_insert_auth on public.audits;
  exception
    when undefined_object then null;
  end;
  begin
    drop policy if exists audits_insert_authenticated on public.audits;
  exception
    when undefined_object then null;
  end;
end
$$;

-- Recreate select-only policy for authenticated users
do
$$
begin
  begin
    drop policy if exists audits_select_auth on public.audits;
  exception
    when undefined_object then null;
  end;
  begin
    drop policy if exists audits_select_authenticated on public.audits;
  exception
    when undefined_object then null;
  end;
end
$$;

create policy audits_select_auth
  on public.audits
  for select
  to authenticated
  using (true);

-- RPC to log audits via a controlled interface
create or replace function public.log_audit(
  p_actor_name text,
  p_action text,
  p_house_id uuid default null,
  p_house_code text default null,
  p_period date default null,
  p_kind text default null,
  p_amount numeric default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as
$$
begin
  insert into public.audits (
    actor_name,
    action,
    house_id,
    house_code,
    period,
    kind,
    amount,
    note
  )
  values (
    p_actor_name,
    p_action,
    p_house_id,
    p_house_code,
    p_period,
    p_kind,
    p_amount,
    p_note
  );
end;
$$;

revoke execute on function public.log_audit(text,text,uuid,text,date,text,numeric,text) from public;
grant execute on function public.log_audit(text,text,uuid,text,date,text,numeric,text) to authenticated;

-- Keep view available for read-only UI access
create or replace view public.v_audits as
select
  a.id,
  a.created_at,
  a.actor_name,
  a.action,
  a.period,
  a.kind,
  a.amount,
  a.note,
  a.meta,
  a.house_id,
  coalesce(a.house_code, h.code) as house_code,
  h.owner as house_owner
from public.audits a
left join public.houses h on h.id = a.house_id;

-- Refresh schema cache for PostgREST
notify pgrst, 'reload schema';

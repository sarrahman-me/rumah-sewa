-- Audit log table to track payment and occupancy actions
create table if not exists audits (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  actor_name text not null,
  action text not null,
  house_id uuid not null references houses(id) on delete cascade,
  period date,
  kind text,
  amount numeric,
  note text,
  meta jsonb
);

create index if not exists audits_created_at_idx on audits (created_at desc);
create index if not exists audits_house_idx on audits (house_id);
create index if not exists audits_period_idx on audits (period);
create index if not exists audits_actor_idx on audits (actor_name);

-- Flattened view that includes house metadata for convenience
create or replace view v_audits as
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
  h.id as house_id,
  h.code as house_code,
  h.owner as house_owner
from audits a
join houses h on h.id = a.house_id;

alter table audits enable row level security;

do
$$
begin
  if not exists (
    select 1
    from pg_policies
    where tablename = 'audits' and policyname = 'audits_select_authenticated'
  ) then
    create policy audits_select_authenticated
      on audits
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where tablename = 'audits' and policyname = 'audits_insert_authenticated'
  ) then
    create policy audits_insert_authenticated
      on audits
      for insert
      to authenticated
      with check (true);
  end if;
end
$$;

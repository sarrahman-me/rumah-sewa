-- BEGIN SQL
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz default now()
);

create table if not exists public.houses (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  owner text not null,
  is_repair_fund boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists public.meters (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text
);

create table if not exists public.meter_house_map (
  meter_id uuid not null references public.meters(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  active_from date not null default current_date,
  active_to date,
  primary key (meter_id, house_id, active_from)
);

create table if not exists public.periods (
  ymd date primary key
);

create table if not exists public.house_readings (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  period date not null references public.periods(ymd) on delete cascade,
  reading_m3 numeric(10,2) not null,
  recorded_by uuid references public.profiles(id),
  recorded_at timestamptz default now(),
  unique (house_id, period)
);

create table if not exists public.meter_bills (
  id uuid primary key default gen_random_uuid(),
  meter_id uuid not null references public.meters(id) on delete cascade,
  period date not null references public.periods(ymd) on delete cascade,
  invoice_no text,
  total_amount numeric(12,2) not null,
  noted_by uuid references public.profiles(id),
  noted_at timestamptz default now(),
  unique (meter_id, period)
);

create table if not exists public.water_shares (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  meter_id uuid not null references public.meters(id) on delete cascade,
  period date not null references public.periods(ymd) on delete cascade,
  usage_m3 numeric(10,2) not null,
  share_amount numeric(12,2) not null,
  generated_at timestamptz default now(),
  unique (house_id, period)
);

create table if not exists public.rents (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  period date not null references public.periods(ymd) on delete cascade,
  amount numeric(12,2) not null,
  unique (house_id, period)
);

do $$ begin
  if not exists (select 1 from pg_type where typname = 'payment_kind') then
    create type public.payment_kind as enum ('rent','water','repair_contrib','other');
  end if;
end $$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  period date not null references public.periods(ymd) on delete cascade,
  kind public.payment_kind not null,
  amount numeric(12,2) not null,
  paid_at date not null default current_date,
  method text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.repairs (
  id uuid primary key default gen_random_uuid(),
  period date not null references public.periods(ymd) on delete cascade,
  house_id uuid references public.houses(id),
  description text not null,
  amount numeric(12,2) not null,
  paid_at date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create or replace view public.v_rent_status as
select
  h.id as house_id,
  p.ymd as period,
  coalesce(r.amount,0) as rent_bill,
  coalesce(sum(pay.amount) filter (where pay.kind='rent'),0) as rent_paid,
  coalesce(r.amount,0) - coalesce(sum(pay.amount) filter (where pay.kind='rent'),0) as rent_due
from public.houses h
cross join public.periods p
left join public.rents r on r.house_id=h.id and r.period=p.ymd
left join public.payments pay on pay.house_id=h.id and pay.period=p.ymd
group by h.id, p.ymd, r.amount;

create or replace view public.v_water_status as
select
  h.id as house_id,
  p.ymd as period,
  coalesce(ws.share_amount,0) as water_bill,
  coalesce(sum(pay.amount) filter (where pay.kind='water'),0) as water_paid,
  coalesce(ws.share_amount,0) - coalesce(sum(pay.amount) filter (where pay.kind='water'),0) as water_due
from public.houses h
cross join public.periods p
left join public.water_shares ws on ws.house_id=h.id and ws.period=p.ymd
left join public.payments pay on pay.house_id=h.id and pay.period=p.ymd
group by h.id, p.ymd, ws.share_amount;

alter table public.profiles enable row level security;
alter table public.houses enable row level security;
alter table public.meters enable row level security;
alter table public.meter_house_map enable row level security;
alter table public.periods enable row level security;
alter table public.house_readings enable row level security;
alter table public.meter_bills enable row level security;
alter table public.water_shares enable row level security;
alter table public.rents enable row level security;
alter table public.payments enable row level security;
alter table public.repairs enable row level security;

create policy "profiles all select" on public.profiles for select to authenticated using (true);
create policy "profiles all insert" on public.profiles for insert to authenticated with check (true);
create policy "profiles all update" on public.profiles for update to authenticated using (true) with check (true);

do $$ declare t record;
begin
  for t in
    select unnest(array[
      'houses','meters','meter_house_map','periods','house_readings',
      'meter_bills','water_shares','rents','payments','repairs'
    ]) as tbl
  loop
    execute format('create policy "rw %s select" on public.%I for select to authenticated using (true);', t.tbl, t.tbl);
    execute format('create policy "rw %s insert" on public.%I for insert to authenticated with check (true);', t.tbl, t.tbl);
    execute format('create policy "rw %s update" on public.%I for update to authenticated using (true) with check (true);', t.tbl, t.tbl);
    execute format('create policy "rw %s delete" on public.%I for delete to authenticated using (true);', t.tbl, t.tbl);
  end loop;
end $$;

create or replace function public.generate_water_shares(p_period date)
returns void
language plpgsql
security definer
as $$
declare
  _period date := p_period;
begin
  if _period is null then
    raise exception 'period is required (YYYY-MM-01)';
  end if;

  create temporary table tmp_usage as
  with nowr as (
    select hr.house_id, hr.reading_m3 as reading_now
    from public.house_readings hr
    where hr.period = _period
  ),
  prevr as (
    select hr.house_id, hr.reading_m3 as reading_prev
    from public.house_readings hr
    where hr.period = (_period - interval '1 month')::date
  ),
  joined as (
    select h.id as house_id,
           coalesce(nr.reading_now,0) as now_val,
           coalesce(pr.reading_prev,0) as prev_val
    from public.houses h
    left join nowr nr on nr.house_id = h.id
    left join prevr pr on pr.house_id = h.id
  ),
  usage_calc as (
    select house_id,
           greatest(now_val - prev_val, 0)::numeric(10,2) as usage_m3
    from joined
  ),
  map as (
    select m.id as meter_id, mhm.house_id
    from public.meters m
    join public.meter_house_map mhm on mhm.meter_id = m.id
    where (mhm.active_from <= _period)
      and (mhm.active_to is null or mhm.active_to >= _period)
  )
  select u.house_id, u.usage_m3, map.meter_id
  from usage_calc u
  left join map on map.house_id = u.house_id;

  delete from public.water_shares where period = _period;

  insert into public.water_shares (house_id, meter_id, period, usage_m3, share_amount, generated_at)
  select
    tu.house_id,
    tu.meter_id,
    _period as period,
    coalesce(tu.usage_m3,0) as usage_m3,
    0::numeric(12,2) as share_amount,
    now()
  from tmp_usage tu;

  do $d$
  declare mrec record;
  begin
    for mrec in
      select mb.meter_id, mb.total_amount
      from public.meter_bills mb
      where mb.period = _period
    loop
      with agg as (
        select
          ws.house_id,
          ws.usage_m3,
          sum(ws.usage_m3) over () as total_usage
        from public.water_shares ws
        where ws.period = _period and ws.meter_id = mrec.meter_id
      ),
      calc as (
        select
          house_id,
          usage_m3,
          case
            when total_usage > 0
            then round(mrec.total_amount * (usage_m3 / total_usage))::numeric(12,2)
            else 0::numeric(12,2)
          end as part
        from agg
      )
      update public.water_shares ws
      set share_amount = c.part
      from calc c
      where ws.period = _period and ws.meter_id = mrec.meter_id and ws.house_id = c.house_id;
    end loop;
  end
  $d$;

  drop table if exists tmp_usage;
end
$$;

-- Seed 8 houses with fixed owners (H04/H05 are repair funds)
insert into public.houses (code, name, owner, is_repair_fund) values
('H01','Rumah 1','Rahman',false),
('H02','Rumah 2','Dival',false),
('H03','Rumah 3','Fadel',false),
('H04','Rumah 4','Dana Perbaikan',true),
('H05','Rumah 5','Dana Perbaikan',true),
('H06','Rumah 6','Fadel',false),
('H07','Rumah 7','Dival',false),
('H08','Rumah 8','Rahman',false)
on conflict (code) do nothing;

-- Seed 2 meters
insert into public.meters (code,name) values
('M1','Meter Grup 1'),
('M2','Meter Grup 2')
on conflict (code) do nothing;

-- Map: M1 -> H01..H04 ; M2 -> H05..H08
insert into public.meter_house_map (meter_id, house_id, active_from)
select m.id, h.id, date_trunc('month', now())::date
from public.meters m
join public.houses h on (
  (m.code='M1' and h.code in ('H01','H02','H03','H04')) or
  (m.code='M2' and h.code in ('H05','H06','H07','H08'))
)
on conflict do nothing;

-- Ensure current period
insert into public.periods(ymd) values (date_trunc('month', now())::date)
on conflict do nothing;

-- Seed rents CURRENT month
with p as (select date_trunc('month', now())::date as y)
insert into public.rents (house_id, period, amount)
select h.id, p.y,
  case h.code
    when 'H01' then 800000
    when 'H02' then 800000
    when 'H03' then 800000
    when 'H04' then 1000000
    when 'H05' then 1000000
    when 'H06' then 1000000
    when 'H07' then 1000000
    when 'H08' then 1000000
  end as amount
from public.houses h cross join p
on conflict (house_id, period) do nothing;
-- END SQL

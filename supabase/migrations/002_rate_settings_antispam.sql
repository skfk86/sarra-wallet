-- إعدادات يتحكم فيها المشرف (سعر الصرف المرجعي والهامش المسموح)
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
insert into public.settings (key, value) values ('rate', '{"sdg_per_usdt": null, "band_pct": 3}') on conflict (key) do nothing;

-- سجل الأحداث لحدود الاستخدام (منع السبام)
create table if not exists public.rate_events (
  id bigserial primary key,
  address text not null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_idx on public.rate_events (address, kind, created_at desc);
alter table public.rate_events enable row level security;

-- يسجّل الحدث ويعيد true إن كان ضمن الحد، أو false إن تجاوزه (ذرّي بقفل لكل محفظة/نوع)
create or replace function public.p2p_hit(p_addr text, p_kind text, p_max int, p_window_secs int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext(p_addr || ':' || p_kind));
  select count(*) into n from rate_events
    where address = p_addr and kind = p_kind and created_at > now() - make_interval(secs => p_window_secs);
  if n >= p_max then return false; end if;
  insert into rate_events (address, kind) values (p_addr, p_kind);
  return true;
end $$;
revoke all on function public.p2p_hit(text, text, int, int) from public, anon, authenticated;

-- تنظيف دوري للسجلات القديمة
create or replace function public.p2p_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from used_nonces where created_at < now() - interval '1 day';
  delete from rate_events where created_at < now() - interval '2 days';
$$;
revoke all on function public.p2p_cleanup() from public, anon, authenticated;

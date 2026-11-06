-- إشعارات Firebase الفورية: رموز الأجهزة، وحالة الماسح لكل شبكة، والجدولة كل دقيقة.
-- الجداول للخادم فقط (RLS بلا سياسات = لا يقرأها التطبيق ولا أي أحد بالمفتاح العام).

create table if not exists public.push_tokens (
  token      text primary key,
  address    text not null,           -- عنوان TRON (هوية المحفظة في صُرّة)
  evm        text,                    -- عنوان 0x (BNB/Ethereum/Polygon) بأحرف صغيرة
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_address on public.push_tokens (address);
create index if not exists push_tokens_evm on public.push_tokens (evm);
alter table public.push_tokens enable row level security;

create table if not exists public.push_state (
  chain      text primary key,        -- tron | bsc | polygon | eth
  last_block bigint not null,
  updated_at timestamptz not null default now()
);
alter table public.push_state enable row level security;

-- سر يُثبت أن الاستدعاء من الجدولة نفسها (يُولَّد هنا، ولا يحتاج إدخالاً يدوياً)
create table if not exists public.push_cfg (k text primary key, v text not null);
alter table public.push_cfg enable row level security;
insert into public.push_cfg (k, v)
  values ('cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
  on conflict (k) do nothing;

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'push-watch') then perform cron.unschedule('push-watch'); end if;
end $$;

select cron.schedule('push-watch', '* * * * *', $cron$
  select net.http_post(
    url := 'https://osdojhpsfbcqguoctbpk.supabase.co/functions/v1/push-watch',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron', (select v from public.push_cfg where k = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$);

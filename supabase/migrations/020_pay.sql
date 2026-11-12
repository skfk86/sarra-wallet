-- بوابة الدفع للتجار (غير احتجازية): التاجر يستلم USDT مباشرة على محفظته، ونحن نؤكد الدفع ونبلّغه.
-- الربح: رصيد مدفوع مسبقاً يُخصم منه عن كل فاتورة مدفوعة. كل المبالغ micro-USDT (6 خانات).
-- الجداول للخادم فقط (RLS بلا سياسات).

create table if not exists public.pay_merchants (
  id             uuid primary key default gen_random_uuid(),
  address        text not null unique,          -- محفظة صُرّة المالكة للحساب (عنوان TRON)
  name           text not null,
  tron_addr      text,                          -- عنوان استلام TRC20
  evm_addr       text,                          -- عنوان استلام BEP20/Polygon/ERC20
  key_hash       text unique,                   -- SHA-256 لمفتاح الـ API (المفتاح نفسه لا يُحفظ)
  key_hint       text,                          -- آخر 4 خانات للعرض
  webhook_url    text,
  webhook_secret text not null,
  credit         bigint not null default 1000000, -- رصيد تجريبي: 1 USDT
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
alter table public.pay_merchants enable row level security;

create table if not exists public.pay_invoices (
  id            text primary key,
  merchant_id   uuid not null references public.pay_merchants(id) on delete cascade,
  kind          text not null default 'payment' check (kind in ('payment', 'topup')),
  network       text not null check (network in ('tron', 'bsc', 'polygon', 'eth')),
  address       text not null,                  -- العنوان الذي يدفع إليه العميل (للعرض)
  match_hex     text not null,                  -- نفس العنوان: 20 بايت hex صغيرة (للمطابقة)
  amount        bigint not null check (amount > 0),
  exact         bigint not null check (exact > amount), -- المبلغ الفريد الذي يدفعه العميل
  fee           bigint not null default 0,
  order_id      text,
  description   text,
  status        text not null default 'pending' check (status in ('pending', 'paid', 'expired')),
  tx            text,
  tx_key        text,                           -- tx:logIndex (تحويل واحد لا يسدد فاتورتين)
  payer         text,
  paid_at       timestamptz,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  hook_state    text not null default 'none' check (hook_state in ('none', 'pending', 'done', 'failed')),
  hook_attempts int not null default 0,
  hook_next     timestamptz
);
alter table public.pay_invoices enable row level security;
-- لا فاتورتان معلّقتان بنفس (الشبكة، العنوان، المبلغ الفريد): هذا ما يربط التحويل بفاتورته
create unique index if not exists pay_inv_match on public.pay_invoices (network, match_hex, exact) where status = 'pending';
-- رقم طلب التاجر لا يتكرر ما دامت فاتورته معلّقة أو مدفوعة (إعادة الإرسال تعيد الفاتورة نفسها)
create unique index if not exists pay_inv_order on public.pay_invoices (merchant_id, order_id) where order_id is not null and status <> 'expired';
create unique index if not exists pay_inv_txkey on public.pay_invoices (network, tx_key) where tx_key is not null;
create index if not exists pay_inv_merchant on public.pay_invoices (merchant_id, created_at desc);
create index if not exists pay_inv_hook on public.pay_invoices (hook_next) where hook_state = 'pending';

-- تسديد ذرّي: الفاتورة تتحول إلى «مدفوعة» مرة واحدة فقط، ومعها يتغير الرصيد (خصم العمولة أو إضافة الشحن)
create or replace function public.pay_settle(p_id text, p_tx text, p_key text, p_payer text)
returns boolean language plpgsql security definer set search_path = public as $$
declare r record;
begin
  update pay_invoices set status = 'paid', tx = p_tx, tx_key = p_key, payer = p_payer, paid_at = now(),
         hook_state = case when kind = 'payment' then 'pending' else 'none' end, hook_next = now()
   where id = p_id and status = 'pending'
   returning merchant_id, kind, exact, fee into r;
  if not found then return false; end if;
  if r.kind = 'topup' then update pay_merchants set credit = credit + r.exact where id = r.merchant_id;
  else update pay_merchants set credit = credit - r.fee where id = r.merchant_id; end if;
  return true;
end $$;
revoke all on function public.pay_settle(text, text, text, text) from public, anon, authenticated;

-- الماسح كل دقيقة (نفس سر الجدولة المستخدم في الإشعارات)
do $$ begin
  if exists (select 1 from cron.job where jobname = 'pay-watch') then perform cron.unschedule('pay-watch'); end if;
end $$;
select cron.schedule('pay-watch', '* * * * *', $cron$
  select net.http_post(
    url := 'https://osdojhpsfbcqguoctbpk.supabase.co/functions/v1/pay/cron',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron', (select v from public.push_cfg where k = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$);

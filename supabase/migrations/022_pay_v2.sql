-- بوابة الدفع v2: عملة USDC، بيانات التاجر (metadata)، رابط الرجوع، إلغاء الفاتورة، أحداث إشعار متعددة، وسجل الإشعارات.
-- إضافات فقط: الفواتير القائمة تبقى كما هي (USDT، بلا metadata).
alter table public.pay_invoices add column if not exists currency text not null default 'USDT';
alter table public.pay_invoices add column if not exists metadata jsonb;
alter table public.pay_invoices add column if not exists success_url text;
alter table public.pay_invoices add column if not exists hook_event text;           -- invoice.paid | invoice.expired | invoice.cancelled
alter table public.pay_invoices add column if not exists cancelled_at timestamptz;

do $$ begin
  alter table public.pay_invoices drop constraint if exists pay_invoices_status_check;
  alter table public.pay_invoices add constraint pay_invoices_status_check check (status in ('pending', 'paid', 'expired', 'cancelled'));
  alter table public.pay_invoices drop constraint if exists pay_invoices_currency_check;
  alter table public.pay_invoices add constraint pay_invoices_currency_check check (currency in ('USDT', 'USDC'));
end $$;

-- المبلغ الفريد فريد لكل عملة (عقد USDC غير عقد USDT، فلا تصادم بينهما)
drop index if exists public.pay_inv_match;
create unique index pay_inv_match on public.pay_invoices (network, currency, match_hex, exact) where status = 'pending' and not test;
drop index if exists public.pay_inv_order;
create unique index pay_inv_order on public.pay_invoices (merchant_id, test, order_id) where order_id is not null and status not in ('expired', 'cancelled');

-- سجل محاولات الإشعار (يعرضه التطبيق للتاجر). يُحذف ما هو أقدم من 30 يوماً
create table if not exists public.pay_hook_log (
  id          bigserial primary key,
  merchant_id uuid not null references public.pay_merchants(id) on delete cascade,
  invoice_id  text not null,
  event       text not null,
  status      int not null default 0,   -- كود HTTP من خادم التاجر، 0 = تعذّر الوصول
  ok          boolean not null default false,
  at          timestamptz not null default now()
);
alter table public.pay_hook_log enable row level security;
create index if not exists pay_hook_log_m on public.pay_hook_log (merchant_id, at desc);

-- التسديد الذرّي كما في 020، مع تسجيل اسم الحدث
create or replace function public.pay_settle(p_id text, p_tx text, p_key text, p_payer text)
returns boolean language plpgsql security definer set search_path = public as $$
declare r record;
begin
  update pay_invoices set status = 'paid', tx = p_tx, tx_key = p_key, payer = p_payer, paid_at = now(),
         hook_state = case when kind = 'payment' then 'pending' else 'none' end, hook_event = 'invoice.paid', hook_next = now(), hook_attempts = 0
   where id = p_id and status = 'pending'
   returning merchant_id, kind, exact, fee into r;
  if not found then return false; end if;
  if r.kind = 'topup' then update pay_merchants set credit = credit + r.exact where id = r.merchant_id;
  else update pay_merchants set credit = credit - r.fee where id = r.merchant_id; end if;
  return true;
end $$;
revoke all on function public.pay_settle(text, text, text, text) from public, anon, authenticated;

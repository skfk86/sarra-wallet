-- الوضع التجريبي لبوابة الدفع: مفتاح sk_test_ منفصل، وفواتير تجريبية لا تُراقَب على الشبكة ولا تخصم رصيداً.
alter table public.pay_merchants add column if not exists test_key_hash text unique;
alter table public.pay_merchants add column if not exists test_key_hint text;
alter table public.pay_invoices add column if not exists test boolean not null default false;
-- الفواتير التجريبية لا تحجز مبلغاً فريداً على عنوان التاجر (لا تزاحم الفواتير الحقيقية)
drop index if exists public.pay_inv_match;
create unique index pay_inv_match on public.pay_invoices (network, match_hex, exact) where status = 'pending' and not test;
-- رقم الطلب يتكرر بين الوضعين: ORDER-1 تجريبي وORDER-1 حقيقي فاتورتان مختلفتان
drop index if exists public.pay_inv_order;
create unique index pay_inv_order on public.pay_invoices (merchant_id, test, order_id) where order_id is not null and status <> 'expired';

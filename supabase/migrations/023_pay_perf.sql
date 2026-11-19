-- فهارس لحذف الفواتير التجريبية وسجل إشعاراتها بسرعة (يعمل كل دقيقة)
create index if not exists pay_hook_log_inv on public.pay_hook_log (invoice_id);
create index if not exists pay_inv_test_final on public.pay_invoices (status) where test;

-- لا رصيد ترحيبي: التاجر الجديد يبدأ بصفر (كان 1 USDT افتراضياً في 020)
alter table public.pay_merchants alter column credit set default 0;
-- من لم يشحن قط يُزال عنه الرصيد الترحيبي (ومن شحن لا يُمس رصيده)
update public.pay_merchants m set credit = least(credit, 0)
 where not exists (select 1 from public.pay_invoices i where i.merchant_id = m.id and i.kind = 'topup' and i.status = 'paid');

-- فهارس لحذف الفواتير التجريبية وسجل إشعاراتها بسرعة (يعمل كل دقيقة)
create index if not exists pay_hook_log_inv on public.pay_hook_log (invoice_id);
create index if not exists pay_inv_test_final on public.pay_invoices (status) where test;

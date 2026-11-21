-- رصيد رسوم البوابة: مكافأة باقات الشحن. إضافات فقط.
-- المكافأة تُحسب في الخادم عند إنشاء فاتورة الشحن وتُحفظ معها، فلا يمكن تغييرها بعد الإنشاء،
-- وتُضاف للرصيد مرة واحدة فقط ضمن التسديد الذرّي نفسه (الشرط status = 'pending' يمنع التكرار).
alter table public.pay_invoices add column if not exists bonus bigint not null default 0;
do $$ begin
  alter table public.pay_invoices drop constraint if exists pay_invoices_bonus_check;
  -- حماية إضافية: المكافأة لا تكون سالبة، ولا تتجاوز 20% من المبلغ، ولا تكون إلا لفواتير الشحن
  alter table public.pay_invoices add constraint pay_invoices_bonus_check check (bonus >= 0 and bonus * 5 <= amount and (bonus = 0 or kind = 'topup'));
end $$;

create or replace function public.pay_settle(p_id text, p_tx text, p_key text, p_payer text)
returns boolean language plpgsql security definer set search_path = public as $$
declare r record;
begin
  update pay_invoices set status = 'paid', tx = p_tx, tx_key = p_key, payer = p_payer, paid_at = now(),
         hook_state = case when kind = 'payment' then 'pending' else 'none' end, hook_event = 'invoice.paid', hook_next = now(), hook_attempts = 0
   where id = p_id and status = 'pending'
   returning merchant_id, kind, exact, fee, bonus into r;
  if not found then return false; end if;
  if r.kind = 'topup' then update pay_merchants set credit = credit + r.exact + r.bonus where id = r.merchant_id;
  else update pay_merchants set credit = credit - r.fee where id = r.merchant_id; end if;
  return true;
end $$;
revoke all on function public.pay_settle(text, text, text, text) from public, anon, authenticated;
grant execute on function public.pay_settle(text, text, text, text) to service_role;

-- ملخص البوابة للأدمن فقط: تُستدعى من دالة p2p بمفتاح الخدمة بعد التحقق من أن الموقّع أدمن.
-- لا تُتاح لأي مستخدم (revoke من الجميع)، وتعيد أرقاماً مجمّعة فقط بلا بيانات تجار.
create or replace function public.pay_admin_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'received',   (select coalesce(sum(exact), 0) from pay_invoices where kind = 'topup' and status = 'paid' and not test),
    'earned',     (select coalesce(sum(fee), 0)   from pay_invoices where kind = 'payment' and status = 'paid' and not test),
    'earned_30d', (select coalesce(sum(fee), 0)   from pay_invoices where kind = 'payment' and status = 'paid' and not test and paid_at > now() - interval '30 days'),
    'gifts',      (select coalesce(sum(bonus), 0) from pay_invoices where kind = 'topup' and status = 'paid' and not test),
    'owed',       (select coalesce(sum(greatest(credit, 0)), 0) from pay_merchants),
    'grace_debt', (select coalesce(-sum(least(credit, 0)), 0) from pay_merchants),
    'merchants',  (select count(*) from pay_merchants),
    'active_30d', (select count(distinct merchant_id) from pay_invoices where kind = 'payment' and status = 'paid' and not test and paid_at > now() - interval '30 days'),
    'paid_30d',   (select count(*) from pay_invoices where kind = 'payment' and status = 'paid' and not test and paid_at > now() - interval '30 days'),
    'volume_30d', (select coalesce(sum(amount), 0) from pay_invoices where kind = 'payment' and status = 'paid' and not test and paid_at > now() - interval '30 days')
  );
$$;
revoke all on function public.pay_admin_stats() from public, anon, authenticated;
grant execute on function public.pay_admin_stats() to service_role; -- صريحاً، لا اعتماداً على الصلاحيات الافتراضية

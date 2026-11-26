-- الاحتفاظ بالبيانات (قرار المالك: 180 يوماً). يُشغَّل يومياً من دالة monitor بعد حذف صور الإيصالات من المخزن.
-- المبدأ: بعد 180 يوماً من انتهاء الطلب/الفاتورة يُحذف المحتوى الشخصي (المحادثات، بيانات الحساب البنكي، بيانات الدافع)،
-- وتبقى الأرقام المالية (المبلغ، العمولة، الشبكة، التاريخ) لأن أرباح الأدمن وإحصاءات البوابة وسجل فواتير التاجر تعتمد عليها.
-- لا يُمسّ أي طلب مفتوح أو في نزاع أو فشل تحريره/إعادته: الحذف للحالات النهائية فقط.
alter table public.orders alter column pay_name drop not null;
alter table public.orders alter column pay_account drop not null;

create or replace function public.sarra_purge(p_days int default 180)
returns json language plpgsql security definer set search_path = public as $$
declare
  cut timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 180), 90)); -- حد أدنى 90 يوماً مهما مُرِّر
  n_msg int; n_ord int; n_inv int; n_hook int; n_seen int; n_cache int;
begin
  delete from messages m using orders o
   where m.order_id = o.id and o.status in ('released', 'cancelled', 'refunded') and o.updated_at < cut;
  get diagnostics n_msg = row_count;
  update orders set pay_name = null, pay_account = null
   where status in ('released', 'cancelled', 'refunded') and updated_at < cut and (pay_name is not null or pay_account is not null);
  get diagnostics n_ord = row_count;
  update pay_invoices set payer = null, description = null, metadata = null, success_url = null
   where status in ('paid', 'expired', 'cancelled') and coalesce(paid_at, cancelled_at, expires_at) < cut
     and (payer is not null or description is not null or metadata is not null or success_url is not null);
  get diagnostics n_inv = row_count;
  delete from pay_hook_log where at < cut;                                   get diagnostics n_hook = row_count;
  delete from p2p_push_seen where at < now() - interval '30 days';           get diagnostics n_seen = row_count;
  delete from evm_history_cache where fetched_at < now() - interval '30 days'; get diagnostics n_cache = row_count;
  return json_build_object('messages', n_msg, 'orders_anonymized', n_ord, 'invoices_anonymized', n_inv,
                           'hook_log', n_hook, 'push_seen', n_seen, 'history_cache', n_cache);
end $$;
revoke all on function public.sarra_purge(int) from public, anon, authenticated;
grant execute on function public.sarra_purge(int) to service_role;

-- الاحتفاظ بالبيانات (قرار المالك). يُشغَّل يومياً من دالة monitor بعد حذف صور الإيصالات من المخزن.
-- الصفقة الناجحة (released): 3 أيام. الملغاة والمُعادة: 180 يوماً (قد تأتي منها شكوى متأخرة). الإعلان المتوقف: 30 يوماً.
-- المبدأ: بعد 180 يوماً من انتهاء الطلب/الفاتورة يُحذف المحتوى الشخصي (المحادثات، بيانات الحساب البنكي، بيانات الدافع)،
-- وتبقى الأرقام المالية (المبلغ، العمولة، الشبكة، التاريخ) لأن أرباح الأدمن وإحصاءات البوابة وسجل فواتير التاجر تعتمد عليها.
-- لا يُمسّ أي طلب مفتوح أو في نزاع أو فشل تحريره/إعادته: الحذف للحالات النهائية فقط.
alter table public.orders alter column pay_name drop not null;
alter table public.orders alter column pay_account drop not null;

create or replace function public.sarra_purge(p_days int default 180)
returns json language plpgsql security definer set search_path = public as $$
declare
  cut timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 180), 90)); -- حد أدنى 90 يوماً مهما مُرِّر
  done_cut timestamptz := now() - interval '3 days'; -- الصفقة الناجحة: المشتري استلم والبائع استلم، لا نزاع بعدها
  n_msg int; n_ord int; n_inv int; n_hook int; n_seen int; n_cache int; n_ads int;
begin
  delete from messages m using orders o
   where m.order_id = o.id and ((o.status = 'released' and o.updated_at < done_cut) or (o.status in ('cancelled', 'refunded') and o.updated_at < cut));
  get diagnostics n_msg = row_count;
  update orders set pay_name = null, pay_account = null
   where ((status = 'released' and updated_at < done_cut) or (status in ('cancelled', 'refunded') and updated_at < cut))
     and (pay_name is not null or pay_account is not null);
  get diagnostics n_ord = row_count;
  update pay_invoices set payer = null, description = null, metadata = null, success_url = null
   where status in ('paid', 'expired', 'cancelled') and coalesce(paid_at, cancelled_at, expires_at) < cut
     and (payer is not null or description is not null or metadata is not null or success_url is not null);
  get diagnostics n_inv = row_count;
  delete from pay_hook_log where at < cut;                                   get diagnostics n_hook = row_count;
  delete from p2p_push_seen where at < now() - interval '30 days';           get diagnostics n_seen = row_count;
  delete from evm_history_cache where fetched_at < now() - interval '30 days'; get diagnostics n_cache = row_count;
  -- الإعلانات المتوقفة الأقدم من 30 يوماً التي لم يُفتح عليها أي طلب (المرتبطة بطلبات تبقى، وتُخفى من «إعلاناتي» في الخادم)
  delete from offers f where f.active = false and f.created_at < now() - interval '30 days'
     and not exists (select 1 from orders o where o.offer_id = f.id);                                     get diagnostics n_ads = row_count;
  return json_build_object('messages', n_msg, 'orders_anonymized', n_ord, 'invoices_anonymized', n_inv,
                           'hook_log', n_hook, 'push_seen', n_seen, 'history_cache', n_cache, 'ads', n_ads);
end $$;
revoke all on function public.sarra_purge(int) from public, anon, authenticated;
grant execute on function public.sarra_purge(int) to service_role;

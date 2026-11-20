-- 024: دوال حجز كميات P2P (كانت مُنشأة في Supabase مباشرة وليست في المستودع) + إغلاق استدعائها من الخارج
--
-- الثغرة: p2p_reserve دالة SECURITY DEFINER ولم يُسحب منها حق التنفيذ، وPostgres يمنح EXECUTE لـ PUBLIC افتراضياً.
-- أي شخص يملك المفتاح العام (الموجود داخل التطبيق) كان يستطيع استدعاءها عبر /rest/v1/rpc/p2p_reserve
-- وإنقاص الكمية المتاحة في كل الإعلانات (معرّفاتها عامة) حتى الصفر: تعطيل سوق P2P بالكامل دون أي توقيع.
-- الدالة نفسها سليمة منطقياً (تحديث واحد ذرّي بشرط الكمية والحدود)، والإصلاح: لا يستدعيها إلا الخادم (service_role).

create or replace function public.p2p_reserve(p_offer uuid, p_amount numeric)
returns boolean language sql security definer set search_path = public as $$
  with u as (
    update offers set available_usdt = available_usdt - p_amount
    where id = p_offer and active and p_amount > 0 and available_usdt >= p_amount
      and p_amount between min_usdt and max_usdt
    returning 1)
  select exists(select 1 from u);
$$;

create or replace function public.p2p_unreserve_order(p_order uuid)
returns void language sql security definer set search_path = public as $$
  with o as (update orders set unreserved = true where id = p_order and not unreserved returning offer_id, amount_usdt)
  update offers set available_usdt = available_usdt + o.amount_usdt from o where offers.id = o.offer_id;
$$;

revoke all on function public.p2p_reserve(uuid, numeric) from public, anon, authenticated;
revoke all on function public.p2p_unreserve_order(uuid) from public, anon, authenticated;
revoke all on function public.p2p_hit(text, text, int, int) from public, anon, authenticated;
grant execute on function public.p2p_reserve(uuid, numeric) to service_role;
grant execute on function public.p2p_unreserve_order(uuid) to service_role;
grant execute on function public.p2p_hit(text, text, int, int) to service_role;

-- فحص شامل: أي دالة SECURITY DEFINER أخرى في public ما زال anon يستطيع تنفيذها تظهر في نتيجة التشغيل (المتوقع: p2p_inbox وp2p_offers وp2p_order_ver فقط، وهي للقراءة عمداً)
select p.oid::regprocedure::text as anon_callable_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE');

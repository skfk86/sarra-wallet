-- 10 آلاف مستخدم بتكلفة صفر: شاشة الطلب تفحص "نسخة" الطلب من قاعدة البيانات ولا تجلبه كاملاً إلا عند تغيّره
create index if not exists messages_order_idx on public.messages (order_id, id);
create or replace function public.p2p_order_ver(p_token uuid, p_order uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('v', extract(epoch from o.updated_at)::bigint,
    'm', coalesce((select max(id) from messages where order_id = o.id), 0), 's', o.status)
  from orders o join profiles p on p.inbox_token = p_token
  where o.id = p_order and (o.buyer = p.address or o.seller = p.address);
$$;
revoke all on function public.p2p_order_ver(uuid, uuid) from public;
grant execute on function public.p2p_order_ver(uuid, uuid) to anon;
-- p2p_offers صار يعيد 30 إعلاناً بدون created_at (انظر قاعدة البيانات الحالية)

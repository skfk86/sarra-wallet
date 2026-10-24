-- إصلاحات المراجعة: منع إرجاع الكمية للإعلان مرتين، وحفظ التوثيق السابق عند طلب تغيير الحساب
alter table public.profiles add column if not exists prev_kyc jsonb;
alter table public.orders add column if not exists unreserved boolean not null default false;
update public.orders set unreserved = true where status in ('cancelled','refunded','refunding','refund_failed');
create or replace function public.p2p_unreserve_order(p_order uuid)
returns void language sql security definer set search_path = public as $$
  with o as (update orders set unreserved = true where id = p_order and not unreserved returning offer_id, amount_usdt)
  update offers set available_usdt = available_usdt + o.amount_usdt from o where offers.id = o.offer_id;
$$;
revoke all on function public.p2p_unreserve_order(uuid) from public, anon, authenticated;

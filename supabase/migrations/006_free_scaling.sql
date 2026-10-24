-- التوسع بتكلفة صفر: قراءات خفيفة عبر قاعدة البيانات مباشرة بدل Edge Functions (حدها 500 ألف طلب شهرياً)

-- رمز صندوق سري لكل مستخدم: يكفي لمعرفة "هل لديّ جديد؟" بدون توقيع ولا Edge Function
alter table public.profiles add column if not exists inbox_token uuid not null default gen_random_uuid();
create unique index if not exists profiles_inbox_token_idx on public.profiles (inbox_token);
create index if not exists orders_seller_status_idx on public.orders (seller, status);
create index if not exists orders_buyer_status_idx on public.orders (buyer, status);

-- عدد الطلبات التي تنتظر إجراءً منك، وعدد المفتوحة، وإعلاناتك النشطة (أرقام فقط، بدون أي بيانات شخصية)
create or replace function public.p2p_inbox(p_token uuid)
returns json language sql stable security definer set search_path = public as $$
  with me as (select address from profiles where inbox_token = p_token and not banned)
  select json_build_object(
    'action', (select count(*) from orders o, me where
        ((o.seller = me.address and (o.status = 'paid' or (o.status = 'awaiting_deposit' and (o.deposit_expires_at is null or o.deposit_expires_at > now())))))
        or (o.buyer = me.address and o.status = 'funded')),
    'open', (select count(*) from orders o, me where (o.seller = me.address or o.buyer = me.address)
        and o.status in ('awaiting_deposit','funded','paid','releasing','refunding')),
    'offers', (select count(*) from offers f, me where f.seller = me.address and f.active),
    'v', (select coalesce(extract(epoch from max(o.updated_at))::bigint, 0) from orders o, me where o.seller = me.address or o.buyer = me.address)
  ) where exists (select 1 from me);
$$;
revoke all on function public.p2p_inbox(uuid) from public;
grant execute on function public.p2p_inbox(uuid) to anon;

-- قائمة الإعلانات العامة (نفس منطق الخادم: النشطة، داخل نطاق سعر الصرف، وبدون حساب بنكك)
create or replace function public.p2p_offers(p_side text)
returns json language sql stable security definer set search_path = public as $$
  with r as (select (value->>'sdg_per_usdt')::numeric rate, coalesce((value->>'band_pct')::numeric, 3) band from settings where key = 'rate'),
  rg as (select case when rate > 0 then round(rate * (1 - least(greatest(band,0),50)/100), 2) end mn,
                case when rate > 0 then round(rate * (1 + least(greatest(band,0),50)/100), 2) end mx, rate, band from r)
  select json_build_object(
    'rate', (select json_build_object('sdg_per_usdt', rate, 'band_pct', band) from rg),
    'range', (select case when mn is null then null else json_build_object('min', mn, 'max', mx) end from rg),
    'offers', coalesce((select json_agg(x order by
        case when p_side = 'buy' then -x.price_sdg else x.price_sdg end) from (
      select f.id, f.seller, f.side, f.price_sdg, f.min_usdt, f.max_usdt, f.available_usdt, f.pay_window_min, f.created_at,
        json_build_object('nickname', p.nickname, 'trades_completed', p.trades_completed, 'disputes_lost', p.disputes_lost,
          'verified', p.verify_status = 'approved',
          'completion', case when p.trades_completed + p.cancels = 0 then null
                        else round(p.trades_completed::numeric / (p.trades_completed + p.cancels) * 100, 1) end) seller_profile
      from offers f join profiles p on p.address = f.seller, rg
      where f.active and not p.banned and f.side = case when p_side = 'buy' then 'buy' else 'sell' end
        and f.available_usdt >= f.min_usdt
        and (rg.mn is null or (f.price_sdg between rg.mn and rg.mx))
      order by case when p_side = 'buy' then -f.price_sdg else f.price_sdg end
      limit 50) x), '[]'::json)
  );
$$;
revoke all on function public.p2p_offers(text) from public;
grant execute on function public.p2p_offers(text) to anon;

-- قائمة السوق السريعة (REST) تُرجع شبكة الإعلان، وتثبيت search_path لـ new_sarra_id
-- (نفس تعريف 006 مع إضافة f.network)
alter function public.new_sarra_id() set search_path = public;

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
      select f.id, f.seller, f.side, f.network, f.price_sdg, f.min_usdt, f.max_usdt, f.available_usdt, f.pay_window_min, f.created_at,
        json_build_object('nickname', p.nickname, 'trades_completed', p.trades_completed, 'disputes_lost', p.disputes_lost,
          'verified', p.verify_status = 'approved',
          'completion', case when p.trades_completed + p.cancels = 0 then null
                        else round(p.trades_completed::numeric / (p.trades_completed + p.cancels) * 100, 1) end) seller_profile
      from offers f join profiles p on p.address = f.seller, rg
      where f.active and not p.banned and f.side = case when p_side = 'buy' then 'buy' else 'sell' end
        and f.available_usdt >= f.min_usdt
        and (rg.mn is null or (f.price_sdg between rg.mn and rg.mx))
      order by case when p_side = 'buy' then -f.price_sdg else f.price_sdg end
      limit 30) x), '[]'::json)
  );
$$;

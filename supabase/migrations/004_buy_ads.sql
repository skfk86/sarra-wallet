-- إعلانات الشراء (تبويب "بيع USDT" على طريقة Binance) وحساب الدفع لكل طلب
alter table public.offers add column if not exists side text not null default 'sell' check (side in ('sell','buy'));
alter table public.orders add column if not exists pay_name text, add column if not exists pay_account text, add column if not exists side text not null default 'sell';
create index if not exists offers_side_idx on public.offers (side, active, price_sdg);

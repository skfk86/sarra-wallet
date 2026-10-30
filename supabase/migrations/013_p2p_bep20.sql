-- ضمان P2P على BNB Chain (BEP20): رسوم الإيداع سنتات بدل ~13 TRX
alter table public.offers add column if not exists network text not null default 'TRC20' check (network in ('TRC20','BEP20'));
alter table public.orders add column if not exists network text not null default 'TRC20' check (network in ('TRC20','BEP20')),
  add column if not exists buyer_payout text, add column if not exists seller_payout text;

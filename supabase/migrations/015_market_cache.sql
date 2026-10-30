-- ذاكرة مؤقتة مشتركة لأسعار CoinGecko (الرسوم البيانية والأسعار): طلب واحد يخدم كل المستخدمين
create table if not exists public.market_cache (key text primary key, body jsonb not null, at timestamptz not null default now());
alter table public.market_cache enable row level security;

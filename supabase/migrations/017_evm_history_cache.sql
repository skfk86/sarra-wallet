-- ذاكرة مؤقتة لسجل معاملات شبكات EVM (BNB/Ethereum/Polygon)
-- القراءة عبر RPC عام (لا تستهلك استدعاء Edge Function) والتحديث عبر دالة history فقط
create table if not exists public.evm_history_cache (
  chain int not null,
  addr text not null,
  body jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (chain, addr)
);
alter table public.evm_history_cache enable row level security;

create or replace function public.evm_history_get(p_chain int, p_addr text)
returns table(body jsonb, fetched_at timestamptz)
language sql security definer set search_path = public as $$
  select c.body, c.fetched_at from evm_history_cache c
  where c.chain = p_chain and c.addr = lower(p_addr)
    and p_chain in (1, 56, 137) and p_addr ~* '^0x[0-9a-f]{40}$';
$$;
grant execute on function public.evm_history_get(int, text) to anon, authenticated;

create or replace function public.history_cleanup()
returns void language sql security definer set search_path = public as $$
  delete from evm_history_cache where fetched_at < now() - interval '30 days';
$$;
revoke all on function public.history_cleanup() from public, anon, authenticated;

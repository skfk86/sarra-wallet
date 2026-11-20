-- 025: إشعارات P2P الفورية (حالة الطلب ورسائل المحادثة) من ماسح push-watch
-- آخر حالة أُبلغ عنها لكل طلب، حتى لا يتكرر إشعار الحالة عند كل تحديث آخر للطلب (رسالة، إيصال)
create table if not exists public.p2p_push_seen (order_id uuid primary key, status text not null, at timestamptz not null default now());
alter table public.p2p_push_seen enable row level security;
revoke all on public.p2p_push_seen from anon, authenticated;
-- push_state.last_block للصف 'p2p' يحمل وقت آخر دورة بالميلي ثانية (bigint يكفي)
create index if not exists orders_updated_at_idx on public.orders (updated_at);
create index if not exists messages_created_at_idx on public.messages (created_at);

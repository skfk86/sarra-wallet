-- تذاكر الدعم الفني داخل التطبيق: المستخدم يكتب، المشرف يرد. لا وصول من العميل (الخادم فقط)
create table if not exists public.support_tickets (
  id bigserial primary key,
  address text not null,
  topic text not null default 'other',
  body text not null check (char_length(body) between 5 and 2000),
  reply text,
  status text not null default 'open' check (status in ('open','answered','closed')),
  created_at timestamptz not null default now(),
  replied_at timestamptz,
  replied_by text
);
create index if not exists support_tickets_addr_idx on public.support_tickets(address, created_at desc);
create index if not exists support_tickets_open_idx on public.support_tickets(status, created_at);
alter table public.support_tickets enable row level security;

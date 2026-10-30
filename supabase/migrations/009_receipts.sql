-- إيصالات بنكك داخل صفقة P2P: يرفعها المشتري، ويراها البائع والمشرف فقط عبر روابط مؤقتة
create table if not exists public.order_receipts (
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  uploader text not null,
  path text not null unique,
  mime text not null,
  size_bytes int not null check (size_bytes between 1 and 2097152),
  sha256 text not null,
  created_at timestamptz not null default now()
);
create index if not exists order_receipts_order_idx on public.order_receipts(order_id);
-- لا سياسات: لا وصول من العميل إطلاقاً، الخادم وحده (service role) يقرأ ويكتب
alter table public.order_receipts enable row level security;

-- مخزن خاص (غير عام)، 2MB كحد أقصى، صور فقط
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

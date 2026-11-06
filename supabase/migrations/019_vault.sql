-- خزنة السجل المشفّرة: نسخة من سجل المعاملات والصفقات تُستعاد بعد إعادة تثبيت التطبيق.
-- المحتوى مشفّر على الجهاز بمفتاح مشتق من مفتاح المحفظة؛ الخادم لا يستطيع قراءته. للخادم فقط (RLS بلا سياسات).
create table if not exists public.user_vault (
  address    text primary key,
  blob       text not null,
  updated_at timestamptz not null default now()
);
alter table public.user_vault enable row level security;

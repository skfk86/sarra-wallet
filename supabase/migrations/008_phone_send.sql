-- الإرسال برقم الهاتف: اختياري، للموثّقين فقط (الرقم مراجَع مع الهوية)
alter table public.profiles add column if not exists phone_link boolean not null default false;
create index if not exists profiles_phone_idx on public.profiles (phone) where phone_link;

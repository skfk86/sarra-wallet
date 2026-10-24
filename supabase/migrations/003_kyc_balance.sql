-- التوثيق (KYC) ونسبة الإتمام
alter table public.profiles
  add column if not exists verify_status text not null default 'none' check (verify_status in ('none','pending','approved','rejected')),
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists bankak_account text,
  add column if not exists id_doc_path text,
  add column if not exists verify_note text,
  add column if not exists verified_at timestamptz,
  add column if not exists cancels int not null default 0;

-- مخزن خاص لصور الهوية (غير عام، والقراءة بروابط مؤقتة للمشرف فقط)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc', 'kyc', false, 600000, array['image/jpeg'])
on conflict (id) do nothing;

-- معرّف صُرّة: رقم عشوائي من 8 خانات لكل مستخدم (عشوائي حتى لا يمكن تخمين معرّفات الآخرين بالتسلسل)
-- يُستخدم للتحويل بين مستخدمي صُرّة على أي شبكة بدون نسخ العناوين
create or replace function public.new_sarra_id() returns bigint language plpgsql as $$
declare v bigint;
begin
  loop
    v := 10000000 + floor(random() * 90000000)::bigint;
    exit when not exists (select 1 from public.profiles where sarra_id = v);
  end loop;
  return v;
end $$;
alter table public.profiles add column if not exists sarra_id bigint;
update public.profiles set sarra_id = public.new_sarra_id() where sarra_id is null;
alter table public.profiles alter column sarra_id set default public.new_sarra_id();
alter table public.profiles alter column sarra_id set not null;
create unique index if not exists profiles_sarra_id_key on public.profiles(sarra_id);
revoke all on function public.new_sarra_id() from public, anon, authenticated;

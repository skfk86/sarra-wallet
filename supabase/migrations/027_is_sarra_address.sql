-- هل العنوان مسجّل في صُرّة؟ (تقرير المراجعة: تسمية مصدر الاستلام «تحويل داخلي من مستخدم صُرّة»)
-- تُرجع صح/خطأ فقط: لا اسم ولا معرّف ولا أي هوية. الجداول تبقى مغلقة (RLS بلا سياسات)، والدالة وحدها تقرأ.
-- خطر الحصر (فحص عناوين كثيرة لمعرفة من يستخدم صُرّة) يُحدّ بسقف 60 استعلاماً يومياً لكل IP.
-- يحتاج موافقة المطوّر قبل التطبيق على المشروع (sarra-p2p).

create table if not exists public.sarra_lookup_rl (
  ip  text not null,
  day date not null default current_date,
  n   int  not null default 0,
  primary key (ip, day)
);
alter table public.sarra_lookup_rl enable row level security;

create or replace function public.is_sarra_address(p_addr text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text := coalesce(split_part((current_setting('request.headers', true)::json ->> 'x-forwarded-for'), ',', 1), 'none');
  v_n  int;
  a    text := trim(coalesce(p_addr, ''));
begin
  if a !~ '^(T[1-9A-HJ-NP-Za-km-z]{33}|0x[0-9a-fA-F]{40})$' then return false; end if;
  insert into sarra_lookup_rl (ip, day, n) values (v_ip, current_date, 1)
    on conflict (ip, day) do update set n = sarra_lookup_rl.n + 1
    returning n into v_n;
  if v_n > 60 then return false; end if; -- فوق السقف: «خارجية» بدل خطأ، فلا يكشف السقف شيئاً
  delete from sarra_lookup_rl where day < current_date - 1;
  if a like 'T%' then
    return exists (select 1 from push_tokens where address = a);
  end if;
  return exists (select 1 from push_tokens where evm = lower(a));
end $$;

revoke all on function public.is_sarra_address(text) from public;
grant execute on function public.is_sarra_address(text) to anon, authenticated;

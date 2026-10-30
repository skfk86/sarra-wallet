-- الإرسال برقم الهاتف على كل الشبكات: عنوان 0x (BNB/Ethereum/Polygon) بجانب عنوان TRON
-- phone_link_pref: اختيار المستخدم عند التوثيق؛ يُفعَّل الاستقبال بالرقم تلقائياً عند قبول التوثيق
alter table public.profiles add column if not exists evm_address text check (evm_address is null or evm_address ~ '^0x[0-9a-fA-F]{40}$');
alter table public.profiles add column if not exists phone_link_pref boolean not null default true;

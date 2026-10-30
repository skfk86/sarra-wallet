-- فحص سلامة P2P المالي — شغّله في Supabase SQL Editor بعد كل صفقة حقيقية، وكل أسبوع.
-- كل صف ناتج = مشكلة تحتاج مراجعة. النتيجة الفارغة = سليم.

-- 1) أكثر من دفعة لنفس الصفقة (دفع مزدوج)
select 'DOUBLE_PAYOUT' as issue, order_id::text as ref, count(*)::text as detail
from audit_log where event in ('release_payout', 'refund_payout', 'late_deposit_refunded')
group by order_id having count(*) > 1
union all
-- 2) صفقة اكتملت أو استُردّت بلا رقم دفعة من OxaPay
select 'NO_PAYOUT_ID', id::text, status from orders
where status in ('released', 'refunded') and payout_track_id is null
union all
-- 3) صفقة عالقة في الإرسال أكثر من 10 دقائق (انقطاع أثناء الدفع)
select 'STUCK_SETTLING', id::text, status || ' since ' || updated_at::text from orders
where status in ('releasing', 'refunding') and updated_at < now() - interval '10 minutes'
union all
-- 4) فشل دفع بنتيجة مجهولة: تحقق يدوياً في لوحة OxaPay قبل أي إعادة
select 'UNKNOWN_PAYOUT', id::text, payout_error from orders
where payout_error like 'UNKNOWN_RESULT%' and status in ('release_failed', 'refund_failed')
union all
-- 5) صفقة مموّلة أو بعدها بلا إيداع مسجّل
select 'FUNDED_NO_DEPOSIT', id::text, status from orders
where status in ('funded', 'paid', 'disputed', 'releasing', 'released') and deposit_track_id is null
union all
-- 6) إعلان رصيده المتاح سالب أو أكبر من الأصل
select 'BAD_OFFER_BALANCE', id::text, available_usdt::text from offers where available_usdt < 0
union all
-- 7) إيداع بمبلغ غير مطابق رُفض (للمراجعة)
select 'AMOUNT_MISMATCH', order_id::text, detail::text from audit_log where event = 'webhook_amount_mismatch'
union all
-- 8) تحرير بدون تمويل مسبق
select 'RELEASE_WITHOUT_FUNDING', o.id::text, o.status from orders o
where o.status in ('released', 'release_failed') and o.funded_at is null;

-- مطابقة OxaPay: هذه أرقام الدفعات التي يجب أن تجدها في لوحة OxaPay ← Payouts بنفس المبلغ
-- select id, status, amount_usdt, fee_usdt, payout_track_id, updated_at from orders where payout_track_id is not null order by updated_at desc;

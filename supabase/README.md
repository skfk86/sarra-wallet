# خادم سوق P2P (Supabase)

المشروع: `sarra-p2p` (osdojhpsfbcqguoctbpk) — منطقة eu-central-1، الخطة المجانية.

## الدوال
- `p2p` — كل إجراءات السوق. الهوية بتوقيع المحفظة (TRON signMessageV2) على كل طلب، مع منع إعادة الاستخدام.
- `oxapay-webhook` — تأكيد إيداع البائع. يتحقق من HMAC-SHA512، ثم يسأل OxaPay مباشرة عن الحالة.

## الأسرار المطلوبة (Supabase ← Edge Functions ← Secrets)
| الاسم | القيمة |
|---|---|
| `OXAPAY_MERCHANT_KEY` | مفتاح Merchant API من OxaPay |
| `OXAPAY_PAYOUT_KEY` | مفتاح Payout API من OxaPay |
| `ADMIN_ADDRESSES` | عنوان محفظتك TRON (المشرف على النزاعات)، ويمكن أكثر من عنوان بفواصل |
| `P2P_FEE_BPS` | اختياري، العمولة (50 = 0.5%) |
| `P2P_MIN_USDT` | اختياري، أقل مبلغ للصفقة (افتراضي 10) |

لا تضع هذه المفاتيح في الكود أو في أي محادثة.

## دورة الصفقة
`awaiting_deposit` (البائع يودع في عنوان OxaPay) ← `funded` (محجوز) ← `paid` (المشتري حوّل عبر بنكك)
← `releasing` ← `released` (OxaPay يرسل للمشتري ناقص العمولة)

الإلغاء والإرجاع: `cancelled` / `refunding` ← `refunded`. النزاع: `disputed` ← المشرف يحرّر أو يُرجع.
فشل الإرسال: `release_failed` / `refund_failed` ← يعيد المشرف المحاولة.

## الاختبار
- `node --experimental-strip-types test/p2p-logic.test.ts` — قواعد الحالات والعمولة.
- `test/p2p/` — موقّع TRON للاختبارات، ومولّد طلبات موقّعة للخادم الحقيقي.

# الإصدار الموقّع — صُرّة

## 1) أنشئ مفتاح التوقيع مرة واحدة (على جهازك Linux، وليس في أي محادثة)
```bash
keytool -genkeypair -v -keystore sarra-release.jks -alias sarra -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 sarra-release.jks > sarra-release.b64
```
احفظ `sarra-release.jks` وكلمتي السر في مكانين آمنين (مثلاً فلاشة + مدير كلمات مرور).
**إن ضاع هذا الملف لا يمكنك تحديث التطبيق على Google Play أبداً** (إلا عبر Play App Signing).

## 2) أسرار GitHub (Settings ← Secrets and variables ← Actions)
| الاسم | القيمة |
|---|---|
| ANDROID_KEYSTORE_B64 | محتوى sarra-release.b64 |
| ANDROID_KEYSTORE_PASSWORD | كلمة سر الملف |
| ANDROID_KEY_ALIAS | sarra |
| ANDROID_KEY_PASSWORD | كلمة سر المفتاح |
| SUPABASE_DB_URL | للنسخ الاحتياطي (Supabase ← Connect ← Session pooler) |
| BACKUP_PASSPHRASE | كلمة سر طويلة لتشفير النسخ الاحتياطية |

## 3) البناء
GitHub ← Actions ← "Release (signed AAB + APK)" ← Run workflow.
الناتج: `sarra-release.aab` (لـ Google Play) و`sarra-release.apk` (للتجربة). لا يُنشر شيء تلقائياً.

## 4) Google Play
- فعّل **Play App Signing** عند أول رفع (يحميك إن ضاع مفتاحك).
- رابط سياسة الخصوصية: فعّل GitHub Pages للمستودع (Settings ← Pages ← main ← /docs) فيصبح الرابط
  `https://skfk86.github.io/sarra-wallet/privacy.html`
- رابط حذف البيانات: نفس الصفحة (قسم "حذف بياناتك").
- App content ← Financial features ← Cryptocurrency wallet (غير احتجازية)، والتوزيع: السودان.

## 5) استعادة نسخة احتياطية
```bash
gpg --decrypt sarra-YYYYMMDD.sql.gz.gpg | gunzip > backup.sql   # ثم شغّله على مشروع Supabase جديد
```
ملاحظة: النسخة تشمل جداول قاعدة البيانات فقط. صور الإيصالات والهويات المعلّقة في Storage غير مشمولة.

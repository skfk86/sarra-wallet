# الإصدار الموقّع — صُرّة (مؤتمت، والمفتاح في الأسرار فقط)

## مرة واحدة فقط
1. أنشئ رمز وصول: GitHub ← صورتك ← Settings ← Developer settings ← Personal access tokens ← **Fine-grained tokens** ← Generate new token
   - Repository access: **Only select repositories** ← sarra-wallet
   - Permissions ← Repository permissions ← **Secrets: Read and write**
   - Generate، ثم انسخ الرمز (يظهر مرة واحدة)
2. المستودع ← Settings ← Secrets and variables ← Actions ← New repository secret:
   Name: `GH_PAT` ، Secret: الرمز الذي نسخته
3. المستودع ← Actions ← **Setup signing key (one time)** ← Run workflow
   يُنشئ المفتاح وكلمة سر عشوائية من 40 حرفاً، ويحفظهما في 4 أسرار (ANDROID_KEYSTORE_B64، ANDROID_KEYSTORE_PASSWORD، ANDROID_KEY_PASSWORD، ANDROID_KEY_ALIAS). لا يراها أحد.

## بعد ذلك تلقائياً
بعد كل بناء ناجح على main يعمل **Release (signed AAB + APK)** ويضع في Actions:
- `sarra-…-release.aab` ← لـ Google Play
- `sarra-…-release.apk` ← للتثبيت على الهاتف

## الحماية من ضياع المفتاح
المفتاح لا يُحفظ في أي ملف (المستودع عام). عند أول رفع على Google Play فعّل **Play App Signing**:
تحتفظ Google بمفتاح التطبيق النهائي، ويصبح مفتاحك "مفتاح رفع" فقط، يمكن استبداله عبر دعم Google Play إن ضاع.

## Google Play
- سياسة الخصوصية: `https://skfk86.github.io/sarra-wallet/privacy.html`
- App content ← Financial features ← Cryptocurrency wallet (غير احتجازية)، والتوزيع: السودان.

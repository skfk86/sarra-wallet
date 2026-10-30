# الإصدار الموقّع — صُرّة (مؤتمت بالكامل)

## المطلوب منك مرة واحدة فقط
GitHub ← المستودع ← Settings ← Secrets and variables ← Actions ← New repository secret:

| Name | Secret |
|---|---|
| SIGNING_PASSWORD | كلمة سر طويلة تخترعها (16 حرفاً على الأقل)، احفظها عندك ولا تغيّرها أبداً |

## ماذا يحدث تلقائياً
1. كل دفع إلى main ← "Build Android APK" يختبر ويبني نسخة التجربة.
2. إن نجح ← "Release (signed AAB + APK)" يعمل وحده:
   - أول مرة فقط: يُنشئ مفتاح التوقيع، ويحفظه في `signing/release.jks.gpg` مشفّراً بكلمة سرك، ويرفع نسخة منه باسم **SAVE-THIS-signing-key** (نزّلها واحفظها خارج GitHub).
   - كل مرة: يبني ويوقّع، والناتج في Actions باسم **sarra-release-x.y.z**:
     - `sarra-…-release.aab` ← لرفعه على Google Play
     - `sarra-…-release.apk` ← للتثبيت المباشر على الهاتف
3. لا يُنشر شيء على Google Play تلقائياً.

## مهم
- إن غيّرت SIGNING_PASSWORD أو حذفت `signing/release.jks.gpg` لن تستطيع تحديث التطبيق على Google Play. فعّل **Play App Signing** عند أول رفع ليحميك.
- المفتاح مشفّر مرتين (كلمة سر المفتاح + AES-256)، فوجوده في المستودع آمن ما دامت كلمة السر طويلة وسرية.

## Google Play
- سياسة الخصوصية: `https://skfk86.github.io/sarra-wallet/privacy.html` (بعد تفعيل GitHub Pages ← main ← /docs).
- App content ← Financial features ← Cryptocurrency wallet (غير احتجازية)، والتوزيع: السودان.

# اختبار الواجهة

يشغّل التطبيق في متصفح Chromium مع شبكة TRON وهمية، ويمرّ بكل التدفق:
إنشاء المحفظة، الرمز، الرصيد، الإرسال (مع منع الإرسال المزدوج)، السجل، الأمان، الحظر، نسيت الرمز، الاستيراد.

```bash
pip install playwright && playwright install chromium
bash test/ui/run.sh
```

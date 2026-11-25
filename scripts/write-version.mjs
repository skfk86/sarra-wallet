// يكتب docs/version.json (يُنشر على sarrapay.com) من package.json: آخر إصدار، وأقل إصدار آمن (minVersion، اختياري).
// التطبيق يقرأ هذا الملف لا GitHub (المستودع سيصبح خاصاً). اختبار test/version.test.mjs يفشل إن نُسي تحديثه.
import { readFileSync, writeFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const out = { latest: p.version, min: p.minVersion || '', url: 'https://sarrapay.com/' };
writeFileSync(new URL('../docs/version.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('docs/version.json ←', out);

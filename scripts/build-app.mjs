// يجمع وحدات الواجهة (src/app/*.js) بالترتيب في src/app.js داخل نطاق واحد مغلق.
// الوحدات تتشارك الحالة والدوال كما كانت في الملف الأصلي، دون تسريب أي اسم إلى window.
// يُشغَّل تلقائياً مع npm run vendor، وفي اختبارات الواجهة. لا تعدّل src/app.js يدوياً.
import fs from 'node:fs';
const dir = new URL('../src/app/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => /^\d\d-.+\.js$/.test(f)).sort();
if (!files.length) throw new Error('no app modules');
let out = '// ملف مولَّد من src/app/*.js عبر scripts/build-app.mjs — لا تعدّله يدوياً\n(function () {\n  \'use strict\';\n';
for (const f of files) out += '\n  // ─── ' + f + ' ───\n' + fs.readFileSync(new URL(f, dir), 'utf8');
out += '})();\n';
fs.writeFileSync(new URL('../src/app.js', import.meta.url), out);
if (process.argv.includes('--check')) new Function(out); // خطأ صياغة = فشل
console.log('app.js ←', files.length, 'وحدات');

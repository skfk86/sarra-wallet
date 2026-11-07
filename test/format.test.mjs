// اختبار عرض الأرقام (niceNum وfmtExact من src/logic/format.js): لا أصفار طويلة، ولا تقريب يخفي مبلغاً صغيراً
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { niceNum, fmtExact } = createRequire(import.meta.url)('../src/logic/format.js');
const cases = [
  [0.00000000000495, undefined, '0.0₁₁495'], [0.00012345, 6, '0.0001235'], [0.5, 6, '0.5'],
  [1234.5678, 6, '1,234.57'], [12.345678, 6, '12.3457'], [0, 6, '0'], [25.5, 2, '25.5'],
  [0.000000004, 6, '0.0₈4'], [-0.00000123, 6, '−0.0₅123'], [151, 2, '151'], ['1,000.5', 2, '1,000.5']
];
for (const [v, d, exp] of cases) assert.equal(niceNum(v, d), exp, `niceNum(${v}, ${d})`);
for (const [v, exp] of [['0.00000000000495', '0.0₁₁495'], ['12.50', '12.5'], ['12.00', '12'], ['1000000.25', '1,000,000.25'], ['0.5', '0.5'], ['7', '7'], ['0.000312456789012345', '0.000312456'], ['1.123456789', '1.123456'], ['0.19999999', '0.199999']]) assert.equal(fmtExact(v), exp, `fmtExact(${v})`);
console.log(`${cases.length + 6} اختبارات عرض الأرقام نجحت`);
{
  const { cmpVersion } = createRequire(import.meta.url)('../src/logic/format.js');
  assert.equal(cmpVersion('v1.0.10', '1.0.9'), 1); assert.equal(cmpVersion('1.0.0', '1.0.0'), 0); assert.equal(cmpVersion('1.2.0', 'v1.10.0'), -1);
  assert.equal(cmpVersion('', '1.0.0'), 0); assert.equal(cmpVersion('latest', '1.0.0'), 0);
  console.log('✓ مقارنة الإصدارات (تنبيه التحديث)');
}

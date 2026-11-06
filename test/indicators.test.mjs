// اختبار المؤشرات الفنية (src/logic/indicators.js) على سلاسل معروفة النتائج
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../src/logic/indicators.js');
const near = (a, b, e = 1e-9, m = '') => assert.ok(Math.abs(a - b) < e, m + ': ' + a + ' ≠ ' + b);
let n = 0; const ok = (m) => { n++; console.log('✓', m); };

assert.deepEqual(L.sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]); ok('SMA');
const e = L.ema([1, 2, 3, 4], 2); assert.equal(e[0], null); near(e[1], 1 + (2 - 1) * 2 / 3, 1e-12, 'EMA'); ok('EMA');
assert.equal(L.rsi(Array.from({ length: 30 }, (_, i) => i)), 100); ok('RSI = 100 لسلسلة صاعدة فقط');
near(L.rsi(Array.from({ length: 30 }, (_, i) => 30 - i)), 0, 1e-9, 'RSI'); ok('RSI = 0 لسلسلة هابطة فقط');
assert.equal(L.rsi([1, 2, 3]), null); ok('RSI بلا بيانات كافية = null');

// شموع صناعية: صعود منتظم ثم تذبذب
const kl = Array.from({ length: 200 }, (_, i) => { const c = 100 + i * 0.5 + Math.sin(i / 3) * 2; return { t: i, o: c - 0.3, h: c + 1, l: c - 1, c, v: 10 + (i % 7) }; });
const A = L.analyze(kl, null);
assert.ok(A.score >= -10 && A.score <= 10, 'الدرجة ضمن المدى'); ok('درجة التحليل بين −10 و+10');
assert.equal(A.trend, 'صاعد'); ok('اتجاه صاعد لسلسلة صاعدة');
assert.ok(A.sup < A.p && A.res > A.p * 0.99, 'الدعم تحت السعر'); ok('الدعم تحت السعر');
assert.ok(A.adx > 20, 'ADX'); ok('ADX يرصد اتجاهاً قوياً');
const bt = L.backtest(A.I, 10, 4); assert.ok(bt.buy.w <= bt.buy.n && bt.sell.w <= bt.sell.n); ok('الاختبار التاريخي متّسق');
const flat = Array.from({ length: 120 }, (_, i) => ({ t: i, o: 50, h: 50, l: 50, c: 50, v: 1 }));
assert.doesNotThrow(() => L.analyze(flat, null)); ok('سعر ثابت لا يكسر التحليل');
console.log(n + ' اختبارات المؤشرات نجحت');

// اختبار دمج الخزنة وحساب الربح/الخسارة بمتوسط التكلفة (src/logic/records.js)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../src/logic/records.js');
let n = 0; const ok = (m) => { n++; console.log('✓', m); };
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, m + ': ' + a + ' ≠ ' + b);

const t = [
  { sym: 'BTC', side: 'buy', qty: '0.001', usdt: '60', time: 1 },
  { sym: 'BTC', side: 'buy', qty: '0.001', usdt: '80', time: 2 },
  { sym: 'BTC', side: 'sell', qty: '0.001', usdt: '90', time: 3 },
  { sym: 'BTC', side: 'buy', qty: '5', usdt: '1', time: 4, status: 'FAILED' },
  { sym: 'ETH', side: 'buy', qty: '1', usdt: '3000', time: 5 }
];
const p = L.position(t, 'BTC');
near(p.qty, 0.001, 'الكمية'); near(p.cost, 70, 'التكلفة المتبقية'); near(p.avg, 70000, 'المتوسط'); near(p.real, 20, 'الربح المحقق'); assert.equal(p.n, 3);
ok('متوسط التكلفة: شراء 60 و80 ثم بيع بـ90 = ربح محقق 20');
ok('الصفقة الفاشلة لا تُحتسب، وعملة أخرى لا تختلط');
assert.equal(L.position([], 'BTC').avg, null); ok('بلا صفقات: لا متوسط');
const over = L.position([{ sym: 'X', side: 'buy', qty: 1, usdt: 10, time: 1 }, { sym: 'X', side: 'sell', qty: 2, usdt: 30, time: 2 }], 'X');
near(over.qty, 0, 'بيع أكثر من المملوك'); near(over.real, 5, 'ربح الجزء المملوك فقط'); ok('بيع كمية أكبر من المسجّلة يحسب ربح المملوك فقط');
assert.equal(L.position([{ sym: 'X', side: 'buy', qty: 'abc', usdt: 1, time: 1 }], 'X').n, 0); ok('بيانات تالفة تُتجاهل');

const a = [{ id: 'x', status: 'PENDING', time: 5 }, { id: 'y', status: 'OK', time: 1 }];
const b = [{ id: 'x', status: 'OK', time: 4 }, { id: 'z', time: 9 }, null, { time: 3 }];
const m = L.mergeRecords(a, b, 10);
assert.deepEqual(m.map((r) => r.id), ['z', 'x', 'y']); assert.equal(m[1].status, 'OK');
ok('الدمج: الحالة النهائية تغلب «قيد التنفيذ»، والترتيب من الأحدث');
assert.equal(L.mergeRecords(a, b, 2).length, 2); ok('الدمج يحترم الحد الأقصى');
console.log(n + ' اختبارات السجلات والربح/الخسارة نجحت');

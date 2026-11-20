// منطق ماسح إشعارات Firebase (بلا شبكة)
import assert from 'node:assert/strict';
import * as L from '../supabase/functions/push-watch/logic.ts';
let pass = 0; const t = (n: string, f: () => void) => { f(); pass++; console.log('✓', n); };

t('تحويل عنوان TRON إلى hex (عقد USDT المعروف)', () => {
  assert.equal(L.tronToHex20('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'), 'a614f803b6fd780986a42c78ec9c7f77e6ded13c');
  assert.equal(L.tronToHex20('0xabc'), null); assert.equal(L.tronToHex20('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6'), null);
});
t('تنسيق المبالغ', () => {
  assert.equal(L.fmtUnits(25500000n, 6), '25.5'); assert.equal(L.fmtUnits(1234567891234n, 6), '1,234,567.891234');
  assert.equal(L.fmtUnits(10n ** 18n * 3n / 2n, 18), '1.5');
});
const ME = 'a614f803b6fd780986a42c78ec9c7f77e6ded13c'.replace(/a6/, 'b7'), OTHER = '1'.repeat(40);
const TOK = [{ sym: 'USDT', addr: '0x55d398326f99059fF775485246999027B3197955', dec: 18 }];
const log = (from: string, to: string, v: bigint, i = 0, addr = TOK[0].addr) => ({ address: addr.toLowerCase(), topics: [L.TRANSFER, L.topicOf(from), L.topicOf(to)], data: '0x' + v.toString(16), transactionHash: '0x' + 'ab'.repeat(32), logIndex: '0x' + i.toString(16) });
const min = () => 10n ** 17n; // 0.1 USDT
t('استلام وإرسال لعناويننا فقط، وتجاهل الغبار وعقود أخرى والتكرار', () => {
  const ev = L.eventsFromLogs('bsc', [
    log(OTHER, ME, 25n * 10n ** 18n, 0),
    log(ME, OTHER, 3n * 10n ** 18n, 1),
    log(OTHER, ME, 1n, 2),                         // غبار
    log(OTHER, ME, 9n * 10n ** 18n, 3, '0x' + '9'.repeat(40)), // عقد غير معروف
    log(OTHER, ME, 25n * 10n ** 18n, 0),           // نفس السجل مكرر من الاستعلامين
    log(OTHER, OTHER, 5n * 10n ** 18n, 4)          // لا يخصّنا
  ], TOK, new Set([ME]), min);
  assert.deepEqual(ev.map((e) => e.kind + ':' + e.amount), ['in:25', 'out:3']);
  assert.equal(L.message(ev[0]).body, 'استلمت +25 USDT على BNB Chain (BEP20)');
});
t('عقد TRON بصيغة 0x41 يُطابق', () => {
  const ev = L.eventsFromLogs('tron', [{ ...log(OTHER, ME, 7000000n), address: '0x41a614f803b6fd780986a42c78ec9c7f77e6ded13c' }], [{ sym: 'USDT', addr: '0xa614f803b6fd780986a42c78ec9c7f77e6ded13c', dec: 6 }], new Set([ME]), () => 100000n);
  assert.equal(ev.length, 1); assert.equal(ev[0].amount, '7');
});
t('نطاق الكتل: لحاق تدريجي، وقفز بعد انقطاع طويل', () => {
  assert.deepEqual(L.blockRange(null, 1000, 80, 800), [1000, 1000]);
  assert.deepEqual(L.blockRange(900, 1000, 80, 800), [901, 980]);
  assert.deepEqual(L.blockRange(990, 1000, 80, 800), [991, 1000]);
  assert.equal(L.blockRange(1000, 1000, 80, 800), null);
  assert.deepEqual(L.blockRange(100, 1000, 80, 800), [1000, 1000]);
});
t('إشعارات P2P: كل حالة تُبلغ الطرف المعني فقط', () => {
  const o = { id: 'o1', buyer: 'TB', seller: 'TS', amount_usdt: 50, total_sdg: 135000, status: '' };
  const to = (st: string) => L.p2pStatusPushes({ ...o, status: st }, ['TA']).map((p) => p.to).join(',');
  assert.equal(to('awaiting_deposit'), 'TS'); assert.equal(to('funded'), 'TB'); assert.equal(to('paid'), 'TS');
  assert.equal(to('disputed'), 'TB,TS,TA'); assert.equal(to('released'), 'TB,TS'); assert.equal(to('refunded'), 'TS');
  assert.equal(to('release_failed'), 'TA'); assert.equal(to('releasing'), '');
  assert.match(L.p2pStatusPushes({ ...o, status: 'paid' }, [])[0].body, /135,000/);
});
t('إشعارات رسائل P2P: لا تصل للمرسل، وتُجمع رسائل الطلب الواحد', () => {
  const o = { id: 'o1', buyer: 'TB', seller: 'TS', amount_usdt: 50, total_sdg: 1, status: 'funded' };
  const ps = L.p2pMessagePushes([{ order_id: 'o1', sender: 'TS', body: 'أ' }, { order_id: 'o1', sender: 'TS', body: 'ب' }, { order_id: 'zz', sender: 'TS', body: 'x' }], { o1: o });
  assert.equal(ps.length, 1); assert.equal(ps[0].to, 'TB'); assert.match(ps[0].body, /^2 رسائل جديدة. آخرها: ب/); assert.equal(ps[0].title, 'رسالة من البائع');
  const adm = L.p2pMessagePushes([{ order_id: 'o1', sender: 'TA', body: 'قرار' }], { o1: o });
  assert.deepEqual(adm.map((p) => p.to), ['TB', 'TS']); assert.equal(adm[0].title, 'رسالة من المشرف');
});
console.log(`\n${pass} اختبارات ماسح الإشعارات نجحت`);

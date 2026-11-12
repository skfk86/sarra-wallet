// منطق بوابة الدفع للتجار (بلا شبكة)
import assert from 'node:assert/strict';
import * as P from '../supabase/functions/_shared/pay.ts';
import { TRANSFER, topicOf } from '../supabase/functions/push-watch/logic.ts';
let pass = 0; const t = async (n: string, f: () => void | Promise<void>) => { await f(); pass++; console.log('✓', n); };
const bad = (f: () => unknown, code: string) => assert.throws(f, (e: Error) => e.message === code);

await t('المبالغ: حتى خانتين عشريتين، بين 1 و100,000 USDT', () => {
  assert.equal(P.parseAmount('12.5'), 12_500_000n); assert.equal(P.parseAmount(10), 10_000_000n); assert.equal(P.parseAmount('1'), 1_000_000n);
  for (const v of ['12.345', '-5', 'abc', '', '1e3', '0x10', ' ', null, undefined, {}, '12.']) bad(() => P.parseAmount(v), 'BAD_AMOUNT');
  bad(() => P.parseAmount('0.99'), 'AMOUNT_TOO_SMALL'); bad(() => P.parseAmount('100000.01'), 'AMOUNT_TOO_LARGE');
  assert.equal(P.fmtUnits(12_500_000n), '12.5'); assert.equal(P.fmtUnits('10004321'), '10.004321'); assert.equal(P.fmtUnits(1_000_000), '1');
});
await t('المبلغ الفريد: يزيد أقل من سنت واحد، ولا يساوي المبلغ الأصلي أبداً', () => {
  assert.equal(P.exactUnits(10_000_000n, 4321), 10_004_321n);
  bad(() => P.exactUnits(10_000_000n, 0), 'BAD_TAIL'); bad(() => P.exactUnits(10_000_000n, 10000), 'BAD_TAIL');
  for (let i = 0; i < 500; i++) { const x = P.randTail(); assert.ok(x >= 1 && x <= P.TAIL_MAX); }
});
await t('العمولة: 0.5% بحد أدنى', () => {
  assert.equal(P.feeUnits(100_000_000n, 50, 20_000n), 500_000n); assert.equal(P.feeUnits(1_000_000n, 50, 20_000n), 20_000n);
});
await t('خانات الشبكة: BNB Chain (18 خانة) تُحوَّل إلى 6، والكسور الأدق لا تطابق شيئاً', () => {
  assert.equal(P.rawToUnits(10_004_321n * 10n ** 12n, 18), 10_004_321n); assert.equal(P.rawToUnits(10_004_321n * 10n ** 12n + 1n, 18), null); assert.equal(P.rawToUnits(5n, 6), 5n);
});
const T_ADDR = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', T_HEX = 'a614f803b6fd780986a42c78ec9c7f77e6ded13c', E = '0x' + 'Ab'.repeat(20), E_HEX = 'ab'.repeat(20);
await t('مفتاح المطابقة: عنوان الشبكة الخاطئة مرفوض', () => {
  assert.equal(P.matchHex('tron', T_ADDR), T_HEX); assert.equal(P.matchHex('bsc', E), E_HEX);
  assert.equal(P.matchHex('tron', E), null); assert.equal(P.matchHex('bsc', T_ADDR), null); assert.equal(P.matchHex('solana', E), null); assert.equal(P.matchHex('bsc', ''), null);
});
const log = (net: string, to: string, units: bigint, o: Record<string, unknown> = {}) => ({ address: P.NETS[net].token, topics: [TRANSFER, topicOf('11'.repeat(20)), topicOf(to)],
  data: '0x' + (units * 10n ** BigInt(P.NETS[net].dec - 6)).toString(16), transactionHash: '0xt' + units, logIndex: '0x1', ...o });
await t('المطابقة: المبلغ الفريد على العنوان الصحيح يسدد فاتورته فقط', () => {
  const pend = [{ id: 'a', match_hex: E_HEX, exact: '10004321' }, { id: 'b', match_hex: E_HEX, exact: '10001111' }, { id: 'c', match_hex: 'cd'.repeat(20), exact: '10004321' }];
  const hits = P.matchLogs('bsc', [log('bsc', E_HEX, 10_004_321n)], pend);
  assert.deepEqual(hits.map((h) => h.id), ['a']); assert.equal(hits[0].from, '11'.repeat(20)); assert.equal(hits[0].key, '0xt10004321:0x1');
});
await t('المطابقة: مبلغ ناقص أو زائد أو المبلغ الأصلي بلا كسر لا يسدد', () => {
  const pend = [{ id: 'a', match_hex: E_HEX, exact: '10004321' }];
  for (const u of [10_000_000n, 10_004_320n, 10_004_322n, 20_008_642n]) assert.equal(P.matchLogs('bsc', [log('bsc', E_HEX, u)], pend).length, 0);
});
await t('المطابقة: توكن مزيّف، سجل محذوف، أو شبكة أخرى لا تُحتسب', () => {
  const pend = [{ id: 'a', match_hex: E_HEX, exact: '10004321' }];
  assert.equal(P.matchLogs('bsc', [log('bsc', E_HEX, 10_004_321n, { address: '0x' + '99'.repeat(20) })], pend).length, 0);
  assert.equal(P.matchLogs('bsc', [log('bsc', E_HEX, 10_004_321n, { removed: true })], pend).length, 0);
  assert.equal(P.matchLogs('polygon', [log('bsc', E_HEX, 10_004_321n)], pend).length, 0);
  assert.equal(P.matchLogs('bsc', [null, {}, { topics: [TRANSFER] }, log('bsc', E_HEX, 10_004_321n, { data: 'zz' })], pend).length, 0);
});
await t('المطابقة: تحويلان بالمبلغ نفسه يسددان الفاتورة مرة واحدة', () => {
  const pend = [{ id: 'a', match_hex: E_HEX, exact: '10004321' }];
  const hits = P.matchLogs('bsc', [log('bsc', E_HEX, 10_004_321n), log('bsc', E_HEX, 10_004_321n, { transactionHash: '0xother' })], pend);
  assert.equal(hits.length, 1);
});
await t('المطابقة على TRON: عنوان العقد بصيغة 0x41… يُوحَّد', () => {
  const pend = [{ id: 't', match_hex: T_HEX, exact: '5000123' }];
  assert.equal(P.matchLogs('tron', [log('tron', T_HEX, 5_000_123n, { address: '0x41' + P.NETS.tron.token.slice(2) })], pend).length, 1);
});
await t('رابط الإشعار: https عام فقط (لا عناوين داخلية ولا IP)', () => {
  assert.equal(P.safeWebhookUrl('https://shop.example.com/hook'), 'https://shop.example.com/hook');
  for (const u of ['http://shop.example.com/h', 'https://localhost/h', 'https://127.0.0.1/h', 'https://10.0.0.5/h', 'https://[::1]/h', 'https://db.internal/h', 'https://printer.local/h',
    'https://user:pw@shop.example.com/', 'https://shop.example.com:8443/h', 'ftp://x.com', 'javascript:alert(1)', 'https://intranet/h', '', null, 'x'.repeat(400)]) assert.equal(P.safeWebhookUrl(u), null, String(u));
});
await t('توقيع الإشعار: HMAC-SHA256 معروف النتيجة', async () => {
  // متجه اختبار RFC 4231 (الحالة 2)
  assert.equal(await P.hmacHex('Jefe', 'what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  const s = await P.signWebhook('whsec_x', '{"a":1}', 1700000000);
  assert.match(s, /^t=1700000000,v1=[0-9a-f]{64}$/); assert.equal(s.slice(16), await P.hmacHex('whsec_x', '1700000000.{"a":1}'));
});
await t('إعادة محاولة الإشعار: 6 مرات بمهل متزايدة ثم تتوقف', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(P.hookBackoffMin), [1, 5, 15, 60, 180, 720, null]);
});
await t('المفاتيح والمعرّفات: عشوائية وبالصيغة الموثّقة، والمفتاح يُحفظ كبصمة', async () => {
  assert.match(P.newApiKey(), /^sk_live_[0-9a-f]{48}$/); assert.match(P.newInvoiceId(), /^inv_[0-9a-f]{20}$/); assert.notEqual(P.newApiKey(), P.newApiKey());
  assert.equal(await P.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
await t('عرض الفاتورة: منتهية بعد وقتها، وصفحة العميل لا تكشف العمولة ولا رقم الطلب', () => {
  const r = { id: 'inv_' + '0'.repeat(20), kind: 'payment', network: 'bsc', address: E, amount: '10000000', exact: '10004321', fee: '50000', order_id: 'A-7', description: 'x', status: 'pending', tx: null, paid_at: null,
    expires_at: '2026-01-01T00:30:00Z', created_at: '2026-01-01T00:00:00Z' };
  const v = P.invoiceView(r, 'https://p/pay.html', Date.parse('2026-01-01T00:10:00Z'));
  assert.equal(v.status, 'pending'); assert.equal(v.amount, '10'); assert.equal(v.pay_amount, '10.004321'); assert.equal(v.fee, '0.05'); assert.equal(v.pay_url, 'https://p/pay.html?i=' + r.id);
  assert.equal(P.invoiceView(r, 'x', Date.parse('2026-01-01T00:31:00Z')).status, 'expired');
  const pub = P.invoiceView(r, 'x', 0, false); assert.ok(!('fee' in pub) && !('order_id' in pub));
});
console.log(pass + ' اختبارات بوابة الدفع نجحت');

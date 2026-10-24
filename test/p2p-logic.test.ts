// اختبار منطق P2P: node --experimental-strip-types test/p2p-logic.test.ts
import assert from 'node:assert/strict';
import * as L from '../supabase/functions/_shared/logic.ts';

let pass = 0;
const t = (name: string, fn: () => void) => { fn(); pass++; console.log('✓', name); };
const S = 'TSe' + 'A'.repeat(31), B = 'TBu' + 'A'.repeat(31), ADM = 'TAd' + 'A'.repeat(31), X = 'TSt' + 'A'.repeat(31);
const now = Date.parse('2026-10-24T10:00:00Z');
const o = (status: string, extra: Partial<L.Order> = {}): L.Order => ({ id: '1', seller: S, buyer: B, status, amount_usdt: '100', ...extra });

t('حساب العمولة بدقة', () => {
  assert.equal(L.feeFor('100', 50), '0.5');
  assert.equal(L.feeFor('33.333333', 50), '0.166666');
  assert.equal(L.buyerReceives('100', '0.5'), '99.5');
  assert.throws(() => L.buyerReceives('1', '1'), /FEE_TOO_HIGH/);
  assert.throws(() => L.toMicro('1.1234567'), /BAD_AMOUNT/);
  assert.throws(() => L.toMicro('-1'), /BAD_AMOUNT/);
});

t('التحقق من الطلب الموقّع', () => {
  const m = (x: object) => JSON.stringify({ action: 'a', params: {}, address: S, ts: now, nonce: 'ab12ab12ab12ab12', ...x });
  assert.equal(L.parseSignedMessage(m({}), now).address, S);
  assert.throws(() => L.parseSignedMessage(m({ ts: now - 600000 }), now), /EXPIRED_REQUEST/);
  assert.throws(() => L.parseSignedMessage(m({ nonce: 'x' }), now), /BAD_NONCE/);
  assert.throws(() => L.parseSignedMessage(m({ address: 'bad' }), now), /BAD_ADDRESS/);
  assert.throws(() => L.parseSignedMessage('{', now), /BAD_MESSAGE/);
});

t('المشتري: يدفع بعد الحجز فقط، ويلغي قبل الدفع', () => {
  assert.equal(L.transitionFor(o('funded'), 'buyer', 'mark_paid', now).to, 'paid');
  assert.throws(() => L.transitionFor(o('awaiting_deposit'), 'buyer', 'mark_paid', now), /INVALID_STATE/);
  assert.equal(L.transitionFor(o('awaiting_deposit'), 'buyer', 'cancel', now).to, 'cancelled');
  const c = L.transitionFor(o('funded'), 'buyer', 'cancel', now);
  assert.equal(c.to, 'refunding'); assert.equal(c.refund, true);
  assert.throws(() => L.transitionFor(o('paid'), 'buyer', 'cancel', now), /INVALID_STATE/);
});

t('المشتري لا يستطيع تحرير العملة لنفسه', () => {
  assert.throws(() => L.transitionFor(o('paid'), 'buyer', 'release', now), /NOT_ALLOWED/);
  assert.throws(() => L.transitionFor(o('disputed'), 'buyer', 'admin_release', now), /NOT_ALLOWED/);
});

t('البائع: يحرّر بعد الحجز، ولا يسترد قبل انتهاء المهلة', () => {
  const r = L.transitionFor(o('paid'), 'seller', 'release', now);
  assert.equal(r.to, 'releasing'); assert.equal(r.release, true);
  assert.throws(() => L.transitionFor(o('funded', { pay_deadline: '2026-10-24T10:10:00Z' }), 'seller', 'cancel', now), /PAY_WINDOW_OPEN/);
  assert.equal(L.transitionFor(o('funded', { pay_deadline: '2026-10-24T09:50:00Z' }), 'seller', 'cancel', now).to, 'refunding');
  assert.throws(() => L.transitionFor(o('paid', { pay_deadline: '2026-10-24T09:50:00Z' }), 'seller', 'cancel', now), /PAY_WINDOW_OPEN|INVALID_STATE/);
});

t('لا تحرير مزدوج: الحالات النهائية مغلقة', () => {
  for (const st of ['released', 'releasing', 'refunded', 'refunding', 'cancelled'])
    for (const [r, a] of [['seller', 'release'], ['admin', 'admin_release'], ['admin', 'admin_refund'], ['buyer', 'mark_paid']])
      assert.throws(() => L.transitionFor(o(st), r, a, now));
});

t('النزاع: بعد الدفع فقط، والمشرف يحكم', () => {
  assert.equal(L.transitionFor(o('paid'), 'buyer', 'dispute', now).to, 'disputed');
  assert.equal(L.transitionFor(o('paid'), 'seller', 'dispute', now).to, 'disputed');
  assert.throws(() => L.transitionFor(o('funded'), 'buyer', 'dispute', now), /INVALID_STATE/);
  assert.equal(L.transitionFor(o('disputed'), 'admin', 'admin_release', now).to, 'releasing');
  assert.equal(L.transitionFor(o('disputed'), 'admin', 'admin_refund', now).to, 'refunding');
  assert.equal(L.transitionFor(o('release_failed'), 'admin', 'admin_release', now).to, 'releasing');
});

t('الأدوار وتفاصيل بنكك', () => {
  assert.equal(L.roleOf(o('paid'), B, [ADM]), 'buyer');
  assert.equal(L.roleOf(o('paid'), ADM, [ADM]), 'admin');
  assert.equal(L.roleOf(o('paid'), X, [ADM]), null);
  assert.equal(L.canSeeBankDetails(o('awaiting_deposit'), B, []), false);
  assert.equal(L.canSeeBankDetails(o('funded'), B, []), true);
  assert.equal(L.canSeeBankDetails(o('funded'), X, []), false);
});

t('حالة دفع OxaPay', () => {
  assert.equal(L.isPaidStatus('Paid'), true);
  assert.equal(L.isPaidStatus('paid'), true);
  assert.equal(L.isPaidStatus('Confirming'), false);
  assert.equal(L.isPaidStatus(undefined), false);
});

t('التحقق من الإعلان', () => {
  const ok = { price_sdg: 2700, min_usdt: 10, max_usdt: 500, amount_usdt: 300, bankak_name: 'محمد أحمد', bankak_account: '1234 5678', pay_window_min: 30 };
  const v = L.validateOffer(ok, 10);
  assert.equal(v.bankak_account, '12345678'); assert.equal(v.available_usdt, '300');
  assert.throws(() => L.validateOffer({ ...ok, min_usdt: 5 }, 10), /MIN_TOO_LOW/);
  assert.throws(() => L.validateOffer({ ...ok, max_usdt: 5, min_usdt: 10 }, 10), /MAX_LT_MIN/);
  assert.throws(() => L.validateOffer({ ...ok, bankak_account: 'abc' }, 10), /BAD_BANKAK_ACCOUNT/);
  assert.throws(() => L.validateOffer({ ...ok, pay_window_min: 45 }, 10), /BAD_WINDOW/);
});

t('سعر الصرف والهامش', () => {
  const r = { sdg_per_usdt: 2700, band_pct: 3 };
  assert.deepEqual(L.priceRange(r), { min: 2619, max: 2781 });
  L.checkPrice(2700, r); L.checkPrice(2619, r); L.checkPrice(2781, r);
  assert.throws(() => L.checkPrice(2800, r), /PRICE_OUT_OF_RANGE/);
  assert.throws(() => L.checkPrice(2500, r), /PRICE_OUT_OF_RANGE/);
  assert.throws(() => L.checkPrice(2700, { sdg_per_usdt: null, band_pct: 3 }), /RATE_NOT_SET/);
  assert.deepEqual(L.validateRateSetting({ sdg_per_usdt: '2650.555', band_pct: 5 }), { sdg_per_usdt: 2650.56, band_pct: 5 });
  assert.throws(() => L.validateRateSetting({ sdg_per_usdt: 0, band_pct: 5 }), /BAD_RATE/);
  assert.throws(() => L.validateRateSetting({ sdg_per_usdt: 2700, band_pct: 7 }), /BAD_BAND/);
});

t('الاسم التلقائي والحدود', () => {
  assert.equal(L.defaultNickname('TQ7mZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'), 'مستخدم-9xKf');
  for (const [k, [n, w]] of Object.entries(L.LIMITS)) assert.ok(n > 0 && w > 0, k);
  assert.equal(L.MAX_ACTIVE_OFFERS, 3);
});

t('التوثيق', () => {
  const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(30000);
  const ok = { full_name: '  محمد  أحمد علي ', phone: '+249 912 345 678', bankak_account: '1234 5678', id_image: IMG };
  const v = L.validateKyc(ok);
  assert.equal(v.full_name, 'محمد أحمد علي'); assert.equal(v.phone, '0912345678'); assert.equal(v.bankak_account, '12345678');
  assert.throws(() => L.validateKyc({ ...ok, full_name: 'محمد' }), /BAD_FULL_NAME/);
  assert.throws(() => L.validateKyc({ ...ok, phone: '12345' }), /BAD_PHONE/);
  assert.throws(() => L.validateKyc({ ...ok, id_image: 'data:image/png;base64,AAAA' }), /BAD_ID_IMAGE/);
  assert.throws(() => L.validateKyc({ ...ok, id_image: 'data:image/jpeg;base64,' + 'A'.repeat(100) }), /BAD_ID_IMAGE/);
  assert.throws(() => L.validateKyc({ ...ok, id_image: 'data:image/jpeg;base64,' + 'A'.repeat(900000) }), /BAD_ID_IMAGE/);
  assert.equal(L.maskAccount('12345678'), '••••5678');
});

t('رصيد البائع على الشبكة', () => {
  L.checkSellerFunds(150000000n, 20000000n, '150');
  assert.throws(() => L.checkSellerFunds(149999999n, 20000000n, '150'), /INSUFFICIENT_SELLER_USDT/);
  assert.throws(() => L.checkSellerFunds(150000000n, 14999999n, '150'), /SELLER_NEEDS_TRX/);
});

t('نسبة الإتمام', () => {
  assert.equal(L.completionRate(0, 0), null);
  assert.equal(L.completionRate(9, 1), 90);
  assert.equal(L.completionRate(2, 1), 66.7);
});

t('إعلانات الشراء', () => {
  assert.deepEqual(L.orderParties({ seller: 'A', side: 'sell' }, 'B'), { seller: 'A', buyer: 'B' });
  assert.deepEqual(L.orderParties({ seller: 'A', side: 'buy' }, 'B'), { seller: 'B', buyer: 'A' });
  const base = { price_sdg: 2700, min_usdt: 10, max_usdt: 50, amount_usdt: 50, bankak_name: 'x y', bankak_account: '1234' };
  assert.equal(L.validateOffer({ ...base, side: 'buy' }, 10).side, 'buy');
  assert.equal(L.validateOffer({ ...base, side: 'hack' }, 10).side, 'sell');
});

t('رسوم الشبكة: لا خسارة على المنصة', () => {
  assert.equal(L.tradeFee('100', 50, '1'), '1.5');
  assert.equal(L.buyerReceives('100', L.tradeFee('100', 50, '1')), '98.5');
  assert.equal(L.tradeFee('10', 50, '1'), '1.05');
  assert.equal(L.refundAmount('100', '1'), '99');
  assert.throws(() => L.refundAmount('1', '1'), /FEE_TOO_HIGH/);
  // ربح المنصة بعد دفع رسوم الإرسال = العمولة دائماً (لا يصبح سالباً)
  for (const a of ['10', '50', '100', '1000']) assert.equal(L.toMicro(L.tradeFee(a, 50, '1')) - L.toMicro('1'), L.toMicro(L.feeFor(a, 50)));
});

console.log(`\n${pass} اختبارات P2P نجحت`);

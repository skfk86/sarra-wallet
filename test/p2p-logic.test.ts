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

console.log(`\n${pass} اختبارات P2P نجحت`);

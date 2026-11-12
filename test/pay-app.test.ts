// اختبار تكاملي لخادم بوابة الدفع: الدالة الحقيقية (supabase/functions/pay/app.ts) فوق قاعدة بيانات وهمية في الذاكرة
// تحاكي قيود الترحيل 020 (الفهارس الفريدة والتسديد الذرّي pay_settle)، وشبكة وهمية للسجلات والإشعارات.
import assert from 'node:assert/strict';
import { createApp } from '../supabase/functions/pay/app.ts';
import * as P from '../supabase/functions/_shared/pay.ts';
import { TRANSFER, topicOf } from '../supabase/functions/push-watch/logic.ts';

type Row = Record<string, any>;
function fakeDb() {
  const T: Record<string, Row[]> = { pay_merchants: [], pay_invoices: [], push_state: [], push_cfg: [{ k: 'cron_secret', v: 'CRON' }], used_nonces: [] };
  const hits: Record<string, number> = {}; let hitLimit = Infinity;
  const DEF: Record<string, () => Row> = {
    pay_merchants: () => ({ id: 'm' + (T.pay_merchants.length + 1), key_hash: null, key_hint: null, webhook_url: null, credit: 1000000, active: true, tron_addr: null, evm_addr: null }),
    pay_invoices: () => ({ kind: 'payment', fee: 0, order_id: null, description: null, status: 'pending', tx: null, tx_key: null, payer: null, paid_at: null, hook_state: 'none', hook_attempts: 0, hook_next: null, created_at: new Date(clock.t).toISOString() })
  };
  // قيود التفرّد كما في 020_pay.sql
  const violates = (t: string, rows: Row[], r: Row) => {
    const others = rows.filter((x) => x !== r);
    if (t === 'pay_invoices') return others.some((x) => x.id === r.id
      || (r.status === 'pending' && x.status === 'pending' && x.network === r.network && x.match_hex === r.match_hex && String(x.exact) === String(r.exact))
      || (r.order_id != null && r.status !== 'expired' && x.status !== 'expired' && x.merchant_id === r.merchant_id && x.order_id === r.order_id)
      || (r.tx_key != null && x.network === r.network && x.tx_key === r.tx_key));
    if (t === 'pay_merchants') return others.some((x) => x.address === r.address || (r.key_hash && x.key_hash === r.key_hash));
    if (t === 'used_nonces') return others.some((x) => x.nonce === r.nonce);
    return false;
  };
  class Q {
    f: ((r: Row) => boolean)[] = []; op = 'select'; val: any; cols = '*'; opts: any = {}; ord: [string, boolean] | null = null; lim = Infinity; single = false; ret = false;
    t: string;
    constructor(t: string) { this.t = t; }
    select(c = '*', o: any = {}) { if (this.op === 'select') { this.cols = c; this.opts = o; } else this.ret = true; return this; }
    insert(v: any) { this.op = 'insert'; this.val = v; return this; }
    update(v: any) { this.op = 'update'; this.val = v; return this; }
    upsert(v: any) { this.op = 'upsert'; this.val = v; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(k: string, v: any) { this.f.push((r) => r[k] === v); return this; }
    neq(k: string, v: any) { this.f.push((r) => r[k] !== v); return this; }
    lt(k: string, v: any) { this.f.push((r) => r[k] < v); return this; }
    lte(k: string, v: any) { this.f.push((r) => r[k] != null && r[k] <= v); return this; }
    like(k: string, v: string) { const p = v.replace(/%$/, ''); this.f.push((r) => String(r[k]).startsWith(p)); return this; }
    order(k: string, o: any = {}) { this.ord = [k, o.ascending !== false]; return this; }
    limit(n: number) { this.lim = n; return this; }
    maybeSingle() { this.single = true; return this; }
    then(res: (v: any) => void) { res(this.run()); }
    out(rows: Row[]) {
      let o = rows.map((r) => ({ ...r }));
      if (this.cols.includes('pay_merchants(')) o.forEach((r) => { r.pay_merchants = T.pay_merchants.find((m) => m.id === r.merchant_id) || null; });
      return this.single ? { data: o[0] ?? null, error: null } : { data: o, error: null, count: o.length };
    }
    run() {
      const rows = T[this.t]; const match = () => rows.filter((r) => this.f.every((f) => f(r)));
      if (this.op === 'insert') {
        const r = { ...(DEF[this.t]?.() || {}), ...this.val };
        if (violates(this.t, rows, r)) return { data: null, error: { code: '23505' } };
        rows.push(r); return this.out([r]);
      }
      if (this.op === 'upsert') { const i = rows.findIndex((r) => r.chain === this.val.chain); if (i >= 0) rows[i] = { ...rows[i], ...this.val }; else rows.push({ ...this.val }); return { data: null, error: null }; }
      if (this.op === 'update') {
        const m = match();
        for (const r of m) { const n = { ...r, ...this.val }; if (violates(this.t, rows.filter((x) => x !== r), n)) return { data: null, error: { code: '23505' } }; Object.assign(r, this.val); }
        return this.out(m);
      }
      if (this.op === 'delete') { const m = new Set(match()); T[this.t] = rows.filter((r) => !m.has(r)); return { data: null, error: null }; }
      let m = match();
      if (this.ord) { const [k, asc] = this.ord; m = m.slice().sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1)); }
      const total = m.length; m = m.slice(0, this.lim);
      if (this.opts.head) return { data: null, error: null, count: total };
      return this.out(m);
    }
  }
  return {
    T, setHitLimit: (n: number) => { hitLimit = n; },
    from: (t: string) => new Q(t),
    rpc: async (fn: string, a: Row) => {
      if (fn === 'p2p_hit') { const k = a.p_addr + ':' + a.p_kind; hits[k] = (hits[k] || 0) + 1; return { data: hits[k] <= Math.min(a.p_max, hitLimit), error: null }; }
      if (fn === 'pay_settle') { // نفس منطق الدالة في 020_pay.sql
        const r = T.pay_invoices.find((x) => x.id === a.p_id && x.status === 'pending'); if (!r) return { data: false, error: null };
        if (T.pay_invoices.some((x) => x !== r && x.network === r.network && x.tx_key === a.p_key)) return { data: null, error: { code: '23505' } };
        Object.assign(r, { status: 'paid', tx: a.p_tx, tx_key: a.p_key, payer: a.p_payer, paid_at: new Date(clock.t).toISOString(), hook_state: r.kind === 'payment' ? 'pending' : 'none', hook_next: new Date(clock.t).toISOString() });
        const m = T.pay_merchants.find((x) => x.id === r.merchant_id)!; m.credit = Number(m.credit) + (r.kind === 'topup' ? Number(r.exact) : -Number(r.fee));
        return { data: true, error: null };
      }
      throw new Error('rpc ' + fn);
    }
  };
}

// ===== عالم الاختبار =====
const clock = { t: Date.parse('2026-11-12T12:00:00Z') };
const ME = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', OTHER = 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7', EVM = '0x' + 'ab'.repeat(20), OUR_EVM = '0x' + 'cd'.repeat(20);
const chain: Record<string, { head: number; logs: any[] }> = { tron: { head: 1000, logs: [] }, bsc: { head: 5000, logs: [] }, polygon: { head: 9000, logs: [] }, eth: { head: 300, logs: [] } };
const rpcCalls: any[] = []; let rpcFail: string | null = null;
const hooks: { url: string; body: string; sig: string }[] = []; let hookStatus = 200;
const db = fakeDb();
const app = createApp({
  db, now: () => clock.t,
  verify: async (message, signature) => signature === 'sig:' + JSON.parse(message).address ? JSON.parse(message).address : 'TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  rpc: async (net, method, params: any[]) => {
    rpcCalls.push([net, method, params]); if (rpcFail === net) throw new Error('rpc down');
    if (method === 'eth_blockNumber') return '0x' + chain[net].head.toString(16);
    const q = params[0], from = parseInt(q.fromBlock, 16), to = parseInt(q.toBlock, 16), want = [].concat(q.topics[2]);
    return chain[net].logs.filter((l) => l.bn >= from && l.bn <= to && want.includes(l.topics[2]));
  },
  fetch: (async (url: string, init: any) => { hooks.push({ url, body: init.body, sig: init.headers['x-sarra-signature'] }); if (hookStatus === 0) throw new Error('timeout'); return new Response('', { status: hookStatus }); }) as any,
  cfg: { feeBps: 50, feeMin: 20000n, topup: { tron: '', evm: OUR_EVM }, payPage: 'https://p/pay.html' }
});
let nonce = 0;
const signed = (action: string, params: Row = {}, addr = ME, sig = 'sig:' + addr) => new Request('https://x/functions/v1/pay/v1/merchant', { method: 'POST', body: JSON.stringify({ message: JSON.stringify({ app: 'sarra-p2p', action, params, address: addr, nonce: (++nonce).toString(16).padStart(24, '0'), ts: clock.t }), signature: sig }) });
const call = async (req: Request) => { const r = await app.handle(req); return { status: r.status, j: await r.json().catch(() => null) as any }; };
const api = (method: string, path: string, key?: string, body?: unknown) => call(new Request('https://x/functions/v1/pay' + path, { method, headers: key ? { authorization: 'Bearer ' + key } : {}, body: body ? JSON.stringify(body) : undefined }));
const cron = (secret = 'CRON') => call(new Request('https://x/functions/v1/pay/cron', { method: 'POST', headers: { 'x-cron': secret } }));
const pay = (net: string, to: string, units: string | bigint, o: Row = {}) => { const N = P.NETS[net]; chain[net].logs.push({ bn: chain[net].head, address: N.token, topics: [TRANSFER, topicOf('11'.repeat(20)), topicOf(P.matchHex(net, to)!)], data: '0x' + (BigInt(units) * 10n ** BigInt(N.dec - 6)).toString(16), transactionHash: '0xtx' + chain[net].logs.length, logIndex: '0x0', ...o }); };
const tick = async (min = 1) => { clock.t += min * 60000; for (const n in chain) chain[n].head += 30; return (await cron()).j; };
const units = (s: string) => { const [w, f = ''] = s.split('.'); return BigInt(w) * 1000000n + BigInt((f + '000000').slice(0, 6)); };
let pass = 0; const t = async (n: string, f: () => Promise<void>) => { await f(); pass++; console.log('✓', n); };

let KEY = '';
await t('التاجر: طلب بتوقيع خاطئ أو فعل غير مسموح يُرفض', async () => {
  assert.equal((await call(signed('pay.me', {}, ME, 'sig:' + OTHER))).j.error, 'BAD_SIGNATURE');
  assert.equal((await call(signed('offers.list'))).j.error, 'BAD_ACTION');
  assert.equal((await call(new Request('https://x/pay/v1/merchant', { method: 'POST', body: '{}' }))).status, 401);
});
await t('التاجر: تفعيل الحساب برصيد تجريبي 1 USDT، وعنوان TRON = محفظته', async () => {
  let r = await call(signed('pay.me')); assert.equal(r.j.merchant, null); assert.deepEqual(r.j.topup_networks, ['bsc', 'polygon', 'eth']);
  assert.equal((await call(signed('pay.save', { name: 'x' }))).j.error, 'BAD_NAME');
  assert.equal((await call(signed('pay.save', { name: 'متجر النيل', webhook_url: 'http://a.com/h' }))).j.error, 'BAD_WEBHOOK_URL');
  assert.equal((await call(signed('pay.save', { name: 'متجر النيل', evm_addr: 'nope' }))).j.error, 'BAD_EVM_ADDRESS');
  r = await call(signed('pay.save', { name: 'متجر النيل', webhook_url: 'https://shop.example.com/hook', evm_addr: EVM }));
  assert.equal(r.status, 200); assert.equal(r.j.merchant.credit, '1'); assert.equal(r.j.merchant.tron_addr, ME); assert.match(r.j.merchant.webhook_secret, /^whsec_/);
});
await t('إعادة إرسال الطلب الموقّع نفسه مرفوضة (REPLAY)', async () => {
  const body = await signed('pay.me').text(), mk = () => new Request('https://x/pay/v1/merchant', { method: 'POST', body });
  assert.equal((await call(mk())).status, 200); assert.equal((await call(mk())).j.error, 'REPLAY');
});
await t('مفتاح API: يظهر مرة واحدة، يُحفظ كبصمة فقط، والجديد يوقف القديم', async () => {
  assert.equal((await api('GET', '/v1/balance')).status, 401); assert.equal((await api('GET', '/v1/balance', 'sk_live_' + '0'.repeat(48))).status, 401);
  const k1 = (await call(signed('pay.key'))).j.api_key; assert.match(k1, /^sk_live_[0-9a-f]{48}$/);
  assert.ok(!JSON.stringify(db.T.pay_merchants).includes(k1), 'المفتاح الخام لا يُخزَّن');
  assert.equal((await api('GET', '/v1/balance', k1)).j.credit, '1');
  KEY = (await call(signed('pay.key'))).j.api_key;
  assert.equal((await api('GET', '/v1/balance', k1)).status, 401); assert.equal((await api('GET', '/v1/balance', KEY)).status, 200);
  assert.equal((await call(signed('pay.me'))).j.merchant.key_hint, KEY.slice(-4));
});
let INV: Row;
await t('فاتورة: مبلغ فريد على عنوان التاجر، والعمولة 0.5%', async () => {
  for (const [b, e] of [[{ amount: '10', network: 'solana' }, 'BAD_NETWORK'], [{ amount: '0.5', network: 'bsc' }, 'AMOUNT_TOO_SMALL'], [{ amount: '10.123', network: 'bsc' }, 'BAD_AMOUNT'], [{ amount: '10', network: 'bsc', order_id: 'a b' }, 'BAD_ORDER_ID'], [{ network: 'bsc' }, 'BAD_AMOUNT']] as const)
    assert.equal((await api('POST', '/v1/invoices', KEY, b)).j.error, e);
  const r = await api('POST', '/v1/invoices', KEY, { amount: '100', network: 'bsc', order_id: 'ORDER-1', description: 'طلب 1' }); INV = r.j.invoice;
  assert.equal(r.status, 200); assert.equal(INV.address, EVM); assert.equal(INV.amount, '100'); assert.equal(INV.fee, '0.5'); assert.equal(INV.status, 'pending');
  const d = units(INV.pay_amount) - 100000000n; assert.ok(d >= 1n && d <= 9999n, 'الكسر الفريد أقل من سنت'); assert.equal(INV.pay_url, 'https://p/pay.html?i=' + INV.id);
});
await t('نفس رقم الطلب يرجع الفاتورة نفسها (لا فاتورة ثانية)', async () => {
  const r = await api('POST', '/v1/invoices', KEY, { amount: '100', network: 'bsc', order_id: 'ORDER-1' });
  assert.equal(r.j.invoice.id, INV.id); assert.equal(db.T.pay_invoices.length, 1);
});
await t('صفحة الدفع العامة: تعرض اسم المتجر والمبلغ، ولا تكشف العمولة أو رقم الطلب', async () => {
  const r = await api('GET', '/v1/public/' + INV.id); assert.equal(r.j.invoice.merchant, 'متجر النيل'); assert.equal(r.j.invoice.pay_amount, INV.pay_amount);
  assert.ok(!('fee' in r.j.invoice) && !('order_id' in r.j.invoice));
  assert.equal((await api('GET', '/v1/public/inv_' + '0'.repeat(20))).status, 404); assert.equal((await api('GET', '/v1/public/x')).status, 404);
});
await t('الماسح: سر الجدولة مطلوب', async () => { assert.equal((await app.handle(new Request('https://x/pay/cron', { method: 'POST', headers: { 'x-cron': 'no' } }))).status, 403); });
await t('مبلغ بلا الكسر الفريد أو لعنوان آخر: لا يسدد الفاتورة', async () => {
  pay('bsc', EVM, 100000000n); pay('bsc', OUR_EVM, units(INV.pay_amount)); pay('bsc', EVM, units(INV.pay_amount), { address: '0x' + '99'.repeat(20) });
  const r = await tick(); assert.equal(r.report.bsc.settled, 0); assert.equal((await api('GET', '/v1/invoices/' + INV.id, KEY)).j.invoice.status, 'pending'); assert.equal(hooks.length, 0);
});
await t('الدفع الصحيح: الفاتورة مدفوعة، العمولة تُخصم مرة واحدة، والإشعار موقّع', async () => {
  pay('bsc', EVM, units(INV.pay_amount));
  const r = await tick(); assert.equal(r.report.bsc.settled, 1); assert.equal(r.hooks_sent, 1);
  const inv = (await api('GET', '/v1/invoices/' + INV.id, KEY)).j.invoice; assert.equal(inv.status, 'paid'); assert.ok(inv.tx && inv.paid_at);
  assert.equal((await api('GET', '/v1/balance', KEY)).j.credit, '0.5');
  assert.equal(hooks.length, 1); const h = hooks[0], ev = JSON.parse(h.body); assert.equal(h.url, 'https://shop.example.com/hook'); assert.equal(ev.event, 'invoice.paid'); assert.equal(ev.invoice.order_id, 'ORDER-1'); assert.equal(ev.invoice.status, 'paid');
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(h.sig)!; assert.equal(m[2], await P.hmacHex(db.T.pay_merchants[0].webhook_secret, m[1] + '.' + h.body));
});
await t('تحويل ثانٍ بالمبلغ نفسه ودورات لاحقة: لا خصم ولا إشعار مكرر', async () => {
  pay('bsc', EVM, units(INV.pay_amount)); await tick(); await tick();
  assert.equal((await api('GET', '/v1/balance', KEY)).j.credit, '0.5'); assert.equal(hooks.length, 1);
});
await t('رصيد لا يكفي للعمولة: INSUFFICIENT_CREDIT (402)', async () => {
  const r = await api('POST', '/v1/invoices', KEY, { amount: '500', network: 'bsc' }); assert.equal(r.status, 402); assert.equal(r.j.error, 'INSUFFICIENT_CREDIT');
});
await t('شحن الرصيد: فاتورة إلى عنواننا، وبعد الدفع يزيد الرصيد بلا إشعار للتاجر', async () => {
  assert.equal((await call(signed('pay.topup', { amount: '20', network: 'tron' }))).j.error, 'NETWORK_NOT_CONFIGURED');
  const top = (await call(signed('pay.topup', { amount: '20', network: 'bsc' }))).j.invoice; assert.equal(top.address, OUR_EVM); assert.equal(top.kind, 'topup'); assert.equal(top.fee, '0');
  assert.equal((await api('GET', '/v1/public/' + top.id)).j.invoice.merchant, 'شحن رصيد بوابة صُرّة');
  pay('bsc', OUR_EVM, units(top.pay_amount)); await tick();
  assert.equal(units((await api('GET', '/v1/balance', KEY)).j.credit), 500000n + units(top.pay_amount)); assert.equal(hooks.length, 1);
  assert.ok(!(await api('GET', '/v1/invoices', KEY)).j.invoices.some((x: Row) => x.kind === 'topup'), 'فواتير الشحن لا تظهر في قائمة الـ API');
});
await t('TRON: استعلام لكل عنوان بموضوع واحد، والدفع يُسدَّد', async () => {
  const inv = (await api('POST', '/v1/invoices', KEY, { amount: '5', network: 'tron' })).j.invoice; assert.equal(inv.address, ME);
  rpcCalls.length = 0; pay('tron', ME, units(inv.pay_amount)); const r = await tick();
  const q = rpcCalls.find((c) => c[0] === 'tron' && c[1] === 'eth_getLogs')[2][0]; assert.equal(typeof q.topics[2], 'string'); assert.equal(q.address, P.NETS.tron.token);
  assert.equal(r.report.tron.settled, 1); assert.equal((await api('GET', '/v1/invoices/' + inv.id, KEY)).j.invoice.status, 'paid');
});
await t('الماسح لا يقرأ إلا الكتل المثبّتة، ولا يستعلم عن شبكة بلا فواتير معلّقة', async () => {
  rpcCalls.length = 0; const r = await tick(); assert.equal(r.pending, 0); assert.equal(rpcCalls.length, 0); assert.equal(r.report.bsc, 'idle');
  const inv = (await api('POST', '/v1/invoices', KEY, { amount: '2', network: 'polygon' })).j.invoice;
  pay('polygon', EVM, units(inv.pay_amount)); // في أحدث كتلة: لم تثبت بعد (Polygon ينتظر 20 كتلة)
  rpcCalls.length = 0; clock.t += 60000; let j = (await cron()).j;
  const q = rpcCalls.find((c) => c[0] === 'polygon' && c[1] === 'eth_getLogs')[2][0]; assert.equal(parseInt(q.toBlock, 16), chain.polygon.head - 20); assert.equal(j.report.polygon.settled, 0);
  j = await tick(); assert.equal(j.report.polygon.settled, 1);
});
await t('عطل في خادم شبكة: يُسجَّل الخطأ، ولا تضيع الدفعة (تُلتقط في الدورة التالية)', async () => {
  const inv = (await api('POST', '/v1/invoices', KEY, { amount: '3', network: 'bsc' })).j.invoice;
  pay('bsc', EVM, units(inv.pay_amount)); rpcFail = 'bsc'; let j = await tick(); assert.match(j.report.bsc, /^error/); assert.equal(j.ok, true);
  rpcFail = null; j = await tick(); assert.equal(j.report.bsc.settled, 1);
});
await t('انتهاء المهلة: تُعرض منتهية فوراً، وتُقبل دفعة متأخرة قليلاً، ثم تُغلق نهائياً', async () => {
  const a = (await api('POST', '/v1/invoices', KEY, { amount: '4', network: 'bsc', order_id: 'LATE', expires_min: 10 })).j.invoice;
  const b = (await api('POST', '/v1/invoices', KEY, { amount: '4', network: 'bsc', order_id: 'DEAD', expires_min: 10 })).j.invoice;
  await tick(12); assert.equal((await api('GET', '/v1/invoices/' + a.id, KEY)).j.invoice.status, 'expired');
  pay('bsc', EVM, units(a.pay_amount)); await tick(); assert.equal((await api('GET', '/v1/invoices/' + a.id, KEY)).j.invoice.status, 'paid');
  await tick(25); assert.equal(db.T.pay_invoices.find((x) => x.id === b.id)!.status, 'expired');
  pay('bsc', EVM, units(b.pay_amount)); await tick(); assert.equal((await api('GET', '/v1/invoices/' + b.id, KEY)).j.invoice.status, 'expired');
  const again = (await api('POST', '/v1/invoices', KEY, { amount: '4', network: 'bsc', order_id: 'DEAD' })).j.invoice; assert.notEqual(again.id, b.id); // رقم الطلب يتحرر بعد الانتهاء
});
await t('الإشعار الفاشل: يُعاد بمهل متزايدة ثم يتوقف، ولا يؤثر على حالة الفاتورة', async () => {
  const n0 = hooks.length; hookStatus = 500;
  const inv = (await api('POST', '/v1/invoices', KEY, { amount: '6', network: 'bsc' })).j.invoice; pay('bsc', EVM, units(inv.pay_amount));
  let j = await tick(); assert.equal(j.hooks_sent, 0); assert.equal(hooks.length, n0 + 1);
  const row = () => db.T.pay_invoices.find((x) => x.id === inv.id)!; assert.equal(row().status, 'paid'); assert.equal(row().hook_state, 'pending'); assert.equal(row().hook_attempts, 1);
  await cron(); assert.equal(hooks.length, n0 + 1, 'لا إعادة قبل المهلة');
  hookStatus = 0; await tick(2); assert.equal(row().hook_attempts, 2); // انقطاع الاتصال يُعامل كفشل
  hookStatus = 200; await tick(6); assert.equal(row().hook_state, 'done'); assert.equal(hooks.length, n0 + 3);
  hookStatus = 500; const inv2 = (await api('POST', '/v1/invoices', KEY, { amount: '7', network: 'bsc' })).j.invoice; pay('bsc', EVM, units(inv2.pay_amount));
  for (const m of [1, 2, 6, 16, 61, 181, 721, 5]) await tick(m);
  const r2 = db.T.pay_invoices.find((x) => x.id === inv2.id)!; assert.equal(r2.hook_state, 'failed'); assert.equal(r2.hook_attempts, 7); hookStatus = 200;
});
await t('تاجران على العنوان نفسه: كل دفعة تسدد فاتورتها فقط', async () => {
  await call(signed('pay.save', { name: 'متجر ثانٍ', evm_addr: EVM }, OTHER)); const k2 = (await call(signed('pay.key', {}, OTHER))).j.api_key;
  const a = (await api('POST', '/v1/invoices', KEY, { amount: '9', network: 'bsc' })).j.invoice, b = (await api('POST', '/v1/invoices', k2, { amount: '9', network: 'bsc' })).j.invoice;
  assert.notEqual(a.pay_amount, b.pay_amount); assert.equal((await api('GET', '/v1/invoices/' + a.id, k2)).status, 404, 'تاجر لا يرى فاتورة غيره');
  pay('bsc', EVM, units(b.pay_amount)); await tick();
  assert.equal((await api('GET', '/v1/invoices/' + a.id, KEY)).j.invoice.status, 'pending'); assert.equal((await api('GET', '/v1/invoices/' + b.id, k2)).j.invoice.status, 'paid');
});
await t('حساب موقوف، وحد الطلبات، وحد الفواتير المعلّقة', async () => {
  db.setHitLimit(0); assert.equal((await api('POST', '/v1/invoices', KEY, { amount: '2', network: 'bsc' })).status, 429); db.setHitLimit(Infinity);
  const m = db.T.pay_merchants[0]; m.credit = 1e12;
  for (let i = 0; i < 200; i++) db.T.pay_invoices.push({ id: 'f' + i, merchant_id: m.id, kind: 'payment', network: 'eth', match_hex: 'ee'.repeat(20), exact: String(i + 1), amount: '1', status: 'pending', order_id: null, tx_key: null, expires_at: new Date(clock.t + 6e5).toISOString() });
  assert.equal((await api('POST', '/v1/invoices', KEY, { amount: '2', network: 'bsc' })).j.error, 'TOO_MANY_PENDING');
  m.active = false; assert.equal((await api('GET', '/v1/balance', KEY)).status, 403);
});
await t('مسار غير معروف: 404، وطلب OPTIONS للمتصفح مسموح', async () => {
  assert.equal((await api('GET', '/v1/nope')).status, 404); assert.equal((await app.handle(new Request('https://x/pay/v1/invoices', { method: 'OPTIONS' }))).status, 200);
});
console.log(pass + ' اختبارات تكاملية لخادم بوابة الدفع نجحت');

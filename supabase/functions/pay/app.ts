// بوابة الدفع للتجار — منطق الخادم كله، بلا اعتماد مباشر على Deno أو الشبكة (تُحقن عبر Deps)
// كي يُختبر في Node بقاعدة بيانات وهمية: test/pay-app.test.ts. الوصف العام في index.ts
import * as L from '../_shared/logic.ts';
import * as P from '../_shared/pay.ts';
import { TRANSFER, topicOf, blockRange } from '../push-watch/logic.ts';

// deno-lint-ignore no-explicit-any
type Db = any;
export type Deps = {
  db: Db;                                                              // عميل Supabase بصلاحية الخدمة
  verify: (message: string, signature: string) => Promise<string>;     // يعيد عنوان TRON الموقِّع
  rpc: (net: string, method: string, params: unknown[]) => Promise<any>; // JSON-RPC للشبكة
  fetch: typeof fetch;                                                 // لإرسال إشعارات التجار
  now: () => number;
  cfg: { feeBps: number; feeMin: bigint; topup: Record<string, string>; payPage: string };
};

export function createApp(d: Deps) {
  const db = d.db, FEE_BPS = d.cfg.feeBps, FEE_MIN = d.cfg.feeMin, TOPUP = d.cfg.topup, PAY_PAGE = d.cfg.payPage;
  const MAX_PENDING = 200, LATE_GRACE_MIN = 20;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  const STATUS: Record<string, number> = { TEST_KEY_REQUIRED: 403, UNAUTHORIZED: 401, BAD_SIGNATURE: 401, REPLAY: 401, INSUFFICIENT_CREDIT: 402, NOT_FOUND: 404, MERCHANT_DISABLED: 403, SERVER_ERROR: 500 };
  const fail = (code: string) => json({ error: code }, code.startsWith('RATE_LIMITED') ? 429 : STATUS[code] || 400);

  type Merchant = { id: string; address: string; name: string; tron_addr: string | null; evm_addr: string | null; key_hint: string | null; test_key_hint?: string | null; webhook_url: string | null; webhook_secret: string; credit: string | number; active: boolean };

  async function hit(who: string, kind: string, max: number, win: number) {
    const { data, error } = await db.rpc('p2p_hit', { p_addr: who, p_kind: kind, p_max: max, p_window_secs: win });
    if (error) throw new Error('SERVER_ERROR');
    if (!data) throw new Error('RATE_LIMITED');
  }
  // المفتاح يحدد الوضع: sk_live_ فواتير حقيقية، sk_test_ فواتير تجريبية. لا يرى أحدهما فواتير الآخر
  async function merchantByKey(req: Request): Promise<{ me: Merchant; test: boolean }> {
    const h = req.headers.get('authorization') || '', key = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    const m = /^sk_(live|test)_[0-9a-f]{48}$/.exec(key); if (!m) throw new Error('UNAUTHORIZED');
    const test = m[1] === 'test';
    const { data } = await db.from('pay_merchants').select('*').eq(test ? 'test_key_hash' : 'key_hash', await P.sha256Hex(key)).maybeSingle();
    if (!data) throw new Error('UNAUTHORIZED');
    if (!data.active) throw new Error('MERCHANT_DISABLED');
    return { me: data as Merchant, test };
  }

  // ===== إنشاء فاتورة (دفع لتاجر، أو شحن رصيد إلى عنواننا) =====
  async function createInvoice(m: Merchant, p: Record<string, unknown>, kind: 'payment' | 'topup', test = false) {
    const net = String(p.network || ''), N = P.NETS[net]; if (!N) throw new Error('BAD_NETWORK');
    const address = kind === 'topup' ? TOPUP[N.kind] : (N.kind === 'tron' ? m.tron_addr : m.evm_addr);
    const mh = P.matchHex(net, address); if (!address || !mh) throw new Error('NETWORK_NOT_CONFIGURED');
    const amount = P.parseAmount(p.amount);
    const fee = kind === 'payment' ? P.feeUnits(amount, FEE_BPS, FEE_MIN) : 0n;
    if (kind === 'payment' && !test && BigInt(m.credit) < fee) throw new Error('INSUFFICIENT_CREDIT'); // التجريبية لا تخصم شيئاً
    const order_id = p.order_id == null || p.order_id === '' ? null : String(p.order_id);
    if (order_id && !/^[\w.:\-]{1,64}$/.test(order_id)) throw new Error('BAD_ORDER_ID');
    const description = p.description == null ? null : String(p.description).slice(0, 140);
    const mins = Math.min(120, Math.max(10, Number(p.expires_min) || 30));
    const existing = async () => order_id ? (await db.from('pay_invoices').select('*').eq('merchant_id', m.id).eq('test', test).eq('order_id', order_id).neq('status', 'expired').maybeSingle()).data : null;
    const dup = await existing(); if (dup) return dup; // إعادة إرسال الطلب نفسه لا تنشئ فاتورة ثانية
    await hit('pay:' + m.id, test ? 'pay_inv_test' : 'pay_inv', 300, 3600);
    const { count } = await db.from('pay_invoices').select('id', { count: 'exact', head: true }).eq('merchant_id', m.id).eq('test', test).eq('status', 'pending');
    if ((count || 0) >= MAX_PENDING) throw new Error('TOO_MANY_PENDING');
    for (let i = 0; i < 6; i++) {
      const row = { id: P.newInvoiceId(), merchant_id: m.id, kind, network: net, address, match_hex: mh, amount: amount.toString(), exact: P.exactUnits(amount, P.randTail()).toString(),
        fee: fee.toString(), order_id, description, test, expires_at: new Date(d.now() + mins * 60000).toISOString() };
      const { data, error } = await db.from('pay_invoices').insert(row).select().maybeSingle();
      if (data) return data;
      if (error?.code !== '23505') throw new Error('SERVER_ERROR');
      const d2 = await existing(); if (d2) return d2; // سباق على رقم الطلب نفسه
      // وإلا فالمبلغ الفريد مستخدم لفاتورة أخرى على العنوان نفسه: نجرّب كسراً آخر
    }
    throw new Error('TRY_AGAIN');
  }

  // ===== إدارة حساب التاجر من تطبيق صُرّة (طلب موقّع بالمحفظة) =====
  const merchantView = (m: Merchant) => ({ name: m.name, tron_addr: m.tron_addr, evm_addr: m.evm_addr, webhook_url: m.webhook_url, webhook_secret: m.webhook_secret, key_hint: m.key_hint, test_key_hint: m.test_key_hint || null, credit: P.fmtUnits(m.credit), active: m.active });
  async function merchantAction(action: string, p: Record<string, unknown>, me: string) {
    const { data: cur } = await db.from('pay_merchants').select('*').eq('address', me).maybeSingle();
    const info = { fee_pct: FEE_BPS / 100, fee_min: P.fmtUnits(FEE_MIN), topup_networks: Object.keys(P.NETS).filter((n) => !!P.matchHex(n, TOPUP[P.NETS[n].kind])), networks: Object.fromEntries(Object.entries(P.NETS).map(([k, v]) => [k, v.name])) };
    if (action === 'pay.me') {
      if (!cur) return { merchant: null, ...info };
      const { data: inv } = await db.from('pay_invoices').select('*').eq('merchant_id', cur.id).order('created_at', { ascending: false }).limit(15);
      return { merchant: merchantView(cur), invoices: (inv || []).map((r) => P.invoiceView(r, PAY_PAGE, d.now())), ...info };
    }
    if (action === 'pay.save') {
      await hit(me, 'pay_save', 20, 86400);
      const name = String(p.name || '').trim(); if (name.length < 2 || name.length > 40) throw new Error('BAD_NAME');
      const hook = p.webhook_url ? P.safeWebhookUrl(p.webhook_url) : null; if (p.webhook_url && !hook) throw new Error('BAD_WEBHOOK_URL');
      const evm = p.evm_addr ? String(p.evm_addr) : null; if (evm && !P.isEvmAddr(evm)) throw new Error('BAD_EVM_ADDRESS');
      const tron = p.tron_addr ? String(p.tron_addr) : me; if (!P.matchHex('tron', tron)) throw new Error('BAD_TRON_ADDRESS');
      const row = { name, webhook_url: hook, evm_addr: evm, tron_addr: tron };
      const q = cur ? db.from('pay_merchants').update(row).eq('id', cur.id) : db.from('pay_merchants').insert({ ...row, address: me, webhook_secret: P.newHookSecret() });
      const { data, error } = await q.select().maybeSingle(); if (error || !data) throw new Error('SERVER_ERROR');
      return { merchant: merchantView(data), ...info };
    }
    if (!cur) throw new Error('NOT_FOUND');
    if (action === 'pay.key') { // مفتاح جديد يلغي القديم من نفس النوع. يظهر مرة واحدة فقط
      const test = p.test === true;
      await hit(me, test ? 'pay_key_test' : 'pay_key', 10, 86400);
      const key = P.newApiKey(test), hash = await P.sha256Hex(key);
      const { error } = await db.from('pay_merchants').update(test ? { test_key_hash: hash, test_key_hint: key.slice(-4) } : { key_hash: hash, key_hint: key.slice(-4) }).eq('id', cur.id);
      if (error) throw new Error('SERVER_ERROR');
      return { api_key: key };
    }
    if (action === 'pay.hooktest') { // إشعار تجريبي فوري إلى رابط التاجر، ونعيد له ما ردّ به خادمه
      await hit(me, 'pay_hooktest', 30, 86400);
      const url = P.safeWebhookUrl(cur.webhook_url); if (!url) throw new Error('NO_WEBHOOK_URL');
      const now = new Date(d.now()).toISOString();
      const sample = { id: 'inv_' + '0'.repeat(20), status: 'paid', network: 'bsc', network_name: P.NETS.bsc.name, currency: 'USDT', amount: '10', pay_amount: '10.004321', address: cur.evm_addr || cur.tron_addr,
        description: 'إشعار تجريبي', tx: '0xtest', paid_at: now, expires_at: now, created_at: now, pay_url: PAY_PAGE + '?i=inv_' + '0'.repeat(20), test: true, order_id: 'TEST', fee: '0', kind: 'payment' };
      return await sendHook(url, cur.webhook_secret, { event: 'test', invoice: sample });
    }
    if (action === 'pay.topup') return { invoice: P.invoiceView(await createInvoice(cur, { amount: p.amount, network: p.network, expires_min: 60 }, 'topup'), PAY_PAGE, d.now()) };
    throw new Error('BAD_ACTION');
  }

  // ===== الماسح: يطابق التحويلات الواردة مع الفواتير المعلّقة =====
  const hx = (n: number) => '0x' + n.toString(16);
  async function scanNet(net: string, pending: P.Pending[], last: number | null) {
    const N = P.NETS[net], sk = 'pay:' + net;
    if (!pending.length) { if (last != null) await db.from('push_state').delete().eq('chain', sk); return 'idle'; }
    const head = parseInt(await d.rpc(net, 'eth_blockNumber', []), 16) - N.conf;
    let settled = 0, cursor = last, scanned = 0;
    for (let round = 0; round < 3; round++) {
      // أول دورة بعد الخمول: نرجع بضع دقائق لنغطي ما بين إنشاء الفاتورة وتشغيل الماسح
      const rg: [number, number] | null = cursor == null ? [head - N.cap + 1, head] : blockRange(cursor, head, N.cap, N.cap * 30);
      if (!rg) break;
      const hexes = [...new Set(pending.map((p) => p.match_hex))], logs: unknown[] = [];
      const base = { fromBlock: hx(rg[0]), toBlock: hx(rg[1]), address: N.token };
      // TRON: استعلام لكل عنوان (فلتر «أو» غير مضمون في خادمها)؛ البقية على دفعات
      const groups = N.kind === 'tron' ? hexes.slice(0, 40).map((h) => [h]) : Array.from({ length: Math.ceil(hexes.length / 50) }, (_, i) => hexes.slice(i * 50, i * 50 + 50));
      for (const g of groups) logs.push(...(await d.rpc(net, 'eth_getLogs', [{ ...base, topics: [TRANSFER, null, g.length === 1 ? topicOf(g[0]) : g.map(topicOf)] }]) || []));
      for (const h of P.matchLogs(net, logs as any[], pending)) {
        const { data } = await db.rpc('pay_settle', { p_id: h.id, p_tx: h.tx, p_key: h.key, p_payer: h.from });
        if (data) settled++;
      }
      cursor = rg[1]; scanned += rg[1] - rg[0] + 1;
      await db.from('push_state').upsert({ chain: sk, last_block: cursor, updated_at: new Date(d.now()).toISOString() });
      if (cursor >= head) break;
    }
    return { head, scanned, settled };
  }
  async function sendHook(url: string, secret: string, payload: unknown) {
    const body = JSON.stringify(payload), ts = Math.floor(d.now() / 1000);
    try {
      const res = await d.fetch(url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', 'user-agent': 'SarraPay/1', 'x-sarra-signature': await P.signWebhook(secret, body, ts) }, body, signal: AbortSignal.timeout(8000) });
      await res.body?.cancel();
      return { ok: res.status >= 200 && res.status < 300, status: res.status };
    } catch { return { ok: false, status: 0 }; }
  }
  async function deliverHooks(onlyId?: string) {
    let q = db.from('pay_invoices').select('*, pay_merchants(webhook_url, webhook_secret)').eq('hook_state', 'pending').lte('hook_next', new Date(d.now()).toISOString());
    if (onlyId) q = q.eq('id', onlyId);
    const { data } = await q.limit(25);
    let ok = 0;
    await Promise.all((data || []).map(async (r) => {
      const m = r.pay_merchants as { webhook_url: string | null; webhook_secret: string } | null, url = m && P.safeWebhookUrl(m.webhook_url);
      if (!m || !url) { await db.from('pay_invoices').update({ hook_state: 'none' }).eq('id', r.id); return; }
      const good = (await sendHook(url, m.webhook_secret, { event: 'invoice.paid', invoice: P.invoiceView(r, PAY_PAGE, d.now()) })).ok; // الفشل يُعاد لاحقاً
      if (good) { ok++; await db.from('pay_invoices').update({ hook_state: 'done', hook_attempts: r.hook_attempts + 1 }).eq('id', r.id); return; }
      const n = r.hook_attempts + 1, wait = P.hookBackoffMin(n);
      await db.from('pay_invoices').update(wait == null ? { hook_state: 'failed', hook_attempts: n } : { hook_attempts: n, hook_next: new Date(d.now() + wait * 60000).toISOString() }).eq('id', r.id);
    }));
    return ok;
  }
  async function cron() {
    await db.from('pay_invoices').update({ status: 'expired' }).eq('status', 'pending').lt('expires_at', new Date(d.now() - LATE_GRACE_MIN * 60000).toISOString());
    const { data: pend } = await db.from('pay_invoices').select('id,network,match_hex,exact').eq('status', 'pending').eq('test', false).limit(5000); // التجريبية لا تُراقَب
    const { data: st } = await db.from('push_state').select('chain,last_block').like('chain', 'pay:%');
    const lastOf = Object.fromEntries((st || []).map((s) => [s.chain, Number(s.last_block)]));
    const report: Record<string, unknown> = {};
    await Promise.all(Object.keys(P.NETS).map(async (net) => {
      try { report[net] = await scanNet(net, (pend || []).filter((p) => p.network === net), lastOf['pay:' + net] ?? null); }
      catch (e) { report[net] = 'error: ' + String((e as Error)?.message || e).slice(0, 120); }
    }));
    return { ok: true, pending: (pend || []).length, hooks_sent: await deliverHooks(), report };
  }

  // ===== محاكاة الدفع للفواتير التجريبية فقط (لا مال ولا شبكة) =====
  async function simulate(row: Record<string, any> | null, status: string) {
    if (!row) throw new Error('NOT_FOUND');
    if (!row.test) throw new Error('NOT_TEST_INVOICE');
    if (row.status !== 'pending') throw new Error('NOT_PENDING');
    if (status !== 'paid' && status !== 'expired') throw new Error('BAD_STATUS');
    const now = new Date(d.now()).toISOString();
    const upd = status === 'paid'
      ? { status: 'paid', tx: '0xtest' + P.newInvoiceId().slice(4), payer: 'test', paid_at: now, hook_state: 'pending', hook_next: now }
      : { status: 'expired', expires_at: now };
    const { data } = await db.from('pay_invoices').update(upd).eq('id', row.id).eq('status', 'pending').eq('test', true).select('*').maybeSingle();
    if (!data) throw new Error('NOT_PENDING');
    if (status === 'paid') await deliverHooks(row.id); // الإشعار فوراً، والفشل يُعاد كالمعتاد
    return (await db.from('pay_invoices').select('*').eq('id', row.id).maybeSingle()).data;
  }

  async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    const path = new URL(req.url).pathname.replace(/^.*?\/pay(?=\/|$)/, '').replace(/\/+$/, '') || '/';
    try {
      if (path === '/cron' && req.method === 'POST') {
        const { data: cfg } = await db.from('push_cfg').select('v').eq('k', 'cron_secret').maybeSingle();
        if (!cfg || req.headers.get('x-cron') !== cfg.v) return new Response('forbidden', { status: 403 });
        return json(await cron());
      }
      let m: RegExpMatchArray | null;
      if ((m = path.match(/^\/v1\/public\/(inv_[0-9a-f]{20})$/)) && req.method === 'GET') {
        const { data } = await db.from('pay_invoices').select('*, pay_merchants(name)').eq('id', m[1]).maybeSingle();
        if (!data) throw new Error('NOT_FOUND');
        return json({ invoice: { ...P.invoiceView(data, PAY_PAGE, d.now(), false), kind: data.kind, merchant: data.kind === 'topup' ? 'شحن رصيد بوابة صُرّة' : (data.pay_merchants as { name: string } | null)?.name || '' } });
      }
      if ((m = path.match(/^\/v1\/public\/(inv_[0-9a-f]{20})\/simulate$/)) && req.method === 'POST') { // زر «محاكاة الدفع» في صفحة الدفع
        await hit('pub:' + m[1], 'pay_sim', 5, 3600);
        const { data } = await db.from('pay_invoices').select('*').eq('id', m[1]).maybeSingle();
        return json({ invoice: P.invoiceView(await simulate(data, 'paid'), PAY_PAGE, d.now(), false) });
      }
      if (path === '/v1/merchant' && req.method === 'POST') {
        const { message, signature } = await req.json().catch(() => ({}));
        if (typeof message !== 'string' || typeof signature !== 'string') throw new Error('UNAUTHORIZED');
        const s = L.parseSignedMessage(message, d.now());
        if (await d.verify(message, signature) !== s.address) throw new Error('BAD_SIGNATURE');
        if (!String(s.action).startsWith('pay.')) throw new Error('BAD_ACTION');
        const { error } = await db.from('used_nonces').insert({ nonce: s.nonce }); if (error) throw new Error('REPLAY');
        await hit(s.address, 'req', L.LIMITS.req[0], L.LIMITS.req[1]);
        return json(await merchantAction(s.action, s.params as Record<string, unknown>, s.address));
      }
      // ما بعده يحتاج مفتاح API
      if (path === '/v1/invoices' && req.method === 'POST') {
        const { me, test } = await merchantByKey(req);
        return json({ invoice: P.invoiceView(await createInvoice(me, await req.json().catch(() => ({})), 'payment', test), PAY_PAGE, d.now()) });
      }
      if ((m = path.match(/^\/v1\/invoices\/(inv_[0-9a-f]{20})\/simulate$/)) && req.method === 'POST') {
        const { me, test } = await merchantByKey(req); if (!test) throw new Error('TEST_KEY_REQUIRED');
        const body = await req.json().catch(() => ({}));
        const { data } = await db.from('pay_invoices').select('*').eq('id', m[1]).eq('merchant_id', me.id).eq('test', true).maybeSingle();
        return json({ invoice: P.invoiceView(await simulate(data, String(body.status || 'paid')), PAY_PAGE, d.now()) });
      }
      if ((m = path.match(/^\/v1\/invoices\/(inv_[0-9a-f]{20})$/)) && req.method === 'GET') {
        const { me, test } = await merchantByKey(req); await hit('pay:' + me.id, 'pay_read', 600, 60);
        const { data } = await db.from('pay_invoices').select('*').eq('id', m[1]).eq('merchant_id', me.id).eq('test', test).maybeSingle();
        if (!data) throw new Error('NOT_FOUND');
        return json({ invoice: P.invoiceView(data, PAY_PAGE, d.now()) });
      }
      if (path === '/v1/invoices' && req.method === 'GET') {
        const { me, test } = await merchantByKey(req); await hit('pay:' + me.id, 'pay_read', 600, 60);
        const q = new URL(req.url).searchParams, lim = Math.min(100, Math.max(1, Number(q.get('limit')) || 20)), st = q.get('status');
        let sel = db.from('pay_invoices').select('*').eq('merchant_id', me.id).eq('kind', 'payment').eq('test', test).order('created_at', { ascending: false }).limit(lim);
        if (st && ['pending', 'paid', 'expired'].includes(st)) sel = sel.eq('status', st);
        const { data } = await sel;
        return json({ invoices: (data || []).map((r) => P.invoiceView(r, PAY_PAGE, d.now())) });
      }
      if (path === '/v1/balance' && req.method === 'GET') {
        const { me, test } = await merchantByKey(req);
        return json({ test, credit: P.fmtUnits(me.credit), currency: 'USDT', fee_pct: FEE_BPS / 100, fee_min: P.fmtUnits(FEE_MIN) });
      }
      return fail('NOT_FOUND');
    } catch (e) {
      const msg = String((e as Error).message || e), code = /^[A-Z_]+$/.test(msg) ? msg : 'SERVER_ERROR';
      if (code === 'SERVER_ERROR') console.error(e);
      return fail(code);
    }
  }
  return { handle, cron };
}

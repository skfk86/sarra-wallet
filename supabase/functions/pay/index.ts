// بوابة الدفع للتجار — API صُرّة
//   للتاجر (مفتاح API في ترويسة Authorization: Bearer sk_live_…):
//     POST /v1/invoices            إنشاء فاتورة
//     GET  /v1/invoices/:id        حالة فاتورة
//     GET  /v1/invoices            آخر الفواتير
//     GET  /v1/balance             رصيد الحساب
//   لصفحة الدفع (بلا مفتاح):   GET /v1/public/:id
//   لتطبيق صُرّة (طلب موقّع بالمحفظة): POST /v1/merchant  { message, signature }
//   للجدولة (كل دقيقة، ترويسة x-cron): POST /cron  ← يطابق التحويلات ويرسل الإشعارات
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { TronWeb } from 'npm:tronweb@6.0.4';
import * as L from '../_shared/logic.ts';
import * as P from '../_shared/pay.ts';
import { TRANSFER, topicOf, blockRange } from '../push-watch/logic.ts';

const env = (k: string, d = '') => (Deno.env.get(k) ?? d).replace(/[\s​-‏‪-‮⁠﻿]/g, '');
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const tw = new TronWeb({ fullHost: 'https://api.trongrid.io' });
const FEE_BPS = Number(env('PAY_FEE_BPS', '50'));                                   // 0.5%
const FEE_MIN = BigInt(Math.round(Number(env('PAY_FEE_MIN_USDT', '0.02')) * 1e6));  // بحد أدنى 0.02 USDT
const TOPUP: Record<string, string> = { tron: env('PAY_TOPUP_TRON'), evm: env('PAY_TOPUP_EVM') }; // عناويننا لاستلام شحن الرصيد
const PAY_PAGE = env('PAY_PAGE_URL', 'https://skfk86.github.io/sarra-wallet/pay.html');
const MAX_PENDING = 200, LATE_GRACE_MIN = 20;
const TRON_KEY = env('TRONGRID_API_KEY');
const RPCS: Record<string, string[]> = {
  tron: ['https://api.trongrid.io/jsonrpc'],
  bsc: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org'],
  polygon: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'],
  eth: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org']
};

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const STATUS: Record<string, number> = { UNAUTHORIZED: 401, BAD_SIGNATURE: 401, REPLAY: 401, INSUFFICIENT_CREDIT: 402, NOT_FOUND: 404, MERCHANT_DISABLED: 403, SERVER_ERROR: 500 };
const fail = (code: string) => json({ error: code }, code.startsWith('RATE_LIMITED') ? 429 : STATUS[code] || 400);

type Merchant = { id: string; address: string; name: string; tron_addr: string | null; evm_addr: string | null; key_hint: string | null; webhook_url: string | null; webhook_secret: string; credit: string | number; active: boolean };

async function hit(who: string, kind: string, max: number, win: number) {
  const { data, error } = await db.rpc('p2p_hit', { p_addr: who, p_kind: kind, p_max: max, p_window_secs: win });
  if (error) throw new Error('SERVER_ERROR');
  if (!data) throw new Error('RATE_LIMITED');
}
async function merchantByKey(req: Request): Promise<Merchant> {
  const h = req.headers.get('authorization') || '', key = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!/^sk_live_[0-9a-f]{48}$/.test(key)) throw new Error('UNAUTHORIZED');
  const { data } = await db.from('pay_merchants').select('*').eq('key_hash', await P.sha256Hex(key)).maybeSingle();
  if (!data) throw new Error('UNAUTHORIZED');
  if (!data.active) throw new Error('MERCHANT_DISABLED');
  return data as Merchant;
}

// ===== إنشاء فاتورة (دفع لتاجر، أو شحن رصيد إلى عنواننا) =====
async function createInvoice(m: Merchant, p: Record<string, unknown>, kind: 'payment' | 'topup') {
  const net = String(p.network || ''), N = P.NETS[net]; if (!N) throw new Error('BAD_NETWORK');
  const address = kind === 'topup' ? TOPUP[N.kind] : (N.kind === 'tron' ? m.tron_addr : m.evm_addr);
  const mh = P.matchHex(net, address); if (!address || !mh) throw new Error('NETWORK_NOT_CONFIGURED');
  const amount = P.parseAmount(p.amount);
  const fee = kind === 'payment' ? P.feeUnits(amount, FEE_BPS, FEE_MIN) : 0n;
  if (kind === 'payment' && BigInt(m.credit) < fee) throw new Error('INSUFFICIENT_CREDIT');
  const order_id = p.order_id == null || p.order_id === '' ? null : String(p.order_id);
  if (order_id && !/^[\w.:\-]{1,64}$/.test(order_id)) throw new Error('BAD_ORDER_ID');
  const description = p.description == null ? null : String(p.description).slice(0, 140);
  const mins = Math.min(120, Math.max(10, Number(p.expires_min) || 30));
  const existing = async () => order_id ? (await db.from('pay_invoices').select('*').eq('merchant_id', m.id).eq('order_id', order_id).neq('status', 'expired').maybeSingle()).data : null;
  const dup = await existing(); if (dup) return dup; // إعادة إرسال الطلب نفسه لا تنشئ فاتورة ثانية
  await hit('pay:' + m.id, 'pay_inv', 300, 3600);
  const { count } = await db.from('pay_invoices').select('id', { count: 'exact', head: true }).eq('merchant_id', m.id).eq('status', 'pending');
  if ((count || 0) >= MAX_PENDING) throw new Error('TOO_MANY_PENDING');
  for (let i = 0; i < 6; i++) {
    const row = { id: P.newInvoiceId(), merchant_id: m.id, kind, network: net, address, match_hex: mh, amount: amount.toString(), exact: P.exactUnits(amount, P.randTail()).toString(),
      fee: fee.toString(), order_id, description, expires_at: new Date(Date.now() + mins * 60000).toISOString() };
    const { data, error } = await db.from('pay_invoices').insert(row).select().maybeSingle();
    if (data) return data;
    if (error?.code !== '23505') throw new Error('SERVER_ERROR');
    const d2 = await existing(); if (d2) return d2; // سباق على رقم الطلب نفسه
    // وإلا فالمبلغ الفريد مستخدم لفاتورة أخرى على العنوان نفسه: نجرّب كسراً آخر
  }
  throw new Error('TRY_AGAIN');
}

// ===== إدارة حساب التاجر من تطبيق صُرّة (طلب موقّع بالمحفظة) =====
const merchantView = (m: Merchant) => ({ name: m.name, tron_addr: m.tron_addr, evm_addr: m.evm_addr, webhook_url: m.webhook_url, webhook_secret: m.webhook_secret, key_hint: m.key_hint, credit: P.fmtUnits(m.credit), active: m.active });
async function merchantAction(action: string, p: Record<string, unknown>, me: string) {
  const { data: cur } = await db.from('pay_merchants').select('*').eq('address', me).maybeSingle();
  const info = { fee_pct: FEE_BPS / 100, fee_min: P.fmtUnits(FEE_MIN), topup_networks: Object.keys(P.NETS).filter((n) => !!P.matchHex(n, TOPUP[P.NETS[n].kind])), networks: Object.fromEntries(Object.entries(P.NETS).map(([k, v]) => [k, v.name])) };
  if (action === 'pay.me') {
    if (!cur) return { merchant: null, ...info };
    const { data: inv } = await db.from('pay_invoices').select('*').eq('merchant_id', cur.id).order('created_at', { ascending: false }).limit(15);
    return { merchant: merchantView(cur), invoices: (inv || []).map((r) => P.invoiceView(r, PAY_PAGE, Date.now())), ...info };
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
  if (action === 'pay.key') { // مفتاح جديد يلغي القديم. يظهر مرة واحدة فقط
    await hit(me, 'pay_key', 10, 86400);
    const key = P.newApiKey();
    const { error } = await db.from('pay_merchants').update({ key_hash: await P.sha256Hex(key), key_hint: key.slice(-4) }).eq('id', cur.id);
    if (error) throw new Error('SERVER_ERROR');
    return { api_key: key };
  }
  if (action === 'pay.topup') return { invoice: P.invoiceView(await createInvoice(cur, { amount: p.amount, network: p.network, expires_min: 60 }, 'topup'), PAY_PAGE, Date.now()) };
  throw new Error('BAD_ACTION');
}

// ===== الماسح: يطابق التحويلات الواردة مع الفواتير المعلّقة =====
async function rpc(net: string, method: string, params: unknown[]) {
  let last: unknown;
  for (const u of RPCS[net]) {
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', ...(net === 'tron' && TRON_KEY ? { 'TRON-PRO-API-KEY': TRON_KEY } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(12000) });
      const j = await r.json(); if (j.error) throw new Error(j.error.message || 'RPC'); return j.result;
    } catch (e) { last = e; }
  }
  throw last;
}
const hx = (n: number) => '0x' + n.toString(16);
async function scanNet(net: string, pending: P.Pending[], last: number | null) {
  const N = P.NETS[net], sk = 'pay:' + net;
  if (!pending.length) { if (last != null) await db.from('push_state').delete().eq('chain', sk); return 'idle'; }
  const head = parseInt(await rpc(net, 'eth_blockNumber', []), 16) - N.conf;
  let settled = 0, cursor = last, scanned = 0;
  for (let round = 0; round < 3; round++) {
    // أول دورة بعد الخمول: نرجع بضع دقائق لنغطي ما بين إنشاء الفاتورة وتشغيل الماسح
    const rg: [number, number] | null = cursor == null ? [head - N.cap + 1, head] : blockRange(cursor, head, N.cap, N.cap * 30);
    if (!rg) break;
    const hexes = [...new Set(pending.map((p) => p.match_hex))], logs: unknown[] = [];
    const base = { fromBlock: hx(rg[0]), toBlock: hx(rg[1]), address: N.token };
    // TRON: استعلام لكل عنوان (فلتر «أو» غير مضمون في خادمها)؛ البقية على دفعات
    const groups = N.kind === 'tron' ? hexes.slice(0, 40).map((h) => [h]) : Array.from({ length: Math.ceil(hexes.length / 50) }, (_, i) => hexes.slice(i * 50, i * 50 + 50));
    for (const g of groups) logs.push(...(await rpc(net, 'eth_getLogs', [{ ...base, topics: [TRANSFER, null, g.length === 1 ? topicOf(g[0]) : g.map(topicOf)] }]) || []));
    for (const h of P.matchLogs(net, logs as any[], pending)) {
      const { data } = await db.rpc('pay_settle', { p_id: h.id, p_tx: h.tx, p_key: h.key, p_payer: h.from });
      if (data) settled++;
    }
    cursor = rg[1]; scanned += rg[1] - rg[0] + 1;
    await db.from('push_state').upsert({ chain: sk, last_block: cursor, updated_at: new Date().toISOString() });
    if (cursor >= head) break;
  }
  return { head, scanned, settled };
}
async function deliverHooks() {
  const { data } = await db.from('pay_invoices').select('*, pay_merchants(webhook_url, webhook_secret)').eq('hook_state', 'pending').lte('hook_next', new Date().toISOString()).limit(25);
  let ok = 0;
  await Promise.all((data || []).map(async (r) => {
    const m = r.pay_merchants as { webhook_url: string | null; webhook_secret: string } | null, url = m && P.safeWebhookUrl(m.webhook_url);
    if (!m || !url) { await db.from('pay_invoices').update({ hook_state: 'none' }).eq('id', r.id); return; }
    const body = JSON.stringify({ event: 'invoice.paid', invoice: P.invoiceView(r, PAY_PAGE, Date.now()) }), ts = Math.floor(Date.now() / 1000);
    let good = false;
    try {
      const res = await fetch(url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', 'user-agent': 'SarraPay/1', 'x-sarra-signature': await P.signWebhook(m.webhook_secret, body, ts) }, body, signal: AbortSignal.timeout(8000) });
      good = res.status >= 200 && res.status < 300; await res.body?.cancel();
    } catch { /* نعيد المحاولة لاحقاً */ }
    if (good) { ok++; await db.from('pay_invoices').update({ hook_state: 'done', hook_attempts: r.hook_attempts + 1 }).eq('id', r.id); return; }
    const n = r.hook_attempts + 1, wait = P.hookBackoffMin(n);
    await db.from('pay_invoices').update(wait == null ? { hook_state: 'failed', hook_attempts: n } : { hook_attempts: n, hook_next: new Date(Date.now() + wait * 60000).toISOString() }).eq('id', r.id);
  }));
  return ok;
}
async function cron() {
  await db.from('pay_invoices').update({ status: 'expired' }).eq('status', 'pending').lt('expires_at', new Date(Date.now() - LATE_GRACE_MIN * 60000).toISOString());
  const { data: pend } = await db.from('pay_invoices').select('id,network,match_hex,exact').eq('status', 'pending').limit(5000);
  const { data: st } = await db.from('push_state').select('chain,last_block').like('chain', 'pay:%');
  const lastOf = Object.fromEntries((st || []).map((s) => [s.chain, Number(s.last_block)]));
  const report: Record<string, unknown> = {};
  await Promise.all(Object.keys(P.NETS).map(async (net) => {
    try { report[net] = await scanNet(net, (pend || []).filter((p) => p.network === net), lastOf['pay:' + net] ?? null); }
    catch (e) { report[net] = 'error: ' + String((e as Error)?.message || e).slice(0, 120); }
  }));
  return { ok: true, pending: (pend || []).length, hooks_sent: await deliverHooks(), report };
}

Deno.serve(async (req) => {
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
      return json({ invoice: { ...P.invoiceView(data, PAY_PAGE, Date.now(), false), kind: data.kind, merchant: data.kind === 'topup' ? 'شحن رصيد بوابة صُرّة' : (data.pay_merchants as { name: string } | null)?.name || '' } });
    }
    if (path === '/v1/merchant' && req.method === 'POST') {
      const { message, signature } = await req.json().catch(() => ({}));
      if (typeof message !== 'string' || typeof signature !== 'string') throw new Error('UNAUTHORIZED');
      const s = L.parseSignedMessage(message, Date.now());
      if (await tw.trx.verifyMessageV2(message, signature) !== s.address) throw new Error('BAD_SIGNATURE');
      if (!String(s.action).startsWith('pay.')) throw new Error('BAD_ACTION');
      const { error } = await db.from('used_nonces').insert({ nonce: s.nonce }); if (error) throw new Error('REPLAY');
      await hit(s.address, 'req', L.LIMITS.req[0], L.LIMITS.req[1]);
      return json(await merchantAction(s.action, s.params as Record<string, unknown>, s.address));
    }
    // ما بعده يحتاج مفتاح API
    if (path === '/v1/invoices' && req.method === 'POST') {
      const me = await merchantByKey(req);
      return json({ invoice: P.invoiceView(await createInvoice(me, await req.json().catch(() => ({})), 'payment'), PAY_PAGE, Date.now()) });
    }
    if ((m = path.match(/^\/v1\/invoices\/(inv_[0-9a-f]{20})$/)) && req.method === 'GET') {
      const me = await merchantByKey(req); await hit('pay:' + me.id, 'pay_read', 600, 60);
      const { data } = await db.from('pay_invoices').select('*').eq('id', m[1]).eq('merchant_id', me.id).maybeSingle();
      if (!data) throw new Error('NOT_FOUND');
      return json({ invoice: P.invoiceView(data, PAY_PAGE, Date.now()) });
    }
    if (path === '/v1/invoices' && req.method === 'GET') {
      const me = await merchantByKey(req); await hit('pay:' + me.id, 'pay_read', 600, 60);
      const q = new URL(req.url).searchParams, lim = Math.min(100, Math.max(1, Number(q.get('limit')) || 20)), st = q.get('status');
      let sel = db.from('pay_invoices').select('*').eq('merchant_id', me.id).eq('kind', 'payment').order('created_at', { ascending: false }).limit(lim);
      if (st && ['pending', 'paid', 'expired'].includes(st)) sel = sel.eq('status', st);
      const { data } = await sel;
      return json({ invoices: (data || []).map((r) => P.invoiceView(r, PAY_PAGE, Date.now())) });
    }
    if (path === '/v1/balance' && req.method === 'GET') {
      const me = await merchantByKey(req);
      return json({ credit: P.fmtUnits(me.credit), currency: 'USDT', fee_pct: FEE_BPS / 100, fee_min: P.fmtUnits(FEE_MIN) });
    }
    return fail('NOT_FOUND');
  } catch (e) {
    const msg = String((e as Error).message || e), code = /^[A-Z_]+$/.test(msg) ? msg : 'SERVER_ERROR';
    if (code === 'SERVER_ERROR') console.error(e);
    return fail(code);
  }
});

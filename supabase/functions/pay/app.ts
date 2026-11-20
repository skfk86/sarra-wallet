// بوابة الدفع للتجار — منطق الخادم كله، بلا اعتماد مباشر على Deno أو الشبكة (تُحقن عبر Deps)
// كي يُختبر في Node بقاعدة بيانات وهمية: test/pay-app.test.ts. الوصف العام في index.ts
import * as L from '../_shared/logic.ts';
import * as P from '../_shared/pay.ts';
import { TRANSFER, topicOf, blockRange } from '../push-watch/logic.ts';
import { AsyncLocalStorage } from 'node:async_hooks';

// deno-lint-ignore no-explicit-any
type Db = any;
export type Deps = {
  db: Db;                                                              // عميل Supabase بصلاحية الخدمة
  verify: (message: string, signature: string) => Promise<string>;     // يعيد عنوان TRON الموقِّع
  rpc: (net: string, method: string, params: unknown[]) => Promise<any>; // JSON-RPC للشبكة
  fetch: typeof fetch;                                                 // لإرسال إشعارات التجار
  now: () => number;
  cfg: { feeBps: number; feeMin: bigint; topup: Record<string, string>; payPage: string; ipLimit?: number };
};

export function createApp(d: Deps) {
  const db = d.db, FEE_BPS = d.cfg.feeBps, FEE_MIN = d.cfg.feeMin, TOPUP = d.cfg.topup, PAY_PAGE = d.cfg.payPage;
  const MAX_PENDING = 200, LATE_GRACE_MIN = 20;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Expose-Headers': 'x-request-id, retry-after' };
  // رقم الطلب وعنوان IP لكل طلب على حدة: الخادم يعالج طلبات متزامنة، والمتغير المشترك كان يخلط بينها
  const als = new AsyncLocalStorage<{ reqId: string; ip: string }>();
  const RQ = () => als.getStore() || { reqId: '', ip: '' };
  // ===== طبقة الحماية الأولى (في الذاكرة، بدون قاعدة بيانات): حد لكل IP، وحجم الطلب =====
  const IP_MAX = d.cfg.ipLimit ?? 120, IP_WIN = 60000, BAD_KEY_MAX = 20, BAD_KEY_WIN = 600000, MAX_BODY = 16384, TEST_TTL_MS = 3 * 60000;
  const mem = new Map<string, { n: number; t: number }>();
  function memHit(k: string, max: number, win: number, add = 1) {
    const now = d.now(); let e = mem.get(k);
    if (!e || now - e.t > win) { e = { n: 0, t: now }; mem.set(k, e); }
    e.n += add;
    if (mem.size > 20000) for (const [kk, v] of mem) if (now - v.t > BAD_KEY_WIN) mem.delete(kk); // تنظيف حتى لا تكبر الذاكرة
    return e.n <= max;
  }
  // عنوان العميل: Netlify ثم بوابة Supabase يضيفان الرأس. بدونه (طلب داخلي) لا يُطبَّق حد الـ IP
  function clientIp(req: Request) {
    const h = req.headers, x = h.get('x-nf-client-connection-ip') || h.get('cf-connecting-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || h.get('x-real-ip') || '';
    return x.trim().slice(0, 64);
  }
  async function readJson(req: Request): Promise<Record<string, any>> {
    const t = await req.text().catch(() => '');
    if (t.length > MAX_BODY) throw new Error('PAYLOAD_TOO_LARGE');
    try { const j = JSON.parse(t || '{}'); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; }
  }
  const json = (data: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'X-Request-Id': RQ().reqId, ...extra } });
  const STATUS: Record<string, number> = { TRY_AGAIN: 409, METHOD_NOT_ALLOWED: 405, ORDER_ID_CONFLICT: 409, BANNED: 403, PAYLOAD_TOO_LARGE: 413, TEST_KEY_REQUIRED: 403, UNAUTHORIZED: 401, BAD_SIGNATURE: 401, REPLAY: 401, INSUFFICIENT_CREDIT: 402, NOT_FOUND: 404, MERCHANT_DISABLED: 403, SERVER_ERROR: 500 };
  // رسالة إنجليزية قصيرة لكل رمز (الرمز ثابت للبرمجة، والرسالة للبشر)
  const MSG: Record<string, string> = {
    UNAUTHORIZED: 'Missing or invalid API key.', TEST_KEY_REQUIRED: 'This endpoint requires a sk_test_ key.', INSUFFICIENT_CREDIT: 'Fee credit is too low. Top up in the Sarra app.',
    BAD_AMOUNT: 'Amount must be a string like "10" or "10.50".', AMOUNT_TOO_SMALL: 'Minimum amount is 1.', AMOUNT_TOO_LARGE: 'Maximum amount is 100000.',
    BAD_NETWORK: 'Unsupported network. Use bsc, tron, polygon or eth.', BAD_CURRENCY: 'Unsupported currency for this network.', NETWORK_NOT_CONFIGURED: 'No receiving address for this network in your account.',
    METHOD_NOT_ALLOWED: 'This HTTP method is not allowed on this path.', BAD_STATUS_FILTER: 'status must be pending, paid, expired or cancelled.', BAD_CURSOR: 'before must be the id of one of your invoices.', ORDER_ID_CONFLICT: 'This order_id already has an active invoice with a different amount, network or currency. Cancel it first or use a new order_id.', BAD_ORDER_ID: 'order_id may contain letters, digits and . : - _ (max 64).', BAD_METADATA: 'metadata must be a flat JSON object (max 20 keys, 2000 chars).', BAD_SUCCESS_URL: 'success_url must be an https URL.',
    TOO_MANY_PENDING: 'Too many pending invoices.', PAYLOAD_TOO_LARGE: 'Request body is too large (max 16 KB).', BANNED: 'This account is suspended.', RATE_LIMITED: 'Too many requests. Retry later.', NOT_FOUND: 'Not found.', NOT_PENDING: 'Invoice is not pending.',
    NOT_TEST_INVOICE: 'Only test invoices can be simulated.', BAD_STATUS: 'status must be paid or expired.', MERCHANT_DISABLED: 'Merchant account is disabled.', SERVER_ERROR: 'Internal error. Retry later.', TRY_AGAIN: 'Temporary conflict. Retry.'
  };
  const fail = (code: string) => {
    const st = code.startsWith('RATE_LIMITED') ? 429 : STATUS[code] || 400;
    return json({ error: code, message: MSG[code] || code, request_id: RQ().reqId }, st, st === 429 ? { 'Retry-After': '60' } : {});
  };

  type Merchant = { id: string; address: string; name: string; tron_addr: string | null; evm_addr: string | null; key_hint: string | null; test_key_hint?: string | null; webhook_url: string | null; webhook_secret: string; credit: string | number; active: boolean };

  async function hit(who: string, kind: string, max: number, win: number) {
    const { data, error } = await db.rpc('p2p_hit', { p_addr: who, p_kind: kind, p_max: max, p_window_secs: win });
    if (error) throw new Error('SERVER_ERROR');
    if (!data) throw new Error('RATE_LIMITED');
  }
  // المفتاح يحدد الوضع: sk_live_ فواتير حقيقية، sk_test_ فواتير تجريبية. لا يرى أحدهما فواتير الآخر
  async function merchantByKey(req: Request): Promise<{ me: Merchant; test: boolean }> {
    const h = req.headers.get('authorization') || '', key = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    // من يجرّب مفاتيح خاطئة كثيرة يُحظر 10 دقائق (في الذاكرة ثم في قاعدة البيانات عبر كل النسخ)
    // المفتاح الصحيح لا يُحظر أبداً (حتى لا يستطيع أحد حظر تاجر بانتحال عنوانه)؛ الحظر يطال المحاولات الخاطئة فقط
    const badKey = async () => {
      const ip = RQ().ip;
      if (ip) {
        if (!memHit('bad:' + ip, BAD_KEY_MAX, BAD_KEY_WIN)) throw new Error('RATE_LIMITED');
        await hit('ip:' + ip, 'pay_badkey', BAD_KEY_MAX, 600);
      }
      throw new Error('UNAUTHORIZED');
    };
    const m = /^sk_(live|test)_[0-9a-f]{48}$/.exec(key); if (!m) return await badKey();
    const test = m[1] === 'test';
    const { data } = await db.from('pay_merchants').select('*').eq(test ? 'test_key_hash' : 'key_hash', await P.sha256Hex(key)).maybeSingle();
    if (!data) return await badKey();
    if (!data.active) throw new Error('MERCHANT_DISABLED');
    return { me: data as Merchant, test };
  }

  // ===== إنشاء فاتورة (دفع لتاجر، أو شحن رصيد إلى عنواننا) =====
  async function createInvoice(m: Merchant, p: Record<string, unknown>, kind: 'payment' | 'topup', test = false) {
    const net = String(p.network || ''); if (!P.hasNet(net)) throw new Error('BAD_NETWORK'); const N = P.NETS[net];
    const currency = kind === 'topup' ? 'USDT' : String(p.currency || 'USDT').toUpperCase();
    if (!P.tokenOf(net, currency)) throw new Error('BAD_CURRENCY');
    const metadata = P.parseMetadata(p.metadata);
    const success_url = p.success_url == null || p.success_url === '' ? null : P.safeReturnUrl(p.success_url);
    if (p.success_url && !success_url) throw new Error('BAD_SUCCESS_URL');
    const address = kind === 'topup' ? TOPUP[N.kind] : (N.kind === 'tron' ? m.tron_addr : m.evm_addr);
    const mh = P.matchHex(net, address); if (!address || !mh) throw new Error('NETWORK_NOT_CONFIGURED');
    const amount = P.parseAmount(p.amount);
    const fee = kind === 'payment' ? P.feeUnits(amount, FEE_BPS, FEE_MIN) : 0n;
    if (kind === 'payment' && !test && BigInt(m.credit) < fee) throw new Error('INSUFFICIENT_CREDIT'); // التجريبية لا تخصم شيئاً
    const order_id = p.order_id == null || p.order_id === '' ? null : String(p.order_id);
    if (order_id && !/^[\w.:\-]{1,64}$/.test(order_id)) throw new Error('BAD_ORDER_ID');
    const description = p.description == null ? null : String(p.description).slice(0, 140);
    const mins = Math.min(120, Math.max(10, Number(p.expires_min) || 30));
    const existing = async () => order_id ? (await db.from('pay_invoices').select('*').eq('merchant_id', m.id).eq('test', test).eq('order_id', order_id).in('status', ['pending', 'paid']).maybeSingle()).data : null;
    // نفس رقم الطلب ببيانات مختلفة (مبلغ أو شبكة أو عملة) خطأ صريح، لا الفاتورة القديمة بصمت: وإلا قد يدفع العميل مبلغ السلة القديم
    const same = (r: Record<string, any>) => String(r.amount) === amount.toString() && r.network === net && (r.currency || 'USDT') === currency && r.kind === kind;
    const dup = await existing(); if (dup) { if (!same(dup)) throw new Error('ORDER_ID_CONFLICT'); return dup; } // إعادة إرسال الطلب نفسه لا تنشئ فاتورة ثانية
    await hit('pay:' + m.id, test ? 'pay_inv_test' : 'pay_inv', 300, 3600);
    const { data: open } = await db.from('pay_invoices').select('fee').eq('merchant_id', m.id).eq('test', test).eq('status', 'pending').limit(MAX_PENDING + 1);
    if ((open || []).length >= MAX_PENDING) throw new Error('TOO_MANY_PENDING');
    // الرصيد يجب أن يغطي عمولات الفواتير المعلّقة كلها، لا الفاتورة الجديدة وحدها (وإلا قد يصبح سالباً)
    if (kind === 'payment' && !test && BigInt(m.credit) < fee + (open || []).reduce((a: bigint, r: { fee: string | number }) => a + BigInt(r.fee || 0), 0n)) throw new Error('INSUFFICIENT_CREDIT');
    for (let i = 0; i < 6; i++) {
      const row = { id: P.newInvoiceId(), merchant_id: m.id, kind, network: net, address, match_hex: mh, amount: amount.toString(), exact: P.exactUnits(amount, P.randTail()).toString(),
        fee: fee.toString(), order_id, description, test, currency, metadata, success_url, expires_at: new Date(d.now() + mins * 60000).toISOString() };
      const { data, error } = await db.from('pay_invoices').insert(row).select().maybeSingle();
      if (data) {
        // فحص ثانٍ بعد الإدراج يغلق سباق الطلبات المتزامنة: إن تجاوزت العمولات المعلّقة الرصيد نحذف فاتورتنا
        if (kind === 'payment' && !test) {
          const { data: cur } = await db.from('pay_merchants').select('credit').eq('id', m.id).maybeSingle();
          const { data: all } = await db.from('pay_invoices').select('fee').eq('merchant_id', m.id).eq('test', false).eq('status', 'pending').limit(MAX_PENDING + 50);
          const owed = (all || []).reduce((a: bigint, r: { fee: string | number }) => a + BigInt(r.fee || 0), 0n);
          if (cur && BigInt(cur.credit) < owed) { await db.from('pay_invoices').delete().eq('id', data.id).eq('status', 'pending'); throw new Error('INSUFFICIENT_CREDIT'); }
        }
        return data;
      }
      if (error?.code !== '23505') throw new Error('SERVER_ERROR');
      const d2 = await existing(); if (d2) { if (!same(d2)) throw new Error('ORDER_ID_CONFLICT'); return d2; } // سباق على رقم الطلب نفسه
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
    if (action === 'pay.hooks') { // آخر محاولات الإشعار
      const { data } = await db.from('pay_hook_log').select('invoice_id,event,status,ok,at').eq('merchant_id', cur.id).order('at', { ascending: false }).limit(30);
      return { hooks: data || [] };
    }
    if (action === 'pay.resend') { // إعادة إرسال إشعار فاتورة منتهية الحالة (مدفوعة/منتهية/ملغاة)
      await hit(me, 'pay_resend', 30, 86400);
      const id = String(p.id || ''); if (!/^inv_[0-9a-f]{20}$/.test(id)) throw new Error('NOT_FOUND');
      const { data: r } = await db.from('pay_invoices').select('*').eq('id', id).eq('merchant_id', cur.id).eq('kind', 'payment').maybeSingle();
      if (!r) throw new Error('NOT_FOUND');
      const ev = P.hookEventOf(r.status); if (!ev) throw new Error('NOT_FINAL');
      if (!P.safeWebhookUrl(cur.webhook_url)) throw new Error('NO_WEBHOOK_URL');
      await db.from('pay_invoices').update({ hook_state: 'pending', hook_event: ev, hook_next: new Date(d.now()).toISOString(), hook_attempts: 0 }).eq('id', id);
      await deliverHooks(id);
      const { data: last } = await db.from('pay_hook_log').select('status,ok').eq('invoice_id', id).order('at', { ascending: false }).limit(1);
      return { ok: !!last?.[0]?.ok, status: last?.[0]?.status ?? 0 };
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
      const rg: [number, number] | null = cursor == null ? [head - N.cap + 1, head] : blockRange(cursor, head, N.cap, N.cap * 200) /* بعد انقطاع طويل نلحق تدريجياً بدل القفز وتفويت التحويلات */;
      if (!rg) break;
      // كل عملة لها عقدها: نستعلم سجلات كل عقد على حدة، ونطابق فواتير تلك العملة فقط
      for (const cur of [...new Set(pending.map((p) => p.currency || 'USDT'))]) {
        const tk = P.tokenOf(net, cur); if (!tk) continue;
        const pc = pending.filter((p) => (p.currency || 'USDT') === cur);
        const hexes = [...new Set(pc.map((p) => p.match_hex))], logs: unknown[] = [];
        const base = { fromBlock: hx(rg[0]), toBlock: hx(rg[1]), address: tk.token };
        // TRON: استعلام لكل عنوان (فلتر «أو» غير مضمون في خادمها)؛ البقية على دفعات
        // (كان يُقصّ عند 40 عنواناً فتُفوَّت تحويلات بقية التجار) — كل العناوين تُستعلم الآن
        const groups = N.kind === 'tron' ? hexes.map((h) => [h]) : Array.from({ length: Math.ceil(hexes.length / 50) }, (_, i) => hexes.slice(i * 50, i * 50 + 50));
        for (const g of groups) logs.push(...(await d.rpc(net, 'eth_getLogs', [{ ...base, topics: [TRANSFER, null, g.length === 1 ? topicOf(g[0]) : g.map(topicOf)] }]) || []));
        for (const h of P.matchLogs(net, logs as any[], pc, cur)) {
          const { data } = await db.rpc('pay_settle', { p_id: h.id, p_tx: h.tx, p_key: h.key, p_payer: h.from });
          if (data) settled++;
        }
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
      // حجز الإشعار قبل إرساله: الماسح وزر الإلغاء/المحاكاة قد يلتقطان الفاتورة نفسها معاً فيُرسل الإشعار مرتين.
      // من ينجح في تغيير hook_next يرسل، والآخر يتركه. إن توقف الخادم أثناء الإرسال يُعاد بعد دقيقتين تلقائياً
      const { data: claimed } = await db.from('pay_invoices').update({ hook_next: new Date(d.now() + 120000).toISOString() })
        .eq('id', r.id).eq('hook_state', 'pending').eq('hook_next', r.hook_next).select('id').maybeSingle();
      if (!claimed) return;
      const m = r.pay_merchants as { webhook_url: string | null; webhook_secret: string } | null, url = m && P.safeWebhookUrl(m.webhook_url);
      if (!m || !url) { await db.from('pay_invoices').update({ hook_state: 'none' }).eq('id', r.id); return; }
      const event = r.hook_event || P.hookEventOf(r.status) || 'invoice.paid';
      const res = await sendHook(url, m.webhook_secret, { event, invoice: P.invoiceView(r, PAY_PAGE, d.now()) }), good = res.ok; // الفشل يُعاد لاحقاً
      await db.from('pay_hook_log').insert({ merchant_id: r.merchant_id, invoice_id: r.id, event, status: res.status, ok: good });
      if (good) { ok++; await db.from('pay_invoices').update({ hook_state: 'done', hook_attempts: r.hook_attempts + 1 }).eq('id', r.id); return; }
      const n = r.hook_attempts + 1, wait = P.hookBackoffMin(n);
      await db.from('pay_invoices').update(wait == null ? { hook_state: 'failed', hook_attempts: n } : { hook_attempts: n, hook_next: new Date(d.now() + wait * 60000).toISOString() }).eq('id', r.id);
    }));
    return ok;
  }
  // الفواتير التجريبية لا تبقى: تُحذف هي وسجل إشعاراتها بعد 3 دقائق من وصولها لحالتها النهائية
  async function purgeTest() {
    const cut = new Date(d.now() - TEST_TTL_MS).toISOString(), ids: string[] = [];
    for (const [st, col] of [['paid', 'paid_at'], ['cancelled', 'cancelled_at'], ['expired', 'expires_at']] as const) {
      const { data } = await db.from('pay_invoices').select('id').eq('test', true).eq('status', st).lt(col, cut).limit(500);
      (data || []).forEach((r: { id: string }) => ids.push(r.id));
    }
    if (!ids.length) return 0;
    await db.from('pay_hook_log').delete().in('invoice_id', ids);
    await db.from('pay_invoices').delete().eq('test', true).in('id', ids);
    return ids.length;
  }
  async function cron() {
    // انتهاء المهلة (بعد فترة سماح للدفع المتأخر): فواتير الدفع ترسل invoice.expired، وفواتير الشحن لا ترسل شيئاً
    // المسح أولاً ثم إنهاء المهلة: تحويل وصل قبل انتهاء المهلة لا يضيع لأن الماسح متأخر قليلاً
    const { data: pend } = await db.from('pay_invoices').select('id,network,match_hex,exact,currency').eq('status', 'pending').eq('test', false).limit(5000); // التجريبية لا تُراقَب
    const { data: st } = await db.from('push_state').select('chain,last_block').like('chain', 'pay:%');
    const lastOf = Object.fromEntries((st || []).map((s) => [s.chain, Number(s.last_block)]));
    const report: Record<string, unknown> = {};
    await Promise.all(Object.keys(P.NETS).map(async (net) => {
      try { report[net] = await scanNet(net, (pend || []).filter((p) => p.network === net), lastOf['pay:' + net] ?? null); }
      catch (e) { report[net] = 'error: ' + String((e as Error)?.message || e).slice(0, 120); }
    }));
    const cut = new Date(d.now() - LATE_GRACE_MIN * 60000).toISOString(), nowIso = new Date(d.now()).toISOString();
    await db.from('pay_invoices').update({ status: 'expired', hook_state: 'pending', hook_event: 'invoice.expired', hook_next: nowIso, hook_attempts: 0 }).eq('status', 'pending').eq('kind', 'payment').eq('test', false).lt('expires_at', cut);
    // التجريبية لا تُدفع فعلياً، فلا فترة سماح لها
    await db.from('pay_invoices').update({ status: 'expired', hook_state: 'pending', hook_event: 'invoice.expired', hook_next: nowIso, hook_attempts: 0 }).eq('status', 'pending').eq('kind', 'payment').eq('test', true).lt('expires_at', nowIso);
    await db.from('pay_invoices').update({ status: 'expired' }).eq('status', 'pending').eq('kind', 'topup').lt('expires_at', cut);
    await db.from('pay_hook_log').delete().lt('at', new Date(d.now() - 30 * 86400000).toISOString());
    // تنظيف سجلات حدود الطلبات والـ nonce القديمة: الصفحة العامة تضيف سجلاً مع كل تحديث، فلا ننتظر خادم P2P لينظّفها
    if (new Date(d.now()).getUTCMinutes() % 10 === 0) await db.rpc('p2p_cleanup').then(() => {}, () => {});
    const hooks_sent = await deliverHooks();
    return { ok: true, pending: (pend || []).length, hooks_sent, test_deleted: await purgeTest(), report };
  }

  // ===== محاكاة الدفع للفواتير التجريبية فقط (لا مال ولا شبكة) =====
  async function simulate(row: Record<string, any> | null, status: string) {
    if (!row) throw new Error('NOT_FOUND');
    if (!row.test) throw new Error('NOT_TEST_INVOICE');
    if (row.status !== 'pending') throw new Error('NOT_PENDING');
    if (status !== 'paid' && status !== 'expired') throw new Error('BAD_STATUS');
    const now = new Date(d.now()).toISOString();
    const upd = status === 'paid'
      ? { status: 'paid', tx: '0xtest' + P.newInvoiceId().slice(4), payer: 'test', paid_at: now, hook_state: 'pending', hook_event: 'invoice.paid', hook_next: now, hook_attempts: 0 }
      : { status: 'expired', expires_at: now, hook_state: 'pending', hook_event: 'invoice.expired', hook_next: now, hook_attempts: 0 };
    const { data } = await db.from('pay_invoices').update(upd).eq('id', row.id).eq('status', 'pending').eq('test', true).select('*').maybeSingle();
    if (!data) throw new Error('NOT_PENDING');
    await deliverHooks(row.id); // الإشعار فوراً، والفشل يُعاد كالمعتاد
    return (await db.from('pay_invoices').select('*').eq('id', row.id).maybeSingle()).data;
  }

  // إلغاء فاتورة معلّقة (العميل تراجع مثلاً). تحويل يصل بعدها لا يسددها، ويصل إلى محفظة التاجر كأي تحويل
  async function cancelInvoice(row: Record<string, any> | null) {
    if (!row) throw new Error('NOT_FOUND');
    if (row.status !== 'pending') throw new Error('NOT_PENDING');
    const now = new Date(d.now()).toISOString();
    const { data } = await db.from('pay_invoices').update({ status: 'cancelled', cancelled_at: now, hook_state: row.kind === 'payment' ? 'pending' : 'none', hook_event: 'invoice.cancelled', hook_next: now, hook_attempts: 0 })
      .eq('id', row.id).eq('status', 'pending').select('*').maybeSingle();
    if (!data) throw new Error('NOT_PENDING');
    await deliverHooks(row.id);
    return (await db.from('pay_invoices').select('*').eq('id', row.id).maybeSingle()).data;
  }

  function handle(req: Request): Promise<Response> {
    return als.run({ reqId: 'req_' + P.randHex(8), ip: clientIp(req) }, () => handleIn(req));
  }
  async function handleIn(req: Request): Promise<Response> {
    const { reqId, ip } = RQ();
    if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...cors, 'X-Request-Id': reqId } });
    const path = new URL(req.url).pathname.replace(/^.*?\/pay(?=\/|$)/, '').replace(/\/+$/, '') || '/';
    try {
      if (ip && !memHit('ip:' + ip, IP_MAX, IP_WIN)) throw new Error('RATE_LIMITED');
      const len = Number(req.headers.get('content-length') || 0); if (len > MAX_BODY) throw new Error('PAYLOAD_TOO_LARGE');
      if (path === '/cron' && req.method === 'POST') {
        const { data: cfg } = await db.from('push_cfg').select('v').eq('k', 'cron_secret').maybeSingle();
        if (!cfg || req.headers.get('x-cron') !== cfg.v) return new Response('forbidden', { status: 403 });
        return json(await cron());
      }
      let m: RegExpMatchArray | null;
      if ((m = path.match(/^\/v1\/public\/(inv_[0-9a-f]{20})$/)) && req.method === 'GET') {
        // الحد في الذاكرة لا يكفي وحده (الخادم يعمل بنسخ كثيرة)، فالصفحة العامة لها حد في قاعدة البيانات أيضاً
        if (ip) await hit('ip:' + ip, 'pay_pub', 300, 60);
        const { data } = await db.from('pay_invoices').select('*, pay_merchants(name)').eq('id', m[1]).maybeSingle();
        if (!data) throw new Error('NOT_FOUND');
        return json({ invoice: { ...P.invoiceView(data, PAY_PAGE, d.now(), false), kind: data.kind, merchant: data.kind === 'topup' ? 'شحن رصيد بوابة صُرّة' : (data.pay_merchants as { name: string } | null)?.name || '' } });
      }
      if ((m = path.match(/^\/v1\/public\/(inv_[0-9a-f]{20})\/simulate$/)) && req.method === 'POST') { // زر «محاكاة الدفع» في صفحة الدفع
        await hit('pub:' + m[1], 'pay_sim', 5, 3600); if (ip) await hit('ip:' + ip, 'pay_sim_ip', 30, 3600);
        const { data } = await db.from('pay_invoices').select('*').eq('id', m[1]).maybeSingle();
        return json({ invoice: P.invoiceView(await simulate(data, 'paid'), PAY_PAGE, d.now(), false) });
      }
      if (path === '/v1/merchant' && req.method === 'POST') {
        const { message, signature } = await readJson(req);
        if (typeof message !== 'string' || typeof signature !== 'string') throw new Error('UNAUTHORIZED');
        const s = L.parseSignedMessage(message, d.now());
        if (await d.verify(message, signature) !== s.address) throw new Error('BAD_SIGNATURE');
        if (!String(s.action).startsWith('pay.')) throw new Error('BAD_ACTION');
        const { error } = await db.from('used_nonces').insert({ nonce: s.nonce }); if (error) throw new Error('REPLAY');
        await hit(s.address, 'req', L.LIMITS.req[0], L.LIMITS.req[1]);
        const { data: pf } = await db.from('profiles').select('banned').eq('address', s.address).maybeSingle();
        if (pf?.banned) throw new Error('BANNED');
        return json(await merchantAction(s.action, s.params as Record<string, unknown>, s.address));
      }
      // ما بعده يحتاج مفتاح API
      if (path === '/v1/invoices' && req.method === 'POST') {
        const { me, test } = await merchantByKey(req);
        return json({ invoice: P.invoiceView(await createInvoice(me, await readJson(req), 'payment', test), PAY_PAGE, d.now()) });
      }
      if ((m = path.match(/^\/v1\/invoices\/(inv_[0-9a-f]{20})\/simulate$/)) && req.method === 'POST') {
        const { me, test } = await merchantByKey(req); if (!test) throw new Error('TEST_KEY_REQUIRED');
        await hit('pay:' + me.id, 'pay_sim_api', 120, 3600);
        const body = await readJson(req);
        const { data } = await db.from('pay_invoices').select('*').eq('id', m[1]).eq('merchant_id', me.id).eq('test', true).maybeSingle();
        return json({ invoice: P.invoiceView(await simulate(data, String(body.status || 'paid')), PAY_PAGE, d.now()) });
      }
      if ((m = path.match(/^\/v1\/invoices\/(inv_[0-9a-f]{20})\/cancel$/)) && req.method === 'POST') {
        const { me, test } = await merchantByKey(req); await hit('pay:' + me.id, 'pay_cancel', 300, 3600);
        const { data } = await db.from('pay_invoices').select('*').eq('id', m[1]).eq('merchant_id', me.id).eq('test', test).maybeSingle();
        return json({ invoice: P.invoiceView(await cancelInvoice(data), PAY_PAGE, d.now()) });
      }
      if ((m = path.match(/^\/v1\/invoices\/(inv_[0-9a-f]{20})$/)) && req.method === 'GET') {
        const { me, test } = await merchantByKey(req); await hit('pay:' + me.id, 'pay_read', 600, 60);
        const { data } = await db.from('pay_invoices').select('*').eq('id', m[1]).eq('merchant_id', me.id).eq('test', test).maybeSingle();
        if (!data) throw new Error('NOT_FOUND');
        return json({ invoice: P.invoiceView(data, PAY_PAGE, d.now()) });
      }
      if (path === '/v1/invoices' && req.method === 'GET') {
        const { me, test } = await merchantByKey(req); await hit('pay:' + me.id, 'pay_read', 600, 60);
        const q = new URL(req.url).searchParams, lim = Math.min(100, Math.max(1, Number(q.get('limit')) || 20)), st = q.get('status'), before = q.get('before');
        if (st && !['pending', 'paid', 'expired', 'cancelled'].includes(st)) throw new Error('BAD_STATUS_FILTER');
        let sel = db.from('pay_invoices').select('*').eq('merchant_id', me.id).eq('kind', 'payment').eq('test', test).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(lim + 1);
        if (st) sel = sel.eq('status', st);
        // الصفحة التالية: before = رقم آخر فاتورة في الصفحة السابقة
        if (before) {
          if (!/^inv_[0-9a-f]{20}$/.test(before)) throw new Error('BAD_CURSOR');
          const { data: cur } = await db.from('pay_invoices').select('created_at').eq('id', before).eq('merchant_id', me.id).maybeSingle();
          if (!cur) throw new Error('BAD_CURSOR');
          sel = sel.or(`created_at.lt."${cur.created_at}",and(created_at.eq."${cur.created_at}",id.lt.${before})`); // الترتيب بالوقت ثم الرقم: لا تكرار ولا فقدان عند تساوي الوقت
        }
        const rows = (await sel).data || [];
        return json({ invoices: rows.slice(0, lim).map((r) => P.invoiceView(r, PAY_PAGE, d.now())), has_more: rows.length > lim });
      }
      if (path === '/v1/balance' && req.method === 'GET') {
        const { me, test } = await merchantByKey(req); await hit('pay:' + me.id, 'pay_read', 600, 60);
        return json({ test, credit: P.fmtUnits(me.credit), currency: 'USDT', fee_pct: FEE_BPS / 100, fee_min: P.fmtUnits(FEE_MIN) });
      }
      // مسار موجود بطريقة خاطئة (GET بدل POST مثلاً): 405 بدل «غير موجود»
      if (/^\/v1\/(invoices(\/inv_[0-9a-f]{20}(\/(cancel|simulate))?)?|balance|merchant|public\/inv_[0-9a-f]{20}(\/simulate)?)$/.test(path)) return fail('METHOD_NOT_ALLOWED');
      return fail('NOT_FOUND');
    } catch (e) {
      const msg = String((e as Error).message || e), code = /^[A-Z_]+$/.test(msg) ? msg : 'SERVER_ERROR';
      if (code === 'SERVER_ERROR') console.error(e);
      return fail(code);
    }
  }
  return { handle, cron };
}

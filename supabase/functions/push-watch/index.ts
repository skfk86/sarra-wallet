// ماسح الإشعارات الفورية: تستدعيه الجدولة (pg_cron) كل دقيقة.
// يقرأ تحويلات USDT/USDC الجديدة في كل شبكة بطلب واحد مفلتر بعناوين المستخدمين المسجّلين (eth_getLogs)،
// ثم يرسل إشعار Firebase للأجهزة. التكلفة ثابتة تقريباً مهما زاد عدد المستخدمين.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import * as L from './logic.ts';

const env = (k: string, d = '') => (Deno.env.get(k) ?? d).trim();
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const TRON_KEY = env('TRONGRID_API_KEY');

const CHAINS: Record<string, { rpcs: string[]; toks: L.Tok[]; cap: number; jump: number; headers?: Record<string, string> }> = {
  tron: { rpcs: ['https://api.trongrid.io/jsonrpc'], headers: TRON_KEY ? { 'TRON-PRO-API-KEY': TRON_KEY } : {}, cap: 60, jump: 600,
    toks: [{ sym: 'USDT', addr: '0xa614f803b6fd780986a42c78ec9c7f77e6ded13c', dec: 6 }] },
  bsc: { rpcs: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org'], cap: 80, jump: 800,
    toks: [{ sym: 'USDT', addr: '0x55d398326f99059fF775485246999027B3197955', dec: 18 }, { sym: 'USDC', addr: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', dec: 18 }] },
  polygon: { rpcs: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'], cap: 100, jump: 1000,
    toks: [{ sym: 'USDT', addr: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', dec: 6 }, { sym: 'USDC', addr: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', dec: 6 }] },
  eth: { rpcs: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'], cap: 25, jump: 250,
    toks: [{ sym: 'USDT', addr: '0xdAC17F958D2ee523a2206206994597C13D831EC7', dec: 6 }, { sym: 'USDC', addr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', dec: 6 }] }
};
const MIN_USD = 0.1; // أقل من 10 سنتات: غبار/تسميم عناوين، لا نزعج المستخدم

async function rpc(chain: string, method: string, params: unknown[]) {
  const c = CHAINS[chain]; let last: unknown;
  for (const u of c.rpcs) {
    try {
      const call = async (m: string, pr: unknown[]) => {
        const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', ...(c.headers || {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: pr }), signal: AbortSignal.timeout(12000) });
        const j = await r.json(); if (j.error) throw new Error(j.error.message || 'RPC'); return j.result;
      };
      // خادم متأخر عن نهاية النطاق يعيد سجلات ناقصة بلا خطأ، فتضيع إشعارات: نتخطاه إلى غيره
      if (method === 'eth_getLogs') {
        const to = parseInt(String((params[0] as { toBlock?: string })?.toBlock || '0'), 16);
        if (to && parseInt(await call('eth_blockNumber', []), 16) < to) throw new Error('RPC_BEHIND');
      }
      return await call(method, params);
    } catch (e) { last = e; }
  }
  throw last;
}
const hex = (n: number) => '0x' + n.toString(16);

// ===== Firebase (HTTP v1) بمفتاح حساب الخدمة =====
let fcmTok: { t: string; exp: number } | null = null;
const sa = (() => { try { return JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') || ''); } catch { return null; } })();
const b64u = (b: ArrayBuffer | Uint8Array | string) => btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function fcmAccess() {
  if (fcmTok && fcmTok.exp > Date.now() + 60000) return fcmTok.t;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const der = Uint8Array.from(atob(String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + claim));
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + claim + '.' + b64u(sig) });
  const j = await r.json(); if (!j.access_token) throw new Error('FCM_AUTH');
  fcmTok = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; return fcmTok.t;
}
async function send(token: string, e: L.Ev): Promise<'ok' | 'gone' | 'err'> {
  return fcm(token, L.message(e), { kind: e.kind, chain: e.chain, sym: e.sym, amount: e.amount, tx: e.tx }, e.key);
}
// visibility PRIVATE: على شاشة القفل الآمنة يظهر «صُرّة» فقط بلا مبالغ ولا نص المحادثة (حسب إعداد الهاتف لإخفاء المحتوى الحساس)
async function fcm(token: string, m: { title: string; body: string }, data: Record<string, string>, tag: string): Promise<'ok' | 'gone' | 'err'> {
  const r = await fetch('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', {
    method: 'POST', headers: { authorization: 'Bearer ' + await fcmAccess(), 'content-type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: m, data,
      android: { priority: 'HIGH', notification: { channel_id: 'tx2', sound: 'coin', icon: 'ic_stat_coin', color: '#16A37A', tag, visibility: 'PRIVATE' } } } })
  });
  if (r.ok) return 'ok';
  const t = await r.text();
  return r.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT.*token/i.test(t) ? 'gone' : 'err';
}

Deno.serve(async (req) => {
  const { data: cfg } = await db.from('push_cfg').select('v').eq('k', 'cron_secret').maybeSingle();
  if (!cfg || req.headers.get('x-cron') !== cfg.v) return new Response('forbidden', { status: 403 });
  if (!sa || !sa.private_key) return Response.json({ ok: false, error: 'FCM_SERVICE_ACCOUNT_MISSING' });

  // الأجهزة المسجّلة: hex20 → رموز (للتحويلات)، وعنوان المحفظة → رموز (لإشعارات P2P)
  const toksByHex: Record<string, Record<string, string[]>> = { tron: {}, evm: {} }, toksByAddr: Record<string, string[]> = {};
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('push_tokens').select('token,address,evm').range(from, from + 999);
    for (const r of data || []) {
      (toksByAddr[r.address] ||= []).push(r.token);
      const th = L.tronToHex20(r.address); if (th) (toksByHex.tron[th] ||= []).push(r.token);
      const eh = String(r.evm || '').toLowerCase().replace(/^0x/, ''); if (/^[0-9a-f]{40}$/.test(eh)) (toksByHex.evm[eh] ||= []).push(r.token);
    }
    if (!data || data.length < 1000) break;
  }
  const { data: states } = await db.from('push_state').select('chain,last_block');
  const lastOf = Object.fromEntries((states || []).map((s) => [s.chain, Number(s.last_block)]));
  const report: Record<string, unknown> = {}, events: L.Ev[] = [];

  await Promise.all(Object.keys(CHAINS).map(async (chain) => {
    try {
      const c = CHAINS[chain], map = chain === 'tron' ? toksByHex.tron : toksByHex.evm, mine = Object.keys(map);
      const latest = parseInt(await rpc(chain, 'eth_blockNumber', []), 16);
      const rg = L.blockRange(lastOf[chain] ?? null, latest, c.cap, c.jump); if (!rg) { report[chain] = 'up-to-date'; return; }
      if (mine.length) {
        const ours = new Set(mine), logs: any[] = [];
        for (let i = 0; i < mine.length; i += 50) { // نفلتر بعناويننا (مستلِم ومرسِل) على دفعات
          const topics = mine.slice(i, i + 50).map(L.topicOf);
          const base = { fromBlock: hex(rg[0]), toBlock: hex(rg[1]), address: c.toks.map((t) => t.addr) };
          const [a, b] = await Promise.all([
            rpc(chain, 'eth_getLogs', [{ ...base, topics: [L.TRANSFER, null, topics] }]),
            rpc(chain, 'eth_getLogs', [{ ...base, topics: [L.TRANSFER, topics] }])
          ]);
          logs.push(...(a || []), ...(b || []));
        }
        const ev = L.eventsFromLogs(chain, logs, c.toks, ours, (t) => BigInt(Math.round(MIN_USD * 1e6)) * 10n ** BigInt(Math.max(0, t.dec - 6)));
        for (const e of ev) events.push(e);
        report[chain] = { blocks: rg, events: ev.length };
      } else report[chain] = { blocks: rg, idle: true };
      // نحفظ التقدّم قبل الإرسال: الأفضل أن يفوت إشعار نادر من أن يتكرر
      await db.from('push_state').upsert({ chain, last_block: rg[1], updated_at: new Date().toISOString() });
    } catch (e) { report[chain] = 'error: ' + String((e as Error)?.message || e).slice(0, 120); }
  }));

  let sent = 0; const gone = new Set<string>();
  for (const e of events) {
    const tokens = (e.chain === 'tron' ? toksByHex.tron : toksByHex.evm)[e.hex] || [];
    const res = await Promise.all(tokens.map((t) => send(t, e).catch(() => 'err' as const)));
    res.forEach((r, i) => { if (r === 'ok') sent++; if (r === 'gone') gone.add(tokens[i]); });
  }
  // ===== P2P: تغيّرات حالة الطلبات ورسائل المحادثة منذ الدورة السابقة =====
  try {
    const ADMINS = env('ADMIN_ADDRESSES').split(',').map((x) => x.trim()).filter(Boolean);
    const runAt = new Date().toISOString(), since = new Date(lastOf['p2p'] || Date.now() - 120000).toISOString();
    const { data: ch } = await db.from('orders').select('id,status,buyer,seller,amount_usdt,total_sdg').gt('updated_at', since).order('updated_at').limit(500);
    const { data: msgs } = await db.from('messages').select('order_id,sender,body').gt('created_at', since).order('id').limit(500);
    const pushes: L.P2PPush[] = [];
    if (ch && ch.length) {
      // آخر حالة أُبلغ عنها لكل طلب: تحديث لا يغيّر الحالة (رسالة، رفع إيصال) لا يكرر إشعار الحالة
      const { data: seen } = await db.from('p2p_push_seen').select('order_id,status').in('order_id', ch.map((o) => o.id));
      const was = Object.fromEntries((seen || []).map((x) => [x.order_id, x.status]));
      const fresh = ch.filter((o) => was[o.id] !== o.status);
      for (const o of fresh) pushes.push(...L.p2pStatusPushes(o as L.P2POrder, ADMINS));
      if (fresh.length) await db.from('p2p_push_seen').upsert(fresh.map((o) => ({ order_id: o.id, status: o.status, at: runAt })));
    }
    if (msgs && msgs.length) {
      const ids = [...new Set(msgs.map((m) => m.order_id))];
      const { data: os } = await db.from('orders').select('id,status,buyer,seller,amount_usdt,total_sdg').in('id', ids);
      pushes.push(...L.p2pMessagePushes(msgs, Object.fromEntries((os || []).map((o) => [o.id, o as L.P2POrder]))));
    }
    await db.from('push_state').upsert({ chain: 'p2p', last_block: Date.parse(runAt), updated_at: runAt });
    let ps = 0;
    for (const p of pushes) {
      const tokens = toksByAddr[p.to] || [];
      const res = await Promise.all(tokens.map((t) => fcm(t, { title: p.title, body: p.body }, { kind: 'p2p', order: p.order }, p.tag).catch(() => 'err' as const)));
      res.forEach((r, i) => { if (r === 'ok') ps++; if (r === 'gone') gone.add(tokens[i]); });
    }
    report.p2p = { changes: ch?.length || 0, messages: msgs?.length || 0, sent: ps };
  } catch (e) { report.p2p = 'error: ' + String((e as Error)?.message || e).slice(0, 120); }
  if (gone.size) await db.from('push_tokens').delete().in('token', [...gone]);
  return Response.json({ ok: true, sent, removed: gone.size, report });
});

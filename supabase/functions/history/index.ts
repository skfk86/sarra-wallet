// سجل معاملات EVM مع ذاكرة مؤقتة في القاعدة. المزوّد: Moralis (مجاني ويغطي BNB وEthereum وPolygon)،
// ثم Etherscan V2 احتياطياً (خطته المجانية لم تعد تغطي BNB Chain منذ أواخر 2025)
// طلب موقّع من المحفظة (مثل p2p) + حد أقصى للطلبات لكل مستخدم
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { TronWeb } from 'npm:tronweb@6.0.4';
import { fromMoralis, fromEtherscan } from './normalize.ts';

// نسخة مطابقة لـ parseSignedMessage في _shared/logic.ts (الدالة مستقلة كي تُنشر كملف واحد)
type SignedMsg = { action: string; params: Record<string, unknown>; address: string; ts: number; nonce: string };
function parseSignedMessage(message: string, now: number, maxSkewMs = 300000): SignedMsg {
  let m: SignedMsg;
  try { m = JSON.parse(message); } catch { throw new Error('BAD_MESSAGE'); }
  if (!m || typeof m.action !== 'string' || typeof m.address !== 'string') throw new Error('BAD_MESSAGE');
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(m.address)) throw new Error('BAD_ADDRESS');
  if (typeof m.ts !== 'number' || Math.abs(now - m.ts) > maxSkewMs) throw new Error('EXPIRED_REQUEST');
  if (typeof m.nonce !== 'string' || !/^[0-9a-f]{16,64}$/.test(m.nonce)) throw new Error('BAD_NONCE');
  if (typeof m.params !== 'object' || m.params === null) m.params = {};
  return m;
}

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const tw = new TronWeb({ fullHost: 'https://api.trongrid.io' });
const clean = (k: string) => (Deno.env.get(k) ?? '').replace(/[\s\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '');
const KEY = clean('ETHERSCAN_API_KEY');
const MORALIS = clean('MORALIS_API_KEY');
const MORALIS_CHAIN: Record<number, string> = { 1: 'eth', 56: 'bsc', 137: 'polygon' };
const CHAINS = new Set([1, 56, 137]);
const TTL_MS = 90_000;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (c: string, s = 400) => json({ error: c }, s);

async function scan(chain: number, action: string, addr: string) {
  const u = `https://api.etherscan.io/v2/api?chainid=${chain}&module=account&action=${action}&address=${addr}&page=1&offset=50&sort=desc&apikey=${KEY}`;
  const r = await fetch(u, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('CHAIN_UNAVAILABLE');
  const j = await r.json();
  if (j.status === '1') return j.result as any[];
  if (/no transactions/i.test(String(j.message))) return [];
  throw new Error('CHAIN_UNAVAILABLE'); // مفتاح غير صالح/شبكة غير مغطاة/حد الطلبات
}

async function moralis(chain: number, addr: string) {
  const u = `https://deep-index.moralis.io/api/v2.2/wallets/${addr}/history?chain=${MORALIS_CHAIN[chain]}&order=DESC&limit=50`;
  const r = await fetch(u, { headers: { accept: 'application/json', 'X-API-Key': MORALIS } });
  if (!r.ok) throw new Error('CHAIN_UNAVAILABLE'); // مفتاح غير صالح أو تجاوز الحصة المجانية
  const j = await r.json();
  return fromMoralis(addr, j.result || []);
}
async function fetchHistory(chain: number, addr: string) {
  if (MORALIS) {
    try { return await moralis(chain, addr); } catch (e) { if (!KEY) throw e; }
  }
  const [native, tokens] = await Promise.all([scan(chain, 'txlist', addr), scan(chain, 'tokentx', addr)]);
  return fromEtherscan(addr, native, tokens);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('METHOD', 405);
  try {
    if (!KEY && !MORALIS) return fail('NOT_CONFIGURED', 503);
    const { message, signature } = await req.json();
    if (typeof message !== 'string' || typeof signature !== 'string') return fail('UNAUTHORIZED', 401);
    const m = parseSignedMessage(message, Date.now());
    if (m.action !== 'history.evm') return fail('BAD_ACTION');
    const signer = await tw.trx.verifyMessageV2(message, signature);
    if (signer !== m.address) return fail('BAD_SIGNATURE', 401);
    const { error: nonceErr } = await db.from('used_nonces').insert({ nonce: m.nonce });
    if (nonceErr) return fail('REPLAY', 401);
    const { data: okRate, error: rerr } = await db.rpc('p2p_hit', { p_addr: m.address, p_kind: 'history', p_max: 30, p_window_secs: 600 });
    if (rerr) throw new Error('SERVER_ERROR');
    if (!okRate) return fail('RATE_LIMITED_HISTORY', 429);

    const p = m.params as Record<string, any>;
    const chain = Number(p.chain), addr = String(p.address || '').toLowerCase();
    if (!CHAINS.has(chain) || !/^0x[0-9a-f]{40}$/.test(addr)) return fail('BAD_REQUEST');

    const { data: row } = await db.from('evm_history_cache').select('body,fetched_at').eq('chain', chain).eq('addr', addr).maybeSingle();
    if (row && Date.now() - Date.parse(row.fetched_at) < TTL_MS) return json({ items: row.body, fetched_at: row.fetched_at, stale: false });
    try {
      const items = await fetchHistory(chain, addr);
      const at = new Date().toISOString();
      await db.from('evm_history_cache').upsert({ chain, addr, body: items, fetched_at: at });
      if (Math.random() < 0.02) db.rpc('history_cleanup').then(() => {}, () => {});
      return json({ items, fetched_at: at, stale: false });
    } catch (e) {
      if (row) return json({ items: row.body, fetched_at: row.fetched_at, stale: true }); // أقدم أفضل من لا شيء
      throw e;
    }
  } catch (e) {
    const msg = String((e as Error).message || e);
    const code = /^[A-Z_]+$/.test(msg) ? msg : 'SERVER_ERROR';
    if (code === 'SERVER_ERROR') console.error(e);
    return fail(code, code === 'SERVER_ERROR' ? 500 : code === 'CHAIN_UNAVAILABLE' ? 502 : 400);
  }
});

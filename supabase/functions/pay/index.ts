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
import { createApp } from './app.ts';

const env = (k: string, d = '') => (Deno.env.get(k) ?? d).replace(/[\s\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '');
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const tw = new TronWeb({ fullHost: 'https://api.trongrid.io' });
const FEE_BPS = Number(env('PAY_FEE_BPS', '50'));                                   // 0.5%
const FEE_MIN = BigInt(Math.round(Number(env('PAY_FEE_MIN_USDT', '0.02')) * 1e6));  // بحد أدنى 0.02 USDT
const TOPUP: Record<string, string> = { tron: env('PAY_TOPUP_TRON'), evm: env('PAY_TOPUP_EVM') }; // عناويننا لاستلام شحن الرصيد
const PAY_PAGE = env('PAY_PAGE_URL', 'https://skfk86.github.io/sarra-wallet/pay.html');
const TRON_KEY = env('TRONGRID_API_KEY');
const RPCS: Record<string, string[]> = {
  tron: ['https://api.trongrid.io/jsonrpc'],
  bsc: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org'],
  polygon: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'],
  eth: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org']
};

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

const app = createApp({
  db, rpc, fetch, now: () => Date.now(),
  verify: async (message, signature) => await tw.trx.verifyMessageV2(message, signature),
  cfg: { feeBps: FEE_BPS, feeMin: FEE_MIN, topup: TOPUP, payPage: PAY_PAGE }
});
Deno.serve((req) => app.handle(req));

// أسعار ورسوم بيانية عبر خادمنا: الجوال لا يتصل بـ CoinGecko مباشرة (حدود الطلبات والحجب الجغرافي)
// ذاكرة مؤقتة مشتركة في market_cache، وقائمة معرّفات مسموحة فقط
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const IDS = new Set(['tether', 'usd-coin', 'tron', 'binancecoin', 'ethereum', 'polygon-ecosystem-token', 'bitcoin', 'first-digital-usd', 'dai', 'ripple', 'solana', 'dogecoin', 'cardano', 'chainlink', 'uniswap', 'aave', 'pancakeswap-token', 'shiba-inu', 'pepe']);
const DAYS = new Set(['1', '7', '30', '90', '365']);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } });
const CG = 'https://api.coingecko.com/api/v3';

async function cached(key: string, ttlSec: number, url: string, shape: (j: any) => unknown) {
  const { data } = await db.from('market_cache').select('body,at').eq('key', key).maybeSingle();
  if (data && Date.now() - Date.parse(data.at) < ttlSec * 1000) return data.body;
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('CG_' + r.status);
    const body = shape(await r.json());
    await db.from('market_cache').upsert({ key, body, at: new Date().toISOString() });
    return body;
  } catch (e) {
    if (data) return data.body; // بيانات أقدم أفضل من لا شيء
    throw e;
  }
}
function thin(a: number[][], n: number) {
  if (!a || a.length <= n) return a || [];
  const st = a.length / n, o: number[][] = [];
  for (let i = 0; i < n; i++) o.push(a[Math.floor(i * st)]);
  o.push(a[a.length - 1]); return o;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const u = new URL(req.url), kind = u.searchParams.get('kind');
  try {
    if (kind === 'chart') {
      const id = u.searchParams.get('id') || '', days = u.searchParams.get('days') || '1';
      if (!IDS.has(id) || !DAYS.has(days)) return out({ error: 'BAD_REQUEST' }, 400);
      const ttl = days === '1' ? 300 : days === '7' ? 1800 : 3600;
      return out(await cached('chart:' + id + ':' + days, ttl, `${CG}/coins/${id}/market_chart?vs_currency=usd&days=${days}`, (j) => ({ prices: thin(j.prices, 160) })));
    }
    if (kind === 'markets') {
      const ids = [...IDS].join(',');
      return out(await cached('markets', 300, `${CG}/coins/markets?vs_currency=usd&sparkline=true&price_change_percentage=24h&ids=${ids}`, (j) => (j as any[]).map((x) => ({
        id: x.id, usd: x.current_price, chg: x.price_change_percentage_24h, spark: thin((x.sparkline_in_7d?.price || []).map((v: number) => [0, v]), 40).map((p) => p[1])
      }))));
    }
    return out({ error: 'BAD_REQUEST' }, 400);
  } catch (_e) {
    return out({ error: 'UPSTREAM' }, 502);
  }
});

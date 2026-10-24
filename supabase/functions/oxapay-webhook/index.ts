// إشعارات OxaPay: تأكيد إيداع البائع في الضمان
// الأمان: نتحقق من توقيع HMAC-SHA512، ثم لا نثق بمحتوى الإشعار ونسأل OxaPay مباشرة عن الحالة
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import * as L from '../_shared/logic.ts';

const env = (k: string, d = '') => Deno.env.get(k) ?? d;
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const MERCHANT_KEY = env('OXAPAY_MERCHANT_KEY');
const PAYOUT_KEY = env('OXAPAY_PAYOUT_KEY');

async function hmacHex(key: string, data: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function audit(order_id: string | null, event: string, detail: unknown = null) {
  await db.from('audit_log').insert({ order_id, actor: 'oxapay', event, detail });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const raw = await req.text();
  const given = (req.headers.get('HMAC') || req.headers.get('hmac') || '').toLowerCase();
  if (!MERCHANT_KEY || !given || !safeEqual(given, await hmacHex(MERCHANT_KEY, raw))) {
    await audit(null, 'webhook_bad_hmac');
    return new Response('bad signature', { status: 401 });
  }
  let body: Record<string, any> = {};
  try { body = JSON.parse(raw); } catch { return new Response('ok'); }
  const trackId = String(body.track_id ?? body.trackId ?? '');
  if (!trackId || (body.type && String(body.type).toLowerCase() !== 'payment' && String(body.type).toLowerCase() !== 'white_label')) {
    return new Response('ok');
  }
  const { data: o } = await db.from('orders').select('*').eq('deposit_track_id', trackId).maybeSingle();
  if (!o) { await audit(null, 'webhook_unknown_track', { trackId }); return new Response('ok'); }

  // المصدر الموثوق: استعلام مباشر من OxaPay
  const res = await fetch('https://api.oxapay.com/v1/payment/' + encodeURIComponent(trackId), {
    headers: { merchant_api_key: MERCHANT_KEY, 'Content-Type': 'application/json' }
  });
  const info = (await res.json().catch(() => ({})))?.data;
  if (!info || !L.isPaidStatus(info.status)) { await audit(o.id, 'webhook_status', { status: info?.status ?? body.status }); return new Response('ok'); }

  if (o.status === 'awaiting_deposit') {
    const { data: off } = await db.from('offers').select('pay_window_min').eq('id', o.offer_id).single();
    const deadline = new Date(Date.now() + (off?.pay_window_min || 15) * 60000).toISOString();
    const { data } = await db.from('orders').update({ status: 'funded', funded_at: new Date().toISOString(), pay_deadline: deadline })
      .eq('id', o.id).eq('status', 'awaiting_deposit').select().maybeSingle();
    if (data) await audit(o.id, 'funded', { amount: info.amount });
  } else if (o.status === 'cancelled') {
    // وصل الإيداع بعد إلغاء الطلب (مثلاً بعد انتهاء المهلة): نعيده للبائع تلقائياً
    const { data: locked } = await db.from('orders').update({ status: 'refunding' }).eq('id', o.id).eq('status', 'cancelled').select().maybeSingle();
    if (locked) {
      try {
        const r = await fetch('https://api.oxapay.com/v1/payout', {
          method: 'POST', headers: { payout_api_key: PAYOUT_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: o.seller, amount: Number(o.amount_usdt), currency: 'USDT', network: 'TRC20', description: 'Sarra P2P late deposit refund ' + o.id })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || (j.status && j.status !== 200)) throw new Error(j.message || String(r.status));
        await db.from('orders').update({ status: 'refunded', payout_track_id: j.data?.track_id ?? null }).eq('id', o.id);
        await audit(o.id, 'late_deposit_refunded', { track_id: j.data?.track_id });
      } catch (e) {
        await db.from('orders').update({ status: 'refund_failed', payout_error: String(e).slice(0, 300) }).eq('id', o.id);
        await audit(o.id, 'late_deposit_refund_failed', { error: String(e) });
      }
    }
  }
  return new Response('ok');
});

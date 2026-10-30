// الدعم الفني وحذف البيانات: دالة صغيرة منفصلة عن سوق P2P
// كل طلب موقّع بمفتاح المحفظة (نفس آلية P2P): لا كلمات مرور، ولا يرى أحد تذاكر غيره
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { TronWeb } from 'npm:tronweb@6.0.4';

const env = (k: string, d = '') => (Deno.env.get(k) ?? d).replace(/[\s​-‏‪-‮⁠﻿]/g, '');
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const tw = new TronWeb({ fullHost: 'https://api.trongrid.io' });
const ADMINS = env('ADMIN_ADDRESSES').split(',').filter(Boolean);
const TOPICS = ['send', 'p2p', 'swap', 'bridge', 'account', 'other'];
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function limit(addr: string, kind: string, max: number, win: number) {
  const { data, error } = await db.rpc('p2p_hit', { p_addr: addr, p_kind: kind, p_max: max, p_window_secs: win });
  if (error) throw new Error('SERVER_ERROR');
  if (!data) throw new Error('RATE_LIMITED');
}
const audit = (actor: string, event: string, detail: unknown = null) => db.from('audit_log').insert({ order_id: null, actor, event, detail });

async function handle(action: string, p: Record<string, any>, me: string) {
  if (action === 'ticket.create') {
    const body = String(p.body || '').trim().slice(0, 2000);
    if (body.length < 5) throw new Error('EMPTY_MESSAGE');
    const topic = TOPICS.includes(p.topic) ? p.topic : 'other';
    await limit(me, 'ticket', 5, 86400);
    const { data, error } = await db.from('support_tickets').insert({ address: me, topic, body }).select('id,topic,body,status,created_at').single();
    if (error) throw new Error('DB_ERROR');
    return { ticket: data };
  }
  if (action === 'ticket.mine') {
    const { data } = await db.from('support_tickets').select('id,topic,body,reply,status,created_at,replied_at').eq('address', me).order('id', { ascending: false }).limit(20);
    return { tickets: data || [] };
  }
  // حذف البيانات الشخصية (متطلب Google Play): يمسح بيانات التوثيق والهاتف وصورة الهوية.
  // سجل الصفقات المالية يبقى (مطلوب للنزاعات والمحاسبة)، لكنه مرتبط بعنوان المحفظة فقط.
  if (action === 'account.delete') {
    const { data: open } = await db.from('orders').select('id').or(`buyer.eq.${me},seller.eq.${me}`)
      .in('status', ['awaiting_deposit', 'funded', 'paid', 'disputed', 'releasing', 'refunding', 'release_failed', 'refund_failed']).limit(1);
    if ((open || []).length) throw new Error('OPEN_ORDERS');
    const { data: pf } = await db.from('profiles').select('id_doc_path').eq('address', me).maybeSingle();
    if (pf?.id_doc_path) await db.storage.from('kyc').remove([pf.id_doc_path]);
    await db.from('offers').update({ active: false }).eq('seller', me);
    await db.from('profiles').update({ full_name: null, phone: null, bankak_account: null, id_doc_path: null, prev_kyc: null,
      phone_link: false, verify_status: 'none', verified_at: null, verify_note: null, nickname: 'محذوف-' + me.slice(-4) }).eq('address', me);
    await db.from('support_tickets').delete().eq('address', me);
    await audit(me, 'account_delete');
    return { ok: true };
  }
  if (!ADMINS.includes(me)) throw new Error('NOT_ALLOWED');
  if (action === 'admin.tickets') {
    const { data } = await db.from('support_tickets').select('id,address,topic,body,reply,status,created_at').in('status', ['open', 'answered']).order('status').order('id').limit(50);
    return { tickets: data || [] };
  }
  if (action === 'admin.reply') {
    const reply = String(p.reply || '').trim().slice(0, 2000);
    if (reply.length < 2) throw new Error('EMPTY_MESSAGE');
    const { data } = await db.from('support_tickets').update({ reply, status: p.close ? 'closed' : 'answered', replied_at: new Date().toISOString(), replied_by: me })
      .eq('id', Number(p.id)).select('id').maybeSingle();
    if (!data) throw new Error('NOT_FOUND');
    await audit(me, 'ticket_reply', { id: data.id });
    return { ok: true };
  }
  throw new Error('UNKNOWN_ACTION');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);
  try {
    const { message, signature } = await req.json();
    if (typeof message !== 'string' || typeof signature !== 'string') return json({ error: 'UNAUTHORIZED' }, 401);
    const m = JSON.parse(message);
    if (!m || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(m.address) || typeof m.action !== 'string') return json({ error: 'BAD_MESSAGE' }, 400);
    if (typeof m.ts !== 'number' || Math.abs(Date.now() - m.ts) > 300000) return json({ error: 'EXPIRED_REQUEST' }, 401);
    if (typeof m.nonce !== 'string' || !/^[0-9a-f]{16,64}$/.test(m.nonce)) return json({ error: 'BAD_NONCE' }, 400);
    if ((await tw.trx.verifyMessageV2(message, signature)) !== m.address) return json({ error: 'BAD_SIGNATURE' }, 401);
    const { error: ne } = await db.from('used_nonces').insert({ nonce: m.nonce });
    if (ne) return json({ error: 'REPLAY' }, 401);
    await limit(m.address, 'req', 60, 60);
    return json(await handle(m.action, m.params || {}, m.address));
  } catch (e) {
    const msg = String((e as Error).message || e);
    const code = /^[A-Z_]+$/.test(msg) ? msg : 'SERVER_ERROR';
    if (code === 'SERVER_ERROR') console.error(e);
    return json({ error: code }, code === 'RATE_LIMITED' ? 429 : code === 'SERVER_ERROR' ? 500 : 400);
  }
});

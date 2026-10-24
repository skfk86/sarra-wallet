// خادم سوق P2P لصُرّة
// - الهوية: توقيع المحفظة (TRON signMessageV2) على كل طلب، بدون حسابات ولا كلمات مرور
// - الضمان: OxaPay (البائع يودع في عنوان خاص بالطلب، ونحرّر للمشتري أو نعيد للبائع عبر Payout)
// - كل تغيير حالة ذرّي: UPDATE مشروط بالحالة الحالية، فلا يمكن التحرير مرتين
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { TronWeb } from 'npm:tronweb@6.0.4';
import * as L from '../_shared/logic.ts';

const env = (k: string, d = '') => Deno.env.get(k) ?? d;
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const tw = new TronWeb({ fullHost: 'https://api.trongrid.io' });
const ADMINS = env('ADMIN_ADDRESSES').split(',').map((s) => s.trim()).filter(Boolean);
const FEE_BPS = Number(env('P2P_FEE_BPS', '50'));
const MIN_TRADE = Number(env('P2P_MIN_USDT', '10'));
const DEPOSIT_LIFETIME = Number(env('DEPOSIT_LIFETIME_MIN', '30'));
const MERCHANT_KEY = env('OXAPAY_MERCHANT_KEY');
const PAYOUT_KEY = env('OXAPAY_PAYOUT_KEY');
const WEBHOOK_URL = env('SUPABASE_URL') + '/functions/v1/oxapay-webhook';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (code: string, status = 400) => json({ error: code }, status);

async function audit(order_id: string | null, actor: string | null, event: string, detail: unknown = null) {
  await db.from('audit_log').insert({ order_id, actor, event, detail });
}

// ===== OxaPay =====
async function oxapay(path: string, body: unknown, key: string, header: string, method = 'POST') {
  const res = await fetch('https://api.oxapay.com/v1' + path, {
    method,
    headers: { [header]: key, 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j.status && j.status !== 200) || j.error && Object.keys(j.error).length) {
    throw new Error('OXAPAY: ' + (j.message || j.error?.message || res.status));
  }
  return j.data;
}
const createDeposit = (orderId: string, amount: string) => oxapay('/payment/white-label', {
  amount: Number(amount), currency: 'USDT', pay_currency: 'USDT', network: 'TRC20',
  lifetime: DEPOSIT_LIFETIME, fee_paid_by_payer: 1, callback_url: WEBHOOK_URL,
  order_id: orderId, description: 'Sarra P2P escrow ' + orderId
}, MERCHANT_KEY, 'merchant_api_key');
const payout = (address: string, amount: string, desc: string) => oxapay('/payout', {
  address, amount: Number(amount), currency: 'USDT', network: 'TRC20', description: desc
}, PAYOUT_KEY, 'payout_api_key');
const paymentInfo = (trackId: string) => oxapay('/payment/' + encodeURIComponent(trackId), null, MERCHANT_KEY, 'merchant_api_key', 'GET');

// ===== تنفيذ التحرير/الإرجاع بعد قفل الحالة =====
async function settle(order: Record<string, any>, kind: 'release' | 'refund', actor: string) {
  const to = kind === 'release' ? order.buyer : order.seller;
  const amount = kind === 'release' ? L.buyerReceives(order.amount_usdt, order.fee_usdt) : L.fromMicro(L.toMicro(order.amount_usdt));
  try {
    const r = await payout(to, amount, `Sarra P2P ${kind} ${order.id}`);
    const done = kind === 'release' ? 'released' : 'refunded';
    await db.from('orders').update({ status: done, payout_track_id: r?.track_id ?? null, payout_error: null })
      .eq('id', order.id).eq('status', kind === 'release' ? 'releasing' : 'refunding');
    await audit(order.id, actor, kind + '_payout', { to, amount, track_id: r?.track_id });
    if (kind === 'release') {
      for (const a of [order.buyer, order.seller]) {
        const { data: p } = await db.from('profiles').select('trades_completed').eq('address', a).single();
        if (p) await db.from('profiles').update({ trades_completed: p.trades_completed + 1 }).eq('address', a);
      }
    } else {
      await db.rpc('p2p_unreserve', { p_offer: order.offer_id, p_amount: order.amount_usdt });
    }
    return done;
  } catch (e) {
    const failed = kind === 'release' ? 'release_failed' : 'refund_failed';
    await db.from('orders').update({ status: failed, payout_error: String((e as Error).message).slice(0, 300) }).eq('id', order.id);
    await audit(order.id, actor, kind + '_failed', { error: String(e) });
    return failed;
  }
}

// إلغاء الطلبات التي لم يودع فيها البائع خلال المهلة
async function expireStale(o: Record<string, any>) {
  if (o.status === 'awaiting_deposit' && o.deposit_expires_at && Date.now() > Date.parse(o.deposit_expires_at) + 60000) {
    const { data } = await db.from('orders').update({ status: 'cancelled' }).eq('id', o.id).eq('status', 'awaiting_deposit').select().maybeSingle();
    if (data) { await db.rpc('p2p_unreserve', { p_offer: o.offer_id, p_amount: o.amount_usdt }); await audit(o.id, null, 'deposit_expired'); o.status = 'cancelled'; }
  }
  return o;
}

function publicOrder(o: Record<string, any>, offer: Record<string, any> | null, viewer: string) {
  const out: Record<string, any> = { ...o };
  delete out.payout_error;
  out.buyer_receives = L.buyerReceives(o.amount_usdt, o.fee_usdt);
  if (offer && L.canSeeBankDetails(o as L.Order, viewer, ADMINS)) {
    out.bankak_name = offer.bankak_name; out.bankak_account = offer.bankak_account;
  }
  if (viewer !== o.seller && !ADMINS.includes(viewer)) { delete out.deposit_address; delete out.deposit_amount; }
  return out;
}

// ===== الإعدادات وحدود الاستخدام =====
async function getRate(): Promise<L.RateSetting> {
  const { data } = await db.from('settings').select('value').eq('key', 'rate').maybeSingle();
  return (data?.value as L.RateSetting) || { sdg_per_usdt: null, band_pct: 3 };
}
// يرمي RATE_LIMITED إن تجاوزت المحفظة حد هذا النوع من العمليات
async function limit(addr: string, kind: string) {
  const [max, win] = L.LIMITS[kind];
  const { data, error } = await db.rpc('p2p_hit', { p_addr: addr, p_kind: kind, p_max: max, p_window_secs: win });
  if (error) throw new Error('SERVER_ERROR');
  if (!data) throw new Error('RATE_LIMITED_' + kind.toUpperCase());
}

async function profilesMap(addresses: string[]) {
  const { data } = await db.from('profiles').select('address,nickname,trades_completed,disputes_lost').in('address', [...new Set(addresses)]);
  return Object.fromEntries((data || []).map((p) => [p.address, p]));
}

// ===== الإجراءات =====
async function handle(action: string, p: Record<string, any>, me: string | null) {
  // قراءة عامة بدون توقيع
  if (action === 'offers.list') {
    const { data } = await db.from('offers')
      .select('id,seller,price_sdg,min_usdt,max_usdt,available_usdt,pay_window_min,created_at')
      .eq('active', true).gte('available_usdt', MIN_TRADE).order('price_sdg', { ascending: true }).limit(50);
    const rate = await getRate();
    const range = L.priceRange(rate);
    // الإعلانات خارج نطاق سعر الصرف الحالي لا تظهر (مثلاً بعد أن يغيّر المشرف السعر)
    const shown = (data || []).filter((o) => Number(o.available_usdt) >= Number(o.min_usdt) &&
      (!range || (Number(o.price_sdg) >= range.min && Number(o.price_sdg) <= range.max)));
    const profs = await profilesMap(shown.map((o) => o.seller));
    return { offers: shown.map((o) => ({ ...o, seller_profile: profs[o.seller] || null })), fee_bps: FEE_BPS, min_trade: MIN_TRADE, rate, range };
  }
  if (!me) throw new Error('UNAUTHORIZED');
  const { data: prof } = await db.from('profiles').select('*').eq('address', me).maybeSingle();
  if (prof?.banned) throw new Error('BANNED');

  // الملف يُنشأ تلقائياً باسم افتراضي، فلا نسأل المستخدم عن اسمه قبل أول عملية
  let profile = prof;
  if (!profile) {
    const { data: created } = await db.from('profiles').upsert({ address: me, nickname: L.defaultNickname(me) }, { onConflict: 'address', ignoreDuplicates: true }).select().maybeSingle();
    profile = created || (await db.from('profiles').select('*').eq('address', me).single()).data;
  }

  if (action === 'me') {
    const rate = await getRate();
    return { profile, is_admin: ADMINS.includes(me), fee_bps: FEE_BPS, min_trade: MIN_TRADE, rate, range: L.priceRange(rate), max_offers: L.MAX_ACTIVE_OFFERS };
  }

  if (action === 'profile.set') {
    const nickname = String(p.nickname || '').trim();
    if (nickname.length < 2 || nickname.length > 24) throw new Error('BAD_NICKNAME');
    await limit(me, 'profile');
    await db.from('profiles').update({ nickname }).eq('address', me);
    return { ok: true };
  }

  if (action === 'offer.create') {
    const v = L.validateOffer(p, MIN_TRADE);
    L.checkPrice(v.price_sdg, await getRate());
    const { count } = await db.from('offers').select('id', { count: 'exact', head: true }).eq('seller', me).eq('active', true);
    if ((count || 0) >= L.MAX_ACTIVE_OFFERS) throw new Error('MAX_OFFERS');
    await limit(me, 'offer_create');
    const { data, error } = await db.from('offers').insert({ ...v, seller: me }).select().single();
    if (error) throw new Error('DB_ERROR');
    await audit(null, me, 'offer_create', { id: data.id });
    return { offer: data };
  }
  if (action === 'offers.mine') {
    const { data } = await db.from('offers').select('*').eq('seller', me).order('created_at', { ascending: false }).limit(50);
    return { offers: data || [] };
  }
  if (action === 'offer.close') {
    await db.from('offers').update({ active: false }).eq('id', p.id).eq('seller', me);
    return { ok: true };
  }

  if (action === 'order.create') {
    const amount = L.fromMicro(L.toMicro(String(p.amount)));
    const { data: offer } = await db.from('offers').select('*').eq('id', p.offer_id).single();
    if (!offer || !offer.active) throw new Error('OFFER_UNAVAILABLE');
    if (offer.seller === me) throw new Error('OWN_OFFER');
    const range = L.priceRange(await getRate());
    if (range && (Number(offer.price_sdg) < range.min || Number(offer.price_sdg) > range.max)) throw new Error('OFFER_UNAVAILABLE');
    const { data: open } = await db.from('orders').select('id').eq('buyer', me).in('status', ['awaiting_deposit', 'funded', 'paid']);
    if ((open || []).length >= 3) throw new Error('TOO_MANY_OPEN');
    await limit(me, 'order_create');
    const { data: ok } = await db.rpc('p2p_reserve', { p_offer: offer.id, p_amount: amount });
    if (!ok) throw new Error('AMOUNT_UNAVAILABLE');
    const fee = L.feeFor(amount, FEE_BPS);
    const total = Math.round(Number(amount) * Number(offer.price_sdg) * 100) / 100;
    const { data: order, error } = await db.from('orders').insert({
      offer_id: offer.id, seller: offer.seller, buyer: me, amount_usdt: amount,
      price_sdg: offer.price_sdg, total_sdg: total, fee_usdt: fee
    }).select().single();
    if (error) { await db.rpc('p2p_unreserve', { p_offer: offer.id, p_amount: amount }); throw new Error('DB_ERROR'); }
    try {
      const d = await createDeposit(order.id, amount);
      const expires = new Date(d.expired_at ? Number(d.expired_at) * 1000 : Date.now() + DEPOSIT_LIFETIME * 60000).toISOString();
      const { data: upd } = await db.from('orders').update({
        deposit_track_id: String(d.track_id), deposit_address: d.address,
        deposit_amount: d.pay_amount ?? amount, deposit_expires_at: expires
      }).eq('id', order.id).select().single();
      await audit(order.id, me, 'order_create', { amount, track_id: d.track_id });
      return { order: publicOrder(upd, offer, me) };
    } catch (e) {
      await db.from('orders').update({ status: 'cancelled', payout_error: String(e).slice(0, 300) }).eq('id', order.id);
      await db.rpc('p2p_unreserve', { p_offer: offer.id, p_amount: amount });
      throw new Error('ESCROW_UNAVAILABLE');
    }
  }

  if (action === 'orders.mine') {
    const { data } = await db.from('orders').select('*').or(`buyer.eq.${me},seller.eq.${me}`).order('created_at', { ascending: false }).limit(30);
    const list = await Promise.all((data || []).map(expireStale));
    const profs = await profilesMap(list.flatMap((o) => [o.buyer, o.seller]));
    return { orders: list.map((o) => ({ ...publicOrder(o, null, me), buyer_profile: profs[o.buyer], seller_profile: profs[o.seller] })) };
  }

  if (action === 'order.get' || action === 'order.action' || action === 'message.send' || action === 'order.refresh') {
    const { data: o0 } = await db.from('orders').select('*').eq('id', p.id).maybeSingle();
    if (!o0) throw new Error('NOT_FOUND');
    const role = L.roleOf(o0 as L.Order, me, ADMINS);
    if (!role) throw new Error('NOT_FOUND');
    let o = await expireStale(o0);

    if (action === 'order.refresh' && o.status === 'awaiting_deposit' && o.deposit_track_id) {
      // احتياط إن تأخر إشعار OxaPay: نسأل عن حالة الإيداع مباشرة
      const info = await paymentInfo(o.deposit_track_id).catch(() => null);
      if (info && L.isPaidStatus(info.status)) o = (await markFunded(o)) || o;
    }

    if (action === 'order.action') {
      const tr = L.transitionFor(o as L.Order, role, String(p.action), Date.now());
      if (p.action === 'cancel') await limit(me, 'order_cancel');
      const patch: Record<string, any> = { status: tr.to };
      if (tr.to === 'paid') patch.paid_at = new Date().toISOString();
      if (tr.to === 'disputed') { patch.dispute_by = me; patch.dispute_reason = String(p.reason || '').slice(0, 500); }
      if (role === 'admin') patch.resolved_by = me;
      const { data: locked } = await db.from('orders').update(patch).eq('id', o.id).in('status', tr.from).select().maybeSingle();
      if (!locked) throw new Error('INVALID_STATE');
      await audit(o.id, me, 'action_' + p.action, { from: o.status, to: tr.to });
      if (tr.to === 'cancelled') await db.rpc('p2p_unreserve', { p_offer: o.offer_id, p_amount: o.amount_usdt });
      if (role === 'admin' && p.action === 'admin_refund' && o.status === 'disputed') {
        const { data: s } = await db.from('profiles').select('disputes_lost').eq('address', o.buyer).single();
        if (s) await db.from('profiles').update({ disputes_lost: s.disputes_lost + 1 }).eq('address', o.buyer);
      }
      if (role === 'admin' && p.action === 'admin_release' && o.status === 'disputed') {
        const { data: s } = await db.from('profiles').select('disputes_lost').eq('address', o.seller).single();
        if (s) await db.from('profiles').update({ disputes_lost: s.disputes_lost + 1 }).eq('address', o.seller);
      }
      if (tr.release) locked.status = await settle(locked, 'release', me);
      if (tr.refund) locked.status = await settle(locked, 'refund', me);
      o = locked;
    }

    if (action === 'message.send') {
      const body = String(p.body || '').trim().slice(0, 1000);
      if (!body) throw new Error('EMPTY_MESSAGE');
      await limit(me, 'message');
      if (['cancelled', 'released', 'refunded'].includes(o.status) && role !== 'admin') throw new Error('ORDER_CLOSED');
      await db.from('messages').insert({ order_id: o.id, sender: me, body });
    }

    const { data: offer } = await db.from('offers').select('bankak_name,bankak_account').eq('id', o.offer_id).single();
    const { data: msgs } = await db.from('messages').select('id,sender,body,created_at').eq('order_id', o.id).order('id').limit(200);
    const profs = await profilesMap([o.buyer, o.seller]);
    return { order: { ...publicOrder(o, offer, me), buyer_profile: profs[o.buyer], seller_profile: profs[o.seller] }, role, messages: msgs || [] };
  }

  if (action === 'admin.queue') {
    if (!ADMINS.includes(me)) throw new Error('NOT_ALLOWED');
    const { data } = await db.from('orders').select('*').in('status', ['disputed', 'release_failed', 'refund_failed']).order('updated_at').limit(50);
    const profs = await profilesMap((data || []).flatMap((o) => [o.buyer, o.seller]));
    return { orders: (data || []).map((o) => ({ ...o, buyer_profile: profs[o.buyer], seller_profile: profs[o.seller] })) };
  }

  // ===== لوحة المشرف =====
  if (action.startsWith('admin.') && !ADMINS.includes(me)) throw new Error('NOT_ALLOWED');
  if (action === 'admin.rate.set') {
    const v = L.validateRateSetting(p);
    await db.from('settings').upsert({ key: 'rate', value: v, updated_by: me, updated_at: new Date().toISOString() });
    await audit(null, me, 'rate_set', v);
    return { rate: v, range: L.priceRange(v) };
  }
  if (action === 'admin.ban') {
    const addr = String(p.address || '').trim();
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr) || ADMINS.includes(addr)) throw new Error('BAD_ADDRESS');
    const banned = p.banned !== false;
    await db.from('profiles').upsert({ address: addr, nickname: L.defaultNickname(addr), banned }, { onConflict: 'address' });
    if (banned) await db.from('offers').update({ active: false }).eq('seller', addr);
    await audit(null, me, banned ? 'ban' : 'unban', { address: addr });
    return { ok: true };
  }
  if (action === 'admin.stats') {
    const count = async (q: any) => (await q).count || 0;
    return {
      users: await count(db.from('profiles').select('address', { count: 'exact', head: true })),
      active_offers: await count(db.from('offers').select('id', { count: 'exact', head: true }).eq('active', true)),
      open_orders: await count(db.from('orders').select('id', { count: 'exact', head: true }).in('status', ['awaiting_deposit', 'funded', 'paid'])),
      disputes: await count(db.from('orders').select('id', { count: 'exact', head: true }).in('status', ['disputed', 'release_failed', 'refund_failed'])),
      completed: await count(db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'released'))
    };
  }

  throw new Error('UNKNOWN_ACTION');
}

// يُستدعى من هنا ومن oxapay-webhook عبر order.refresh
async function markFunded(o: Record<string, any>) {
  const { data: off } = await db.from('offers').select('pay_window_min').eq('id', o.offer_id).single();
  const deadline = new Date(Date.now() + (off?.pay_window_min || 15) * 60000).toISOString();
  const { data } = await db.from('orders').update({ status: 'funded', funded_at: new Date().toISOString(), pay_deadline: deadline })
    .eq('id', o.id).eq('status', 'awaiting_deposit').select().maybeSingle();
  if (data) await audit(o.id, 'oxapay', 'funded_by_poll');
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('METHOD', 405);
  try {
    const body = await req.json();
    // قراءة عامة
    if (body && body.action === 'offers.list') return json(await handle('offers.list', {}, null));
    // طلب موقّع
    const { message, signature } = body || {};
    if (typeof message !== 'string' || typeof signature !== 'string') return fail('UNAUTHORIZED', 401);
    const m = L.parseSignedMessage(message, Date.now());
    const signer = await tw.trx.verifyMessageV2(message, signature);
    if (signer !== m.address) return fail('BAD_SIGNATURE', 401);
    const { error: nonceErr } = await db.from('used_nonces').insert({ nonce: m.nonce });
    if (nonceErr) return fail('REPLAY', 401);
    await limit(m.address, 'req');
    if (Math.random() < 0.02) db.rpc('p2p_cleanup').then(() => {}, () => {});
    return json(await handle(m.action, m.params as Record<string, any>, m.address));
  } catch (e) {
    const msg = String((e as Error).message || e);
    const code = /^[A-Z_]+$/.test(msg) ? msg : 'SERVER_ERROR';
    if (code.startsWith('RATE_LIMITED')) return fail(code, 429);
    if (code === 'SERVER_ERROR') console.error(e);
    return fail(code, code === 'SERVER_ERROR' ? 500 : 400);
  }
});

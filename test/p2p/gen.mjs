// يولّد SQL لإرسال طلبات موقّعة للخادم عبر pg_net (لأن بيئة الاختبار لا تصل لـ Supabase مباشرة)
import { makeWallet, signedBody } from './tron-sign.mjs';
const URL = 'https://osdojhpsfbcqguoctbpk.supabase.co/functions/v1/p2p';
const W = { seller: makeWallet('5e11e5e11e5e11e5e11e5e11e5e11e5e11e5e11e5e11e5e11e5e11e5e11e5e1'), buyer: makeWallet('b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0') , stranger: makeWallet('c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ff') };
const steps = JSON.parse(process.argv[2]); // [[who, action, params, tag], ...]
const q = (s) => "'" + s.replace(/'/g, "''") + "'";
const rows = steps.map(([who, action, params, tag]) => {
  const body = who === 'public' ? { action } : who === 'tampered' ? (() => { const b = signedBody(W.buyer, action, params); b.message = b.message.replace(W.buyer.address, W.seller.address); return b; })() : signedBody(W[who], action, params);
  return `select ${q(tag)} as tag, net.http_post(${q(URL)}, ${q(JSON.stringify(body))}::jsonb, '{}'::jsonb, '{"Content-Type":"application/json"}'::jsonb) as req`;
});
console.log(rows.join('\nunion all\n') + ';');
if (process.argv[3] === 'addr') console.error(JSON.stringify({ seller: W.seller.address, buyer: W.buyer.address, stranger: W.stranger.address }));

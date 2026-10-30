// منطق سوق P2P الصافي (بدون شبكة ولا قاعدة بيانات) — يُختبر مباشرة بـ Node
// كل انتقال حالة يمر من هنا، والخادم ينفّذه بتحديث ذرّي مشروط بالحالة الحالية

export type Order = {
  id: string;
  seller: string;
  buyer: string;
  status: string;
  amount_usdt: string | number;
  fee_usdt?: string | number;
  pay_deadline?: string | null;
  deposit_expires_at?: string | null;
};

export type Transition = { from: string[]; to: string; refund?: boolean; release?: boolean };

// ===== المبالغ بدقة 6 خانات (بدون أخطاء الأرقام العشرية) =====
export function toMicro(v: string | number): bigint {
  const s = String(v).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error('BAD_AMOUNT');
  const [w, f = ''] = s.split('.');
  return BigInt(w) * 1000000n + BigInt((f + '000000').slice(0, 6));
}
export function fromMicro(u: bigint): string {
  const w = u / 1000000n, f = (u % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return f ? `${w}.${f}` : `${w}`;
}

// عمولة المنصة من مبلغ المشتري (تبقى في رصيد OxaPay كربح)
export function feeFor(amount: string | number, bps: number): string {
  const fee = toMicro(amount) * BigInt(bps) / 10000n;
  return fromMicro(fee);
}
export function buyerReceives(amount: string | number, fee: string | number): string {
  const r = toMicro(amount) - toMicro(fee);
  if (r <= 0n) throw new Error('FEE_TOO_HIGH');
  return fromMicro(r);
}

// ===== الطلب الموقّع من المحفظة =====
export type SignedMsg = { action: string; params: Record<string, unknown>; address: string; ts: number; nonce: string };
export function parseSignedMessage(message: string, now: number, maxSkewMs = 300000): SignedMsg {
  let m: SignedMsg;
  try { m = JSON.parse(message); } catch { throw new Error('BAD_MESSAGE'); }
  if (!m || typeof m.action !== 'string' || typeof m.address !== 'string') throw new Error('BAD_MESSAGE');
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(m.address)) throw new Error('BAD_ADDRESS');
  if (typeof m.ts !== 'number' || Math.abs(now - m.ts) > maxSkewMs) throw new Error('EXPIRED_REQUEST');
  if (typeof m.nonce !== 'string' || !/^[0-9a-f]{16,64}$/.test(m.nonce)) throw new Error('BAD_NONCE');
  if (typeof m.params !== 'object' || m.params === null) m.params = {};
  return m;
}

// ===== قواعد انتقال الحالة =====
// role: 'buyer' | 'seller' | 'admin'
export function transitionFor(order: Order, role: string, action: string, now: number): Transition {
  const st = order.status;
  const late = order.pay_deadline ? now > Date.parse(order.pay_deadline) : false;
  const A = (from: string[], to: string, extra: Partial<Transition> = {}): Transition => {
    if (!from.includes(st)) throw new Error('INVALID_STATE');
    return { from, to, ...extra };
  };
  if (role === 'buyer') {
    if (action === 'cancel') {
      if (st === 'awaiting_deposit') return A(['awaiting_deposit'], 'cancelled');
      // المشتري يلغي بعد حجز البائع ← يُعاد المبلغ للبائع
      return A(['funded'], 'refunding', { refund: true });
    }
    if (action === 'mark_paid') return A(['funded'], 'paid');
    if (action === 'dispute') return A(['paid'], 'disputed');
  }
  if (role === 'seller') {
    if (action === 'cancel') {
      if (st === 'awaiting_deposit') return A(['awaiting_deposit'], 'cancelled');
      // البائع يسترد فقط إن انتهت مهلة الدفع ولم يضغط المشتري "دفعت"
      if (st === 'funded' && late) return A(['funded'], 'refunding', { refund: true });
      throw new Error('PAY_WINDOW_OPEN');
    }
    if (action === 'release') return A(['funded', 'paid'], 'releasing', { release: true });
    if (action === 'dispute') return A(['paid'], 'disputed');
  }
  if (role === 'admin') {
    if (action === 'admin_release') return A(['disputed', 'release_failed'], 'releasing', { release: true });
    if (action === 'admin_refund') return A(['disputed', 'refund_failed', 'funded'], 'refunding', { refund: true });
  }
  throw new Error('NOT_ALLOWED');
}

export function roleOf(order: Order, address: string, admins: string[]): string | null {
  if (address === order.buyer) return 'buyer';
  if (address === order.seller) return 'seller';
  if (admins.includes(address)) return 'admin';
  return null;
}

// تفاصيل بنكك تظهر للمشتري فقط بعد أن يحجز البائع العملة فعلاً
export function canSeeBankDetails(order: Order, address: string, admins: string[]): boolean {
  if (address === order.seller || admins.includes(address)) return true;
  return address === order.buyer && ['funded', 'paid', 'disputed', 'releasing', 'released', 'release_failed'].includes(order.status);
}

// حالة الدفع من OxaPay: نعتبرها مكتملة فقط عند "paid"
export function isPaidStatus(s: unknown): boolean {
  return typeof s === 'string' && s.toLowerCase() === 'paid';
}

export function validateOffer(p: Record<string, unknown>, minTrade: number) {
  const num = (k: string) => { const v = Number(p[k]); if (!isFinite(v) || v <= 0) throw new Error('BAD_' + k.toUpperCase()); return v; };
  const price = num('price_sdg'), min = num('min_usdt'), max = num('max_usdt'), amount = num('amount_usdt');
  if (min < minTrade) throw new Error('MIN_TOO_LOW');
  if (max < min) throw new Error('MAX_LT_MIN');
  if (amount < min) throw new Error('AMOUNT_LT_MIN');
  const name = String(p.bankak_name || '').trim(), acct = String(p.bankak_account || '').replace(/\s/g, '');
  if (name.length < 2 || name.length > 60) throw new Error('BAD_BANKAK_NAME');
  if (!/^\d{4,30}$/.test(acct)) throw new Error('BAD_BANKAK_ACCOUNT');
  const win = Number(p.pay_window_min || 15);
  if (![15, 30, 60].includes(win)) throw new Error('BAD_WINDOW');
  const side = p.side === 'buy' ? 'buy' : 'sell';
  return {
    side,
    price_sdg: Math.round(price * 100) / 100,
    min_usdt: fromMicro(toMicro(min.toFixed(6))), max_usdt: fromMicro(toMicro(max.toFixed(6))),
    available_usdt: fromMicro(toMicro(amount.toFixed(6))),
    bankak_name: name, bankak_account: acct, pay_window_min: win
  };
}

// ===== سعر الصرف المرجعي (يحدده المشرف) =====
export type RateSetting = { sdg_per_usdt: number | null; band_pct: number };
export function priceRange(r: RateSetting): { min: number; max: number } | null {
  if (!r || !r.sdg_per_usdt || r.sdg_per_usdt <= 0) return null;
  const band = Math.min(Math.max(Number(r.band_pct) || 0, 0), 50) / 100;
  return { min: Math.round(r.sdg_per_usdt * (1 - band) * 100) / 100, max: Math.round(r.sdg_per_usdt * (1 + band) * 100) / 100 };
}
export function checkPrice(price: number, r: RateSetting) {
  const range = priceRange(r);
  if (!range) throw new Error('RATE_NOT_SET');
  if (price < range.min || price > range.max) throw new Error('PRICE_OUT_OF_RANGE');
}
export function validateRateSetting(p: Record<string, unknown>): RateSetting {
  const rate = Number(p.sdg_per_usdt), band = Number(p.band_pct);
  if (!isFinite(rate) || rate <= 0 || rate > 10000000) throw new Error('BAD_RATE');
  if (![1, 2, 3, 5, 10].includes(band)) throw new Error('BAD_BAND');
  return { sdg_per_usdt: Math.round(rate * 100) / 100, band_pct: band };
}

// اسم تلقائي في السوق حتى لا نسأل المستخدم قبل أول عملية
export function defaultNickname(address: string): string {
  return 'مستخدم-' + address.slice(-4);
}

// ===== حدود منع السبام (العدد، والمدة بالثواني) =====
export const LIMITS: Record<string, [number, number]> = {
  req: [60, 60],              // 60 طلباً في الدقيقة لكل محفظة
  offer_create: [5, 86400],   // 5 إعلانات في اليوم
  order_create: [10, 86400],  // 10 طلبات شراء في اليوم
  order_cancel: [5, 86400],   // 5 إلغاءات في اليوم
  message: [30, 3600],        // 30 رسالة في الساعة
  profile: [5, 86400],        // 5 تغييرات اسم في اليوم
  verify: [3, 86400],         // 3 طلبات توثيق في اليوم
  phone_lookup: [30, 86400]   // 30 بحثاً برقم هاتف في اليوم (يمنع تجربة آلاف الأرقام)
};
export const MAX_ACTIVE_OFFERS = 3;

// ===== التوثيق (KYC) =====
export function validateKyc(p: Record<string, unknown>) {
  const full_name = String(p.full_name || '').trim().replace(/\s+/g, ' ');
  const phone = String(p.phone || '').replace(/[\s-]/g, '').replace(/^\+?249/, '0');
  const bankak_account = String(p.bankak_account || '').replace(/\s/g, '');
  if (full_name.length < 6 || full_name.split(' ').length < 2 || full_name.length > 60) throw new Error('BAD_FULL_NAME');
  if (!/^0\d{9}$/.test(phone)) throw new Error('BAD_PHONE');
  if (!/^\d{4,30}$/.test(bankak_account)) throw new Error('BAD_BANKAK_ACCOUNT');
  const img = String(p.id_image || '');
  const m = img.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('BAD_ID_IMAGE');
  const bytes = Math.floor(m[1].length * 3 / 4);
  if (bytes < 15000 || bytes > 600000) throw new Error('BAD_ID_IMAGE');
  return { full_name, phone, bankak_account, image_b64: m[1] };
}
export function maskAccount(a: string | null | undefined): string {
  if (!a) return '';
  return '••••' + a.slice(-4);
}

// ===== رصيد البائع على الشبكة =====
export const SELLER_MIN_TRX_SUN = 15000000n; // 15 TRX لرسوم إيداع الضمان
export function checkSellerFunds(usdtMicro: bigint, trxSun: bigint, needUsdt: string | number) {
  if (usdtMicro < toMicro(needUsdt)) throw new Error('INSUFFICIENT_SELLER_USDT');
  if (trxSun < SELLER_MIN_TRX_SUN) throw new Error('SELLER_NEEDS_TRX');
}

// نسبة الإتمام على طريقة Binance: المكتملة ÷ (المكتملة + الإلغاءات)
export function completionRate(completed: number, cancels: number): number | null {
  const total = completed + cancels;
  if (!total) return null;
  return Math.round(completed / total * 1000) / 10;
}

// من الطرف الذي يأخذ الإعلان؟ إعلان بيع ← الآخذ مشترٍ، إعلان شراء ← الآخذ بائع
export function orderParties(offer: { seller: string; side?: string }, taker: string) {
  return offer.side === 'buy' ? { seller: taker, buyer: offer.seller } : { seller: offer.seller, buyer: taker };
}

// رسوم شبكة OxaPay الثابتة لكل إرسال (Payout TRC20 = 1 USDT حسب صفحة الأسعار)
// يدفعها المشتري مع العمولة عند التحرير، ويُخصم من المبلغ المُعاد للبائع عند الإلغاء بعد الإيداع
export function tradeFee(amount: string | number, bps: number, netFee: string | number): string {
  return fromMicro(toMicro(feeFor(amount, bps)) + toMicro(netFee));
}
export function refundAmount(amount: string | number, netFee: string | number): string {
  const r = toMicro(amount) - toMicro(netFee);
  if (r <= 0n) throw new Error('FEE_TOO_HIGH');
  return fromMicro(r);
}

// ===== الإرسال برقم الهاتف =====
// يقبل 0912345678 أو +249912345678 أو 249 912 345 678 والأرقام العربية، ويعيد الصيغة المحلية 0XXXXXXXXX
export function normalizePhone(v: unknown): string {
  const s = String(v ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/[\s\-()]/g, '').replace(/^00/, '+');
  const n = s.replace(/^\+?249/, '0');
  if (!/^0\d{9}$/.test(n)) throw new Error('BAD_PHONE');
  return n;
}
// "محمد أحمد علي" ← "محمد أ•••" : يكفي ليتأكد المرسل، ولا يكشف الاسم كاملاً
export function maskName(full: string | null | undefined): string {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '•••';
  return parts[0] + (parts[1] ? ' ' + parts[1].charAt(0) + '•••' : '');
}
export function maskPhone(p: string | null | undefined): string {
  const s = String(p || '');
  return s.length >= 7 ? s.slice(0, 3) + '•••' + s.slice(-3) : '';
}

// الإيداع يُقبل فقط إن طابق الطلب: الحالة مدفوعة، والعملة USDT، والمبلغ لا يقل عن مبلغ الصفقة، ورقم الطلب نفسه
export function paymentMatches(info: Record<string, any> | null | undefined, order: { id: string; amount_usdt: string | number }): boolean {
  if (!info || !isPaidStatus(info.status)) return false;
  if (info.order_id && String(info.order_id) !== String(order.id)) return false;
  const cur = String(info.currency || 'USDT').toUpperCase();
  if (cur !== 'USDT') return false;
  const amt = Number(info.amount);
  if (!isFinite(amt) || amt + 0.000001 < Number(order.amount_usdt)) return false;
  return true;
}

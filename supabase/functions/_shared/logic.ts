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
  return {
    price_sdg: Math.round(price * 100) / 100,
    min_usdt: fromMicro(toMicro(min.toFixed(6))), max_usdt: fromMicro(toMicro(max.toFixed(6))),
    available_usdt: fromMicro(toMicro(amount.toFixed(6))),
    bankak_name: name, bankak_account: acct, pay_window_min: win
  };
}

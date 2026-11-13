// منطق بوابة الدفع للتجار (بلا شبكة ولا قاعدة بيانات) — يُختبر في test/pay-logic.test.ts
//
// الفكرة: بوابة غير احتجازية. العميل يدفع USDT مباشرة إلى عنوان التاجر، ونحن نراقب الشبكة ونؤكد الدفع.
// نربط التحويل بالفاتورة عن طريق «مبلغ فريد»: نضيف كسراً صغيراً عشوائياً (أقل من سنت) إلى المبلغ،
// فلا توجد فاتورتان معلّقتان بنفس (الشبكة، العنوان، المبلغ) في الوقت نفسه.
import { TRANSFER, addrOfTopic, tronToHex20 } from '../push-watch/logic.ts';

// كل المبالغ الداخلية بوحدة micro-USDT (6 خانات) مهما كانت خانات التوكن على الشبكة
export const NETS: Record<string, { name: string; token: string; dec: number; conf: number; cap: number; kind: 'tron' | 'evm' }> = {
  tron: { name: 'TRON (TRC20)', token: '0xa614f803b6fd780986a42c78ec9c7f77e6ded13c', dec: 6, conf: 3, cap: 200, kind: 'tron' },
  bsc: { name: 'BNB Chain (BEP20)', token: '0x55d398326f99059ff775485246999027b3197955', dec: 18, conf: 5, cap: 400, kind: 'evm' },
  polygon: { name: 'Polygon', token: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', dec: 6, conf: 20, cap: 300, kind: 'evm' },
  eth: { name: 'Ethereum (ERC20)', token: '0xdac17f958d2ee523a2206206994597c13d831ec7', dec: 6, conf: 3, cap: 60, kind: 'evm' }
};
export const MIN_UNITS = 1_000_000n;          // أقل فاتورة: 1 USDT
export const MAX_UNITS = 100_000_000_000n;    // أكبر فاتورة: 100,000 USDT
export const TAIL_MAX = 9999;                 // الكسر الفريد: حتى 0.009999 USDT

// "12.5" → 12500000n. نقبل حتى خانتين عشريتين (الكسر الأصغر محجوز للمبلغ الفريد)
export function parseAmount(v: unknown): bigint {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) throw new Error('BAD_AMOUNT');
  const [w, f = ''] = s.split('.');
  const u = BigInt(w) * 1_000_000n + BigInt((f + '00').slice(0, 2)) * 10_000n;
  if (u < MIN_UNITS) throw new Error('AMOUNT_TOO_SMALL');
  if (u > MAX_UNITS) throw new Error('AMOUNT_TOO_LARGE');
  return u;
}
export function fmtUnits(u: bigint | number | string): string {
  const n = BigInt(u), w = n / 1_000_000n, f = (n % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return w.toString() + (f ? '.' + f : '');
}
// المبلغ الذي يدفعه العميل بالضبط = المبلغ + كسر فريد (1…9999 micro)
export function exactUnits(amount: bigint, tail: number): bigint {
  if (!Number.isInteger(tail) || tail < 1 || tail > TAIL_MAX) throw new Error('BAD_TAIL');
  return amount + BigInt(tail);
}
// قيمة التحويل الخام على الشبكة → micro-USDT، أو null إن كان فيها كسور أدق من 6 خانات (لا تطابق أي فاتورة)
export function rawToUnits(raw: bigint, dec: number): bigint | null {
  if (dec === 6) return raw;
  const k = 10n ** BigInt(dec - 6);
  return raw % k === 0n ? raw / k : null;
}
// عمولتنا على الفاتورة المدفوعة: نسبة بحد أدنى
export function feeUnits(amount: bigint, bps: number, minUnits: bigint): bigint {
  const f = amount * BigInt(Math.max(0, Math.round(bps))) / 10_000n;
  return f < minUnits ? minUnits : f;
}

export function isEvmAddr(a: unknown): a is string { return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a); }
// مفتاح المطابقة: 20 بايت hex صغيرة لأي عنوان (TRON أو EVM)، أو null إن كان العنوان لا يخص الشبكة
export function matchHex(net: string, addr: unknown): string | null {
  const n = NETS[net]; if (!n || typeof addr !== 'string') return null;
  if (n.kind === 'tron') return tronToHex20(addr);
  return isEvmAddr(addr) ? addr.slice(2).toLowerCase() : null;
}

export type Pending = { id: string; match_hex: string; exact: string | number | bigint };
export type Hit = { id: string; tx: string; key: string; from: string };
// يطابق سجلات Transfer مع الفواتير المعلّقة على شبكة واحدة. كل فاتورة تُطابَق مرة واحدة، وكل تحويل يسدد فاتورة واحدة
export function matchLogs(net: string, logs: any[], pending: Pending[]): Hit[] {
  const n = NETS[net]; if (!n) return [];
  const norm = (a: string) => { a = String(a || '').toLowerCase(); return a.length === 44 && a.startsWith('0x41') ? '0x' + a.slice(4) : a; };
  const idx = new Map<string, string>(); // "hex:units" → invoice id
  for (const p of pending) idx.set(p.match_hex + ':' + BigInt(p.exact).toString(), p.id);
  const out: Hit[] = [], seen = new Set<string>();
  for (const l of logs || []) {
    if (!l || l.removed || !Array.isArray(l.topics) || l.topics.length < 3 || String(l.topics[0]).toLowerCase() !== TRANSFER) continue;
    if (norm(l.address) !== n.token) continue; // توكن آخر باسم مشابه لا يُحتسب
    let raw: bigint; try { raw = BigInt(l.data && l.data !== '0x' ? l.data : '0x0'); } catch { continue; }
    const units = rawToUnits(raw, n.dec); if (units == null) continue;
    const k = addrOfTopic(l.topics[2]) + ':' + units.toString(), id = idx.get(k); if (!id) continue;
    const tx = String(l.transactionHash || ''), key = tx + ':' + String(l.logIndex ?? ''); if (!tx || seen.has(key)) continue;
    seen.add(key); idx.delete(k); // الفاتورة سُدّدت: تحويل ثانٍ بالمبلغ نفسه لا يسددها مرتين
    out.push({ id, tx, key, from: addrOfTopic(l.topics[1]) });
  }
  return out;
}

// ===== رابط الإشعار (Webhook) =====
// نمنع العناوين الداخلية كي لا يُستخدم خادمنا للوصول إلى شبكات خاصة (SSRF)
export function safeWebhookUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 300) return null;
  let u: URL; try { u = new URL(v.trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h.endsWith('.local') || h.endsWith('.internal') || h === 'localhost') return null;
  if (/^\[|^\d+\.\d+\.\d+\.\d+$/.test(h) || /^[0-9.]+$/.test(h)) return null; // عناوين IP مباشرة مرفوضة
  if (u.port && u.port !== '443') return null;
  return u.toString();
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(s: string): Promise<string> { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
export async function hmacHex(secret: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
// ترويسة التوقيع: X-Sarra-Signature: t=<ثوانٍ>,v1=<HMAC-SHA256(secret, t + "." + body)>
export async function signWebhook(secret: string, body: string, tsSec: number): Promise<string> {
  return 't=' + tsSec + ',v1=' + await hmacHex(secret, tsSec + '.' + body);
}
// مهلة إعادة المحاولة بعد الفشل رقم n (بالدقائق)، أو null لإيقاف المحاولات
export function hookBackoffMin(attempts: number): number | null {
  return [1, 5, 15, 60, 180, 720][attempts - 1] ?? null;
}

export function randHex(bytes: number): string { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map((x) => x.toString(16).padStart(2, '0')).join(''); }
export const newInvoiceId = () => 'inv_' + randHex(10);
export const newApiKey = (test = false) => (test ? 'sk_test_' : 'sk_live_') + randHex(24);
export const newHookSecret = () => 'whsec_' + randHex(24);
export const randTail = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % TAIL_MAX);

export type InvoiceRow = { id: string; kind: string; network: string; address: string; amount: string | number; exact: string | number; fee: string | number; order_id: string | null; description: string | null; status: string; tx: string | null; paid_at: string | null; expires_at: string; created_at: string; test?: boolean };
// شكل الفاتورة في الـ API (للتاجر) وفي صفحة الدفع (للعميل)
export function invoiceView(r: InvoiceRow, payBase: string, now: number, forMerchant = true) {
  const late = r.status === 'pending' && now > Date.parse(r.expires_at);
  const v: Record<string, unknown> = {
    id: r.id, status: late ? 'expired' : r.status, network: r.network, network_name: NETS[r.network]?.name || r.network, currency: 'USDT',
    amount: fmtUnits(r.amount), pay_amount: fmtUnits(r.exact), address: r.address,
    description: r.description, tx: r.tx, paid_at: r.paid_at, expires_at: r.expires_at, created_at: r.created_at,
    pay_url: payBase + '?i=' + r.id, test: !!r.test
  };
  if (forMerchant) { v.order_id = r.order_id; v.fee = fmtUnits(r.fee); v.kind = r.kind; }
  return v;
}

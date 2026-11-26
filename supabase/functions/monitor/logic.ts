// منطق التنبيه (بلا شبكة) — يُختبر في test/monitor-logic.test.ts
// الشروط من تقرير المراجعة: تأخر الماسح أو توقفه، وطلبات P2P عالقة أو فشل تحريرها/إعادتها.
export type ScanRow = { chain: string; updated_at: string };
export type OrderRow = { id: string; status: string; updated_at: string };
export const STALE_SCAN_MIN = 3;          // الماسح لم يحدّث شبكة منذ 3 دقائق = متوقف
export const STUCK_ORDER_H = 6;           // طلب في حالة وسيطة أكثر من 6 ساعات
export const FAILED = ['release_failed', 'refund_failed', 'late_deposit_refund_failed'];
export const OPEN = ['awaiting_deposit', 'paying', 'funded', 'paid', 'disputed'];

export function alerts(now: number, scans: ScanRow[], orders: OrderRow[]): string[] {
  const out: string[] = [], min = (t: string) => Math.round((now - Date.parse(t)) / 60000);
  for (const s of scans) { const m = min(s.updated_at); if (m >= STALE_SCAN_MIN) out.push('⛔ ماسح الإشعارات متوقف على ' + s.chain + ' منذ ' + m + ' دقيقة'); }
  const failed = orders.filter((o) => FAILED.includes(o.status));
  if (failed.length) out.push('🚨 ' + failed.length + ' طلب P2P بحالة فشل: ' + failed.slice(0, 5).map((o) => o.id.slice(0, 8) + ' (' + o.status + ')').join('، '));
  const stuck = orders.filter((o) => OPEN.includes(o.status) && min(o.updated_at) >= STUCK_ORDER_H * 60);
  if (stuck.length) out.push('⏳ ' + stuck.length + ' طلب P2P عالق أكثر من ' + STUCK_ORDER_H + ' ساعات: ' + stuck.slice(0, 5).map((o) => o.id.slice(0, 8) + ' (' + o.status + ')').join('، '));
  return out;
}
// لا نكرر نفس التنبيه كل دقيقة: بصمة النص تُحفظ، ويُعاد الإرسال بعد ساعة إن استمرت المشكلة
export function due(msg: string, sent: Record<string, number>, now: number, everyMs = 3600000): boolean {
  const k = msg.replace(/\d+/g, '#'); return !(sent[k] && now - sent[k] < everyMs);
}
export const keyOf = (msg: string) => msg.replace(/\d+/g, '#');

// مقارنة ثابتة الزمن لسر الجدولة: لا تكشف مدة المقارنة كم حرفاً صحيحاً. السر يجب أن يكون 32 حرفاً على الأقل
export function secretOk(given: string | null, secret: string): boolean {
  if (!secret || secret.length < 32 || typeof given !== 'string') return false;
  const a = new TextEncoder().encode(given), b = new TextEncoder().encode(secret);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i % (a.length || 1)] ?? 0) ^ b[i];
  return diff === 0 && a.length === b.length;
}

// ===== الاحتفاظ بالبيانات: تنظيف يومي (180 يوماً) =====
export const RETAIN_DAYS = 180;
export const CLOSED = ['released', 'cancelled', 'refunded'];
// مرة كل 24 ساعة على الأكثر (الدالة تُستدعى كل 5 دقائق)
export function purgeDue(lastAt: string | undefined, now: number): boolean {
  const t = Number(lastAt || 0); return !(t > 0) || now - t >= 24 * 3600000;
}

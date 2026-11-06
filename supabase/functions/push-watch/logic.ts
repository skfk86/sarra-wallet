// منطق ماسح الإشعارات (بلا شبكة) — يُختبر في test/push-logic.test.ts
export const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// عنوان TRON (T…) ← 20 بايت بصيغة hex صغيرة (بدون البادئة 41)
export function tronToHex20(addr: string): string | null {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return null;
  let n = 0n;
  for (const ch of addr) { const i = B58.indexOf(ch); if (i < 0) return null; n = n * 58n + BigInt(i); }
  let hex = n.toString(16); while (hex.length < 50) hex = '0' + hex; // 25 بايت: 1 بادئة + 20 + 4 تحقق
  if (!hex.startsWith('41')) return null;
  return hex.slice(2, 42);
}
export function hex20ToTron(h: string): string {
  const body = '41' + h.toLowerCase().replace(/^0x/, '').padStart(40, '0');
  return body; // للعرض داخلياً فقط؛ المطابقة تتم بالـ hex
}
export const topicOf = (hex20: string) => '0x' + '0'.repeat(24) + hex20.toLowerCase().replace(/^0x/, '');
export const addrOfTopic = (t: string) => String(t || '').toLowerCase().slice(-40);

export function fmtUnits(raw: bigint, dec: number): string {
  const neg = raw < 0n; let v = neg ? -raw : raw;
  const base = 10n ** BigInt(dec), w = v / base, f = (v % base).toString().padStart(dec, '0').slice(0, 6).replace(/0+$/, '');
  return (neg ? '-' : '') + w.toLocaleString('en-US') + (f ? '.' + f : '');
}

export type Tok = { sym: string; addr: string; dec: number };
export type Ev = { kind: 'in' | 'out'; chain: string; sym: string; amount: string; hex: string; tx: string; key: string };

// يحوّل سجلات Transfer إلى أحداث لعناويننا فقط. ours: hex20 → true
export function eventsFromLogs(chain: string, logs: any[], toks: Tok[], ours: Set<string>, minRaw: (t: Tok) => bigint): Ev[] {
  // عناوين TRON في JSON-RPC قد تأتي 0x41… (21 بايت): نوحّدها إلى 20 بايت
  const norm = (a: string) => { a = String(a || '').toLowerCase(); return a.length === 44 && a.startsWith('0x41') ? '0x' + a.slice(4) : a; };
  const byAddr = new Map(toks.map((t) => [norm(t.addr), t]));
  const out: Ev[] = [], seen = new Set<string>();
  for (const l of logs || []) {
    if (!l || !Array.isArray(l.topics) || l.topics[0]?.toLowerCase() !== TRANSFER || l.topics.length < 3) continue;
    const t = byAddr.get(norm(l.address)); if (!t) continue;
    let v: bigint; try { v = BigInt(l.data && l.data !== '0x' ? l.data : '0x0'); } catch { continue; }
    if (v < minRaw(t)) continue; // غبار وتسميم عناوين
    const from = addrOfTopic(l.topics[1]), to = addrOfTopic(l.topics[2]), tx = String(l.transactionHash || ''), key = tx + ':' + String(l.logIndex ?? '');
    if (seen.has(key)) continue; seen.add(key);
    const amount = fmtUnits(v, t.dec);
    if (ours.has(to)) out.push({ kind: 'in', chain, sym: t.sym, amount, hex: to, tx, key });
    if (ours.has(from) && from !== to) out.push({ kind: 'out', chain, sym: t.sym, amount, hex: from, tx, key: key + ':o' });
  }
  return out;
}

// نطاق الكتل لهذه الدورة: نلحق بالتأخر على دفعات، ونقفز إن كان التأخر كبيراً جداً (انقطاع طويل)
export function blockRange(last: number | null, latest: number, cap: number, jumpAfter: number): [number, number] | null {
  if (!(latest > 0)) return null;
  if (last == null || latest - last > jumpAfter) return [latest, latest];
  if (latest <= last) return null;
  return [last + 1, Math.min(latest, last + cap)];
}

export const NET_NAME: Record<string, string> = { tron: 'TRON (TRC20)', bsc: 'BNB Chain (BEP20)', polygon: 'Polygon', eth: 'Ethereum (ERC20)' };
export function message(e: Ev): { title: string; body: string } {
  return e.kind === 'in'
    ? { title: 'وصلتك تحويلة', body: 'استلمت +' + e.amount + ' ' + e.sym + ' على ' + NET_NAME[e.chain] }
    : { title: 'خرج مبلغ من محفظتك', body: e.amount + ' ' + e.sym + ' على ' + NET_NAME[e.chain] + '. إن لم تكن أنت فاحمِ محفظتك فوراً.' };
}

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
// fromSarra: المرسِل عنوان مسجّل في صُرّة (تحويل بين مستخدمي صُرّة)؛ لا نكشف هويته أبداً
// self: المعاملة أرسلها عنوانك أنت (تبديل/نقل/إرسال من جهازك)؛ undefined = لم نتمكن من التحقق
export type Ev = { kind: 'in' | 'out'; chain: string; sym: string; amount: string; hex: string; tx: string; key: string; self?: boolean; fromSarra?: boolean };

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
    if (ours.has(to)) out.push({ kind: 'in', chain, sym: t.sym, amount, hex: to, tx, key, fromSarra: ours.has(from) && from !== to });
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
// هل أرسل عنوانُنا المعاملة؟ (from المعاملة = hex20 للمحفظة). تعذّر القراءة ← undefined فلا نخمّن
export function senderIsUs(txFrom: unknown, hex: string): boolean | undefined {
  const f = String(txFrom || '').toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40,42}$/.test(f)) return undefined;
  return f.slice(-40) === hex.toLowerCase().replace(/^0x/, '');
}
const shortTx = (t: string) => t ? ' · ' + t.slice(0, 8) + '…' + t.slice(-6) : '';
// نص الإشعار حسب أصل العملية: التحذير الأمني فقط لخصم لم تبدأه أنت، وأثر عملياتك يُوصف بما هو عليه
export function message(e: Ev): { title: string; body: string } {
  const net = NET_NAME[e.chain], amt = e.amount + ' ' + e.sym;
  if (e.kind === 'in') {
    return e.self === true
      ? { title: 'اكتملت عمليتك', body: 'وصلك +' + amt + ' على ' + net + ' نتيجة عملية أجريتها من محفظتك' + shortTx(e.tx) }
      : e.fromSarra ? { title: 'وصلتك تحويلة داخلية', body: 'وصلك +' + amt + ' على ' + net + ' من مستخدم صُرّة' }
      : { title: 'وصلتك تحويلة', body: 'استلمت +' + amt + ' على ' + net };
  }
  if (e.self === true) return { title: 'تم إرسال مبلغ', body: 'أُرسلت ' + amt + ' من محفظتك على ' + net + shortTx(e.tx) };
  if (e.self === false) return { title: 'خرج مبلغ من محفظتك', body: amt + ' على ' + net + ' بمعاملة لم تبدأها أنت. إن لم تكن تعرفها فاحمِ محفظتك فوراً' + shortTx(e.tx) + '.' };
  return { title: 'خرج مبلغ من محفظتك', body: amt + ' على ' + net + '. إن لم تكن أنت فاحمِ محفظتك فوراً' + shortTx(e.tx) + '.' };
}

// ===== إشعارات P2P: حالة الطلب الجديدة ← من يُبلَّغ وبماذا (تصل والتطبيق مغلق) =====
export type P2POrder = { id: string; status: string; buyer: string; seller: string; amount_usdt: number | string; total_sdg: number | string };
export type P2PPush = { to: string; title: string; body: string; order: string; tag: string };
const n2 = (v: unknown) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
export function p2pStatusPushes(o: P2POrder, admins: string[]): P2PPush[] {
  const u = n2(o.amount_usdt) + ' USDT', sdg = n2(o.total_sdg) + ' ج.س', mk = (to: string, title: string, body: string) => ({ to, title, body, order: o.id, tag: 'p2p-' + o.id });
  switch (o.status) {
    case 'awaiting_deposit': return [mk(o.seller, 'طلب P2P جديد', 'مشترٍ طلب ' + u + '. أودعها في الضمان ليبدأ الطلب قبل انتهاء المهلة.')];
    case 'funded': return [mk(o.buyer, 'حُجزت ' + u + ' لك', 'حوّل ' + sdg + ' عبر بنكك إلى حساب البائع، ثم اضغط «حوّلت المبلغ».')];
    case 'paid': return [mk(o.seller, 'المشتري أكّد التحويل', 'يقول إنه حوّل ' + sdg + '. تأكد من وصولها في تطبيق بنكك قبل التحرير.')];
    case 'disputed': return [mk(o.buyer, 'فُتح نزاع على طلبك', 'المشرف يراجع الطلب. USDT محفوظة في الضمان حتى القرار.'), mk(o.seller, 'فُتح نزاع على طلبك', 'المشرف يراجع الطلب. USDT محفوظة في الضمان حتى القرار.'),
      ...admins.map((a) => mk(a, 'نزاع جديد يحتاج مراجعة', 'طلب ' + u + ' / ' + sdg))];
    case 'released': return [mk(o.buyer, 'وصلتك ' + u, 'اكتملت صفقة P2P، والعملة في محفظتك.'), mk(o.seller, 'اكتملت الصفقة', 'أُرسلت ' + u + ' للمشتري.')];
    case 'refunded': return [mk(o.seller, 'أُعيدت USDT إليك', 'أُعيد مبلغ الضمان إلى محفظتك (بعد رسوم الشبكة).')];
    case 'cancelled': return [mk(o.buyer, 'أُلغي الطلب', 'أُلغي طلب ' + u + '.'), mk(o.seller, 'أُلغي الطلب', 'أُلغي طلب ' + u + '.')];
    case 'release_failed': case 'refund_failed': return admins.map((a) => mk(a, 'دفعة فاشلة تحتاج تدخلاً', 'طلب ' + u + ': ' + (o.status === 'release_failed' ? 'تعذّر التحرير' : 'تعذّر الاسترداد')));
    default: return [];
  }
}
// رسائل المحادثة الجديدة: إشعار واحد لكل طلب ولكل مستلم في الدورة (لا سيل إشعارات)
export function p2pMessagePushes(msgs: { order_id: string; sender: string; body: string }[], orders: Record<string, P2POrder>): P2PPush[] {
  const out = new Map<string, P2PPush & { n: number }>();
  for (const m of msgs) {
    const o = orders[m.order_id]; if (!o) continue;
    const sys = String(m.body).startsWith('📎');
    for (const to of [o.buyer, o.seller]) {
      if (to === m.sender) continue;
      const who = m.sender === o.buyer ? 'المشتري' : m.sender === o.seller ? 'البائع' : 'المشرف';
      const k = o.id + ':' + to, prev = out.get(k), txt = sys ? 'رفع المشتري إيصال التحويل' : String(m.body).slice(0, 90);
      if (prev) { prev.n++; prev.body = prev.n + ' رسائل جديدة. آخرها: ' + txt; }
      else out.set(k, { to, title: 'رسالة من ' + who, body: txt, order: o.id, tag: 'p2pm-' + o.id, n: 1 });
    }
  }
  return [...out.values()].map(({ n: _n, ...p }) => p);
}

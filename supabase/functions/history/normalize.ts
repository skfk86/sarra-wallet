// تحويل ردود مزوّدي السجل (Moralis وEtherscan) إلى صيغة موحّدة صغيرة تعرضها الواجهة:
// { h: hash, k: 'native'|'token', c?: عقد التوكن, from, to, v: القيمة الخام, t: ثوانٍ, ok }
// الواجهة (core.evmHistoryItems) تهمل التوكنات غير المعروفة، وهنا نهمل السبام المعلَّم أيضاً.
export type Item = { h: string; k: 'native' | 'token'; c?: string; from: string; to: string; v: string; t: number; ok: boolean };
const lc = (x: unknown) => String(x ?? '').toLowerCase();
const isHash = (h: unknown) => typeof h === 'string' && /^0x[0-9a-fA-F]{64}$/.test(h);
const isUint = (v: unknown) => typeof v === 'string' && /^\d+$/.test(v);

export function fromMoralis(me: string, result: any[]): Item[] {
  const out: Item[] = [];
  const addr = lc(me);
  for (const r of result || []) {
    if (!r || !isHash(r.hash) || r.possible_spam === true) continue;
    const t = Math.floor(Date.parse(r.block_timestamp) / 1000);
    if (!isFinite(t)) continue;
    const ok = String(r.receipt_status ?? '1') !== '0';
    for (const n of r.native_transfers || []) {
      if (!isUint(n.value) || n.value === '0') continue;
      const from = lc(n.from_address), to = lc(n.to_address);
      if (from !== addr && to !== addr) continue;
      out.push({ h: r.hash, k: 'native', from, to, v: n.value, t, ok });
    }
    for (const e of r.erc20_transfers || []) {
      if (e.possible_spam === true || !isUint(e.value) || e.value === '0') continue;
      const from = lc(e.from_address), to = lc(e.to_address);
      if (from !== addr && to !== addr) continue;
      out.push({ h: r.hash, k: 'token', c: lc(e.address), from, to, v: e.value, t, ok });
    }
  }
  out.sort((a, b) => b.t - a.t);
  return out.slice(0, 80);
}

export function fromEtherscan(_me: string, native: any[], tokens: any[]): Item[] {
  const out: Item[] = [];
  for (const t of native || []) {
    if (t.value === '0' && t.input && t.input !== '0x') continue; // استدعاء عقد بلا تحويل
    out.push({ h: t.hash, k: 'native', from: lc(t.from), to: lc(t.to), v: t.value, t: Number(t.timeStamp), ok: t.isError === '0' });
  }
  for (const t of tokens || []) {
    out.push({ h: t.hash, k: 'token', c: lc(t.contractAddress), from: lc(t.from), to: lc(t.to), v: t.value, t: Number(t.timeStamp), ok: true });
  }
  out.sort((a, b) => b.t - a.t);
  return out.slice(0, 80);
}

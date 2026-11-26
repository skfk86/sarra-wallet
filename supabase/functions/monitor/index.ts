// تنبيه آلي للمطوّر على تيليغرام (تقرير المراجعة: «المراقبة والتنبيه»). تستدعيه الجدولة كل 5 دقائق بترويسة x-cron.
// الأسرار: TELEGRAM_BOT_TOKEN وTELEGRAM_CHAT_ID يضيفها المطوّر بنفسه. بدونها تُرجع الدالة التنبيهات فقط ولا ترسل.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import * as L from './logic.ts';

const env = (k: string) => (Deno.env.get(k) ?? '').trim();
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const { data: cfg } = await db.from('push_cfg').select('k,v').in('k', ['cron_secret', 'monitor_sent', 'purge_at']);
  const get = (k: string) => (cfg || []).find((r) => r.k === k)?.v || '';
  if (!L.secretOk(req.headers.get('x-cron'), get('cron_secret'))) return new Response('forbidden', { status: 403 });
  const now = Date.now();
  const [{ data: scans }, { data: orders }] = await Promise.all([
    db.from('push_state').select('chain,updated_at'),
    db.from('orders').select('id,status,updated_at').in('status', [...L.FAILED, ...L.OPEN]).limit(500)
  ]);
  const list = L.alerts(now, scans || [], orders || []);
  let sent: Record<string, number> = {}; try { sent = JSON.parse(get('monitor_sent') || '{}'); } catch { /* */ }
  const fresh = list.filter((m) => L.due(m, sent, now));
  const tok = env('TELEGRAM_BOT_TOKEN'), chat = env('TELEGRAM_CHAT_ID');
  if (fresh.length && tok && chat) {
    const r = await fetch('https://api.telegram.org/bot' + tok + '/sendMessage', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: 'صُرّة — تنبيه\n' + fresh.join('\n') }), signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (r && r.ok) { for (const m of fresh) sent[L.keyOf(m)] = now; await db.from('push_cfg').upsert({ k: 'monitor_sent', v: JSON.stringify(sent) }); }
  }
  // تنظيف يومي: صور إيصالات الطلبات المنتهية منذ 180 يوماً من المخزن أولاً، ثم sarra_purge (ترحيل 028).
  // أي فشل لا يوقف التنبيهات، ويُعاد في الدورة التالية لأن purge_at لا يُحدَّث إلا بعد نجاح الخطوتين
  let purge: unknown = null;
  if (L.purgeDue(get('purge_at'), now)) {
    try {
      const cut = new Date(now - L.RETAIN_DAYS * 864e5).toISOString(); let files = 0;
      const { data: old } = await db.from('orders').select('id').in('status', L.CLOSED).lt('updated_at', cut).limit(1000);
      const ids = (old || []).map((o) => o.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { data: rec } = await db.from('order_receipts').select('path').in('order_id', ids.slice(i, i + 100));
        const paths = (rec || []).map((r) => r.path);
        if (!paths.length) continue;
        const { error } = await db.storage.from('receipts').remove(paths); if (error) throw error;
        await db.from('order_receipts').delete().in('path', paths); files += paths.length;
      }
      const { data: res, error } = await db.rpc('sarra_purge', { p_days: L.RETAIN_DAYS }); if (error) throw error;
      purge = { receipts: files, ...(res as Record<string, number>) };
      await db.from('push_cfg').upsert({ k: 'purge_at', v: String(now) });
    } catch (e) { purge = { error: String((e as Error)?.message || e).slice(0, 160) }; }
  }
  return Response.json({ purge, alerts: list, sent: fresh.length && tok && chat ? fresh.length : 0 });
});

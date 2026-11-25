// تنبيه آلي للمطوّر على تيليغرام (تقرير المراجعة: «المراقبة والتنبيه»). تستدعيه الجدولة كل 5 دقائق بترويسة x-cron.
// الأسرار: TELEGRAM_BOT_TOKEN وTELEGRAM_CHAT_ID يضيفها المطوّر بنفسه. بدونها تُرجع الدالة التنبيهات فقط ولا ترسل.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import * as L from './logic.ts';

const env = (k: string) => (Deno.env.get(k) ?? '').trim();
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const { data: cfg } = await db.from('push_cfg').select('k,v').in('k', ['cron_secret', 'monitor_sent']);
  const get = (k: string) => (cfg || []).find((r) => r.k === k)?.v || '';
  if (!get('cron_secret') || req.headers.get('x-cron') !== get('cron_secret')) return new Response('forbidden', { status: 403 });
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
  return Response.json({ alerts: list, sent: fresh.length && tok && chat ? fresh.length : 0 });
});

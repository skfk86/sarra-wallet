import assert from 'node:assert/strict';
import * as L from '../supabase/functions/monitor/logic.ts';
const now = Date.parse('2026-11-25T12:00:00Z'), ago = (m: number) => new Date(now - m * 60000).toISOString();
let n = 0; const t = (name: string, f: () => void) => { f(); n++; console.log('✓ ' + name); };
t('الماسح السليم والطلبات الحديثة: لا تنبيه', () => {
  assert.deepEqual(L.alerts(now, [{ chain: 'bsc', updated_at: ago(1) }], [{ id: 'a'.repeat(36), status: 'paid', updated_at: ago(30) }]), []);
});
t('ماسح متوقف + طلب فشل تحريره + طلب عالق', () => {
  const a = L.alerts(now, [{ chain: 'tron', updated_at: ago(10) }], [{ id: 'f1234567xx', status: 'release_failed', updated_at: ago(1) }, { id: 's1234567xx', status: 'funded', updated_at: ago(7 * 60) }]);
  assert.equal(a.length, 3); assert.match(a[0], /tron منذ 10/); assert.match(a[1], /f1234567/); assert.match(a[2], /s1234567/);
});
t('لا يتكرر نفس التنبيه قبل ساعة ولو تغيّر العدد', () => {
  const sent = { [L.keyOf('⛔ ماسح الإشعارات متوقف على tron منذ 10 دقيقة')]: now - 60000 };
  assert.equal(L.due('⛔ ماسح الإشعارات متوقف على tron منذ 11 دقيقة', sent, now), false);
  assert.equal(L.due('⛔ ماسح الإشعارات متوقف على tron منذ 70 دقيقة', sent, now + 3600000), true);
});
t('سر الجدولة: مطابقة تامة فقط، ورفض السر القصير أو الفارغ', () => {
  const sec = 'a'.repeat(64);
  assert.equal(L.secretOk(sec, sec), true); assert.equal(L.secretOk(sec.slice(0, 63) + 'b', sec), false);
  assert.equal(L.secretOk(sec + 'a', sec), false); assert.equal(L.secretOk('', sec), false); assert.equal(L.secretOk(null, sec), false);
  assert.equal(L.secretOk('short', 'short'), false);
});
t('التنظيف اليومي: مرة كل 24 ساعة، والحالات المغلقة فقط', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  assert.equal(L.purgeDue(undefined, now), true); assert.equal(L.purgeDue('', now), true);
  assert.equal(L.purgeDue(String(now - 3600000), now), false); assert.equal(L.purgeDue(String(now - 25 * 3600000), now), true);
  for (const s of [...L.OPEN, ...L.FAILED]) assert.ok(!L.CLOSED.includes(s), s); // لا يُمسّ مفتوح أو نزاع أو فاشل
  assert.equal(L.RETAIN_DAYS, 180);
});
console.log('\n' + n + ' اختبارات التنبيه نجحت');

// مطابقة إشعار الخادم بالاستلام برمز المعاملة (src/logic/rxmatch.js)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { transferRawTo, hintCandidates } = createRequire(import.meta.url)('../src/logic/rxmatch.js');
const T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', TOK = '0x55d398326f99059fF775485246999027B3197955';
const me = '0x' + 'ab'.repeat(20), other = '0x' + 'cd'.repeat(20), pad = (a) => '0x' + '0'.repeat(24) + a.slice(2);
const log = (addr, to, v) => ({ address: addr, topics: [T, pad(other), pad(to)], data: '0x' + v.toString(16) });
let n = 0; const t = (name, f) => { f(); n++; console.log('✓ ' + name); };
t('يجمع تحويلات العملة إليّ فقط في الإيصال', () => {
  assert.equal(transferRawTo([log(TOK, me, 10n ** 18n), log(TOK, other, 5n), log('0x' + '11'.repeat(20), me, 7n)], TOK, me), 10n ** 18n);
});
t('عنوان بأحرف كبيرة/صغيرة مختلفة يُطابق، وسجل تالف يُتجاهل', () => {
  assert.equal(transferRawTo([log(TOK.toLowerCase(), me.toUpperCase().replace('0X', '0x'), 3n), { address: TOK, topics: [T] }, null], TOK, me), 3n);
});
t('لا تحويل إليّ = 0n', () => { assert.equal(transferRawTo([log(TOK, other, 3n)], TOK, me), 0n); });
t('المرشحون: نفس الشبكة والعملة، برمز معاملة صالح، غير مستخدم، وحديث', () => {
  const now = 1e9, tx = '0x' + 'a'.repeat(64);
  const hs = [{ chain: 'bsc', sym: 'USDT', tx, at: now - 1000 }, { chain: 'bsc', sym: 'USDT', tx, at: now, used: true }, { chain: 'bsc', sym: 'USDT', tx: '', at: now },
    { chain: 'bsc', sym: 'USDC', tx, at: now }, { chain: 'eth', sym: 'USDT', tx, at: now }, { chain: 'bsc', sym: 'USDT', tx, at: now - 16 * 60000 }];
  assert.deepEqual(hintCandidates(hs, 'bsc', 'USDT', now), [hs[0]]);
});
console.log('\n' + n + ' اختبارات مطابقة الإشعار نجحت');

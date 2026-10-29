// اختبار نواة المحفظة بدون شبكة: التشفير، المبالغ، الحفظ وفتح القفل
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// TronWeb وهمي للاختبار دون إنترنت (الاشتقاق الحقيقي يُختبر على الجهاز)
globalThis.TronWeb = {
  TronWeb: {
    isAddress: (a) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a),
    fromMnemonic: (m) => ({ address: 'T' + 'A'.repeat(33), privateKey: '0x' + 'ab'.repeat(32) }),
    createRandom: () => ({ mnemonic: { phrase: 'river smile cotton eagle harvest lamp orbit velvet sand thunder maple quiet' } })
  }
};

const W = require('../src/wallet-core.js');
let pass = 0;
const t = async (name, fn) => { await fn(); pass++; console.log('✓', name); };

await t('محفظة EVM من نفس الكلمات (متجه اختبار معروف)', async () => {
  const { createRequire: cr } = await import('node:module');
  let ethers = null;
  try { ethers = cr(import.meta.url)('../node_modules/ethers/dist/ethers.umd.min.js'); } catch (e) {}
  if (!ethers) { console.log('  (تخطّي: ethers غير مثبّت)'); return; }
  globalThis.ethers = ethers;
  // المتجه المعروف لعبارة الاختبار القياسية في Hardhat/Foundry
  const w = W.evmFromMnemonic('test test test test test test test test test test test junk');
  assert.equal(w.address, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  // الفواصل والأحرف الكبيرة لا تغيّر العنوان
  assert.equal(W.evmFromMnemonic('Test, test test test test test test test test test test JUNK').address, w.address);
  const c = W.EVM_CHAINS;
  assert.deepEqual(Object.keys(c), ['bsc', 'eth', 'polygon']);
  for (const k of Object.keys(c)) for (const t of c[k].tokens) assert.ok(ethers.isAddress(t.addr) && ethers.getAddress(t.addr) === t.addr, k + ' ' + t.sym);
  assert.equal(c.bsc.tokens[0].dec, 18); assert.equal(c.eth.tokens[0].dec, 6);
});

await t('قراءة عنوان WETH من SunSwap بكل الصيغ', () => {
  const tw = { address: { fromHex: (x) => x === '41891cdb91d149f23b1a45d9c5ca78a88d0cb44c18' ? 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR' : 'X' } };
  const W2 = 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR';
  for (const v of [W2, '41891cdb91d149f23b1a45d9c5ca78a88d0cb44c18', '0x891cdb91d149f23b1a45d9c5ca78a88d0cb44c18', '891cdb91d149f23b1a45d9c5ca78a88d0cb44c18', ['0x891cdb91d149f23b1a45d9c5ca78a88d0cb44c18']])
    assert.equal(W.normalizeAddress(tw, v), W2, String(v));
  assert.equal(W.normalizeAddress(tw, 'garbage'), '');
});

await t('toUnits يحوّل بدقة', () => {
  assert.equal(W.toUnits('12.5', 6), 12500000n);
  assert.equal(W.toUnits('0.000001', 6), 1n);
  assert.equal(W.toUnits('1,000', 6), 1000000000n);
  assert.equal(W.toUnits('١٢٫٥'.replace('٫', '.'), 6), 12500000n);
  assert.throws(() => W.toUnits('0', 6));
  assert.throws(() => W.toUnits('1.0000001', 6));
  assert.throws(() => W.toUnits('abc', 6));
  assert.throws(() => W.toUnits('-5', 6));
});

await t('fromUnits/formatAmount', () => {
  assert.equal(W.fromUnits(12500000n, 6), '12.5');
  assert.equal(W.formatAmount(1248500000n, 6), '1,248.50');
});

await t('التشفير وفك التشفير برمز PIN', async () => {
  const box = await W.encryptSecret('secret words here', '123456');
  assert.notEqual(box.ct, 'secret words here');
  assert.equal(await W.decryptSecret(box, '123456'), 'secret words here');
  await assert.rejects(W.decryptSecret(box, '000000'), /WRONG_PIN/);
});

await t('الحفظ وفتح القفل والقفل', async () => {
  const core = W.createCore({ network: 'nile' });
  assert.equal(await core.hasWallet(), false);
  const m = core.generateMnemonic();
  assert.equal(core.validateMnemonic(m), true);
  await core.saveWallet(m, '246810');
  assert.equal(await core.hasWallet(), true);
  core.lock();
  assert.equal(core.isUnlocked(), false);
  await assert.rejects(core.unlock('111111'), /WRONG_PIN/);
  await core.unlock('246810');
  assert.equal(core.isUnlocked(), true);
  assert.equal(await core.revealMnemonic('246810'), m);
  await assert.rejects(core.saveWallet(m, '12'), /PIN_FORMAT/);
});

await t('قبول الكلمات المفصولة بفواصل وأسطر', () => {
  const core = W.createCore();
  const w = 'river smile cotton eagle harvest lamp orbit velvet sand thunder maple quiet'.split(' ');
  assert.equal(core.validateMnemonic(w.join(', ')), true);
  assert.equal(core.validateMnemonic(w.join(' ،')), true);
  assert.equal(core.validateMnemonic('  ' + w.join(' ,\n') + ' '), true);
  assert.equal(core.validateMnemonic(w.map((x, i) => (i + 1) + '. ' + x.toUpperCase()).join(' ')), true);
  assert.equal(core.validateMnemonic(w.slice(0, 11).join(', ')), false);
});

await t('حساب عمولة التبديل', () => {
  const off = W.createCore();
  assert.equal(off.feeEnabled(), false);
  assert.equal(off.swapFeeUnits('TRX_USDT', 100000000n, 0n), 0n);
  const on = W.createCore({ feeAddress: 'T' + 'B'.repeat(33), feeBps: 50 });
  assert.equal(on.feeEnabled(), true);
  assert.equal(on.feeRateText(), '0.5%');
  assert.equal(on.swapFeeUnits('TRX_USDT', 100000000n, 0n), 500000n);   // 100 TRX → 0.5 TRX
  assert.equal(on.swapFeeUnits('USDT_TRX', 0n, 30000000n), 150000n);    // يستلم 30 TRX → 0.15 TRX
  assert.equal(on.swapFeeUnits('TRX_USDT', 10000000n, 0n), 0n);         // 10 TRX → 0.05 أقل من الحد
  const bad = W.createCore({ feeAddress: 'not-an-address' });
  assert.equal(bad.feeEnabled(), false);
});

await t('تغيير رمز القفل', async () => {
  const core = W.createCore();
  const m = core.generateMnemonic();
  await core.saveWallet(m, '111222');
  await core.changePin('111222', '333444');
  await assert.rejects(core.verifyPin('111222'), /WRONG_PIN/);
  assert.equal(await core.verifyPin('333444'), true);
  assert.equal(await core.revealMnemonic('333444'), m);
  await assert.rejects(core.changePin('000000', '555666'), /WRONG_PIN/);
  await core.wipe();
  assert.equal(await core.hasWallet(), false);
});

await t('التبديل معطّل على شبكة بدون عقد SunSwap', async () => {
  const core = W.createCore({ network: 'nile' });
  assert.equal(await core.swapSupported(), false);
  await assert.rejects(core.quoteSwap('TRX_USDT', '10'), /SWAP_UNAVAILABLE/);
});

await t('الحظر المؤقت بعد 5 محاولات خاطئة', async () => {
  const core = W.createCore();
  await core.saveWallet(core.generateMnemonic(), '246810');
  core.lock();
  for (let i = 0; i < 4; i++) await assert.rejects(core.unlock('999999'), /WRONG_PIN/);
  await assert.rejects(core.unlock('999999'), /LOCKED_OUT/); // الخامسة تُعلن الحظر مباشرة
  await assert.rejects(core.unlock('246810'), /LOCKED_OUT/);
  // الحظر يبقى بعد إعادة تشغيل التطبيق (نسخة جديدة من النواة)
  const core2 = W.createCore();
  await assert.rejects(core2.unlock('246810'), /LOCKED_OUT/);
  // ويشمل التحقق وعرض الكلمات أيضاً
  await assert.rejects(core2.verifyPin('246810'), /LOCKED_OUT/);
  await assert.rejects(core2.revealMnemonic('246810'), /LOCKED_OUT/);
  assert.ok((await core2.lockoutRemaining()) > 0);
  await core2.wipe();
});

await t('محاولات التحقق الخاطئة تُحسب ضمن الحظر', async () => {
  const core = W.createCore();
  await core.saveWallet(core.generateMnemonic(), '135790');
  for (let i = 0; i < 4; i++) await assert.rejects(core.verifyPin('000000'), /WRONG_PIN/);
  await assert.rejects(core.revealMnemonic('000000'), /LOCKED_OUT/);
  await assert.rejects(core.verifyPin('135790'), /LOCKED_OUT/);
  await core.wipe();
});

await t('النجاح يصفّر عدّاد المحاولات', async () => {
  const core = W.createCore();
  await core.saveWallet(core.generateMnemonic(), '112233');
  for (let i = 0; i < 4; i++) await assert.rejects(core.verifyPin('000000'), /WRONG_PIN/);
  assert.equal(await core.verifyPin('112233'), true);
  for (let i = 0; i < 4; i++) await assert.rejects(core.verifyPin('000000'), /WRONG_PIN/);
  assert.equal(await core.verifyPin('112233'), true);
  await core.wipe();
});

await t('رسائل الأخطاء بالعربية', () => {
  assert.equal(W.errorText(new Error('INSUFFICIENT_USDT')), 'رصيد USDT غير كافٍ');
  assert.match(W.errorText(new Error('xyz')), /الشبكة/);
});

console.log(`\n${pass} اختبارات نجحت`);

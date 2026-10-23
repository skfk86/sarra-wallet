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

await t('الحظر المؤقت بعد 5 محاولات خاطئة', async () => {
  const core = W.createCore();
  await core.saveWallet(core.generateMnemonic(), '246810');
  core.lock();
  for (let i = 0; i < 5; i++) await assert.rejects(core.unlock('999999'), /WRONG_PIN/);
  await assert.rejects(core.unlock('246810'), /LOCKED_OUT/);
});

await t('رسائل الأخطاء بالعربية', () => {
  assert.equal(W.errorText(new Error('INSUFFICIENT_USDT')), 'رصيد USDT غير كافٍ');
  assert.match(W.errorText(new Error('xyz')), /الشبكة/);
});

console.log(`\n${pass} اختبارات نجحت`);

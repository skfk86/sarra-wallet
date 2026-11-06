// سجل الشبكات والعملات (src/logic/registry.js): يجب أن يطابق القوائم اليدوية السابقة تماماً، وأن يمنع الإرسال الخاطئ
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.TronWeb = { TronWeb: { isAddress: (a) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) } };
const W = require('../src/wallet-core.js');
const R = require('../src/logic/registry.js');
let n = 0; const ok = (m) => { n++; console.log('✓', m); };
const chains = W.createCore({ storage: { get: async () => null, set: async () => {}, remove: async () => {} }, network: 'mainnet' }).evmChains();
const reg = R.buildRegistry(chains);

// القوائم اليدوية كما كانت قبل السجل (src/app/02-home.js وsrc/app/10-trade-market.js)
const OLD_NETS = { USDT: ['tron', 'bsc', 'eth', 'polygon'], USDC: ['bsc', 'eth', 'polygon'], TRX: ['tron', 'bsc'], BNB: ['bsc'], ETH: ['eth', 'bsc', 'polygon'], POL: ['polygon'],
  BTC: ['bsc', 'eth', 'polygon'], FDUSD: ['bsc'], DAI: ['bsc', 'eth', 'polygon'], XRP: ['bsc'], SOL: ['bsc'], DOGE: ['bsc'], ADA: ['bsc'], LINK: ['bsc', 'eth', 'polygon'],
  UNI: ['bsc', 'eth'], AAVE: ['bsc', 'eth', 'polygon'], CAKE: ['bsc'], SHIB: ['bsc', 'eth'], PEPE: ['bsc', 'eth'] };
const OLD_BN = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', BNB: 'BNBUSDT', TRX: 'TRXUSDT', SOL: 'SOLUSDT', XRP: 'XRPUSDT', DOGE: 'DOGEUSDT', ADA: 'ADAUSDT', LINK: 'LINKUSDT', UNI: 'UNIUSDT', AAVE: 'AAVEUSDT', CAKE: 'CAKEUSDT', SHIB: 'SHIBUSDT', PEPE: 'PEPEUSDT', POL: 'POLUSDT' };
assert.deepEqual(reg.assets.map((a) => a.sym), Object.keys(OLD_NETS));
for (const a of reg.assets) assert.deepEqual(a.nets, OLD_NETS[a.sym], a.sym);
ok('شبكات كل عملة (' + reg.assets.length + ') تطابق القائمة اليدوية السابقة بنفس الترتيب');
assert.deepEqual(reg.binance, OLD_BN); ok('أزواج Binance للتداول تطابق السابقة');
assert.deepEqual(reg.networks.map((x) => x.key), ['tron', 'bsc', 'eth', 'polygon']); ok('ترتيب الشبكات: TRON ثم BNB ثم Ethereum ثم Polygon');
assert.deepEqual(reg.network('bsc').coins.slice(0, 3), ['USDT', 'USDC', 'BNB']); ok('عملات الشبكة: المستقرتان ثم الأصلية');
const noEvm = R.buildRegistry({});
assert.deepEqual(noEvm.networks.map((x) => x.key), ['tron']); assert.deepEqual(noEvm.assets.map((a) => a.sym), ['USDT', 'TRX']);
ok('بدون EVM (شبكة الاختبار): TRON فقط وعملتاه');
const withL2 = R.buildRegistry(Object.assign({}, chains, { base: { name: 'Base', short: 'Base', native: 'ETH', color: '#0052FF', tokens: [{ sym: 'USDC' }] } }));
assert.equal(withL2.networks.at(-1).key, 'base'); assert.ok(withL2.asset('USDC').nets.includes('base')); assert.ok(withL2.asset('ETH').nets.includes('base'));
ok('إضافة شبكة Layer 2 جديدة تظهر تلقائياً مع عملاتها دون تعديل أي ملف آخر');

const V = { tron: (a) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a), evm: (a) => /^0x[0-9a-fA-F]{40}$/.test(a) };
const T = 'T' + 'A'.repeat(33), X = '0x' + 'a'.repeat(40);
assert.equal(R.checkTransfer(reg, 'tron', 'USDT', T, V), null); assert.equal(R.checkTransfer(reg, 'bsc', 'USDT', X, V), null); ok('عنوان صحيح على شبكته يمر');
assert.equal(R.checkTransfer(reg, 'tron', 'USDT', X, V), 'WRONG_NETWORK_ADDRESS'); assert.equal(R.checkTransfer(reg, 'bsc', 'USDT', T, V), 'WRONG_NETWORK_ADDRESS'); ok('عنوان شبكة أخرى يُرفض');
assert.equal(R.checkTransfer(reg, 'tron', 'BNB', T, V), 'ASSET_NOT_ON_NETWORK'); assert.equal(R.checkTransfer(reg, 'polygon', 'UNI', X, V), 'ASSET_NOT_ON_NETWORK'); ok('عملة غير موجودة على الشبكة تُرفض');
assert.equal(R.checkTransfer(reg, 'bsc', 'USDT', 'abc', V), 'INVALID_ADDRESS'); assert.equal(R.checkTransfer(reg, 'solana', 'USDT', X, V), 'UNKNOWN_NETWORK'); ok('عنوان تالف أو شبكة مجهولة تُرفض');
console.log(n + ' اختبارات سجل الشبكات والعملات نجحت');
assert.equal(R.explorerName('https://bscscan.com/tx/0x1'), 'BscScan'); assert.equal(R.explorerName('https://tronscan.org/#/transaction/a'), 'TRONSCAN'); assert.equal(R.explorerName('x'), 'المستكشف');
console.log('✓ اسم المستكشف من الرابط');

// رسوم EVM: Polygon يرفض إكرامية أقل من 25 gwei، فنرفعها إلى 30 على الأقل؛ BNB (رسوم قديمة) لا يتغير
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.TronWeb = { TronWeb: { isAddress: () => true } };
const W = require('../src/wallet-core.js');
const G = 1000000000n;
const prov = (fd, rpcTip, base) => ({
  getFeeData: async () => { if (fd === 'boom') throw new Error('error encountered with polygon gas station'); return fd; },
  send: async (m) => m === 'eth_maxPriorityFeePerGas' ? (rpcTip == null ? Promise.reject(new Error('x')) : '0x' + rpcTip.toString(16))
    : m === 'eth_getBlockByNumber' ? { baseFeePerGas: '0x' + base.toString(16) } : '0x' + (2n * base).toString(16) });
const poly = W.EVM_CHAINS.polygon, bsc = W.EVM_CHAINS.bsc;
let r = await W.evmFees(prov('boom', null, 30n * G), poly);
assert.equal(r.f.maxPriorityFeePerGas, 30n * G); assert.equal(r.f.maxFeePerGas, 90n * G); assert.equal(r.price, 90n * G);
console.log('✓ Polygon: لا يستدعي محطة الغاز الخارجية (getFeeData)، والإكرامية 30 على الأقل والسقف = ضعف الأساسية + الإكرامية');
r = await W.evmFees(prov('boom', 45n * G, 50n * G), poly);
assert.equal(r.f.maxPriorityFeePerGas, 45n * G); assert.equal(r.f.maxFeePerGas, 145n * G);
console.log('✓ Polygon: نأخذ إكرامية الشبكة إن كانت أعلى');
r = await W.evmFees(prov({ gasPrice: 1n * G }, null, 0n), bsc);
assert.equal(r.f.type, 0); assert.equal(r.f.gasPrice, 1n * G);
console.log('✓ BNB Chain: الرسوم القديمة كما هي');
assert.match(W.errorText({ message: 'x', shortMessage: 'transaction gas price below minimum: gas tip cap 1500000000, minimum needed 25000000000' }), /أقل من المطلوب/);
assert.match(W.errorText({ message: 'insufficient funds for gas * price + value' }), /عملة الشبكة/);
console.log('✓ رسائل الشبكة الخام تظهر بسببها الحقيقي بدل «خطأ في الاتصال»');
assert.match(W.errorText({ message: 'EVM_REJECTED', raw: 'execution reverted: ERC20: transfer amount exceeds allowance' }), /الموافقة/);
assert.match(W.errorText({ message: 'EVM_NETWORK', raw: 'drpc: could not detect network' }), /تعذّر الاتصال.*drpc: could not detect network/);
assert.equal(W.errorText({ message: 'EVM_NETWORK' }), 'تعذّر الاتصال بالشبكة. تحقق من الإنترنت وحاول مجدداً');
console.log('✓ رفض الشبكة يظهر بسببه، والانقطاع الحقيقي يُرفق بمقتطف تقني للدعم');

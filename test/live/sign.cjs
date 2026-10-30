// اختبار حيّ للخادم بمحافظ مؤقتة (بدون مال): يوقّع طلبات بصيغة TRON. الاستخدام: node test/live/sign.cjs <action> <A|B|C> '<json params>'
// توقيع طلبات صُرّة بصيغة TRON signMessageV2 باستخدام ethers (محافظ مؤقتة للاختبار فقط)
const ethers = require('../../node_modules/ethers/dist/ethers.umd.min.js');
function tronAddr(w) {
  const pub = ethers.SigningKey.computePublicKey(w.signingKey.publicKey, false);
  const h = ethers.keccak256('0x' + pub.slice(4));
  const raw = '0x41' + h.slice(-40);
  const chk = ethers.sha256(ethers.sha256(raw)).slice(2, 10);
  return ethers.encodeBase58(raw + chk);
}
function sign(w, action, params) {
  const nonce = ethers.hexlify(ethers.randomBytes(16)).slice(2);
  const message = JSON.stringify({ action, params, address: tronAddr(w), ts: Date.now(), nonce });
  const bytes = ethers.toUtf8Bytes(message);
  const digest = ethers.keccak256(ethers.concat([ethers.toUtf8Bytes('\x19TRON Signed Message:\n' + bytes.length), bytes]));
  return { message, signature: w.signingKey.sign(digest).serialized };
}
const [,, cmd, ...rest] = process.argv;
const A = new ethers.Wallet('0x' + '11'.repeat(32)), B = new ethers.Wallet('0x' + '22'.repeat(32)), C = new ethers.Wallet('0x' + '33'.repeat(32));
if (cmd === 'addr') console.log(JSON.stringify({ A: tronAddr(A), B: tronAddr(B) }));
else { const who = rest[0] === 'A' ? A : rest[0] === 'C' ? C : B; console.log(JSON.stringify(sign(who, cmd, JSON.parse(rest[1] || '{}')))); }

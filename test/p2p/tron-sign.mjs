// موقّع TRON صغير للاختبارات فقط (secp256k1 + Keccak-256 + signMessageV2)
// يُنتج نفس توقيع tronWeb.trx.signMessageV2 حتى نختبر الخادم الحقيقي بدون TronWeb
import { createHash, randomBytes } from 'node:crypto';

// ===== Keccak-256 =====
const RC = [1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n, 0x808bn, 0x80000001n, 0x8000000080008081n, 0x8000000000008009n, 0x8an, 0x88n, 0x80008009n, 0x8000000an, 0x8000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n];
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const M = (1n << 64n) - 1n;
const rotl = (x, n) => n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M;
function keccakF(s) {
  for (let r = 0; r < 24; r++) {
    const C = [0, 1, 2, 3, 4].map((x) => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    for (let x = 0; x < 5; x++) { const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1); for (let y = 0; y < 25; y += 5) s[y + x] ^= D; }
    const B = new Array(25);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x + 5 * y]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + 5 * y] = B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y] & M) & B[(x + 2) % 5 + 5 * y]);
    s[0] ^= RC[r];
  }
}
export function keccak256(bytes) {
  const rate = 136, p = Buffer.alloc(Math.ceil((bytes.length + 1) / rate) * rate);
  Buffer.from(bytes).copy(p); p[bytes.length] ^= 0x01; p[p.length - 1] ^= 0x80;
  const s = new Array(25).fill(0n);
  for (let o = 0; o < p.length; o += rate) {
    for (let i = 0; i < rate / 8; i++) s[i] ^= p.readBigUInt64LE(o + i * 8);
    keccakF(s);
  }
  const out = Buffer.alloc(32); for (let i = 0; i < 4; i++) out.writeBigUInt64LE(s[i], i * 8);
  return out;
}

// ===== secp256k1 =====
const P = 2n ** 256n - 2n ** 32n - 977n, N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const G = [0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n, 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n];
const mod = (a, m = P) => ((a % m) + m) % m;
const inv = (a, m = P) => { let [x, y, u, v] = [mod(a, m), m, 1n, 0n]; while (x) { const q = y / x; [x, y, u, v] = [y - q * x, x, v - q * u, u]; } return mod(v, m); };
function add(A, B) {
  if (!A) return B; if (!B) return A;
  if (A[0] === B[0] && A[1] !== B[1]) return null;
  const l = A[0] === B[0] ? mod(3n * A[0] * A[0] * inv(2n * A[1])) : mod((B[1] - A[1]) * inv(B[0] - A[0]));
  const x = mod(l * l - A[0] - B[0]); return [x, mod(l * (A[0] - x) - A[1])];
}
function mul(k, Pt = G) { let R = null; while (k > 0n) { if (k & 1n) R = add(R, Pt); Pt = add(Pt, Pt); k >>= 1n; } return R; }
const hex32 = (n) => n.toString(16).padStart(64, '0');

// ===== TRON =====
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58check(buf) {
  const c = createHash('sha256').update(createHash('sha256').update(buf).digest()).digest().subarray(0, 4);
  let n = BigInt('0x' + Buffer.concat([buf, c]).toString('hex')), s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  return s;
}
export function makeWallet(seedHex) {
  const d = seedHex ? BigInt('0x' + seedHex) % N : BigInt('0x' + randomBytes(32).toString('hex')) % N;
  const Q = mul(d);
  const pub = Buffer.from(hex32(Q[0]) + hex32(Q[1]), 'hex');
  const address = base58check(Buffer.concat([Buffer.from([0x41]), keccak256(pub).subarray(12)]));
  return { d, address };
}
export function signMessageV2(message, w) {
  const msg = Buffer.from(message, 'utf8');
  const h = BigInt('0x' + keccak256(Buffer.concat([Buffer.from('\x19TRON Signed Message:\n' + msg.length), msg])).toString('hex'));
  for (;;) {
    const k = BigInt('0x' + randomBytes(32).toString('hex')) % N; if (!k) continue;
    const R = mul(k), r = mod(R[0], N); if (!r) continue;
    let s = mod(inv(k, N) * (h + r * w.d), N); if (!s) continue;
    let recid = Number(R[1] & 1n);
    if (s > N / 2n) { s = N - s; recid ^= 1; } // توقيع low-s
    return '0x' + hex32(r) + hex32(s) + (27 + recid).toString(16);
  }
}
export function signedBody(w, action, params = {}) {
  const message = JSON.stringify({ action, params, address: w.address, ts: Date.now(), nonce: randomBytes(16).toString('hex') });
  return { message, signature: signMessageV2(message, w) };
}

// اختبار ذاتي: عنوان معروف من مفتاح معروف (المفتاح 1)
if (process.argv[2] === 'selftest') {
  const kh = keccak256(Buffer.from('')).toString('hex');
  console.log('keccak("")', kh === 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' ? 'OK' : 'FAIL ' + kh);
  console.log('addr(key=1)', makeWallet('01').address);
}

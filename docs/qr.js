// مولّد رمز QR صغير بلا مكتبات خارجية (صفحة الدفع لا تعتمد على أي موقع آخر).
// يدعم: نص بايتات (UTF-8) حتى 106 بايت، مستوى تصحيح M، الإصدارات 1–6. يكفي لعناوين المحافظ.
// الاستخدام: sarraQR.svg('نص')  ←  نص SVG، أو sarraQR.matrix('نص')  ←  مصفوفة 0/1
(function (root) {
  'use strict';
  // لكل إصدار بمستوى M: [عدد الكتل، بايتات البيانات في الكتلة، بايتات التصحيح في الكتلة]
  var VER = [null, [1, 16, 10], [1, 28, 16], [1, 44, 26], [2, 32, 18], [2, 43, 24], [4, 27, 16]];
  // حقل غالوا GF(256) بكثير الحدود 0x11d
  var EXP = [], LOG = [];
  (function () { var x = 1; for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  function rsGen(n) { var g = [1]; for (var i = 0; i < n; i++) { var r = new Array(g.length + 1).fill(0); for (var j = 0; j < g.length; j++) { r[j] ^= g[j]; r[j + 1] ^= EXP[(LOG[g[j]] + i) % 255]; } g = r; } return g; }
  function rsEc(data, n) {
    var g = rsGen(n), r = data.concat(new Array(n).fill(0));
    for (var i = 0; i < data.length; i++) { var c = r[i]; if (c) for (var j = 1; j < g.length; j++) r[i + j] ^= EXP[LOG[g[j]] + LOG[c]]; }
    return r.slice(data.length);
  }
  function utf8(s) { var o = [], e = unescape(encodeURIComponent(String(s))); for (var i = 0; i < e.length; i++) o.push(e.charCodeAt(i)); return o; }

  function codewords(bytes) {
    var v = 0; for (var k = 1; k <= 6; k++) if (bytes.length <= VER[k][0] * VER[k][1] - 2) { v = k; break; }
    if (!v) throw new Error('QR_TOO_LONG');
    var total = VER[v][0] * VER[v][1], bits = [];
    var put = function (val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    put(4, 4); put(bytes.length, 8); bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, total * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    var data = []; for (var i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (var p = 0; data.length < total; p++) data.push(p % 2 ? 0x11 : 0xec);
    var nb = VER[v][0], dl = VER[v][1], el = VER[v][2], blocks = [], ecs = [], out = [];
    for (var b = 0; b < nb; b++) { var d = data.slice(b * dl, b * dl + dl); blocks.push(d); ecs.push(rsEc(d, el)); }
    for (i = 0; i < dl; i++) for (b = 0; b < nb; b++) out.push(blocks[b][i]);
    for (i = 0; i < el; i++) for (b = 0; b < nb; b++) out.push(ecs[b][i]);
    return { v: v, cw: out };
  }

  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; }, function (r) { return r % 2 === 0; }, function (r, c) { return c % 3 === 0; }, function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; }, function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; },
    function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; }, function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }
  ];
  function formatBits(mask) { // مستوى M = 00
    var d = mask, r = d << 10; for (var i = 14; i >= 10; i--) if ((r >> i) & 1) r ^= 0x537 << (i - 10);
    return ((d << 10) | r) ^ 0x5412;
  }
  function build(v, cw, mask) {
    var n = 17 + 4 * v, m = [], fn = [], r, c;
    for (r = 0; r < n; r++) { m.push(new Array(n).fill(0)); fn.push(new Array(n).fill(false)); }
    var set = function (rr, cc, val) { m[rr][cc] = val ? 1 : 0; fn[rr][cc] = true; };
    var finder = function (r0, c0) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var rr = r0 + dr, cc = c0 + dc; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        var on = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        set(rr, cc, on);
      }
    };
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
    for (var i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    if (v >= 2) { var a = n - 7; for (r = -2; r <= 2; r++) for (c = -2; c <= 2; c++) set(a + r, a + c, Math.max(Math.abs(r), Math.abs(c)) !== 1); }
    set(n - 8, 8, 1); // الوحدة الداكنة الثابتة
    // نحجز مواضع معلومات الصيغة
    for (i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, 0); if (!fn[i][8]) set(i, 8, 0); }
    for (i = 0; i < 8; i++) { set(8, n - 1 - i, 0); if (i < 7) set(n - 1 - i, 8, m[n - 1 - i][8]); }
    // البيانات: متعرجة من أسفل اليمين، عمودان في كل مرة، مع تخطي عمود التوقيت
    var bi = 0, up = true, total = cw.length * 8;
    for (c = n - 1; c > 0; c -= 2) {
      if (c === 6) c--;
      for (var k = 0; k < n; k++) {
        r = up ? n - 1 - k : k;
        for (var j = 0; j < 2; j++) {
          var cc2 = c - j; if (fn[r][cc2]) continue;
          var bit = bi < total ? (cw[bi >> 3] >> (7 - (bi & 7))) & 1 : 0; bi++;
          m[r][cc2] = bit ^ (MASKS[mask](r, cc2) ? 1 : 0);
        }
      }
      up = !up;
    }
    var f = formatBits(mask), fb = function (x) { return (f >> x) & 1; };
    for (i = 0; i <= 5; i++) m[8][i] = fb(14 - i);
    m[8][7] = fb(8); m[8][8] = fb(7); m[7][8] = fb(6);
    for (i = 0; i <= 5; i++) m[5 - i][8] = fb(5 - i);
    for (i = 0; i <= 6; i++) m[n - 1 - i][8] = fb(14 - i);
    for (i = 0; i <= 7; i++) m[8][n - 8 + i] = fb(7 - i);
    return m;
  }
  function penalty(m) {
    var n = m.length, p = 0, r, c, dark = 0;
    for (r = 0; r < n; r++) for (var dir = 0; dir < 2; dir++) {
      var run = 1;
      for (c = 1; c < n; c++) {
        var a = dir ? m[c][r] : m[r][c], b = dir ? m[c - 1][r] : m[r][c - 1];
        if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
      }
    }
    for (r = 0; r < n - 1; r++) for (c = 0; c < n - 1; c++) if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3;
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) dark += m[r][c];
    return p + Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
  }
  function matrix(text) {
    var cwv = codewords(utf8(text)), best = null, bp = Infinity;
    for (var k = 0; k < 8; k++) { var m = build(cwv.v, cwv.cw, k), p = penalty(m); if (p < bp) { bp = p; best = m; } }
    return best;
  }
  function svg(text, margin) {
    var m = matrix(text), n = m.length, q = margin == null ? 4 : margin, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (m[r][c]) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    var s = n + 2 * q;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" shape-rendering="crispEdges"><rect width="' + s + '" height="' + s + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  var api = { matrix: matrix, svg: svg };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.sarraQR = api;
})(typeof window !== 'undefined' ? window : globalThis);

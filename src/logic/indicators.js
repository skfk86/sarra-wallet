// المؤشرات الفنية وإشارة التحليل والاختبار التاريخي
// منطق صافٍ بلا واجهة: يعمل في المتصفح (window.SarraLogic) وفي Node (require) للاختبار
(function (root) {
  'use strict';
  function sma(a, n) { var o = [], s = 0; for (var i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; o.push(i >= n - 1 ? s / n : null); } return o; }
  function ema(a, n) { var o = [], k = 2 / (n + 1), e = null; for (var i = 0; i < a.length; i++) { e = e == null ? a[i] : a[i] * k + e * (1 - k); o.push(i >= n - 1 ? e : null); } return o; }
  function rsi(a, n) {
    n = n || 14; if (a.length <= n) return null; var g = 0, l = 0;
    for (var i = 1; i <= n; i++) { var d = a[i] - a[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= n; l /= n;
    for (i = n + 1; i < a.length; i++) { d = a[i] - a[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  function levels(kl, price) { // دعم ومقاومة من القمم والقيعان المحلية (فراكتال 2 شمعة من كل جهة)
    var hs = [], ls = [], s = kl.slice(-120);
    for (var i = 2; i < s.length - 2; i++) {
      if (s[i].h >= s[i - 1].h && s[i].h >= s[i - 2].h && s[i].h >= s[i + 1].h && s[i].h >= s[i + 2].h) hs.push(s[i].h);
      if (s[i].l <= s[i - 1].l && s[i].l <= s[i - 2].l && s[i].l <= s[i + 1].l && s[i].l <= s[i + 2].l) ls.push(s[i].l);
    }
    var sup = ls.filter(function (x) { return x < price; }).sort(function (a, b) { return b - a; })[0];
    var res = hs.filter(function (x) { return x > price; }).sort(function (a, b) { return a - b; })[0];
    if (sup == null) sup = Math.min.apply(null, s.map(function (k) { return k.l; }));
    if (res == null) res = Math.max.apply(null, s.map(function (k) { return k.h; }));
    return { sup: sup, res: res };
  }
  // سلسلة RSI كاملة (Wilder) لاستخدامها في كل شمعة
  function rsiSeries(a, n) {
    var o = new Array(a.length).fill(null), g = 0, l = 0, i, d; if (a.length <= n) return o;
    for (i = 1; i <= n; i++) { d = a[i] - a[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= n; l /= n; o[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (i = n + 1; i < a.length; i++) { d = a[i] - a[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    return o;
  }
  // ADX (قوة الاتجاه) و +DI/−DI
  function adxSeries(kl, n) {
    var L = kl.length, adx = new Array(L).fill(null), pdi = new Array(L).fill(null), mdi = new Array(L).fill(null);
    if (L < n * 2 + 1) return { adx: adx, pdi: pdi, mdi: mdi };
    var tr = 0, pd = 0, md = 0, dxs = [], a = null;
    for (var i = 1; i < L; i++) {
      var up = kl[i].h - kl[i - 1].h, dn = kl[i - 1].l - kl[i].l, t = Math.max(kl[i].h - kl[i].l, Math.abs(kl[i].h - kl[i - 1].c), Math.abs(kl[i].l - kl[i - 1].c));
      var p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
      if (i <= n) { tr += t; pd += p; md += m; if (i < n) continue; } else { tr = tr - tr / n + t; pd = pd - pd / n + p; md = md - md / n + m; }
      var P = tr ? 100 * pd / tr : 0, M = tr ? 100 * md / tr : 0, dx = P + M ? 100 * Math.abs(P - M) / (P + M) : 0;
      pdi[i] = P; mdi[i] = M; dxs.push(dx);
      if (dxs.length === n) a = dxs.reduce(function (s, x) { return s + x; }, 0) / n; else if (dxs.length > n) a = (a * (n - 1) + dx) / n;
      if (dxs.length >= n) adx[i] = a;
    }
    return { adx: adx, pdi: pdi, mdi: mdi };
  }
  // كل المؤشرات كسلاسل، ثم درجة لكل شمعة: تُستخدم للإشارة الحالية ولاختبارها على الماضي بنفس القواعد
  function indicators(kl) {
    var c = kl.map(function (k) { return k.c; }), v = kl.map(function (k) { return k.v || 0; });
    var e20 = ema(c, 20), e50 = ema(c, 50), e12 = ema(c, 12), e26 = ema(c, 26), r = rsiSeries(c, 14), dx = adxSeries(kl, 14);
    var macd = c.map(function (_, i) { return e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null; });
    var first = macd.findIndex(function (x) { return x != null; }), sig = new Array(c.length).fill(null);
    if (first >= 0) { var se = ema(macd.slice(first), 9); for (var i = 0; i < se.length; i++) sig[first + i] = se[i]; }
    var hist = macd.map(function (m, i) { return m != null && sig[i] != null ? m - sig[i] : null; });
    var s20 = sma(c, 20), sd = c.map(function (_, i) { if (i < 19) return null; var m = s20[i], q = 0; for (var j = i - 19; j <= i; j++) q += (c[j] - m) * (c[j] - m); return Math.sqrt(q / 20); });
    var v20 = sma(v, 20);
    return { c: c, v: v, e20: e20, e50: e50, r: r, hist: hist, adx: dx.adx, pdi: dx.pdi, mdi: dx.mdi, s20: s20, sd: sd, v20: v20 };
  }
  // درجة من −10 إلى +10 عند الشمعة i. الاتجاه يُعطى وزناً أكبر حين يكون ADX قوياً، والزخم يُؤكَّد بالحجم
  function scoreAt(I, i) {
    var c = I.c[i]; if (I.e50[i] == null || I.r[i] == null || I.hist[i] == null || I.hist[i - 1] == null) return null;
    var s = 0, adx = I.adx[i] || 0, strong = adx >= 25;
    s += (c > I.e20[i] ? 1 : -1) + (I.e20[i] > I.e50[i] ? 1 : -1);                         // الاتجاه بالمتوسطات
    if (I.pdi[i] != null) s += (I.pdi[i] > I.mdi[i] ? 1 : -1) * (strong ? 2 : 0.5);           // اتجاه ADX، بوزن قوته
    s += I.hist[i] > 0 ? 1 : -1; s += I.hist[i] > I.hist[i - 1] ? 0.5 : -0.5;                 // زخم MACD وتسارعه
    var r = I.r[i];
    if (r < 30) s += 1.5; else if (r > 70) s -= 1.5; else s += r > 50 ? 0.5 : -0.5;           // RSI
    if (I.sd[i]) { var pb = (c - (I.s20[i] - 2 * I.sd[i])) / (4 * I.sd[i]); if (pb < 0.05) s += 1; else if (pb > 0.95) s -= 1; } // بولنجر
    if (I.v20[i] && I.v[i] > I.v20[i] * 1.5) s += (c >= I.c[i - 1] ? 1 : -1);                 // حجم يؤكد الحركة
    return Math.max(-10, Math.min(10, s));
  }
  // اختبار تاريخي صادق: كم مرة صدقت الإشارة نفسها على هذه العملة وهذا الإطار في الشموع المحمّلة
  function backtest(I, H, th) {
    var b = { n: 0, w: 0, ret: 0 }, s = { n: 0, w: 0, ret: 0 }, last = -99;
    for (var i = 60; i < I.c.length - H; i++) {
      var sc = scoreAt(I, i); if (sc == null || i - last < 3) continue; // لا نعدّ نفس الحركة مرات متتالية
      var ch = I.c[i + H] / I.c[i] - 1, cost = 0.002;
      if (sc >= th) { b.n++; if (ch > cost) b.w++; b.ret += ch - cost; last = i; }
      else if (sc <= -th) { s.n++; if (ch < -cost) s.w++; s.ret += -ch - cost; last = i; }
    }
    return { buy: b, sell: s, H: H };
  }
  function analyze(kl, hkl) {
    var I = indicators(kl), L = kl.length - 1, p = I.c[L], sc = scoreAt(I, L);
    var atr = 0, n = Math.min(14, L); for (var i = L - n + 1; i <= L; i++) atr += Math.max(kl[i].h - kl[i].l, Math.abs(kl[i].h - kl[i - 1].c), Math.abs(kl[i].l - kl[i - 1].c)); atr /= n;
    var hs = null; // اتجاه الإطار الأعلى يؤكد أو يعاكس
    if (hkl && hkl.length > 60) { var HI = indicators(hkl), HL = hkl.length - 1; hs = scoreAt(HI, HL); }
    var total = sc == null ? null : Math.max(-10, Math.min(10, sc + (hs == null ? 0 : hs > 2 ? 1.5 : hs < -2 ? -1.5 : 0)));
    var lv = levels(kl, p), bt = backtest(I, 10, 4);
    var agree = hs == null ? null : (total > 0) === (hs > 0);
    return { p: p, I: I, L: L, score: total, raw: sc, hs: hs, agree: agree, rsi: I.r[L], adx: I.adx[L], hist: I.hist[L], atrPct: atr / p * 100, sup: lv.sup, res: lv.res, bt: bt,
      bb: I.sd[L] ? (p - (I.s20[L] - 2 * I.sd[L])) / (4 * I.sd[L]) : null, vol: I.v20[L] ? I.v[L] / I.v20[L] : null,
      trend: I.e50[L] == null ? 'جانبي' : (I.adx[L] || 0) < 20 ? 'جانبي (بلا اتجاه واضح)' : I.e20[L] > I.e50[L] ? 'صاعد' : 'هابط' };
  }
  var api = { sma: sma, ema: ema, rsi: rsi, levels: levels, rsiSeries: rsiSeries, adxSeries: adxSeries, indicators: indicators, scoreAt: scoreAt, backtest: backtest, analyze: analyze };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SarraLogic = Object.assign(root.SarraLogic || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);

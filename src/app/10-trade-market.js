  // ===== التداول الفوري: السوق، الشموع اليابانية، التحليل، والربح/الخسارة =====
  // البيانات من Binance (data-api.binance.vision: بيانات سوق عامة بلا حساب)، والاحتياط CoinGecko.
  // التنفيذ من محفظة المستخدم مباشرة: EVM عبر LI.FI (نفس محرك التبديل)، وTRX عبر SunSwap.
  var BN_SYM = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', BNB: 'BNBUSDT', TRX: 'TRXUSDT', SOL: 'SOLUSDT', XRP: 'XRPUSDT', DOGE: 'DOGEUSDT', ADA: 'ADAUSDT', LINK: 'LINKUSDT', UNI: 'UNIUSDT', AAVE: 'AAVEUSDT', CAKE: 'CAKEUSDT', SHIB: 'SHIBUSDT', PEPE: 'PEPEUSDT', POL: 'POLUSDT' };
  var BN_API = 'https://data-api.binance.vision/api/v3/';
  var TR = { sym: null, tf: '1h', kl: null, hover: null, sort: 'all', q: '', tick: {}, tickAt: 0, timer: null, side: 'buy', net: null, oq: null, view: 80 };
  function trCoins() { return COINS.filter(function (c) { return !c.stable && BN_SYM[c.sym] && trNets(c).length; }); }
  function trCoin(sym) { return COINS.filter(function (c) { return c.sym === sym; })[0]; }
  // الشبكات التي يمكن عليها تبديل العملة مع USDT من المحفظة
  function trNets(c) {
    return c.nets.filter(function (n) {
      if (n === 'tron') return c.sym === 'TRX';
      return EVM[n] && core.bridgeEnabled && core.bridgeEnabled() && netOf(n).coins.indexOf('USDT') >= 0;
    });
  }
  function fp(v) { // سعر مقابل USDT بدقة تناسب حجمه
    v = Number(v); if (!isFinite(v) || v <= 0) return '—';
    if (v >= 1000) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (v >= 1) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    if (v >= 0.0001) return Number(v.toPrecision(4)).toString();
    return niceNum(v);
  }
  function fUsd(v, sign) { if (v == null || !isFinite(v)) return '—'; var s = sign && v > 0 ? '+' : v < 0 ? '−' : ''; var a = Math.abs(v); return s + '$' + (a >= 1000 ? a.toLocaleString('en-US', { maximumFractionDigits: 0 }) : a.toFixed(2)); }
  function fVol(v) { v = Number(v); if (!isFinite(v)) return '—'; return v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(0); }
  function trJson(url, ms) {
    var ctl = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 8000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error('MARKET'); return r.json(); });
  }
  // أسعار السوق لكل العملات بطلب واحد
  async function trTickers() {
    var cs = trCoins(); if (!cs.length) return;
    try {
      var syms = JSON.stringify(cs.map(function (c) { return BN_SYM[c.sym]; }));
      var j = await trJson(BN_API + 'ticker/24hr?symbols=' + encodeURIComponent(syms));
      var by = {}; (j || []).forEach(function (x) { by[x.symbol] = x; });
      cs.forEach(function (c) { var x = by[BN_SYM[c.sym]]; if (x) TR.tick[c.sym] = { p: Number(x.lastPrice), chg: Number(x.priceChangePercent), hi: Number(x.highPrice), lo: Number(x.lowPrice), vol: Number(x.quoteVolume) }; });
      TR.tickAt = Date.now(); $('tr-live').classList.remove('off');
    } catch (e) {
      $('tr-live').classList.add('off'); // احتياط: أسعار CoinGecko المحمّلة مسبقاً
      cs.forEach(function (c) { var p = priceOf(c); if (p && p.usd != null && !TR.tick[c.sym]) TR.tick[c.sym] = { p: p.usd, chg: p.chg }; });
    }
  }
  function trPrice(sym) { var t = TR.tick[sym]; if (t && t.p) return t.p; var c = trCoin(sym), p = c && priceOf(c); return p && p.usd != null ? p.usd : null; }

  // ===== سجل الصفقات المحلي والربح/الخسارة (متوسط التكلفة) =====
  function trKey() { return 'sarra.tr.' + (state.lhAddr || ''); }
  function trAll() { return lsJson(trKey(), []); }
  function trSave(t) {
    if (!state.lhAddr) return;
    try { var l = trAll().filter(function (x) { return x.id !== t.id && x.id !== t.prevId; }); l.unshift(t); localStorage.setItem(trKey(), JSON.stringify(l.slice(0, 500))); } catch (e) {}
    vaultSoon();
  }
  function trPos(sym) { return SarraLogic.position(trAll(), sym); } // logic/records.js
  function trPortfolio() {
    var val = 0, un = 0, re = 0, any = false, n = 0, wait = false;
    trCoins().forEach(function (c) {
      var ps = trPos(c.sym), held = coinTotal(c), p = trPrice(c.sym); re += ps.real; n += ps.n;
      if (ps.qty > 0 && !p) wait = true; // مركز مفتوح لكن السعر لم يصل بعد
      if (ps.qty > 0 && p) { var q = held == null ? ps.qty : Math.min(ps.qty, held); if (q > 0) { val += q * p; un += q * p - ps.cost * (q / ps.qty); any = true; } }
    });
    return { val: any ? val : wait ? null : 0, un: any ? un : wait ? null : 0, re: re, n: n, wait: wait && !any };
  }

  // ===== شاشة السوق =====
  function loadTrade() {
    renderTrade();
    trTickers().then(renderTrade);
    clearInterval(TR.timer);
    TR.timer = setInterval(function () {
      var cur = state.stack[state.stack.length - 1];
      if (document.hidden || (cur !== 'trade' && cur !== 'pair')) return;
      TR.n = (TR.n || 0) + 1;
      if (TR.n % 3 === 0 && Object.keys(EVM).length) core.evmBalances().then(function (eb) { if (eb) state.evmBal = eb; }).catch(function () {}); // الكمية الفعلية بعد الصفقات
      trTickers().then(function () { if (cur === 'trade') renderTrade(); else trRenderTop(); });
    }, 10000);
  }
  function renderTrade() {
    var pf = trPortfolio();
    $('tr-pf-val').textContent = state.hidden ? '••••' : pf.wait ? 'جارٍ…' : fUsd(pf.val);
    var un = $('tr-pf-un'); un.textContent = state.hidden ? '••••' : pf.wait ? 'جارٍ…' : fUsd(pf.un, true); un.className = 'ltr ' + (pf.un > 0 ? 'pl-up' : pf.un < 0 ? 'pl-dn' : '');
    var rr = $('tr-pf-re'); rr.textContent = state.hidden ? '••••' : fUsd(pf.re, true); rr.className = 'ltr ' + (pf.re > 0 ? 'pl-up' : pf.re < 0 ? 'pl-dn' : '');
    $('tr-pf-n').textContent = pf.n;
    renderOpen();
    var q = TR.q.trim().toUpperCase(), list = trCoins().filter(function (c) { return !q || c.sym.indexOf(q) >= 0 || c.name.toUpperCase().indexOf(q) >= 0; });
    if (TR.sort === 'mine') list = list.filter(function (c) { var t = coinTotal(c); return (t && t > 0) || trPos(c.sym).qty > 0; });
    var chg = function (c) { var t = TR.tick[c.sym]; return t && isFinite(t.chg) ? t.chg : null; };
    if (TR.sort === 'gain') list.sort(function (a, b) { return (chg(b) || -999) - (chg(a) || -999); });
    else if (TR.sort === 'loss') list.sort(function (a, b) { return (chg(a) == null ? 999 : chg(a)) - (chg(b) == null ? 999 : chg(b)); });
    else list.sort(function (a, b) { var ta = TR.tick[a.sym], tb = TR.tick[b.sym]; return ((tb && tb.vol) || 0) - ((ta && ta.vol) || 0); });
    var box = $('tr-list'); box.textContent = '';
    if (!list.length) { box.appendChild(el('div', null, TR.sort === 'mine' ? 'لا تملك عملات للتداول بعد. اختر عملة واضغط «شراء».' : 'لا توجد نتائج')).className = 'tr-empty'; return; }
    list.forEach(function (c) {
      var t = TR.tick[c.sym], r = el('button'); r.type = 'button'; r.className = 'tr-row'; r.dataset.sym = c.sym;
      var a = el('div'); a.className = 'tr-c'; var im = document.createElement('img'); im.src = coinImg(c); im.alt = ''; im.onerror = function () { this.style.visibility = 'hidden'; }; a.appendChild(im);
      var d = el('div'), nm = el('b', null, c.sym); nm.appendChild(el('small', null, ' /USDT')); d.appendChild(nm);
      var held = coinTotal(c); d.appendChild(el('span', null, held && held > 0 ? (state.hidden ? '••••' : 'لديك ' + niceNum(held, 6)) : c.name)); a.appendChild(d); r.appendChild(a);
      var p = el('div'); p.className = 'tr-p'; var pr = trPrice(c.sym); p.appendChild(el('b', null, fp(pr))); if (t && t.vol) p.appendChild(el('small', null, 'Vol ' + fVol(t.vol))); r.appendChild(p);
      var ch = chg(c), cb = el('span', null, ch == null ? '—' : (ch > 0 ? '+' : '') + ch.toFixed(2) + '%'); cb.className = 'tr-ch ' + (ch == null ? 'na' : ch >= 0 ? 'up' : 'dn'); r.appendChild(cb);
      r.onclick = function () { openPair(c.sym); };
      box.appendChild(r);
    });
  }
  $('tr-q').addEventListener('input', function () { TR.q = this.value; renderTrade(); });
  document.querySelectorAll('#tr-sort button').forEach(function (b) { b.onclick = function () { TR.sort = b.dataset.sort; document.querySelectorAll('#tr-sort button').forEach(function (x) { x.classList.toggle('on', x === b); }); renderTrade(); }; });

  // ===== شاشة الزوج =====
  function openPair(sym) { TR.sym = sym; TR.kl = null; TR.hover = null; show('pair'); }
  function loadPair() {
    var c = trCoin(TR.sym); if (!c) return;
    $('pr-logo').src = coinImg(c); $('pr-pair').textContent = c.sym + '/USDT'; $('pr-name').textContent = c.name; $('pr-pos-sym').textContent = c.sym;
    document.querySelectorAll('#pr-tf button').forEach(function (b) { b.classList.toggle('on', b.dataset.tf === TR.tf); });
    trRenderTop(); trRenderPos(); loadKlines();
    if (!TR.timer) loadTrade();
  }
  function trRenderTop() {
    var t = TR.tick[TR.sym] || {}, p = trPrice(TR.sym), pe = $('pr-price');
    var prev = Number(pe.dataset.v || 0); pe.textContent = fp(p); pe.dataset.v = p || 0;
    pe.className = 'ltr' + (prev && p && p !== prev ? (p > prev ? ' up' : ' dn') : '');
    var ch = $('pr-chg'); ch.textContent = isFinite(t.chg) ? (t.chg > 0 ? '+' : '') + t.chg.toFixed(2) + '%' : '—'; ch.className = 'pr-chg ' + (t.chg >= 0 ? 'up' : t.chg < 0 ? 'dn' : '');
    $('pr-usd').textContent = p ? '≈ $' + fp(p) : '';
    $('pr-hi').textContent = fp(t.hi); $('pr-lo').textContent = fp(t.lo); $('pr-vol').textContent = t.vol ? '$' + fVol(t.vol) : '—';
    if (TR.kl && TR.kl.length && p && !TR.hover) { var last = TR.kl[TR.kl.length - 1]; if (Date.now() - last.t < tfMs(TR.tf)) { last.c = p; if (p > last.h) last.h = p; if (p < last.l) last.l = p; drawCandles(); } }
    trRenderPos();
  }
  function tfMs(tf) { return { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 }[tf]; }
  // شموع Binance (200 شمعة) بصيغة موحّدة { t, o, h, l, c, v }؛ v = حجم التداول بالدولار
  async function binanceKlines(sym, tf) {
    var j = await trJson(BN_API + 'klines?symbol=' + BN_SYM[sym] + '&interval=' + tf + '&limit=200');
    return j.map(function (x) { return { t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[7] }; });
  }
  async function loadKlines() {
    var sym = TR.sym, tf = TR.tf, key = 'sarra.kl.' + sym + '.' + tf, kl = null;
    $('pr-load').hidden = false; $('pr-load').textContent = 'جارٍ تحميل الشموع…';
    kl = cacheGet(key, 60000, 'k');
    if (!kl) {
      try {
        kl = await binanceKlines(sym, tf);
      } catch (e) {
        try { // احتياط CoinGecko (بلا حجم تداول، وفترات أخشن)
          var c = trCoin(sym), days = { '15m': 1, '1h': 7, '4h': 30, '1d': 365, '1w': 'max' }[tf];
          var g = await trJson('https://api.coingecko.com/api/v3/coins/' + c.cg + '/ohlc?vs_currency=usd&days=' + days);
          kl = g.map(function (x) { return { t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: 0 }; });
        } catch (e2) { kl = null; }
      }
      if (kl && kl.length) cachePut(key, 'k', kl);
    }
    if (TR.sym !== sym || TR.tf !== tf) return;
    if (!kl || kl.length < 5) { $('pr-load').textContent = 'تعذّر تحميل الشموع الآن. اضغط لإعادة المحاولة'; $('pr-load').onclick = function () { $('pr-load').onclick = null; loadKlines(); }; return; }
    $('pr-load').hidden = true; TR.kl = kl; TR.hover = null; TR.off = 0; TR.oldDone = false; drawCandles(); renderAnalysis();
  }
  async function loadOlder() {
    if (TR.oldBusy || TR.oldDone || !TR.kl || !TR.kl.length || TR.kl.length >= 1000) return;
    var sym = TR.sym, tf = TR.tf, first = TR.kl[0].t; TR.oldBusy = true;
    try {
      var j = await trJson(BN_API + 'klines?symbol=' + BN_SYM[sym] + '&interval=' + tf + '&limit=200&endTime=' + (first - 1));
      if (TR.sym !== sym || TR.tf !== tf || TR.kl[0].t !== first) return;
      var more = j.map(function (x) { return { t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[7] }; }).filter(function (k) { return k.t < first; });
      if (!more.length) { TR.oldDone = true; return; }
      TR.kl = more.concat(TR.kl); drawCandles(); // TR.off محسوب من النهاية فيبقى المنظر ثابتاً
    } catch (e) {} finally { TR.oldBusy = false; }
  }
  $('pr-more-btn').onclick = function () { var m = $('pr-more'); m.hidden = !m.hidden; this.textContent = m.hidden ? 'عرض التفاصيل' : 'إخفاء التفاصيل'; };
  document.querySelectorAll('#pr-tf button').forEach(function (b) { b.onclick = function () { TR.tf = b.dataset.tf; document.querySelectorAll('#pr-tf button').forEach(function (x) { x.classList.toggle('on', x === b); }); loadKlines(); }; });

  // ===== المؤشرات =====
  // logic/indicators.js
  function sma(a, n) { return SarraLogic.sma(a, n); }
  function ema(a, n) { return SarraLogic.ema(a, n); }
  function analyze(kl, hkl) { return SarraLogic.analyze(kl, hkl); }
  var HTF = { '15m': '1h', '1h': '4h', '4h': '1d', '1d': '1w', '1w': null };
  async function loadHigherTf() { // شموع الإطار الأعلى للتأكيد (تُحفظ 5 دقائق)
    var sym = TR.sym, tf = HTF[TR.tf]; if (!tf) return null;
    var key = 'sarra.kl.' + sym + '.' + tf;
    var cached = cacheGet(key, 300000, 'k'); if (cached) return cached;
    try { var k = await binanceKlines(sym, tf); cachePut(key, 'k', k); return k; } catch (e) { return null; }
  }
  async function renderAnalysis() {
    var kl = TR.kl, sym = TR.sym, tf = TR.tf; if (!kl || kl.length < 80) { $('pr-ana').hidden = true; return; } $('pr-ana').hidden = false;
    var hk = await loadHigherTf(); if (TR.sym !== sym || TR.tf !== tf || TR.kl !== kl) return;
    var A = analyze(kl, hk), s = A.score == null ? 0 : A.score;
    var lab = s >= 3 ? ['شراء', 'buy'] : s <= -3 ? ['بيع', 'sell'] : ['محايد', ''];
    // الثقة: توافق المؤشرات مع الإطار الأعلى وقوة الاتجاه
    var conf = Math.abs(s) >= 6 && A.agree !== false && (A.adx || 0) >= 20 ? 'عالية' : Math.abs(s) >= 3 && A.agree !== false ? 'متوسطة' : 'منخفضة';
    var sg = $('pr-sig'); sg.textContent = lab[0]; sg.className = 'pr-sig ' + lab[1];
    $('pr-gauge-dot').style.left = ((s + 10) / 20 * 100).toFixed(1) + '%';
    $('pr-conf').textContent = 'الثقة: ' + conf + (A.agree === true ? ' · يتوافق مع الإطار الأعلى' : A.agree === false ? ' · يعاكس الإطار الأعلى ⚠️' : '');
    // الدقة التاريخية للإشارة الحالية
    var side = s >= 3 ? A.bt.buy : s <= -3 ? A.bt.sell : null, btEl = $('pr-bt');
    if (side && side.n >= 5) {
      var wr = side.w / side.n * 100, avg = side.ret / side.n * 100;
      btEl.textContent = '📊 على ' + sym + ' بهذا الإطار، صدقت إشارات ' + (s > 0 ? 'الشراء' : 'البيع') + ' المماثلة ' + wr.toFixed(0) + '% من المرات (' + side.w + ' من ' + side.n + ') بعد ' + A.bt.H + ' شموع، بمتوسط ' + (avg >= 0 ? '+' : '') + avg.toFixed(2) + '% بعد الرسوم.';
      btEl.className = 'pr-bt ' + (wr >= 55 ? 'up' : wr < 45 ? 'dn' : '');
    } else if (side) { btEl.textContent = '📊 إشارات قليلة مماثلة في الماضي القريب، فلا يمكن قياس دقتها بعد.'; btEl.className = 'pr-bt'; }
    else { var tb = A.bt.buy, ts = A.bt.sell; btEl.textContent = '📊 لا إشارة واضحة الآن. تاريخياً على هذا الإطار: الشراء صدق ' + (tb.n ? (tb.w / tb.n * 100).toFixed(0) + '%' : '—') + ' والبيع ' + (ts.n ? (ts.w / ts.n * 100).toFixed(0) + '%' : '—') + ' من المرات.'; btEl.className = 'pr-bt'; }
    var box = $('pr-ind'); box.textContent = '';
    var add = function (t, v, cls, sub) { var d = el('div'); d.appendChild(el('span', null, t)); var b = el('b', null, v); if (cls) b.className = cls; d.appendChild(b); if (sub) d.appendChild(el('small', 'font-size:11px;color:var(--mu);direction:ltr;text-align:right', sub)); box.appendChild(d); };
    add('الاتجاه', A.trend, A.trend === 'صاعد' ? 'up' : A.trend === 'هابط' ? 'dn' : '');
    add('قوة الاتجاه (ADX)', A.adx == null ? '—' : A.adx.toFixed(0) + (A.adx >= 25 ? ' · قوي' : A.adx >= 20 ? ' · متوسط' : ' · ضعيف'));
    add('RSI (14)', A.rsi == null ? '—' : A.rsi.toFixed(1) + (A.rsi > 70 ? ' · تشبّع شراء' : A.rsi < 30 ? ' · تشبّع بيع' : ''), A.rsi > 70 ? 'dn' : A.rsi < 30 ? 'up' : '');
    add('MACD', A.hist == null ? '—' : A.hist > 0 ? 'زخم صاعد' : 'زخم هابط', A.hist > 0 ? 'up' : 'dn');
    add('بولنجر', A.bb == null ? '—' : A.bb > 0.95 ? 'عند الحد العلوي' : A.bb < 0.05 ? 'عند الحد السفلي' : 'داخل النطاق', A.bb > 0.95 ? 'dn' : A.bb < 0.05 ? 'up' : '');
    add('الحجم', A.vol == null || !A.vol ? '—' : A.vol >= 1.5 ? 'مرتفع ×' + A.vol.toFixed(1) : A.vol < 0.6 ? 'ضعيف' : 'عادي');
    add('الإطار الأعلى (' + ({ '1h': '1س', '4h': '4س', '1d': 'يوم', '1w': 'أسبوع' }[HTF[tf]] || '—') + ')', A.hs == null ? '—' : A.hs > 2 ? 'صاعد' : A.hs < -2 ? 'هابط' : 'محايد', A.hs > 2 ? 'up' : A.hs < -2 ? 'dn' : '');
    add('التذبذب (ATR)', A.atrPct.toFixed(2) + '%', '', 'متوسط حركة الشمعة');
    add('أقرب دعم', fp(A.sup), 'up', '−' + ((A.p - A.sup) / A.p * 100).toFixed(1) + '% من السعر');
    add('أقرب مقاومة', fp(A.res), 'dn', '+' + ((A.res - A.p) / A.p * 100).toFixed(1) + '% من السعر');
    // مستويات مقترحة للمعلومة: وقف خسارة تحت الدعم بمسافة ATR، والهدف عند المقاومة
    var stop = Math.min(A.sup, A.p) - A.atrPct / 100 * A.p, rr = (A.res - A.p) / Math.max(A.p - stop, 1e-12);
    add('وقف خسارة مقترح', fp(stop), 'dn', '−' + ((A.p - stop) / A.p * 100).toFixed(1) + '% من السعر');
    add('العائد/المخاطرة', rr > 0 ? '1 : ' + rr.toFixed(1) + (rr >= 2 ? ' · جيد' : rr < 1 ? ' · ضعيف' : '') : '—', rr >= 2 ? 'up' : rr < 1 ? 'dn' : '');
  }

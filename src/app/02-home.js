  // ===== الرئيسية =====
  function shortAddr(a) { return a ? a.slice(0, 4) + '…' + a.slice(-4) : ''; }
  function netName() { return NETWORK === 'mainnet' ? (Object.keys(EVM).length ? 'TRON · BNB Chain · Ethereum · Polygon' : 'شبكة TRON') : 'شبكة الاختبار (Nile)'; }
  // التنقل بين الأقسام لا يعيد الجلب إن كانت البيانات حديثة (أقل من 20 ثانية)، حتى لا نتجاوز حد طلبات TronGrid
  var FRESH_MS = 20000;
  state.fetchedAt = { home: 0, history: 0 };
  // آخر رصيد معروف يُحفظ على الجهاز ويُعرض فوراً عند الفتح، ثم يُحدَّث من الشبكة
  function balCacheKey() { return 'sarra.bal.' + (state.lhAddr || ''); }
  function saveBalCache() {
    try {
      var b = state.balances, eb = state.evmBal, o = { at: Date.now() };
      if (b) o.t = { trxUnits: String(b.trxUnits), usdtUnits: String(b.usdtUnits), trx: b.trx, usdt: b.usdt };
      if (eb) { o.e = {}; Object.keys(eb).forEach(function (k) { if (eb[k]) { o.e[k] = {}; Object.keys(eb[k]).forEach(function (x) { if (eb[k][x] != null) o.e[k][x] = String(eb[k][x]); }); } }); }
      lsPut(balCacheKey(), o);
    } catch (e) {}
  }
  function loadBalCache() {
    try {
      var o = lsJson(balCacheKey(), null); if (!o) return;
      if (o.t && !state.balances) state.balances = { trxUnits: BigInt(o.t.trxUnits), usdtUnits: BigInt(o.t.usdtUnits), trx: o.t.trx, usdt: o.t.usdt, cached: true };
      if (o.e && !state.evmBal) { var eb = {}; Object.keys(o.e).forEach(function (k) { eb[k] = {}; Object.keys(o.e[k]).forEach(function (x) { eb[k][x] = BigInt(o.e[k][x]); }); }); state.evmBal = eb; state.evmBalCached = true; }
    } catch (e) {}
  }
  // ===== انقطاع الإنترنت: شريط واضح، وتحديث تلقائي عند عودته =====
  function netState() {
    var off = navigator.onLine === false; $('offline-bar').hidden = !off;
    if (!off && state.wasOffline && core.isUnlocked()) { state.balances && (state.balances.cached = true); var cur = state.stack[state.stack.length - 1]; if (cur === 'home') loadHome(true); rxTick(true); }
    state.wasOffline = off;
  }
  window.addEventListener('offline', netState); window.addEventListener('online', netState); netState();
  // ===== إشعارات Firebase الفورية (تصل والتطبيق مغلق) =====
  var PN = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.PushNotifications;
  function pushKey() { return 'sarra.push.' + (state.lhAddr || ''); }
  async function pushInit() {
    if (!PN || !P2P_URL || state.pushInit) return; state.pushInit = 1;
    try {
      await PN.addListener('registration', async function (t) {
        var tok = t && t.value; if (!tok) return;
        try { if (localStorage.getItem(pushKey()) === tok) { state.pushOn = true; return; } } catch (e) {}
        try {
          var evm = Object.keys(EVM).length ? await core.evmAddress() : null;
          await p2p('push.register', evm ? { token: tok, evm: evm } : { token: tok });
          try { localStorage.setItem(pushKey(), tok); } catch (e) {}
          state.pushOn = true;
        } catch (e) { /* يُعاد التسجيل عند الفتح التالي */ }
      });
      await PN.addListener('registrationError', function () { state.pushOn = false; });
      // وصل إشعار والتطبيق مفتوح: لا يظهر في الشريط (presentationOptions فارغة)، فنفحص فوراً ونعرض نافذة الاستلام
      // إشعار P2P (حالة طلب أو رسالة): التطبيق مفتوح ← نحدّث الطلب المفتوح والشارة فوراً؛ ضغط الإشعار ← يفتح الطلب نفسه
      var p2pData = function (n) { var d = n && (n.data || (n.notification && n.notification.data)) || {}; return d.kind === 'p2p' && /^[\w-]{1,64}$/.test(String(d.order || '')) ? d.order : null; };
      await PN.addListener('pushNotificationReceived', function (n) {
        var oid = p2pData(n);
        if (!oid) { rxHint(n); return rxTick(true); }
        if (state.p2p.orderId === oid && /^order/.test(state.stack[state.stack.length - 1])) refreshOrder('order.get'); else { toast((n && n.title) || 'تحديث على طلب P2P'); pollMyOrders(); }
      });
      await PN.addListener('pushNotificationActionPerformed', function (a) {
        var oid = p2pData(a);
        if (!oid) return setTimeout(function () { rxTick(true); }, 800);
        var go = function () { if (core.isUnlocked()) openOrder(oid, true); else setTimeout(go, 700); }; setTimeout(go, 600); // بعد فتح القفل
      });
      if (PN.createChannel) await PN.createChannel({ id: 'tx2', name: 'المعاملات', description: 'استلام وخصم', importance: 5, visibility: 1, sound: 'coin.wav', vibration: true, lights: true, lightColor: '#16A37A' }).catch(function () {});
      var pm = await PN.checkPermissions(); if (pm.receive !== 'granted') pm = await PN.requestPermissions();
      if (pm.receive === 'granted') await PN.register();
    } catch (e) {}
  }
  async function loadHome(force) {
    if (!state.rxFirst) { state.rxFirst = 1; setTimeout(pushInit, 1500); setTimeout(vaultRestore, 2500); setTimeout(function () { lnReady().catch(function () {}); rxTick(true); }, 3000); setTimeout(function () { mcLowCheck().catch(function () {}); }, 6000); } // بعد تحميل الرصيد: لا نزاحم طلبات الفتح
    if (!state.lhAddr) { try { state.lhAddr = await core.getAddress(); } catch (e) {} }
    if (!state.balances || !state.evmBal) loadBalCache();
    $('net-label').textContent = Object.keys(EVM).length ? 'محفظتك الرقمية' : netName();
    renderBalances();
    loadPrices();
    var evmFetch = function () { if (Object.keys(EVM).length) core.evmBalances().then(function (eb) { if (eb) { state.evmBal = eb; state.evmBalCached = false; renderBalances(); saveBalCache(); } }).catch(function () {}); };
    if (force !== true && state.balances && !state.balances.cached && Date.now() - state.fetchedAt.home < FRESH_MS) { if (!state.evmBal || state.evmBalCached) evmFetch(); return; }
    state.fetchedAt.home = Date.now();
    evmFetch();
    try {
      var b = await core.getBalances();
      state.balances = b;
      renderBalances(); saveBalCache();
      var trx = Number(WalletCore.fromUnits(b.trxUnits, 6));
      $('low-trx').hidden = !(trx < 15 && b.usdtUnits > 0n);
    } catch (e) {
      state.fetchedAt.home = 0;
      // عند وجود رصيد معروض مسبقاً لا نزعج المستخدم برسالة عند كل تنقّل؛ نُظهرها عند التحديث اليدوي أو أول تحميل
      // رصيد محفوظ معروض: لا نزعج المستخدم؛ نعيد المحاولة بهدوء بعد قليل
      if (state.balances && state.balances.cached) { if (!state.homeRetry) { state.homeRetry = 1; setTimeout(function () { state.homeRetry = 0; if (state.stack[state.stack.length - 1] === 'home') loadHome(true); }, 8000); } }
      else if (force === true || !state.balances) toast('تعذّر تحديث الرصيد الآن. سنحاول مجدداً تلقائياً', true);
    }
    loadHistory();
  }
  // ===== العملات (على طريقة Binance وTrust Wallet) =====
  var COINS = REG.assets; // logic/registry.js: العملات وشبكاتها وأزواج تداولها
  function coinLogo(k) { return 'assets/coins/' + k + '.png'; }
  function coinImg(c) { return c.url || coinLogo(c.logo); }
  // شعار احتياطي (حرف العملة) إن تعذّر تحميل الشعار من الإنترنت
  function fallbackLogo(sym) { var t = String(sym || '?').slice(0, 1); return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#8a94a6"/><text x="20" y="26" font-size="18" font-family="sans-serif" font-weight="700" fill="#fff" text-anchor="middle">' + t + '</text></svg>'); }
  document.addEventListener('error', function (e) { var im = e.target; if (im && im.tagName === 'IMG' && !im.dataset.fb) { im.dataset.fb = '1'; im.src = fallbackLogo(im.alt || im.dataset.sym); } }, true);
  // رصيد عملة على شبكة (رقم) أو null إن لم يُحمّل بعد
  function balOn(sym, net) {
    if (net === 'tron') { var b = state.balances; if (!b) return null; return sym === 'USDT' ? Number(b.usdt) : sym === 'TRX' ? Number(b.trx) : null; }
    var u = evmUnits(net, sym); return u == null ? null : Number(WalletCore.fromUnits(u, evmDec(net, sym)));
  }
  // المبلغ القابل للصرف بالوحدات الصحيحة (BigInt بلا أخطاء فاصلة عائمة). لعملة الشبكة نحجز gasKeep للرسوم أولاً ثم نطبّق النسبة على المتاح،
  // فتكون النسب متصاعدة دائماً (25 < 50 < 75 < 100). لغيرها المتاح = الرصيد كله. يرجع {units, keep, bal} أو null إن لم يُحمّل الرصيد.
  // units=0n حين لا يتسع الرصيد للحجز (الواجهة تعرض رسالة بدل صفر صامت).
  function spendUnits(net, sym, pct) {
    var u = evmUnits(net, sym); if (u == null) return null;
    var d = evmDec(net, sym), bal = BigInt(u), keep = sym === netOf(net).native ? WalletCore.toUnitsFloor(String(REG.gasKeep(net)), d) : 0n;
    var avail = bal > keep ? bal - keep : 0n;
    return { units: avail * BigInt(pct) / 100n, keep: keep, bal: bal, dec: d };
  }
  // نص الكمية مقتطعاً (لا تقريب لأعلى أبداً) إلى 6 خانات كحد أقصى
  function unitsText(units, dec) {
    var s = WalletCore.fromUnits(units, dec), p = s.split('.'); if (p.length < 2) return s;
    var f = p[1].slice(0, 6).replace(/0+$/, ''); return f ? p[0] + '.' + f : p[0];
  }
  // عملة مغلّفة/مجسّرة على هذه الشبكة (مثل ETH على BNB Chain = Binance-Peg) ليست العملة الأصلية للشبكة الأخرى
  function isWrapped(net, sym) {
    if (sym === netOf(net).native) return false;
    if (sym === 'BTC') return true;
    return NETS.some(function (n) { return n.key !== net && n.native === sym; });
  }
  function coinOnLabel(net, sym) { return sym + ' · ' + netOf(net).name + (isWrapped(net, sym) ? ' (مغلّف)' : ''); }
  function coinTotal(c) {
    var t = 0, known = false;
    c.nets.forEach(function (n) { var v = balOn(c.sym, n); if (v != null) { t += v; known = true; } });
    return known ? t : null;
  }
  // الأسعار من CoinGecko (مجاني، من الهاتف مباشرة) وتُحفظ 5 دقائق؛ على شبكة الاختبار لا قيمة للعملات
  state.prices = null;
  var pc = cacheGet('sarra.prices', 6 * 3600000, 'p'); if (pc) state.prices = pc;
  var pricesAt = 0;
  // الأسعار عبر خادمنا (ذاكرة مؤقتة مشتركة، ولا حجب جغرافي)، ثم CoinGecko مباشرة إن تعذّر
  function marketUrl(q) { var b = CFG.p2pUrl ? String(CFG.p2pUrl).replace(/\/p2p\/?$/, '/market') : ''; return b ? b + '?' + q : ''; }
  async function marketGet(q, direct) {
    var mu = marketUrl(q);
    if (mu) { try { var r = await fetch(mu); if (r.ok) return await r.json(); } catch (e) {} }
    var r2 = await fetch(direct); if (!r2.ok) throw new Error('MARKET'); return await r2.json();
  }
  function loadPrices() {
    if (NETWORK !== 'mainnet' || Date.now() - pricesAt < 300000) return;
    pricesAt = Date.now();
    var ids = COINS.map(function (c) { return c.cg; }).join(',');
    marketGet('kind=markets', 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&sparkline=true&price_change_percentage=24h&ids=' + ids)
      .then(function (j) {
        var by = {}; j.forEach(function (x) { by[x.id] = x; });
        var p = {}, sp = {};
        COINS.forEach(function (c) {
          var x = by[c.cg]; if (!x) return;
          var usd = x.usd != null ? x.usd : x.current_price, chg = x.chg != null ? x.chg : x.price_change_percentage_24h;
          if (usd != null) p[c.sym] = { usd: usd, chg: chg };
          var a = x.spark || (x.sparkline_in_7d && x.sparkline_in_7d.price);
          if (a && a.length > 8) { if (a.length > 41) { var st = a.length / 40, d = []; for (var i = 0; i < 40; i++) d.push(a[Math.floor(i * st)]); d.push(a[a.length - 1]); a = d; } sp[c.cg] = a; }
        });
        state.prices = p; cachePut('sarra.prices', 'p', p);
        if (Object.keys(sp).length) { state.spark = sp; cachePut('sarra.spark', 's', sp); }
        renderBalances();
      }).catch(function () { pricesAt = 0; });
  }
  // خط سعر الأسبوع الصغير بجانب كل عملة (طلب واحد لكل العملات، يُحفظ ساعة)
  state.spark = null;
  var spc = cacheGet('sarra.spark', 3600000, 's'); if (spc) state.spark = spc;
  function sparkSvg(a) {
    var mn = Math.min.apply(null, a), mx = Math.max.apply(null, a), rg = Math.max(mx - mn, mx * 0.01) || 1, up = a[a.length - 1] >= a[0];
    var d = a.map(function (v, i) { return (i ? 'L' : 'M') + (i / (a.length - 1) * 60).toFixed(1) + ' ' + (2 + (1 - (v - mn) / rg) * 20).toFixed(1); }).join(' ');
    var w = document.createElement('span'); w.className = 'spark'; w.setAttribute('aria-hidden', 'true');
    w.innerHTML = '<svg viewBox="0 0 60 24" preserveAspectRatio="none"><path d="' + d + '" fill="none" stroke="' + (up ? '#16a37a' : '#e5484d') + '" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
    return w;
  }
  function priceOf(c) { if (c.stable) return { usd: 1, chg: state.prices && state.prices[c.sym] ? state.prices[c.sym].chg : null }; return state.prices && state.prices[c.sym] || null; }
  // سعر الوحدة: العملات الرخيصة جداً (PEPE مثلاً) تُعرض بأرقامها المهمة بدل «<$0.01»
  function unitUsd(n) { n = Number(n); if (!(n > 0) || n >= 0.01) return usd(n); var d = Math.min(12, Math.ceil(-Math.log10(n)) + 2); return '$' + n.toFixed(d).replace(/0+$/, ''); }
  function usd(n) { n = Number(n); if (n > 0 && n < 0.01) return '<$0.01'; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  // ≈ القيمة بالدولار لمبلغ من عملة (لا شيء إن لم يتوفر السعر)
  function usdOf(amount, sym) { var c = COINS.filter(function (x) { return x.sym === sym; })[0], p = c && priceOf(c), n = Number(String(amount || '').replace(/,/g, '')); return p && p.usd != null && isFinite(n) && n > 0 ? n * p.usd : null; }
  function usdEq(elm, amount, sym) { if (!elm) return; var v = usdOf(amount, sym); elm.textContent = v == null ? '' : '≈ ' + usd(v); }
  function coinPill(elm, sym) { elm.textContent = ''; var im = document.createElement('img'); im.src = symLogo(sym); im.alt = sym; elm.appendChild(im); elm.appendChild(document.createTextNode(sym)); }
  function chgEl(chg) { if (chg == null || !isFinite(chg)) return null; var e = el('em', null, (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%'); e.className = 'chg ' + (chg >= 0 ? 'up' : 'dn'); return e; }
  function renderAssets() {
    var box = $('assets'); box.textContent = '';
    var rows = COINS.map(function (c) { var t = coinTotal(c), p = priceOf(c); return { c: c, t: t, v: t != null && p && NETWORK === 'mainnet' ? t * p.usd : (c.stable ? t : null), p: p }; });
    // الأعلى قيمة أولاً، ثم العملات الأساسية، ثم بقية العملات المدعومة بترتيبها
    rows.forEach(function (r, i) { r.i = i; });
    rows.sort(function (a, b) { return ((b.v || 0) - (a.v || 0)) || ((a.c.extra ? 1 : 0) - (b.c.extra ? 1 : 0)) || (a.i - b.i); });
    var zeros = rows.filter(function (r) { return !r.t && r.t != null; }).length, fold = zeros > 3 && !state.showZero && rows.length - zeros > 0;
    rows.forEach(function (r) {
      var c = r.c, row = el('button'); row.type = 'button'; row.className = 'coin-row' + (r.t ? '' : ' zero'); row.dataset.asset = c.sym;
      if (fold && !r.t && r.t != null) row.hidden = true;
      var cl = el('span'); cl.className = 'cl'; var im = el('img'); im.dataset.sym = c.sym; im.src = coinImg(c); im.alt = ''; cl.appendChild(im);
      row.appendChild(cl);
      var mid = el('div'); mid.className = 'cr-mid'; mid.appendChild(el('b', null, c.sym));
      var sub = el('span', 'direction:ltr;unicode-bidi:isolate;text-align:right', r.p && NETWORK === 'mainnet' ? unitUsd(r.p.usd) : c.name); // نسبة التغير لا تظهر في القائمة: الرسم البياني في صفحة العملة يعرضها، والقائمة تبقى هادئة
      mid.appendChild(sub); row.appendChild(mid);
      var sp = state.spark && state.spark[c.cg]; if (sp) row.appendChild(sparkSvg(sp));
      var end = el('div'); end.className = 'cr-end';
      end.appendChild(el('b', null, state.hidden ? '••••' : r.t == null ? '—' : fmt(r.t, c.stable ? 2 : 6)));
      end.appendChild(el('span', null, state.hidden ? '' : r.v == null ? '' : '≈ ' + usd(r.v)));
      row.appendChild(end);
      row.onclick = function () { openCoin(c); };
      box.appendChild(row);
    });
    if (zeros > 3 && rows.length - zeros > 0) {
      var tg = el('button', null, state.showZero ? 'إخفاء العملات بلا رصيد' : 'عرض ' + (zeros === 1 ? 'عملة أخرى' : zeros === 2 ? 'عملتين أخريين' : zeros <= 10 ? zeros + ' عملات أخرى' : zeros + ' عملة أخرى') + ' بلا رصيد'); tg.type = 'button'; tg.className = 'zero-tg'; tg.id = 'zero-tg';
      tg.onclick = function () { state.showZero = !state.showZero; renderAssets(); };
      box.appendChild(tg);
    }
    $('price-src').textContent = NETWORK === 'mainnet' && state.prices ? 'الأسعار: CoinGecko' : '';
  }
  function openCoin(c) {
    var t = coinTotal(c), p = priceOf(c);
    $('cs-logo').removeAttribute('data-fb'); $('cs-logo').dataset.sym = c.sym; $('cs-logo').src = coinImg(c); $('cs-name').textContent = c.name === c.sym ? c.sym : c.name + ' · ' + c.sym;
    var cp = $('cs-price'); cp.textContent = '';
    if (p && NETWORK === 'mainnet') { var pb = el('bdi', null, unitUsd(p.usd)); pb.style.direction = 'ltr'; cp.appendChild(pb); }
    if (c.nets.length > 1) cp.appendChild(document.createTextNode(' · على ' + c.nets.length + ' شبكات'));
    $('cs-total').textContent = state.hidden ? '••••' : (t == null ? '—' : fmt(t, 6)) + ' ' + c.sym;
    $('cs-usd').textContent = !state.hidden && t != null && p && NETWORK === 'mainnet' ? '≈ ' + usd(t * p.usd) : '';
    var box = $('cs-nets'); box.textContent = '';
    c.nets.forEach(function (n) {
      var nn = netOf(n), v = balOn(c.sym, n), row = el('div'); row.className = 'li'; row.style.cursor = 'default';
      var im = el('img'); im.src = netLogo(n); im.alt = ''; im.className = 'net-mini'; row.appendChild(im);
      var t2 = el('span'); t2.className = 't'; t2.appendChild(document.createTextNode(nn.name)); t2.appendChild(el('small', null, state.hidden ? '••••' : (v == null ? '—' : fmt(v, 6)) + ' ' + c.sym));
      row.appendChild(t2);
      var bs = el('div', 'display:flex;gap:6px;flex-shrink:0');
      var sb = el('button', 'height:34px;padding:0 12px', 'إرسال'); sb.type = 'button'; sb.className = 'chip';
      sb.onclick = function () { $('coin-sheet').classList.remove('show'); state.sendNet = n; state.coin = c.sym; renderCoinSeg(); $('amt').value = ''; show('send'); };
      var rb = el('button', 'height:34px;padding:0 12px', 'استلام'); rb.type = 'button'; rb.className = 'chip';
      rb.onclick = function () { $('coin-sheet').classList.remove('show'); state.recvNet = n; show('receive'); };
      bs.appendChild(sb); bs.appendChild(rb); row.appendChild(bs);
      box.appendChild(row);
    });
    $('coin-sheet').classList.add('show');
    CH.coin = c; $('cs-chart').hidden = NETWORK !== 'mainnet'; if (!$('cs-chart').hidden) loadChart();
  }
  // ===== الرسم البياني للسعر (CoinGecko، SVG بدون مكتبات) =====
  var CH = { coin: null, days: 1, pts: null };
  document.querySelectorAll('.ch-range button').forEach(function (b) {
    b.onclick = function () { CH.days = Number(b.dataset.days); document.querySelectorAll('.ch-range button').forEach(function (x) { x.classList.toggle('on', x === b); }); loadChart(); };
  });
  function fmtPrice(v) { if (v > 0 && v < 1e-4) return '$' + niceNum(v); return v >= 1000 ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 1 ? '$' + v.toFixed(2) : '$' + Number(v.toPrecision(4)); }
  async function loadChart() {
    var c = CH.coin, days = CH.days, key = 'sarra.ch.' + c.cg + '.' + days, data = null;
    $('ch-load').hidden = false; $('ch-load').textContent = 'جارٍ تحميل الرسم…';
    data = cacheGet(key, days === 1 ? 300000 : 3600000, 'p');
    if (!data) {
      try {
        data = (await marketGet('kind=chart&id=' + c.cg + '&days=' + days, 'https://api.coingecko.com/api/v3/coins/' + c.cg + '/market_chart?vs_currency=usd&days=' + days)).prices || [];
        if (data.length > 160) { var st = data.length / 160, d2 = []; for (var i = 0; i < 160; i++) d2.push(data[Math.floor(i * st)]); d2.push(data[data.length - 1]); data = d2; }
        cachePut(key, 'p', data);
      } catch (e) { if (CH.coin === c && CH.days === days) { $('ch-load').textContent = 'تعذّر تحميل الرسم الآن. اضغط هنا لإعادة المحاولة'; $('ch-load').onclick = function () { $('ch-load').onclick = null; loadChart(); }; } return; }
    }
    if (CH.coin !== c || CH.days !== days) return;
    $('ch-load').hidden = true; CH.pts = data; drawChart();
  }
  function drawChart(hover) {
    var pts = CH.pts, svg = $('ch-svg'); if (!pts || pts.length < 2) return;
    var W = 320, H = 150, P = 8, ys = pts.map(function (x) { return x[1]; }), mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys), rg = Math.max(mx - mn, mx * 0.01) || 1; mn = Math.min(mn, mx - rg + (rg - (mx - mn)) / 2); // لا نضخّم تذبذب العملات المستقرة
    var X = function (i) { return i / (pts.length - 1) * W; }, Y = function (v) { return P + (1 - (v - mn) / rg) * (H - 2 * P); };
    var up = ys[ys.length - 1] >= ys[0], col = up ? '#16a37a' : '#e5484d';
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' ');
    var g = '<defs><linearGradient id="chg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity=".28"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>';
    var area = '<path d="' + line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="url(#chg)"/>';
    var path = '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>';
    var hv = '';
    var i = hover == null ? pts.length - 1 : hover, cur = pts[i];
    if (hover != null) hv = '<line x1="' + X(i) + '" x2="' + X(i) + '" y1="0" y2="' + H + '" stroke="var(--mu)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/><circle cx="' + X(i) + '" cy="' + Y(cur[1]) + '" r="4" fill="' + col + '" stroke="var(--s1)" stroke-width="2" vector-effect="non-scaling-stroke"/>';
    svg.innerHTML = g + area + path + hv;
    var chg = (cur[1] - ys[0]) / ys[0] * 100;
    $('ch-price').textContent = fmtPrice(cur[1]);
    $('ch-chg').textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%'; $('ch-chg').style.color = chg >= 0 ? '#16a37a' : '#e5484d';
    var d = new Date(cur[0]);
    $('ch-date').textContent = hover == null ? { 1: 'آخر 24 ساعة', 7: 'آخر أسبوع', 30: 'آخر شهر', 90: 'آخر 3 أشهر', 365: 'آخر سنة' }[CH.days] : d.toLocaleString('ar', CH.days <= 7 ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: CH.days > 90 ? 'numeric' : undefined });
    $('ch-hi').textContent = 'أعلى ' + fmtPrice(mx); $('ch-lo').textContent = 'أدنى ' + fmtPrice(mn);
  }
  (function () {
    var svg = $('ch-svg');
    var at = function (e) { if (!CH.pts) return; var r = svg.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; drawChart(Math.max(0, Math.min(CH.pts.length - 1, Math.round(x / r.width * (CH.pts.length - 1))))); };
    svg.addEventListener('pointermove', at); svg.addEventListener('pointerdown', at);
    svg.addEventListener('touchmove', function (e) { e.preventDefault(); at(e); }, { passive: false });
    var end = function () { drawChart(); }; svg.addEventListener('pointerleave', end); svg.addEventListener('touchend', end); svg.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') end(); });
  })();
  // شرح وقود الشبكة
  function openGasHelp(k) {
    var n = netOf(k || 'bsc'), coin = n.evm ? n.native : 'TRX';
    $('gas-coin').textContent = coin; document.querySelectorAll('.gas-coin2').forEach(function (x) { x.textContent = coin; });
    $('gas-net').textContent = n.evm ? n.name + ' (' + n.short + ')' : 'TRON (TRC20)';
    $('gas-sheet').dataset.net = n.key; $('gas-sheet').classList.add('show');
  }
  function openCoinsHelp() {
    var box = $('coins-list'); box.textContent = '';
    NETS.forEach(function (n) {
      var r = el('div'); r.className = 'li'; r.style.cursor = 'default';
      var ic = el('span'); ic.className = 'ic'; var im = document.createElement('img'); im.src = netLogo(n.key); im.alt = ''; im.style.cssText = 'width:26px;height:26px;border-radius:50%'; ic.appendChild(im); r.appendChild(ic);
      var t = el('span'); t.className = 't'; var sh = n.evm ? n.short : 'TRC20'; t.appendChild(document.createTextNode(sh && sh !== n.name ? n.name + ' (' + sh + ')' : n.name));
      t.appendChild(el('small', null, n.coins.join(' · ') + ' — الرسوم بـ ' + (n.evm ? n.native : 'TRX'))); r.appendChild(t);
      box.appendChild(r);
    });
    $('coins-sheet').classList.add('show');
  }
  $('recv-coins-help').onclick = openCoinsHelp;
  $('coins-close').onclick = function () { $('coins-sheet').classList.remove('show'); };
  $('coins-sheet').onclick = function (e) { if (e.target === this) this.classList.remove('show'); };
  $('gas-close').onclick = function () { $('gas-sheet').classList.remove('show'); };
  $('gas-sheet').onclick = function (e) { if (e.target === this) this.classList.remove('show'); };
  $('gas-recv').onclick = function () { $('gas-sheet').classList.remove('show'); state.recvNet = $('gas-sheet').dataset.net || MAIN_NET; if (state.stack[state.stack.length - 1] === 'receive') loadReceive(); else show('receive'); };
  $('send-gas-help').onclick = function () { openGasHelp(state.sendNet); };
  $('recv-gas-help').onclick = function () { openGasHelp(state.recvNet); };
  $('cs-close').onclick = function () { $('coin-sheet').classList.remove('show'); };
  $('coin-sheet').onclick = function (e) { if (e.target === this) this.classList.remove('show'); };
  // إجمالي الأصول بالدولار (العملات المستقرة بدولار، والبقية بسعرها إن عُرف)
  function portfolioUsd() {
    var tot = 0, ok = false;
    COINS.forEach(function (c) { var t = coinTotal(c); if (t == null) return; var p = priceOf(c);
      if (c.stable) { tot += t; ok = true; } else if (p && NETWORK === 'mainnet') { tot += t * p.usd; ok = true; } });
    return ok ? tot : null;
  }
  function renderBalances() {
    var b = state.balances;
    renderAssets(); try { syncHeroSid(); } catch (e) {}
    if (NETS.length > 1 && !$('bal-chip').dataset.done) {
      var ch = $('bal-chip'); ch.dataset.done = '1'; ch.textContent = ''; ch.className = 'net-stack';
      var st = document.createElement('span'); st.className = 'logos';
      NETS.forEach(function (n) { var im = document.createElement('img'); im.src = netLogo(n.key); im.alt = n.name; im.title = n.name; st.appendChild(im); });
      ch.appendChild(st);
      ch.removeAttribute('style'); ch.setAttribute('aria-label', 'الشبكات: ' + NETS.map(function (n) { return n.name; }).join('، '));
    }
    if (!b) return;
    var multi = Object.keys(EVM).length || (state.prices && NETWORK === 'mainnet');
    var tot = portfolioUsd();
    var bu = $('bal-usdt'); bu.classList.toggle('masked', state.hidden);
    if (state.hidden) { // نقاط دائرية بحجم الرقم نفسه (لا نص «••••» صغير يكشف عدد الخانات)
      bu.textContent = ''; var dots = el('span'); dots.className = 'bal-dots'; dots.setAttribute('aria-label', 'الرصيد مخفي');
      dots.appendChild(el('span', null, '$')).className = 'bal-cur'; for (var di = 0; di < 6; di++) dots.appendChild(el('i')); bu.appendChild(dots);
    }
    else {
      // الدولارات كبيرة والسنتات أصغر، كما في تطبيقات البنوك
      var val = multi && tot != null ? tot : Number(b.usdt) || 0, sp = usd(val).replace('$', '').split('.');
      bu.textContent = ''; bu.appendChild(el('span', null, '$')).className = 'bal-cur'; bu.appendChild(document.createTextNode(sp[0]));
      bu.appendChild(el('span', null, '.' + (sp[1] || '00'))).className = 'bal-dec';
    }
    var dch = portfolioChange(), bc = $('bal-chg');
    bc.hidden = state.hidden || dch == null || !isFinite(dch.pct);
    if (!bc.hidden) {
      var up = dch.usd >= 0; bc.className = 'bal-chg ' + (up ? 'up' : 'dn');
      bc.textContent = '';
      bc.appendChild(el('i', 'font-style:normal;font-size:10px', up ? '▲' : '▼'));
      bc.appendChild(el('b', 'direction:ltr;unicode-bidi:isolate', (up ? '+' : '−') + usd(Math.abs(dch.usd))));
      bc.appendChild(el('b', 'direction:ltr;unicode-bidi:isolate;opacity:.9', (up ? '+' : '') + dch.pct.toFixed(2) + '%'));
      bc.appendChild(el('span', null, 'ربح/خسارة اليوم'));
      bc.appendChild(el('i', 'font-style:normal;opacity:.8;margin-inline-start:2px', '‹'));
    }
    $('bal-label').textContent = multi ? 'إجمالي الأصول' : 'رصيد الدولار الرقمي';
    if (tot != null && pfComplete()) pfRecord(tot); // نقطة ناقصة (شبكة لم تُقرأ أو سعر غير متوفر) كانت ستظهر «خسارة» وهمية في الرسم
    renderPerf();
  }
  // ===== أداء المحفظة =====
  // نقاط قيمة المحفظة محفوظة على الجهاز (لكل محفظة): نقطة كل 15 دقيقة على الأكثر، تُخفَّف بعد أسبوع لنقطة كل 6 ساعات
  var ALLOC_COL = ['#16A37A', '#3B82F6', '#F0B90B', '#8B5CF6', '#EF4444', '#94A3B8'];
  // كل الأرصدة على كل الشبكات مقروءة، ولكل عملة غير مستقرة نملكها سعر معروف
  function pfComplete() {
    if (!state.prices) return false;
    return COINS.every(function (c) {
      var t = 0; for (var i = 0; i < c.nets.length; i++) { var v = balOn(c.sym, c.nets[i]); if (v == null) return false; t += v; }
      return !t || c.stable || (state.prices[c.sym] && state.prices[c.sym].usd > 0);
    });
  }
  function pfKey() { return 'sarra.pfv.' + (state.lhAddr || ''); }
  function pfAll() { var l = lsJson(pfKey(), []); return Array.isArray(l) ? l : []; }
  function pfRecord(v) {
    if (!state.lhAddr || !(v >= 0) || NETWORK !== 'mainnet') return;
    var l = pfAll(), now = Date.now(), last = l[l.length - 1];
    if (last && now - last[0] < 15 * 60000) { last[1] = v; } else l.push([now, v]);
    var wk = now - 7 * 864e5, out = [], lastOld = 0;
    l.forEach(function (p) { if (p[0] >= wk) out.push(p); else if (p[0] - lastOld >= 6 * 3600e3) { out.push(p); lastOld = p[0]; } });
    lsPut(pfKey(), out.slice(-1500));
  }
  // صافي الإيداع والسحب في الفترة (استلام − إرسال من السجل المحلي، بلا تبديل ونقل): حتى لا يُحسب إيداعك «ربحاً»
  function pfFlows(since) {
    var f = 0; lhAll().forEach(function (r) {
      if (!r.time || r.time < since || r.status === 'FAILED') return;
      if (r.kind !== 'recv' && r.kind !== 'send') return;
      var c = REG.asset(r.coin) || {}, p = c.stable ? 1 : (state.prices && state.prices[r.coin] && state.prices[r.coin].usd);
      if (!p) return; f += (r.kind === 'recv' ? 1 : -1) * Number(r.amount || 0) * p;
    });
    return f;
  }
  state.pfP = Number(lsJson('sarra.pfp', 1)) || 1;
  document.querySelectorAll('#pf-tabs button').forEach(function (b) {
    b.classList.toggle('on', Number(b.dataset.p) === state.pfP);
    b.onclick = function () { state.pfP = Number(b.dataset.p); lsPut('sarra.pfp', state.pfP); document.querySelectorAll('#pf-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); }); renderPerf(); };
  });
  // مثل Binance: سطر «ربح/خسارة اليوم» صغير في بطاقة الرصيد، والضغط عليه يفتح التحليل الكامل (لا يحجز مكاناً في الرئيسية)
  $('bal-chg').onclick = function () { renderPerf(true); $('pf-sheet').classList.add('show'); };
  $('pf-close').onclick = function () { $('pf-sheet').classList.remove('show'); };
  $('pf-sheet').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('show'); });
  function renderPerf(force) {
    var tot = portfolioUsd();
    if (!force && !$('pf-sheet').classList.contains('show')) return;
    if (NETWORK !== 'mainnet' || tot == null || !state.prices) return;
    var P = state.pfP, now = Date.now(), all = pfAll(), since = P ? now - P * 864e5 : 0;
    var pts = all.filter(function (p) { return p[0] >= since; });
    if (!pts.length || pts[pts.length - 1][0] < now - 60000) pts.push([now, tot]);
    var pl, base, note = '';
    if (P === 1) { var d = portfolioChange(); pl = d ? d.usd : 0; base = d ? tot - d.usd : tot; note = 'تغيّر أسعار عملاتك خلال 24 ساعة.'; }
    else {
      var first = pts[0], flows = pfFlows(first[0]);
      pl = tot - first[1] - flows; base = first[1] + Math.max(0, flows);
      var span = now - first[0];
      note = span < (P || 1) * 864e5 * 0.8 ? 'يبدأ التتبع من ' + new Date(first[0]).toLocaleDateString('ar', { day: 'numeric', month: 'long' }) + ' (أول فتح بعد التحديث). ' : '';
      note += 'الربح هنا بعد استبعاد ما أودعته أو سحبته.';
    }
    var up = pl >= 0, pct = base > 0 ? pl / base * 100 : 0;
    var pe = $('pf-pl'); pe.className = 'ltr ' + (Math.abs(pl) < 0.005 ? '' : up ? 'up' : 'dn');
    pe.textContent = state.hidden ? '••••' : (up ? '+' : '−') + usd(Math.abs(pl));
    var pc = $('pf-pct'); pc.className = 'pf-pct ltr ' + (Math.abs(pct) < 0.005 ? '' : up ? 'up' : 'dn'); pc.textContent = state.hidden ? '••' : (up ? '+' : '') + pct.toFixed(2) + '%';
    $('pf-note').textContent = note;
    if (P === 1 && pts.length < 3) pts = [[now - 864e5, base], [now, tot]]; // لا نقاط محفوظة بعد: من قيمة الأمس المحسوبة بالأسعار إلى الآن
    pfDraw(pts, up);
    renderAlloc($('pf-alloc'), COINS.map(function (c) { var t = coinTotal(c), p = priceOf(c); return { sym: c.sym, usd: t && p && p.usd ? t * p.usd : 0 }; }), state.hidden);
  }
  function pfDraw(pts, up) {
    var box = $('pf-chart'); box.textContent = '';
    var W = 300, H = 110, col = up ? 'var(--in)' : 'var(--out)';
    if (pts.length < 2) pts = [[pts[0][0] - 1, pts[0][1]], pts[0]];
    var t0 = pts[0][0], t1 = pts[pts.length - 1][0], lo = Infinity, hi = -Infinity;
    pts.forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
    if (hi - lo < hi * 0.002) { hi += hi * 0.002 + 0.01; lo -= lo * 0.002 + 0.01; }
    var X = function (t) { return (t - t0) / Math.max(1, t1 - t0) * W; }, Y = function (v) { return 8 + (hi - v) / (hi - lo) * (H - 16); };
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' ');
    var id = 'pfg' + (up ? 'u' : 'd');
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><defs><linearGradient id="' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + d + ' L' + W + ' ' + H + ' L0 ' + H + 'Z" fill="url(#' + id + ')" stroke="none"/><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
    box.style.color = col;
    // لمس الرسم: قيمة المحفظة في تلك اللحظة
    var tip = el('span'); tip.className = 'tip'; tip.hidden = true; box.appendChild(tip);
    var at = function (cx) { var r = box.getBoundingClientRect(), f = Math.max(0, Math.min(1, (cx - r.left) / r.width)), t = t0 + f * (t1 - t0), best = pts[0];
      pts.forEach(function (p) { if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p; });
      tip.hidden = state.hidden; tip.style.left = (X(best[0]) / W * 100) + '%'; tip.textContent = usd(best[1]) + ' · ' + new Date(best[0]).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
    box.onpointerdown = box.onpointermove = function (e) { if (e.buttons || e.pointerType === 'touch') at(e.clientX); };
    box.onpointerleave = box.onpointerup = function () { setTimeout(function () { tip.hidden = true; }, 1200); };
  }
  // شريط توزيع الأصول: أكبر 4 عملات ثم «أخرى»
  function renderAlloc(box, items, hid, pal) {
    pal = pal || ALLOC_COL;
    items = items.filter(function (x) { return x.usd > 0.005; }).sort(function (a, b) { return b.usd - a.usd; });
    var sum = items.reduce(function (s, x) { return s + x.usd; }, 0); box.textContent = '';
    if (!(sum > 0)) { box.hidden = true; return; }
    box.hidden = false;
    var top = items.slice(0, 4), rest = items.slice(4).reduce(function (s, x) { return s + x.usd; }, 0);
    if (rest > 0) top.push({ sym: 'أخرى', usd: rest });
    var bar = el('div'), lg = el('div'); bar.className = 'bar'; lg.className = 'lg';
    top.forEach(function (x, i) {
      var pc = x.usd / sum * 100, c = pal[x.sym === 'أخرى' ? 5 : i];
      var seg = el('i'); seg.style.width = pc + '%'; seg.style.background = c; bar.appendChild(seg);
      var it = el('span'); var dot = el('i'); dot.style.background = c; it.appendChild(dot); it.appendChild(document.createTextNode(x.sym + ' ')); it.appendChild(el('b', null, hid ? '••' : pc.toFixed(pc < 10 ? 1 : 0) + '%')); lg.appendChild(it);
    });
    box.appendChild(bar); box.appendChild(lg);
  }
  // تغيّر قيمة المحفظة خلال 24 ساعة بالدولار من تغيّر سعر كل عملة تملكها
  function portfolioChange() {
    if (NETWORK !== 'mainnet' || !state.prices) return null;
    var now = 0, prev = 0;
    COINS.forEach(function (c) {
      var t = coinTotal(c), p = priceOf(c); if (!t || !p || p.usd == null) return;
      var v = t * p.usd, ch = Number(p.chg) || 0; now += v; prev += v / (1 + ch / 100);
    });
    if (!(prev > 0)) return null;
    return { usd: now - prev, pct: (now - prev) / prev * 100 };
  }
  function setHidden(v, quiet) {
    state.hidden = v;
    document.body.classList.toggle('privacy', v);
    var bu0 = $('bal-usdt'); bu0.classList.remove('flip'); void bu0.offsetWidth; bu0.classList.add('flip'); // حركة انتقال ناعمة
    try { if (P.Haptics) P.Haptics.impact({ style: 'LIGHT' }); } catch (e) {}
    if (!quiet && v && localStorage.getItem('sarra.hideTip') !== '1') { try { localStorage.setItem('sarra.hideTip', '1'); } catch (e) {} toast('أُخفيت الأرصدة في كل الشاشات. اضغط الرصيد أو العين لإظهارها'); }
    var tb = $('toggle-bal'); tb.classList.toggle('off', v); tb.setAttribute('aria-pressed', v ? 'true' : 'false'); tb.setAttribute('aria-label', v ? 'إظهار الرصيد' : 'إخفاء الرصيد');
    renderBalances();
    // الشاشة المفتوحة تُعاد رسمها فوراً بالوضع الجديد (التداول، الزوج، السجل)، لا عند التحديث التالي
    try { var cur = state.stack[state.stack.length - 1]; if (cur === 'trade') renderTrade(); else if (cur === 'pair') trRenderPos(); else if (cur === 'history') applyFilter(); else if (cur === 'p2p-admin') renderGw(state.admGw); else if (cur === 'merchant' && MC.data && MC.data.merchant) mcRender(); } catch (e) {}
  }
  $('toggle-bal').onclick = function () { setHidden(!state.hidden); };
  // «عند كل فتح»: يشمل العودة للتطبيق من الخلفية بعد 30 ثانية أو أكثر، لا التشغيل من الصفر فقط
  var bgAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { bgAt = Date.now(); return; }
    if (state.hideOnOpen && !state.hidden && bgAt && Date.now() - bgAt >= 30000) setHidden(true, true);
  });
  // الضغط على الرقم نفسه يخفي/يُظهر (كما في Binance)، والعين تبقى للوضوح
  $('bal-usdt').onclick = function () { setHidden(!state.hidden); };
  $('bal-usdt').setAttribute('role', 'button'); $('bal-usdt').setAttribute('tabindex', '0');
  $('bal-usdt').onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHidden(!state.hidden); } };
  $('priv-chip').onclick = function () { setHidden(false); };
  function syncHeroSid() {
    var sid = state.p2p && state.p2p.me && state.p2p.me.profile && state.p2p.me.profile.sarra_id, hb = $('hero-sid');
    if (!sid) { hb.hidden = true; return; }
    hb.hidden = false; hb.textContent = ''; hb.appendChild(el('small', null, 'معرّفي')); hb.appendChild(el('b', null, fmtSid(sid)));
    hb.onclick = function () { copyText(String(sid)); toast('نُسخ معرّف صُرّة'); };
  }
  if (state.hidden) { $('toggle-bal').classList.add('off'); $('toggle-bal').setAttribute('aria-pressed', 'true'); document.body.classList.add('privacy'); }
  $('refresh').onclick = function () { state.fetchedAt.history = 0; loadHome(true); };


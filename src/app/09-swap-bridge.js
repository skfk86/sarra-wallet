  // ===== التبديل =====
  var SWAP_SLIPPAGE_BPS = 50; // 0.5%: نفس القيمة المستخدمة في التنفيذ
  state.swapDir = 'TRX_USDT';
  var swapTimer = null, swapSeq = 0;
  function swapSyms() { return state.swapDir === 'TRX_USDT' ? ['TRX', 'USDT'] : ['USDT', 'TRX']; }
  // ===== التبديل على BNB Chain وPolygon وEthereum (LI.FI داخل نفس الشبكة) =====
  var ES = { net: null, from: 'USDT', to: null, q: null };
  function esReset() { ES.q = null; $('es-quote').hidden = true; $('es-go').hidden = true; $('es-err').hidden = true; }
  function esErr(m) { $('es-err').textContent = m; $('es-err').hidden = !m; }
  function renderSwapEvm() {
    var n = netOf(ES.net), cs = n.coins;
    if (cs.indexOf(ES.from) < 0) ES.from = cs[0];
    if (!ES.to || ES.to === ES.from || cs.indexOf(ES.to) < 0) ES.to = ES.from === n.native ? 'USDT' : n.native;
    [['es-from', 'from'], ['es-to', 'to']].forEach(function (x) {
      var seg = $(x[0]); seg.textContent = ''; seg.style.gridTemplateColumns = 'repeat(' + cs.length + ',minmax(0,1fr))'; seg.classList.toggle('scroll', cs.length > 4);
      cs.forEach(function (c) {
        var b = document.createElement('button'); b.type = 'button'; b.dataset.coin = c; var im = document.createElement('img'); im.alt = c; im.src = symLogo(c); b.appendChild(im); b.appendChild(document.createTextNode(c));
        var on = ES[x[1]] === c, dis = x[1] === 'to' && c === ES.from; b.className = on ? 'on' : ''; b.disabled = dis; b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.onclick = function () { ES[x[1]] = c; if (x[1] === 'from' && ES.to === c) ES.to = null; esReset(); renderSwapEvm(); };
        seg.appendChild(b);
      });
    });
    var bal = balOn(ES.from, ES.net); $('es-bal').textContent = bal == null ? '—' : (Math.floor(bal * 1e6) / 1e6) + ' ' + ES.from;
    $('es-note').firstChild.textContent = '⛽ تحتاج قليلاً من ' + n.native + ' لرسوم الشبكة.';
  }
  $('es-amt').addEventListener('input', function () { esReset(); usdEq($('es-usd'), $('es-amt').value, ES.from); });
  $('es-flip').onclick = function () { var f = ES.from; ES.from = ES.to; ES.to = f; $('es-amt').value = ''; usdEq($('es-usd'), '', ES.from); esReset(); renderSwapEvm(); };
  $('es-requote').onclick = function () { $('es-quote-btn').click(); };
  document.querySelectorAll('#es-pct [data-pct]').forEach(function (b) {
    b.onclick = function () {
      var n = netOf(ES.net), bal = balOn(ES.from, ES.net); if (bal == null) return;
      var v = bal * Number(b.dataset.pct) / 100;
      if (ES.from === n.native && b.dataset.pct === '100') v = Math.max(0, v - 0.001); // نترك وقوداً للرسوم
      $('es-amt').value = String(Math.floor(v * 1e6) / 1e6); esReset(); usdEq($('es-usd'), $('es-amt').value, ES.from);
    };
  });
  $('es-max').onclick = function () {
    var n = netOf(ES.net), b = balOn(ES.from, ES.net); if (b == null) return;
    if (ES.from === n.native) b = Math.max(0, b - 0.001); // نترك وقوداً للرسوم
    $('es-amt').value = String(Math.floor(b * 1e6) / 1e6); esReset();
  };
  $('es-quote-btn').onclick = async function () {
    esReset();
    var n = netOf(ES.net), amt = $('es-amt').value.trim().replace(',', '.');
    if (!(Number(amt) > 0)) return esErr('أدخل المبلغ');
    var bal = balOn(ES.from, ES.net); if (bal != null && Number(amt) > bal) return esErr('الرصيد غير كافٍ');
    var nat = evmUnits(ES.net, n.native); if (nat != null && nat === 0n) { esErr('تحتاج ' + n.native + ' لدفع رسوم الشبكة'); return openGasHelp(ES.net); }
    var btn = this; btn.disabled = true; btn.textContent = 'جارٍ جلب السعر…';
    try {
      var q = await core.bridgeQuote(ES.net, ES.net, ES.from, amt, ES.to); q.at = Date.now(); ES.q = q;
      var f = function (v) { return niceNum(v, 6); };
      $('es-out').textContent = f(q.toAmount) + ' ' + ES.to; $('es-min').textContent = f(q.toAmountMin) + ' ' + ES.to;
      $('es-rate').textContent = Number(q.amount) > 0 ? '1 ' + ES.from + ' ≈ ' + niceNum(Number(q.toAmount) / Number(q.amount), 6) + ' ' + ES.to : '—';
      var usd2 = function (v) { return v < 0.01 ? 'أقل من $0.01' : '≈ $' + v.toFixed(2); };
      $('es-pay').textContent = f(q.amount) + ' ' + ES.from;
      $('es-app').textContent = q.appFee ? f(Number(q.amount) * q.appFee) + ' ' + ES.from + ' (' + (q.appFee * 100).toFixed(1).replace(/\.0$/, '') + '%)' : 'مجاناً';
      $('es-plat').textContent = q.feesUsd ? usd2(q.feesUsd) : 'مضمّنة في السعر';
      $('es-gas-c').textContent = n.native;
      $('es-fee').textContent = (Number(q.gasNative) ? f(q.gasNative) + ' ' + n.native + ' · ' : '') + usd2(q.gasUsd);
      $('es-tool').textContent = q.tool || 'LI.FI';
      $('es-quote').hidden = false; $('es-go').hidden = false;
    } catch (e) { esErr(WalletCore.errorText(e)); }
    finally { btn.disabled = false; btn.textContent = 'عرض السعر'; }
  };
  $('es-go').onclick = function () {
    if (!ES.q || state.txBusy) return;
    if (Date.now() - (ES.q.at || 0) > 60000) { $('es-quote-btn').click(); esErr('انتهت صلاحية السعر، جُلب سعر جديد. راجعه ثم أكّد.'); return; } // الأسعار تتغير: لا ننفّذ سعراً قديماً
    var q = ES.q, run = async function () {
      if (q.used || state.txBusy) return; q.used = true;
      state.txBusy = true; state.stack = ['home', 'swap']; show('swap', false);
      $('es-go').hidden = true; esErr(''); toast('جارٍ التبديل…');
      try {
        var r = await core.bridgeExecute(q); rxExpect(q); /* بعد النجاح فقط: الفحص الدوري متوقف أثناء العملية */ ES.q = null; state.balances = null; state.evmBal = null; state.historyCache = null;
        var rec = { kind: 'swap', net: q.fromNet, coin: q.toSym || q.sym, amount: String(q.toAmount), paidAmount: q.amount, paidCoin: q.sym, via: netOf(q.fromNet).name + ' · LI.FI', txid: r.txid, url: core.evmTxUrl ? core.evmTxUrl(q.fromNet, r.txid) : '', status: 'PENDING' };
        lhAdd(rec); // يظهر في السجل فوراً "قيد التنفيذ" ثم يُحدَّث، فلا تضيع العملية إن أُغلق التطبيق
        state.txBusy = false; // أُرسلت المعاملة: لا نوقف بقية التطبيق (والإشعارات) أثناء المتابعة
        for (var i = 0; i < 45; i++) {
          var st = await core.bridgeStatus(r.txid, q.fromNet, q.toNet).catch(function () { return {}; });
          if (st.status === 'DONE') { toast('تم التبديل ✓'); rec.amount = stAmount(st, q); rec.url = st.link || rec.url; rec.status = 'SUCCESS'; lhAdd(rec); break; }
          if (st.status === 'FAILED' || st.status === 'REFUNDED') { rxUnexpect(q); rec.status = 'FAILED'; lhAdd(rec); esErr('لم يكتمل التبديل وبقي المبلغ في محفظتك'); break; }
          await new Promise(function (res) { setTimeout(res, i < 15 ? 4000 : 10000); });
        }
        $('es-quote').hidden = true; $('es-amt').value = '';
        core.evmBalances().then(function (eb) { if (eb) { state.evmBal = eb; renderSwapEvm(); } }).catch(function () {});
      } catch (e) { esErr(WalletCore.errorText(e)); if (e && e.message === 'LOW_GAS') openGasHelp(q.fromNet); }
      finally { state.txBusy = false; }
    };
    var askPin = function () { openPin('verify', run); };
    if (bioEnabled()) bioVerify('تأكيد التبديل').then(run).catch(askPin); else askPin();
  };
  function swapNets() { return NETS.filter(function (n) { return n.key === 'tron' || (n.evm && core.bridgeEnabled && core.bridgeEnabled()); }); }
  async function prepareSwap() {
    var sn = swapNets();
    if (!ES.net) ES.net = MAIN_NET;
    if (sn.length > 1) {
      renderNetbar($('sw-nets'), ES.net, function (k) { ES.net = k; esReset(); prepareSwap(); }, 'USDT');
    } else ES.net = 'tron';
    var evm = ES.net !== 'tron';
    $('swap-evm').hidden = !evm;
    if (evm) {
      $('swap-off').hidden = true; $('swap-on').style.display = 'none'; renderSwapEvm();
      if (!state.evmBal) core.evmBalances().then(function (eb) { if (eb) { state.evmBal = eb; if (state.stack[state.stack.length - 1] === 'swap') renderSwapEvm(); } }).catch(function () {});
      return;
    }
    $('sw-err').hidden = true;
    var ok = await core.swapSupported();
    $('swap-off').hidden = ok;
    $('swap-on').style.display = ok ? 'flex' : 'none';
    if (!ok) {
      $('swap-off-msg').textContent = NETWORK === 'mainnet'
        ? 'تعذّر التحقق من عقد SunSwap الآن. تحقق من الاتصال وحاول لاحقاً.'
        : 'أنت على شبكة الاختبار (Nile). التبديل يعمل على شبكة TRON الرئيسية فقط.';
      return;
    }
    renderSwapSide();
    if (!state.balances) { try { state.balances = await core.getBalances(); renderSwapSide(); } catch (e) {} }
  }
  function renderSwapSide() {
    var s = swapSyms(), b = state.balances;
    coinPill($('sw-sym-in'), s[0]); coinPill($('sw-sym-out'), s[1]);
    $('sw-bal-in').textContent = b ? (s[0] === 'TRX' ? b.trx : b.usdt) : '—';
    $('sw-bal-out').textContent = b ? (s[1] === 'TRX' ? b.trx : b.usdt) : '—';
    $('sw-approve-note').hidden = state.swapDir !== 'USDT_TRX';
    requestQuote();
  }
  $('sw-flip').onclick = function () {
    state.swapDir = state.swapDir === 'TRX_USDT' ? 'USDT_TRX' : 'TRX_USDT';
    $('sw-in').value = '';
    renderSwapSide();
  };
  $('sw-in').oninput = function () { usdEq($('sw-usd-in'), $('sw-in').value, swapSyms()[0]); clearTimeout(swapTimer); swapTimer = setTimeout(requestQuote, 450); };
  $('sw-requote').onclick = function () { requestQuote(); };
  document.querySelectorAll('#sw-pct [data-pct]').forEach(function (b) {
    b.onclick = function () {
      var sym = swapSyms()[0], bl = state.balances; if (!bl) return;
      var v = Number(sym === 'TRX' ? bl.trx : bl.usdt) * Number(b.dataset.pct) / 100;
      if (sym === 'TRX' && b.dataset.pct === '100') v = Math.max(0, v - 15); // نترك TRX لرسوم الشبكة
      $('sw-in').value = String(Math.floor(v * 1e6) / 1e6); $('sw-in').oninput();
    };
  });
  async function requestQuote() {
    var v = $('sw-in').value, seq = ++swapSeq;
    $('sw-err').hidden = true; $('sw-go').disabled = true; state.swapQuote = null;
    var valid = false;
    try { valid = !!v && WalletCore.toUnitsFloor(v, 6) > 0n; } catch (e) {}
    if (!valid) { $('sw-out').textContent = '0'; $('sw-min').textContent = '—'; flushSwapErr(); return; }
    $('sw-out').textContent = '…';
    try {
      var q = await core.quoteSwap(state.swapDir, v);
      if (seq !== swapSeq) return;
      var min = q.outUnits * BigInt(10000 - SWAP_SLIPPAGE_BPS) / 10000n;
      $('sw-out').textContent = niceNum(q.out, 4); usdEq($('sw-usd-out'), q.out, swapSyms()[1]);
      $('sw-min').textContent = niceNum(WalletCore.fromUnits(min, 6), 4) + ' ' + swapSyms()[1];
      var fee = core.swapFeeUnits(state.swapDir, q.inUnits, min);
      $('sw-fee-row').hidden = !core.feeEnabled();
      $('sw-fee').textContent = fee > 0n ? core.feeRateText() + ' (' + WalletCore.fromUnits(fee, 6) + ' TRX)' : 'لا عمولة على هذا المبلغ';
      var sy = swapSyms(), inN = Number(WalletCore.fromUnits(q.inUnits, 6)), outN = Number(q.out);
      $('sw-rate').textContent = inN > 0 ? '1 ' + sy[0] + ' ≈ ' + niceNum(outN / inN, 6) + ' ' + sy[1] : '—';
      $('sw-route').textContent = sy[0] + ' → ' + sy[1] + ' · عبر SunSwap';
      $('sw-slip').textContent = (SWAP_SLIPPAGE_BPS / 100) + '%';
      state.swapQuote = { dir: state.swapDir, amt: v, out: q.out, min: Number(WalletCore.fromUnits(min, 6)), rate: $('sw-rate').textContent };
      $('sw-go').disabled = false;
    } catch (e) {
      if (seq !== swapSeq) return;
      $('sw-out').textContent = '0'; $('sw-min').textContent = '—';
      $('sw-err').textContent = WalletCore.errorText(e); $('sw-err').hidden = false;
    }
    flushSwapErr();
  }
  // خطأ من محاولة تبديل سابقة يُعرض بعد انتهاء إعادة التسعير، حتى لا يمسحه
  function flushSwapErr() {
    if (!state.swapErrMsg) return;
    $('sw-err').textContent = state.swapErrMsg; $('sw-err').hidden = false;
    state.swapErrMsg = null;
  }
  $('sw-go').onclick = function () {
    var q = state.swapQuote; if (!q) return;
    var s = swapSyms();
    $('swc-in').textContent = q.amt + ' ' + s[0];
    $('swc-out').textContent = niceNum(q.out, 4) + ' ' + s[1];
    $('swc-min').textContent = niceNum(q.min, 4) + ' ' + s[1];
    $('swc-rate').textContent = q.rate || '—';
    $('sw-sheet').classList.add('show');
  };
  $('swc-cancel').onclick = function () { $('sw-sheet').classList.remove('show'); };
  $('sw-sheet').onclick = function (e) { if (e.target === this) this.classList.remove('show'); };
  $('swc-ok').onclick = function () {
    var q = state.swapQuote; $('sw-sheet').classList.remove('show'); if (!q) return;
    var s = swapSyms();
    var run = function () { doSwap(q, s); };
    var askPin = function () { openPin('verify', run); };
    if (bioEnabled()) bioVerify('تأكيد التبديل').then(run).catch(askPin);
    else askPin();
  };
  async function doSwap(q, s) {
    if (state.txBusy) return;
    state.txBusy = true;
    $('pin-sub').textContent = 'جارٍ التبديل…';
    toast('جارٍ التبديل… قد يستغرق دقيقة');
    try {
      var r = await core.swap(q.dir, q.amt, SWAP_SLIPPAGE_BPS, q.out);
      state.historyCache = null; state.balances = null;
      showSuccess({ kind: 'swap', status: r.status, amt: String(r.out), coin: s[1], paid: q.amt + ' ' + s[0], net: 'tron', route: 'TRON (TRC20) · SunSwap', txid: r.txid, url: r.url });
      $('sw-in').value = '';
      state.stack = ['home'];
      show('success');
    } catch (e) {
      state.stack = ['home'];
      state.swapErrMsg = WalletCore.errorText(e);
      show('swap');
    } finally { state.txBusy = false; }
  }


  // ===== نقل بين الشبكات (LI.FI) =====
  var BR = { from: 'tron', to: 'bsc', coin: 'USDT', q: null };
  if (core.bridgeEnabled && core.bridgeEnabled() && NETS.length > 1) { $('act-bridge').hidden = false; document.querySelector('.actions').style.setProperty('--acols', '4'); }
  function brCoins() {
    var a = netOf(BR.from).coins, b = netOf(BR.to).coins;
    return a.filter(function (c) { return b.indexOf(c) >= 0; });
  }
  function brReset() { BR.q = null; $('br-quote').hidden = true; $('br-go').hidden = true; $('br-err').hidden = true; }
  function prepareBridge() {
    if (BR.from === BR.to) BR.to = NETS.filter(function (n) { return n.key !== BR.from; })[0].key;
    renderNetbar($('br-from'), BR.from, function (k) { BR.from = k; if (BR.to === k) BR.to = NETS.filter(function (n) { return n.key !== k; })[0].key; brReset(); prepareBridge(); });
    renderNetbar($('br-to'), BR.to, function (k) { if (k === BR.from) return; BR.to = k; brReset(); prepareBridge(); });
    var cs = brCoins(); if (cs.indexOf(BR.coin) < 0) BR.coin = cs[0] || 'USDT';
    var seg = $('br-coin'); seg.textContent = ''; seg.style.gridTemplateColumns = 'repeat(' + Math.max(cs.length, 1) + ',minmax(0,1fr))'; seg.classList.toggle('scroll', cs.length > 4);
    cs.forEach(function (c) { var b = document.createElement('button'); b.type = 'button'; b.textContent = c; b.dataset.brcoin = c; b.className = c === BR.coin ? 'on' : ''; b.setAttribute('aria-checked', c === BR.coin);
      b.onclick = function () { BR.coin = c; brReset(); prepareBridge(); }; seg.appendChild(b); });
    var bal = balOn(BR.coin, BR.from);
    $('br-bal').textContent = bal == null ? '—' : (Math.floor(bal * 1e6) / 1e6) + ' ' + BR.coin;
    if (!state.balances) core.getBalances().then(function (b) { state.balances = b; if (state.stack[state.stack.length - 1] === 'bridge') prepareBridge(); }).catch(function () {});
    if (Object.keys(EVM).length && !state.evmBal) core.evmBalances().then(function (eb) { if (eb) { state.evmBal = eb; if (state.stack[state.stack.length - 1] === 'bridge') prepareBridge(); } }).catch(function () {});
  }
  $('br-flip').onclick = function () { var t = BR.from; BR.from = BR.to; BR.to = t; $('br-amt').value = ''; brReset(); prepareBridge(); };
  function brErr(m) { var e = $('br-err'); e.textContent = m; e.hidden = !m; }
  $('br-amt').addEventListener('input', brReset);
  $('br-max').onclick = function () { var b = balOn(BR.coin, BR.from); if (b != null) { $('br-amt').value = String(Math.floor(b * 1e6) / 1e6); brReset(); } };
  $('br-quote-btn').onclick = async function () {
    brReset();
    var amt = $('br-amt').value.trim().replace(',', '.');
    if (!(Number(amt) > 0)) return brErr('أدخل المبلغ');
    var bal = balOn(BR.coin, BR.from); if (bal != null && Number(amt) > bal) return brErr('الرصيد غير كافٍ على هذه الشبكة');
    var btn = this; btn.disabled = true; btn.textContent = 'جارٍ جلب السعر…';
    try {
      var q = await core.bridgeQuote(BR.from, BR.to, BR.coin, amt); q.at = Date.now(); BR.q = q;
      var fmt = function (v) { return niceNum(v, 6); };
      $('br-out').textContent = fmt(q.toAmount) + ' ' + BR.coin + ' · ' + netOf(BR.to).name;
      $('br-min').textContent = fmt(q.toAmountMin) + ' ' + BR.coin;
      var usd2b = function (v) { return v < 0.01 ? 'أقل من $0.01' : '≈ $' + v.toFixed(2); }, fn = netOf(BR.from), gc = fn.evm ? fn.native : 'TRX';
      $('br-plat').textContent = q.feesUsd ? usd2b(q.feesUsd) : 'مضمّنة في السعر';
      $('br-gas-c').textContent = gc;
      $('br-fee').textContent = (fn.evm && Number(q.gasNative) ? fmt(q.gasNative) + ' ' + gc + ' · ' : '') + usd2b(q.gasUsd);
      $('br-time').textContent = q.seconds ? (q.seconds < 90 ? 'أقل من دقيقتين' : 'حوالي ' + Math.ceil(q.seconds / 60) + ' دقيقة') : '—';
      $('br-tool').textContent = q.tool || 'LI.FI';
      $('br-app').textContent = q.appFee ? fmt(Number(q.amount) * q.appFee) + ' ' + BR.coin + ' (' + (q.appFee * 100).toFixed(1).replace(/\.0$/, '') + '%)' : 'مجاناً';
      $('br-quote').hidden = false; $('br-go').hidden = false;
    } catch (e) { brErr(WalletCore.errorText(e)); }
    finally { btn.disabled = false; btn.textContent = 'عرض السعر'; }
  };
  $('br-go').onclick = function () {
    if (!BR.q || state.txBusy) return;
    var q = BR.q;
    $('brc-amt').textContent = q.amount + ' ' + q.sym;
    $('brc-nets').textContent = netOf(q.fromNet).name + ' ← ' + netOf(q.toNet).name;
    ['out', 'min', 'plat', 'fee', 'time', 'tool'].forEach(function (k) { $('brc-' + k).textContent = $('br-' + k).textContent; });
    $('br-sheet').classList.add('show');
  };
  $('brc-cancel').onclick = function () { $('br-sheet').classList.remove('show'); };
  $('br-sheet').onclick = function (e) { if (e.target === this) this.classList.remove('show'); };
  $('brc-ok').onclick = function () {
    $('br-sheet').classList.remove('show');
    if (!BR.q || state.txBusy) return;
    if (Date.now() - (BR.q.at || 0) > 60000) { $('br-quote-btn').click(); brErr('انتهت صلاحية السعر، جُلب سعر جديد. راجعه ثم أكّد.'); return; }
    var q = BR.q, run = function () { doBridge(q); };
    var askPin = function () { openPin('verify', run); };
    if (bioEnabled()) bioVerify('تأكيد النقل').then(run).catch(askPin); else askPin();
  };
  async function doBridge(q) {
    if (!q || q.used || state.txBusy) return; q.used = true;
    state.txBusy = true; state.stack = ['home', 'bridge']; show('bridge', false);
    $('br-go').hidden = true; brErr(''); var tr = $('br-track'); tr.hidden = false;
    $('br-track-t').textContent = 'جارٍ إرسال المعاملة…'; $('br-track-s').textContent = q.amount + ' ' + q.sym + ' من ' + netOf(q.fromNet).name + ' إلى ' + netOf(q.toNet).name; $('br-track-l').hidden = true;
    try {
      var r = await core.bridgeExecute(q); rxExpect(q); /* بعد النجاح فقط: الفحص الدوري متوقف أثناء العملية */ BR.q = null; state.balances = null; state.evmBal = null; state.historyCache = null;
      var rec = { kind: 'bridge', net: q.fromNet, toNet: q.toNet, coin: q.toSym || q.sym, amount: String(q.toAmount), paidAmount: q.amount, paidCoin: q.sym, via: 'LI.FI', txid: r.txid, url: '', status: 'PENDING' };
      lhAdd(rec); // في السجل فوراً "قيد التنفيذ"
      state.txBusy = false; // أُرسلت: المتابعة قد تطول، فلا نوقف الإرسال والإشعارات خلالها
      $('br-track-t').textContent = 'أُرسلت ✓ — بانتظار الوصول على ' + netOf(q.toNet).name + '…';
      for (var i = 0; i < 120; i++) {
        var st = await core.bridgeStatus(r.txid, q.fromNet, q.toNet).catch(function () { return {}; });
        if (st.link) { $('br-track-l').href = st.link; $('br-track-l').hidden = false; if (!rec.url) { rec.url = st.link; lhAdd(rec); } }
        if (st.status === 'DONE') { rec.amount = stAmount(st, q); rec.url = st.link || rec.url; rec.status = 'SUCCESS'; lhAdd(rec); $('br-track-t').textContent = 'تم النقل بنجاح ✓'; $('br-quote').hidden = true; toast('وصلت عملتك إلى ' + netOf(q.toNet).name); break; }
        if (st.status === 'REFUNDED') { rxUnexpect(q); rec.status = 'FAILED'; lhAdd(rec); $('br-track-t').textContent = 'تعذّر النقل وأُعيد المبلغ لمحفظتك'; break; }
        if (st.status === 'FAILED') { rxUnexpect(q); rec.status = 'FAILED'; lhAdd(rec); $('br-track-t').textContent = 'فشل النقل — تابع الرابط أو تواصل مع الدعم'; break; }
        await new Promise(function (res) { setTimeout(res, i < 10 ? 6000 : 15000); });
        if (i === 119) $('br-track-t').textContent = 'ما زال النقل قيد التنفيذ — بعض الجسور تتأخر. تابع رابط التتبّع، والمبلغ يصل أو يُعاد تلقائياً';
      }
    } catch (e) { tr.hidden = true; brErr(WalletCore.errorText(e)); }
    finally { state.txBusy = false; }
  }



  // ===== إشعار استلام تحويلة =====
  // مصدر حقيقي فقط: TRON من سجل الشبكة (معاملة واردة جديدة)، وشبكات EVM من زيادة فعلية في الرصيد.
  // لا تُعرض معاملاتك أنت (RX.own) ولا الغبار (أقل من 0.01)، ولا يتكرر إشعار العملية نفسها (معرّفات محفوظة).
  var RX = { own: {}, evmBase: null, busy: false, q: [], cur: null, tick: 0, expect: (rxGet('sarra.rxe') || []).filter(function (e) { return e && e.until > Date.now(); }) };
  // وارد متوقع من عملياتك أنت (تبديل أو نقل بين الشبكات): لا يُعرض كـ"استلام تحويلة" عند وصوله
  // تُطابق بالشبكة والعملة والمبلغ معاً (بين "أقل مبلغ مضمون" و"المتوقع" بهامش)، فلا يبتلع وارداً حقيقياً من شخص آخر
  function rxExpect(q) {
    var lo = Number(q.toAmountMin || 0) * 0.97, hi = Number(q.toAmount || q.toAmountMin || 0) * 1.05;
    if (q.toNet === q.fromNet) lo = lo * 0.5; // تبديل داخل الشبكة: رسوم الغاز تُخصم من نفس الرصيد فيظهر الصافي أقل
    RX.expect.push({ net: q.toNet, coin: q.toSym || q.sym, lo: lo, hi: hi > 0 ? hi : 1e30, until: Date.now() + 3 * 3600000 });
    rxPut('sarra.rxe', RX.expect); // يبقى بعد إغلاق التطبيق: وصول النقل لاحقاً لا يظهر كتحويلة من شخص آخر
  }
  // المبلغ المستلم فعلاً من حالة LI.FI (بالوحدات الخام) وإلا التقدير
  function stAmount(st, q) { try { if (st && st.received && q && q.toTok) return WalletCore.fromUnits(BigInt(st.received), q.toTok.dec); } catch (e) {} return String(q.toAmount); }
  function rxUnexpect(q) { // عملية فشلت: لا ننتظر وارداً منها حتى لا نبتلع تحويلة حقيقية بنفس المبلغ
    for (var i = RX.expect.length - 1; i >= 0; i--) { var e = RX.expect[i]; if (e.net === q.toNet && e.coin === (q.toSym || q.sym)) { RX.expect.splice(i, 1); break; } }
    rxPut('sarra.rxe', RX.expect);
  }
  function rxConsume(net, coin, amount) {
    var now = Date.now(), a = Number(amount); RX.expect = RX.expect.filter(function (e) { return e.until > now; });
    for (var i = 0; i < RX.expect.length; i++) { var e = RX.expect[i]; if (e.net === net && e.coin === coin && a >= e.lo && a <= e.hi) { RX.expect.splice(i, 1); rxPut('sarra.rxe', RX.expect); return true; } }
    return false;
  }
  // أي عملية صادرة من هذا الجهاز: نعلّمها "منك" حتى لا يظهر نقص رصيدها كخصم غريب
  ['sendTRX', 'sendUSDT', 'swap', 'evmSend', 'bridgeExecute'].forEach(function (m) {
    var f = core[m]; if (typeof f !== 'function') return;
    var evm = m === 'evmSend' || m === 'bridgeExecute';
    core[m] = async function () {
      RX.ownUntil = Date.now() + 5 * 60000; RX.gen = (RX.gen || 0) + 1; // يُبطل أي فحص بدأ قبل العملية
      if (evm) RX.rebasing = (RX.rebasing || 0) + 1; // لا نقارن أرصدة EVM أثناء عمليتك
      var ok = false;
      try {
        var r = await f.apply(core, arguments); ok = true;
        [r && r.txid, r && r.hash, r && r.txHash, r && r.feeTxid].forEach(function (id) { if (id) RX.own[id] = 1; }); // يشمل معاملة عمولة التبديل
        return r;
      }
      finally { RX.ownUntil = Date.now() + 5 * 60000; if (evm) rxRebase(ok); }
    };
  });
  // بعد عملية EVM من جهازك: ننتظر حتى يظهر أثرها في الرصيد ثم نعتمده أساساً جديداً للمقارنة.
  // هكذا لا يُلغي الإرسال (مثلاً إلى Binance) أي استلام لاحق (من Binance) عند المقارنة.
  async function rxRebase(ok) {
    try {
      var ea = await core.evmAddress(), key = 'sarra.rxb.' + ea, pre = RX.evmBase || rxGet(key), snap = function (bal) {
        var n = {}; Object.keys(bal).forEach(function (k) { if (bal[k]) { n[k] = {}; Object.keys(bal[k]).forEach(function (x) { if (bal[k][x] != null) n[k][x] = bal[k][x].toString(); }); if (pre && pre[k]) Object.keys(pre[k]).forEach(function (x) { if (n[k][x] == null) n[k][x] = pre[k][x]; }); } }); return n;
      };
      for (var i = 0; i < (ok ? 20 : 1); i++) { // حتى ~80 ثانية
        if (i) await new Promise(function (r) { setTimeout(r, 4000); });
        var bal = await core.evmBalances().catch(function () { return null; }); if (!bal) continue;
        var n = snap(bal);
        Object.keys(pre || {}).forEach(function (k) { if (!n[k] && pre[k]) n[k] = pre[k]; }); // شبكة تعذّرت قراءتها
        if (!ok || !pre || JSON.stringify(n) !== JSON.stringify(pre) || i === 19) { RX.evmBase = n; rxPut(key, n); break; }
      }
    } catch (e) {} finally { RX.rebasing = Math.max(0, (RX.rebasing || 1) - 1); }
  }
  function rxGet(k) { return lsJson(k, null); }
  function rxPut(k, v) { lsPut(k, v); }
  // ===== إشعارات النظام (أندرويد): استلام وخصم. تعمل والتطبيق مفتوح أو في الخلفية ما دام النظام لم يوقفه =====
  var LN = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.LocalNotifications, lnOk = null, lnId = Math.floor(Date.now() / 1000) % 1000000000; // معرّف فريد لا يتكرر بعد إعادة الفتح
  async function lnReady() {
    if (!LN) return false; if (lnOk !== null) return lnOk;
    try {
      var p = await LN.checkPermissions();
      if (p.display !== 'granted') p = await LN.requestPermissions();
      lnOk = p.display === 'granted';
      // أندرويد 12+: بعض الهواتف لا تعرض الإشعار حتى يُسمح "بالمنبّهات والتذكيرات". نطلبه مرة واحدة مع شرح
      if (lnOk && LN.checkExactNotificationSetting) {
        var ex = await LN.checkExactNotificationSetting().catch(function () { return null; });
        if (ex && ex.exact_alarm && ex.exact_alarm !== 'granted' && localStorage.getItem('sarra.exactAsked') !== '1') {
          try { localStorage.setItem('sarra.exactAsked', '1'); } catch (e) {}
          var go = await askConfirm('لتصلك إشعارات الاستلام والخصم فوراً، فعّل "المنبّهات والتذكيرات" لصُرّة في الصفحة التي ستفتح الآن، ثم ارجع للتطبيق.');
          if (go) await LN.changeExactNotificationSetting().catch(function () {});
        }
      }
      if (lnOk && LN.createChannel) await LN.createChannel({ id: 'tx2', name: 'المعاملات', description: 'استلام وخصم', importance: 5, visibility: 1, sound: 'coin.wav', vibration: true, lights: true, lightColor: '#16A37A' }).catch(function () {});
    } catch (e) { lnOk = false; }
    return lnOk;
  }
  async function notifyTx(kind, n) {
    // إشعارات Firebase مفعّلة: الخادم يرسل إشعار USDT/USDC حتى والتطبيق مغلق، فلا نكرره محلياً
    if (state.pushOn && /^(USDT|USDC)$/.test(n.coin)) return;
    if (!(await lnReady())) return;
    var a = state.hidden ? '' : ' ' + fmtExact(n.amount) + ' ' + n.coin;
    try {
      await LN.schedule({ notifications: [{ id: ++lnId, channelId: 'tx2', smallIcon: 'ic_stat_coin', iconColor: '#16A37A', sound: 'coin.wav',
        title: kind === 'recv' ? 'وصلتك تحويلة' : 'تم خصم مبلغ من محفظتك',
        body: (kind === 'recv' ? 'استلمت' + (a ? ' +' + a.trim() : '') : 'خرج' + a) + ' على ' + chainLabel(n.net) + (kind === 'out' ? '. إن لم تكن أنت، احمِ محفظتك فوراً.' : '') }] });
    } catch (e) {}
  }
  function rxOut(n) { // خصم لم يتم من هذا الجهاز (من جهاز آخر بنفس الكلمات مثلاً)
    if (!n.logged) { n.logged = 1; lhAdd({ kind: 'send', net: n.net, coin: n.coin, amount: String(n.amount), to: n.to, txid: n.txid, url: n.url, status: 'SUCCESS', time: n.time }); }
    notifyTx('out', n);
    if (!document.hidden) toast('خرج ' + (state.hidden ? '' : fmtExact(n.amount) + ' ') + n.coin + ' من محفظتك على ' + chainLabel(n.net), true);
    state.balances = null; state.historyCache = null;
  }
  function rxIn(n) { // يُحفظ في السجل فوراً عند الكشف، حتى لو لم تظهر النافذة (التطبيق في الخلفية)
    n.logged = 1; lhAdd({ kind: 'recv', net: n.net, coin: n.coin, amount: String(n.amount), from: n.from, txid: n.txid, url: n.url, status: 'SUCCESS', time: n.time });
    state.balances = null; state.historyCache = null;
    RX.q.push(n); notifyTx('recv', n);
  }
  async function rxPollTron() {
    var addr = await core.getAddress(), key = 'sarra.rx.' + addr;
    if (!state.lhAddr) state.lhAddr = addr; // كي يُحفظ أي وارد في السجل حتى قبل فتح الرئيسية
    var list = await core.getHistory(addr, 15), st = rxGet(key);
    var ids = st && st.ids ? st.ids : [], t0 = st ? st.t : 0, maxT = t0;
    list.forEach(function (t) { if (t.time > maxT) maxT = t.time; });
    if (st) {
      list.filter(function (t) {
        return t.incoming && ids.indexOf(t.txid) < 0 && t.time >= t0 && !RX.own[t.txid] && Number(t.exact) >= 0.01;
      }).reverse().forEach(function (t) {
        if (rxConsume('tron', t.coin, t.exact)) return;
        rxIn({ net: 'tron', coin: t.coin, amount: t.exact, from: t.counterparty, time: t.time, txid: t.txid, url: core.network.explorer + t.txid });
      });
      list.filter(function (t) {
        return !t.incoming && t.ok !== false && ids.indexOf(t.txid) < 0 && t.time >= t0 && !RX.own[t.txid] && Number(t.exact) >= 0.01 && !lhAll().some(function (r) { return r.txid === t.txid; })
          && !(CFG.feeAddress && t.counterparty === CFG.feeAddress && Date.now() - t.time < 30 * 60000); // عمولة تبديل أرسلها هذا الجهاز
      }).forEach(function (t) { rxOut({ net: 'tron', coin: t.coin, amount: t.exact, to: t.counterparty, time: t.time, txid: t.txid, url: core.network.explorer + t.txid }); });
    }
    var all = ids.concat(list.map(function (t) { return t.txid; })).filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(-100);
    rxPut(key, { t: st ? maxT : Math.max(maxT, Date.now()), ids: all });
  }
  // الغبار يُقاس بالدولار لا بعدد الوحدات: 0.001 ETH (~$3) استلام حقيقي، بينما 0.000001 USDT تسميم عناوين.
  // بلا سعر معروف: المستقرة تحت 0.01، والعملة الأصلية تحت 0.00001، وغيرها لا يُعدّ غباراً إلا إن كان أقل من 1e-9
  function rxDust(amount, coin, minUsd) {
    var n = Number(amount), v = usdOf(n, coin), a = REG.asset(coin);
    if (v != null) return v < minUsd;
    if (a && a.stable) return n < minUsd;
    if (NETS.some(function (x) { return x.native === coin; })) return n < 0.00001;
    return n < 1e-9;
  }
  async function rxPollEvm() {
    if (!Object.keys(EVM).length || RX.rebasing) return;
    var gen = RX.gen || 0;
    var ea = await core.evmAddress(); if (!ea) return;
    var bal = await core.evmBalances(); if (!bal) return;
    if (RX.rebasing || (RX.gen || 0) !== gen || state.txBusy) return; // بدأت عملية منك أثناء القراءة: النتيجة قديمة، نتجاهلها
    var key = 'sarra.rxb.' + ea, base = RX.evmBase || rxGet(key), next = {}, skipOut = Date.now() < (RX.ownUntil || 0);
    Object.keys(EVM).forEach(function (k) {
      if (!bal[k]) { next[k] = base && base[k] ? base[k] : null; return; } // شبكة تعذّر قراءتها: نُبقي القديم
      next[k] = {}; Object.keys(bal[k]).forEach(function (sym) { if (bal[k][sym] != null) next[k][sym] = bal[k][sym].toString(); });
      if (base && base[k]) Object.keys(base[k]).forEach(function (sym) { if (next[k][sym] == null) next[k][sym] = base[k][sym]; }); // عملة تعذّرت قراءتها: نُبقي القديم
    });
    if (base) Object.keys(next).forEach(function (k) {
      if (!next[k] || !base[k]) return;
      Object.keys(next[k]).forEach(function (sym) {
        if (base[k][sym] == null) return;
        var diff = BigInt(next[k][sym]) - BigInt(base[k][sym]); if (diff === 0n) return;
        var tk = EVM[k].tokens.filter(function (t) { return t.sym === sym; })[0], dec = sym === 'native' ? 18 : tk ? tk.dec : 18;
        if (diff < 0n) { if (skipOut) return; // نقص: الرسوم والعمليات من هذا الجهاز تُصفّر الأساس قبلها، فالنقص هنا ليس منك
          var out = WalletCore.fromUnits(-diff, dec);
          if (!rxDust(out, sym === 'native' ? EVM[k].native : sym, 0.05)) rxOut({ net: k, coin: sym === 'native' ? EVM[k].native : sym, amount: out, time: Date.now(), txid: null, url: EVM[k].explorer + '/address/' + ea });
          return;
        }
        var amt = WalletCore.fromUnits(diff, dec);
        if (rxDust(amt, sym === 'native' ? EVM[k].native : sym, 0.01)) return;
        if (rxConsume(k, sym === 'native' ? EVM[k].native : sym, amt)) return;
        rxIn({ net: k, coin: sym === 'native' ? EVM[k].native : sym, amount: amt, from: null, time: Date.now(), txid: null, url: EVM[k].explorer + '/address/' + ea });
      });
    });
    RX.evmBase = next; rxPut(key, next);
  }
  function rxShow() {
    if (RX.cur || !RX.q.length || document.hidden || !core.isUnlocked()) return;
    var n = RX.cur = RX.q.shift();
    if (!n.logged) { n.logged = 1; lhAdd({ kind: 'recv', net: n.net, coin: n.coin, amount: String(n.amount), from: n.from, txid: n.txid, url: n.url, status: 'SUCCESS', time: n.time }); }
    var a = fmtExact(n.amount);
    $('rx-amt').textContent = state.hidden ? '••••' : '+' + a; fitAmt($('rx-amt'), state.hidden ? '••••' : '+' + a);
    $('rx-coin').textContent = n.coin + ' · ' + chainLabel(n.net);
    var dl = $('rx-kv'); dl.textContent = '';
    if (n.from) kvRow(dl, 'من', shortAddr(n.from), n.from);
    else kvRow(dl, 'من', el('span', 'color:var(--mu)', 'غير معروف (رُصدت من زيادة الرصيد)'));
    kvRow(dl, 'الوقت', el('span', null, fmtWhen(n.time)));
    if (n.txid) kvRow(dl, 'رقم المعاملة', shortAddr(n.txid), n.txid);
    var more = $('rx-more'); more.hidden = !RX.q.length; more.textContent = RX.q.length ? 'و ' + RX.q.length + ' تحويلات أخرى بعد هذه' : '';
    $('rx-detail').textContent = 'عرض على ' + explorerName(n.url);
    $('rx-sheet').classList.add('show');
    state.balances = null; state.historyCache = null; RX.evmBase = null;
    if (state.stack[state.stack.length - 1] === 'home') loadHome(true);
  }
  function rxClose() { $('rx-sheet').classList.remove('show'); RX.cur = null; setTimeout(rxShow, 350); }
  $('rx-close').onclick = rxClose;
  $('rx-sheet').addEventListener('click', function (e) { if (e.target === $('rx-sheet')) rxClose(); });
  $('rx-detail').onclick = function () { if (RX.cur && RX.cur.url) window.open(RX.cur.url, '_blank'); };
  async function rxTick(force) {
    if (RX.busy || (document.hidden && !LN) || !core.isUnlocked() || state.txBusy) return;
    RX.busy = true;
    try {
      RX.tick++;
      // التطبيق أمامك: TRON كل ~12 ثانية وشبكات EVM كل ~24 ثانية. في الخلفية: أبطأ لتوفير البطارية والطلبات
      var bg = document.hidden;
      if (force === true || RX.tick % (bg ? 4 : 1) === 0) await rxPollTron().catch(function () {});
      if (force === true || RX.tick % (bg ? 6 : 2) === 0) await rxPollEvm().catch(function () {});
    } finally { RX.busy = false; }
    rxShow();
  }
  setInterval(rxTick, 12000);
  setTimeout(rxTick, 4000);
  // وضع الترقّب: فتح شاشة الاستلام أو نسخ/مشاركة العنوان أو المعرّف يعني أن تحويلة قادمة غالباً،
  // فنفحص كل ~5 ثوانٍ (EVM كل ~10) لمدة 15 دقيقة ثم نعود للإيقاع العادي
  var rxWatchT = null, rxWatchN = 0;
  function rxWatch() {
    RX.watchUntil = Date.now() + 15 * 60000;
    if (rxWatchT) return;
    rxWatchT = setInterval(async function () {
      if (Date.now() > RX.watchUntil) { clearInterval(rxWatchT); rxWatchT = null; return; }
      if (RX.busy || !core.isUnlocked() || state.txBusy) return;
      RX.busy = true; rxWatchN++;
      try { await rxPollTron().catch(function () {}); if (rxWatchN % 2 === 0) await rxPollEvm().catch(function () {}); }
      finally { RX.busy = false; }
      rxShow();
    }, 5000);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { if (lnOk === false) lnOk = null; rxTick(true); } }); // العودة للتطبيق: فحص فوري، وإعادة فحص الإذن إن فعّله من الإعدادات
  async function doSend() {
    var p = state.pending;
    if (!p || state.txBusy) return;
    state.txBusy = true;
    $('pin-sub').textContent = 'جارٍ الإرسال…';
    toast('جارٍ الإرسال…');
    try {
      // آخر فحص قبل التوقيع: العملة موجودة على الشبكة والعنوان من نوعها (logic/registry.js)
      var bad = SarraLogic.checkTransfer(REG, p.net || 'tron', p.coin, p.to, { tron: function (a) { return core.isValidAddress(a); }, evm: function (a) { return core.isEvmAddress(a); } });
      if (bad) throw new Error(bad);
      var r = p.net && p.net !== 'tron' ? await core.evmSend(p.net, p.coin, p.to, p.amt)
        : p.coin === 'USDT' ? await core.sendUSDT(p.to, p.amt) : await core.sendTRX(p.to, p.amt);
      if (p.net && p.net !== 'tron') state.evmBal = null;
      state.historyCache = null; state.pending = null; state.balances = null;
      if (p.net && p.net !== 'tron') RX.evmBase = null;
      showSuccess({ kind: 'send', status: r.status, amt: p.amt, coin: p.coin, net: p.net || 'tron', to: shortAddr(p.to), toFull: p.to, txid: r.txid, url: r.url });
      saveRecent(p.net || 'tron', p.phone || p.to);
      $('to').value = ''; $('amt').value = '';
      state.stack = ['home'];
      show('success');
    } catch (e) {
      state.stack = ['home'];
      show('send');
      sendError(WalletCore.errorText(e));
      if (e && (e.message === 'LOW_GAS' || e.message === 'INSUFFICIENT_TRX')) openGasHelp(state.sendNet);
      if (e && e.message === 'LOCKED') { state.resume = ['home', 'send']; openPin('unlock'); }
    } finally { state.txBusy = false; }
  }
  $('explorer').onclick = function () { if (state.lastTx) window.open(state.lastTx.url, '_blank'); };


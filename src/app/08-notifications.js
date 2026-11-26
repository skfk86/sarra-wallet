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
  function stAmount(st, q) { try { if (st && st.received && q && q.toTok) return WalletCore.fromUnits(BigInt(st.received), st.recvDec != null && st.recvAddr && String(st.recvAddr).toLowerCase() !== String(q.toTok.addr).toLowerCase() ? st.recvDec : q.toTok.dec); } catch (e) {} return String(q.toAmount); }
  // وصل بعملة غير المطلوبة؟ نعيد رمزها لنُظهره للمستخدم
  function stOther(st, q) { return st && st.partial && st.recvSym && q && st.recvSym !== (q.toSym || q.sym) ? st.recvSym : ''; }
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
        // نفس صيغة إشعارات الخادم: المبلغ في العنوان (إلا مع إخفاء الأرصدة)
        title: kind === 'recv' ? (a ? 'وصلك' + a : 'وصلتك تحويلة') : 'خرج' + (a ? 'ت' + a : ' مبلغ') + ' من محفظتك',
        body: kind === 'recv' ? 'تحويل على ' + chainLabel(n.net) : 'على ' + chainLabel(n.net) + ' من جهاز آخر أو دون علمك. إن لم تكن أنت، احمِ محفظتك فوراً.' }] });
    } catch (e) {}
  }
  function rxOut(n) { // خصم لم يتم من هذا الجهاز (من جهاز آخر بنفس الكلمات مثلاً)
    if (!n.logged) { n.logged = 1; lhAdd({ kind: 'send', net: n.net, coin: n.coin, amount: String(n.amount), to: n.to, txid: n.txid, url: n.url, status: 'SUCCESS', time: n.time }); }
    notifyTx('out', n);
    if (!document.hidden) toast('خرج ' + (state.hidden ? '' : fmtExact(n.amount) + ' ') + n.coin + ' من محفظتك على ' + chainLabel(n.net), true);
    state.balances = null; state.historyCache = null;
  }
  // تلميح من إشعار push: هل المرسل مستخدم صُرّة؟ (الخادم يعرفه ولا يكشف هويته). يُستعمل لتسمية مصدر التحويل في شاشة الاستلام
  RX.hints = [];
  function rxHint(n) {
    var d = n && (n.data || (n.notification && n.notification.data)) || {};
    if (d.kind !== 'in' || !d.chain) return;
    RX.hints.push({ chain: String(d.chain), sym: String(d.sym || ''), tx: String(d.tx || ''), sarra: d.sarra === '1', at: Date.now() });
    RX.hints = RX.hints.filter(function (h) { return Date.now() - h.at < 15 * 60000; }).slice(-20);
  }
  // مصدر استلام EVM (التطبيق لا يعرف المرسل): نطابق إشعار الخادم برمز معاملته، ونتحقق من إيصالها على الشبكة أن المبلغ
  // نفسه وصل إلى محفظتي من نفس العملة. كل إشعار يُستعمل لاستلام واحد فقط، فلا يُنسب تحويلان متساويان لبعضهما.
  // لا إشعار مطابق = لا نعرف المرسل: نفحص هل هو تحرير/استرداد من ضمان P2P لصفقة لك، وإلا «تحويل وارد» بلا ادعاء.
  // («محفظة خارجية» فقط حين يؤكد الخادم أن المرسل غير مسجّل؛ والخادم يرصد USDT/USDC فقط، فـ BNB مثلاً لا يُؤكَّد أبداً)
  async function rxSrcEvm(n) {
    var a = parseFloat(n.amount), cs = SarraLogic.hintCandidates(RX.hints, n.net, n.coin, Date.now());
    for (var i = 0; i < cs.length; i++) {
      var h = cs[i], got = await core.evmReceivedIn(n.net, h.tx, n.coin);
      if (h.used || got == null || !isFinite(a) || Math.abs(parseFloat(got) - a) > 1e-9 + a * 1e-9) continue;
      h.used = true; n.txid = h.tx; n.url = core.evmTxUrl(n.net, h.tx);
      return h.sarra ? 'sarra' : (await rxP2P(n)) || 'ext';
    }
    return (await rxP2P(n)) || 'in';
  }
  // هل هذا الوارد تحرير صفقة P2P اشتريتها (يستلم المشتري buyer_receives) أو استرداد إيداعك بعد إلغاء (المبلغ − رسوم الشبكة)؟
  // من قائمة طلباتك على الخادم (طلب موقّع)، خلال 6 ساعات من آخر تحديث للطلب. تعذّر القراءة = null
  async function rxP2P(n) {
    if (!P2P_URL || !core.isUnlocked() || n.coin !== 'USDT' || n.net !== 'bsc') return null;
    try {
      var me = await core.getAddress(), a = parseFloat(n.amount), fee = Number(state.p2p && state.p2p.netFeeBep) || 0.3;
      var r = await Promise.race([p2p('orders.mine'), new Promise(function (res, rej) { setTimeout(function () { rej(new Error('TIMEOUT')); }, 8000); })]);
      var near = function (x) { return isFinite(x) && Math.abs(x - a) < 0.000001 + a * 1e-9; };
      var hit = (r && r.orders || []).filter(function (o) { return o.network === 'BEP20' && Date.now() - Date.parse(o.updated_at || o.created_at || 0) < 6 * 3600000; });
      if (hit.some(function (o) { return o.status === 'released' && o.buyer === me && near(Number(o.buyer_receives)); })) return 'p2p';
      if (hit.some(function (o) { return o.status === 'refunded' && o.seller === me && near(Number(o.amount_usdt) - fee); })) return 'p2pr';
    } catch (e) {}
    return null;
  }
  // وصف مصدر الاستلام في الشاشة والسجل (مصدر واحد للنص)
  function srcLabel(src) {
    return src === 'sarra' ? { t: 'من عنوان مسجّل في صُرّة', s: 1 } : src === 'p2p' ? { t: 'تحرير صفقة P2P من الضمان', s: 1 } : src === 'p2pr' ? { t: 'استرداد إيداعك من ضمان P2P', s: 1 }
      : src === 'ext' ? { t: 'تحويل من محفظة خارجية' } : { t: 'تحويل وارد' };
  }
  function srcSpan(src) { var l = srcLabel(src); return el('span', l.s ? null : 'color:var(--mu)', l.t); }
  // هل المرسل (عنوان TRON معروف) مستخدم صُرّة؟ طلب موقّع لخادم P2P يرد بصح/خطأ فقط، ويقبل فقط عنواناً أرسل إليك فعلاً.
  // لا نفتح شاشة الرمز لأجله: إن كانت المحفظة مقفلة أو فشل الطلب = لا نعرف (يبقى العنوان وحده دون تصنيف)
  RX.sarraAddr = {};
  async function isSarraAddr(a) {
    if (!a || !core.isUnlocked() || !CFG.p2pUrl) return null;
    if (RX.sarraAddr[a] != null) return RX.sarraAddr[a];
    try {
      var r = await Promise.race([p2p('addr.sarra', { addr: a }), new Promise(function (res, rej) { setTimeout(function () { rej(new Error('TIMEOUT')); }, 8000); })]);
      return (RX.sarraAddr[a] = r && r.sarra === true);
    } catch (e) { return null; }
  }
  function rxIn(n) { // يُحفظ في السجل فوراً عند الكشف، حتى لو لم تظهر النافذة (التطبيق في الخلفية)
    if (n._sx) { delete n._sx; return isSarraAddr(n.from).then(function (y) { if (y != null) n.src = y ? 'sarra' : 'ext'; rxIn(n); }); }
    if (n._ex) { delete n._ex; return rxSrcEvm(n).then(function (src) { n.src = src; rxIn(n); }, function () { n.src = 'in'; rxIn(n); }); }
    if (!n.from && !n.src) n.src = 'in';
    n.logged = 1; lhAdd({ kind: 'recv', net: n.net, coin: n.coin, amount: String(n.amount), from: n.from, src: n.src, txid: n.txid, url: n.url, status: 'SUCCESS', time: n.time });
    state.balances = null; state.historyCache = null;
    RX.q.push(n); notifyTx('recv', n);
  }
  async function rxPollTron() {
    var addr = await core.getAddress(), key = 'sarra.rx.' + addr;
    if (!state.lhAddr) state.lhAddr = addr; // كي يُحفظ أي وارد في السجل حتى قبل فتح الرئيسية
    var gen = RX.gen || 0, list = await core.getHistory(addr, 15), st = rxGet(key);
    // عملية منك جارية أو بدأت أثناء القراءة (تبديل/شراء TRX: موافقة + معاملة التبديل + العمولة تظهر في السجل قبل أن تُعلَّم "منك"): نؤجل الفحص كله للدورة التالية
    if (state.txBusy || (RX.gen || 0) !== gen) return;
    var skipOut = Date.now() < (RX.ownUntil || 0); // خلال 5 دقائق من عمليتك: لا نعدّ صادراً غريباً (نفس سلوك EVM)
    var ids = st && st.ids ? st.ids : [], t0 = st ? st.t : 0, maxT = t0;
    list.forEach(function (t) { if (t.time > maxT) maxT = t.time; });
    if (st) {
      list.filter(function (t) {
        return t.incoming && ids.indexOf(t.txid) < 0 && t.time >= t0 && !RX.own[t.txid] && Number(t.exact) >= 0.01;
      }).reverse().forEach(function (t) {
        if (rxConsume('tron', t.coin, t.exact)) return;
        rxIn({ net: 'tron', coin: t.coin, amount: t.exact, from: t.counterparty, time: t.time, txid: t.txid, url: core.network.explorer + t.txid, _sx: 1 });
      });
      list.filter(function (t) {
        return !skipOut && !t.incoming && t.ok !== false && ids.indexOf(t.txid) < 0 && t.time >= t0 && !RX.own[t.txid] && Number(t.exact) >= 0.01 && !lhAll().some(function (r) { return r.txid === t.txid; })
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
        rxIn({ net: k, coin: sym === 'native' ? EVM[k].native : sym, amount: amt, from: null, time: Date.now(), txid: null, url: EVM[k].explorer + '/address/' + ea, _ex: 1 });
      });
    });
    RX.evmBase = next; rxPut(key, next);
  }
  function rxShow() {
    if (RX.cur || !RX.q.length || document.hidden || !core.isUnlocked()) return;
    var n = RX.cur = RX.q.shift();
    if (!n.logged) { n.logged = 1; if (!n.from && !n.src) n.src = 'in'; lhAdd({ kind: 'recv', net: n.net, coin: n.coin, amount: String(n.amount), from: n.from, src: n.src, txid: n.txid, url: n.url, status: 'SUCCESS', time: n.time }); }
    var a = fmtExact(n.amount);
    $('rx-amt').textContent = state.hidden ? '••••' : '+' + a; fitAmt($('rx-amt'), state.hidden ? '••••' : '+' + a);
    $('rx-coin').textContent = n.coin + ' · ' + chainLabel(n.net);
    var dl = $('rx-kv'); dl.textContent = '';
    if (n.from) { kvRow(dl, 'من', shortAddr(n.from), n.from); if (n.src) kvRow(dl, 'النوع', srcSpan(n.src)); }
    else kvRow(dl, 'من', srcSpan(n.src));
    kvRow(dl, 'الوقت', el('span', null, fmtWhen(n.time)));
    if (n.txid) kvRow(dl, 'رقم المعاملة', shortAddr(n.txid), n.txid);
    var more = $('rx-more'); more.hidden = !RX.q.length; more.textContent = RX.q.length ? 'و ' + RX.q.length + ' تحويلات أخرى بعد هذه' : '';
    $('rx-detail').textContent = 'عرض على ' + explorerName(n.url);
    var rr = document.querySelector('#rx-sheet .rxring'); if (rr) { rr.classList.add('has-m'); putMascot(rr, 'receive', 112, 'جاتك قروش!'); }
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
      try { localStorage.setItem('sarra.lastsend', JSON.stringify({ to: p.to, amt: p.amt, coin: p.coin, net: p.net || 'tron', t: Date.now() })); } catch (e2) {}
      var r = p.net && p.net !== 'tron' ? await core.evmSend(p.net, p.coin, p.to, p.amt)
        : p.coin === 'USDT' ? await core.sendUSDT(p.to, p.amt) : await core.sendTRX(p.to, p.amt);
      if (p.net && p.net !== 'tron') state.evmBal = null;
      state.historyCache = null; state.pending = null; state.balances = null;
      if (p.net && p.net !== 'tron') RX.evmBase = null;
      showSuccess({ kind: 'send', status: r.status, amt: p.amt, coin: p.coin, net: p.net || 'tron', to: p.via ? recipLabel(p.via) : shortAddr(p.to), toFull: p.to, txid: r.txid, url: r.url });
      saveRecent(p.net || 'tron', p.phone || p.to);
      $('to').value = ''; $('amt').value = '';
      state.stack = ['home'];
      show('success');
    } catch (e) {
      // خطأ قبل البث مؤكد (رصيد، عنوان، قفل…): لم يُرسل شيء، فلا نحذّر من «إرسال مكرر» عند إعادة المحاولة
      if (e && /^(INSUFFICIENT|LOW_|SELF_SEND|INVALID|LOCKED|BAD_)/.test(e.message || '')) { try { localStorage.removeItem('sarra.lastsend'); } catch (e3) {} }
      state.stack = ['home'];
      show('send');
      sendError(WalletCore.errorText(e));
      if (e && (e.message === 'LOW_GAS' || e.message === 'INSUFFICIENT_TRX')) openGasHelp(state.sendNet);
      if (e && e.message === 'LOCKED') { state.resume = ['home', 'send']; openPin('unlock'); }
    } finally { state.txBusy = false; }
  }
  $('explorer').onclick = function () { if (state.lastTx) window.open(state.lastTx.url, '_blank'); };


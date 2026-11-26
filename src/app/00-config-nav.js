  // قراءة مبلغ من خانة إدخال بنفس قواعد الإرسال: «1,5» ملتبسة فتُرفض (لا تصبح 15 ولا 1.5)، و«1,000» = ألف.
  // يعيد النص المطبَّع، أو null مع رسالة الخطأ في err إن كان المبلغ غير صحيح
  function readAmt(id, err) {
    var raw = $(id).value.trim(); if (!raw) return '';
    try { return WalletCore.normAmount(raw); } catch (e) { if (err) err(WalletCore.errorText(e)); return null; }
  }
  // قيمة رقمية للعرض فقط (تفعيل الأزرار، المعادل بالدولار) بنفس قواعد readAmt، فـ«1,000» لا تُعطّل الزر
  function amtNum(id) { var raw = $(id).value.trim(); if (!raw) return 0; try { return Number(WalletCore.normAmount(raw)) || 0; } catch (e) { return 0; } }
  // ===== مهلة افتراضية لكل طلب شبكة (30 ثانية) =====
  // على إنترنت ضعيف قد يعلق الطلب بلا نهاية فيبقى مؤشر التحميل للأبد. الطلبات التي لها مهلتها الخاصة لا تتأثر
  (function () {
    var f0 = window.fetch; if (!f0 || f0.__sarraTimeout || typeof AbortController === 'undefined') return;
    var f = function (input, init) {
      if (init && init.signal) return f0.call(this, input, init);
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 30000);
      var o = Object.assign({}, init || {}, { signal: ctl.signal });
      return f0.call(this, input, o).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
    };
    f.__sarraTimeout = true; window.fetch = f;
  })();

  // ===== الإعدادات =====
  // غيّر إلى 'mainnet' عند الإطلاق فقط، بعد الاختبار الكامل على شبكة nile
  // تُكتب وقت البناء في config.js من GitHub Secrets (انظر scripts/write-config.mjs)
  var CFG = window.SARRA_CONFIG || {};
  var NETWORK = CFG.network === 'mainnet' ? 'mainnet' : 'nile';
  var TRONGRID_API_KEY = CFG.trongridApiKey || '';
  var AUTO_LOCK_MS = 60000;

  // ===== التخزين المحلي (JSON آمن: أي خطأ أو وضع خاص يعيد القيمة الافتراضية بدل أن يكسر الشاشة) =====
  function lsJson(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function lsPut(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  // ذاكرة مؤقتة بمدة صلاحية: تُحفظ { at, <field>: value } (نفس الشكل القديم، فلا تضيع النسخ المحفوظة)
  function cacheGet(k, ttl, field) { var c = lsJson(k, null); return c && Date.now() - c.at < ttl ? c[field] : null; }
  function cachePut(k, field, v) { var o = { at: Date.now() }; o[field] = v; lsPut(k, o); }

  var core = WalletCore.createCore({ deviceKey: (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.DeviceKey) ? function () { return window.Capacitor.Plugins.DeviceKey.get().then(function (r) { return r && r.key; }); } : null, network: NETWORK, apiKey: TRONGRID_API_KEY, feeAddress: CFG.feeAddress, feeBps: CFG.feeBps, evm: CFG.evm === true, lifiFee: CFG.lifiFee, lifiSwapFee: CFG.lifiSwapFee, lifiIntegrator: CFG.lifiIntegrator, bridgeMax: CFG.bridgeMax, lifiTron: CFG.lifiTron || '' });
  // ===== الشبكات =====
  var EVM = core.evmEnabled() ? core.evmChains() : {};
  if (location.protocol === 'file:') window.__core = { st: function () { return state; }, hide: function (v) { setHidden(v, true); }, lock: function () { core.lock(); }, rx: function () { return RX; }, busy: function () { return !!state.txBusy; }, rebase: function (ok) { RX.rebasing = (RX.rebasing || 0) + 1; return rxRebase(ok); } }; // للاختبارات الآلية فقط
  // كل الشبكات والعملات من سجل واحد (logic/registry.js)؛ عقود التوكنات في wallet-core.js
  var REG = SarraLogic.buildRegistry(EVM);
  // حجز رسوم الشبكة عند «الكل» في التبديل والنقل والتداول والإرسال: على شبكات EVM بسعر الغاز الحالي
  // (موافقة + تبديل ≈ 350,000 غاز × السعر × 1.5) بدل حجز ثابت (0.001 BNB ≈ 0.6$ بينما الكلفة الفعلية أقل من سنت).
  // سقفه الحجز الثابت القديم، ويُحدَّث كل 5 دقائق؛ تعذّرت القراءة = الحجز الثابت. TRON لا يتغير (الطاقة تُحرق بـ TRX)
  var GAS_LIVE = {}, gasKeepFixed = REG.gasKeep;
  REG.gasKeep = function (k) { var v = GAS_LIVE[k]; return v != null ? v : gasKeepFixed(k); };
  function refreshGasKeep() {
    Object.keys(EVM).forEach(function (k) {
      if (!core.evmGasCost) return;
      core.evmGasCost(k, 350000).then(function (w) {
        if (w == null || !(w > 0n)) return;
        var v = Number(w) / 1e18, cap = gasKeepFixed(k); GAS_LIVE[k] = Math.min(cap, Math.ceil(v * 1e8) / 1e8);
      }).catch(function () {});
    });
  }
  setTimeout(refreshGasKeep, 3000); setInterval(refreshGasKeep, 5 * 60000);
  var NETS = REG.networks;
  function netOf(k) { return REG.network(k) || NETS[0]; }
  function netLogo(k) { return REG.netLogo(k); }
  var LOCAL_LOGOS = ['usdt', 'usdc', 'trx', 'bnb', 'eth', 'pol'];
  function symLogo(sym) {
    var k = String(sym).toLowerCase(); if (LOCAL_LOGOS.indexOf(k) >= 0) return 'assets/coins/' + k + '.png';
    var c = typeof COINS !== 'undefined' && COINS.filter(function (x) { return x.sym === sym; })[0]; return c && c.url ? c.url : fallbackLogo(sym);
  }
  // sym اختياري: يعرض تحت كل شبكة رصيدك من هذه العملة عليها (إن كان معروفاً)
  function renderNetbar(box, cur, onPick, sym) {
    box.hidden = NETS.length < 2; box.textContent = '';
    NETS.forEach(function (n) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (n.key === cur ? ' on' : '');
      b.dataset.net = n.key; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', n.key === cur ? 'true' : 'false');
      var lg = document.createElement('img'); lg.src = netLogo(n.key); lg.alt = ''; b.appendChild(lg);
      var t = document.createElement('span'); t.textContent = n.name; b.appendChild(t);
      if (sym && n.coins.indexOf(sym) >= 0) {
        var bv = balOn(sym, n.key), sm = document.createElement('small'); sm.className = 'netbal';
        sm.textContent = state.hidden ? '••••' : bv == null ? '…' : bv.toLocaleString('en-US', { maximumFractionDigits: bv >= 100 ? 0 : 2 });
        sm.setAttribute('aria-label', 'رصيد ' + sym + ' على ' + n.name); b.appendChild(sm);
      }
      b.onclick = function () { onPick(n.key); }; box.appendChild(b);
    });
    box.classList.add('netgrid'); box.style.gridTemplateColumns = 'repeat(' + NETS.length + ',minmax(0,1fr))';
  }
  function evmUnits(k, sym) {
    var b = state.evmBal && state.evmBal[k]; if (!b) return null;
    return sym === EVM[k].native ? b.native : b[sym];
  }
  function evmDec(k, sym) { if (sym === EVM[k].native) return 18; return EVM[k].tokens.filter(function (t) { return t.sym === sym; })[0].dec; }
  var P = (window.Capacitor && window.Capacitor.Plugins) || {};
  var $ = function (id) { return document.getElementById(id); };

  var state = { mnemonic: null, pinMode: 'create', firstPin: '', pin: '', pinCb: null, balances: null, hidden: false, lastTx: null, stack: [], coin: 'USDT', filter: 'all', historyCache: null };
  // الشبكة الافتراضية: BNB Chain (رسوم سنتات) إن كانت مفعّلة، وإلا TRON
  var MAIN_NET = EVM.bsc ? 'bsc' : 'tron';
  state.evmBal = null; state.recvNet = MAIN_NET; state.sendNet = MAIN_NET;
  var TAB_SCREENS = ['home', 'trade', 'history', 'p2p', 'security'];

  // تفضيل إخفاء الأرصدة (غير حساس)
  // «إخفاء الأرصدة عند فتح التطبيق» إعداد دائم (sarra.hideOnOpen)، منفصل عن حالة الإخفاء الحالية:
  // العين تُظهر الأرصدة لهذه الجلسة فقط، وعند كل فتح جديد للتطبيق تعود مخفية إن كان الإعداد مفعّلاً
  try {
    if (localStorage.getItem('sarra.hideOnOpen') == null && localStorage.getItem('sarra.hide') === '1') localStorage.setItem('sarra.hideOnOpen', '1'); // ترحيل من الإعداد القديم
    state.hideOnOpen = localStorage.getItem('sarra.hideOnOpen') === '1';
    state.hidden = state.hideOnOpen;
  } catch (e) {}

  // ===== تنقل =====
  function show(name, push) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    if (name !== 'reveal') $('words2').textContent = ''; // لا تبقى الكلمات في الشاشة بعد مغادرتها
    if (name !== 'backup' && name !== 'pin') state.mnemonic = null; // لا تبقى الكلمات في الذاكرة خارج شاشات الإنشاء
    $('s-' + name).classList.add('active');
    // شاشات الكلمات والاستيراد: لا تصوير للشاشة ولا معاينة في التطبيقات الأخيرة (أندرويد)
    try { var DK = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.DeviceKey; if (DK && DK.secure) DK.secure({ on: name === 'backup' || name === 'reveal' || name === 'import' }).catch(function () {}); } catch (e) {}
    if (name !== 'send' && state.payLock) unlockPay(); // قفل دفع فاتورة الشحن يخص شاشة الإرسال فقط
    if (push !== false) state.stack.push(name);
    window.scrollTo(0, 0);
    var tabbed = TAB_SCREENS.indexOf(name) >= 0;
    $('tabbar').classList.toggle('show', tabbed);
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.dataset.tab === name); });
    if (name === 'home') loadHome();
    if (name === 'receive') loadReceive();
    if (name === 'send') prepareSend();
    if (name === 'history') loadHistoryFull();
    if (name === 'security') prepareSecurity();
    if (name === 'swap') prepareSwap();
    if (name === 'bridge') prepareBridge();
    if (name === 'p2p') loadP2P();
    if (name === 'trade') loadTrade();
    if (name === 'pair') loadPair();
  }
  function back() {
    if (state.stack[state.stack.length - 1] === 'pin' && state.unlockWait) { var w = state.unlockWait; state.unlockWait = null; state.unlockCancelAt = Date.now(); w.reject(new Error('CANCELLED')); }
    state.stack.pop();
    var prev = state.stack[state.stack.length - 1];
    if (prev) show(prev, false);
  }
  function resetTo(name) { state.stack = []; show(name); }

  document.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-tab]');
    if (tab) { resetTo(tab.dataset.tab); return; }
    var go = e.target.closest('[data-go]');
    if (go) { routes[go.dataset.go](); return; }
    if (e.target.closest('[data-back]')) back();
  });

  var routes = {
    create: function () {
      state.mnemonic = core.generateMnemonic();
      renderWords(state.mnemonic);
      show('backup');
    },
    import: function () { $('mn-in').value = ''; $('import-err').hidden = true; show('import'); },
    home: function () { resetTo('home'); },
    send: function () { show('send'); },
    receive: function () { show('receive'); },
    swap: function () { show('swap'); },
    bridge: function () { show('bridge'); }
  };

  if (P.App) {
    P.App.addListener('backButton', function () {
      var cur = state.stack[state.stack.length - 1];
      if ($('drawer').classList.contains('show')) { openDrawer(false); return; }
      if (!$('scanner').hidden) { stopScan(); return; }
      if ($('sheet').classList.contains('show')) { $('sheet').classList.remove('show'); return; }
      if ($('wipe-sheet').classList.contains('show')) { $('wipe-sheet').classList.remove('show'); return; }
      if ($('od-sheet').classList.contains('show')) { $('od-sheet').classList.remove('show'); return; }
      if ($('td-sheet').classList.contains('show')) { $('td-sheet').classList.remove('show'); return; }
      if ($('th-sheet').classList.contains('show')) { $('th-sheet').classList.remove('show'); return; }
      if ($('txd-sheet').classList.contains('show')) { $('txd-sheet').classList.remove('show'); return; }
      if ($('rx-sheet').classList.contains('show')) { rxClose(); return; }
      if ($('sw-sheet').classList.contains('show')) { $('sw-sheet').classList.remove('show'); return; }
      if ($('br-sheet').classList.contains('show')) { $('br-sheet').classList.remove('show'); return; }
      if ($('coin-sheet').classList.contains('show')) { $('coin-sheet').classList.remove('show'); return; }
      if ($('celebrate').classList.contains('show')) { $('cel-ok').click(); return; }
      if ($('coins-sheet').classList.contains('show')) { $('coins-sheet').classList.remove('show'); return; }
      if ($('gas-sheet').classList.contains('show')) { $('gas-sheet').classList.remove('show'); return; }
      if ($('ask-sheet').classList.contains('show')) { state.askBack = true; $('ask-no').click(); return; } // زر الرجوع = إلغاء (false)، يختلف عن زر «لا» (null)
      if ($('nick-sheet').classList.contains('show')) { $('nick-no').click(); return; }
      if (cur && cur !== 'home' && TAB_SCREENS.indexOf(cur) >= 0) { resetTo('home'); return; }
      if (state.stack.length > 1 && cur !== 'home' && !(cur === 'pin' && state.pinMode === 'unlock')) back();
      else P.App.exitApp();
    });
    var hiddenAt = 0;
    P.App.addListener('appStateChange', function (s) {
      if (!s.isActive) { hiddenAt = Date.now(); if (!$('scanner').hidden) stopScan(); return; }
      var picking = state.pickingAt && Date.now() - state.pickingAt < 10 * 60000; state.pickingAt = 0;
      if (hiddenAt && !picking && Date.now() - hiddenAt > AUTO_LOCK_MS && core.isUnlocked()) { state.resume = state.stack.slice(); core.lock(); openPin('unlock'); }
    });
  }

  // ===== Toast =====
  var toastTimer;
  // رسالة عائمة بأيقونة ونوع واضح: نجاح، خطأ، تنبيه، معلومة. مدتها تناسب طولها، ولا تحجب اللمس عمّا تحتها
  var TOAST_IC = {
    ok: '<path d="m5 12 5 5L20 7"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/>',
    warn: '<path d="M12 3 2 21h20z"/><path d="M12 10v4M12 17.5v.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.5"/>'
  };
  function toastKind(msg, isErr) {
    if (isErr === true) return /^(تأكد|انتبه|⚠)/.test(msg) ? 'warn' : 'error';
    if (typeof isErr === 'string') return isErr;
    return /✓|^تم |^تمت|^نُسخ|^حُفظ|^أُرسل|^وصل|^اكتمل/.test(msg) ? 'ok' : 'info';
  }
  function toast(msg, isErr) {
    var t = $('toast'), k = toastKind(String(msg || ''), isErr), text = String(msg || '').replace(/\s*✓\s*$/, '').replace(/^⚠️?\s*/, '');
    t.textContent = '';
    var ic = document.createElement('span'); ic.className = 'toast-ic'; ic.innerHTML = '<svg class="i" viewBox="0 0 24 24">' + TOAST_IC[k] + '</svg>';
    var tx = document.createElement('span'); tx.className = 'toast-tx'; tx.textContent = text;
    t.appendChild(ic); t.appendChild(tx);
    t.className = 'toast show t-' + k + (k === 'error' || k === 'warn' ? ' error' : '');
    t.setAttribute('role', k === 'error' ? 'alert' : 'status');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast t-' + k; }, Math.min(7000, 2200 + text.length * 45));
  }



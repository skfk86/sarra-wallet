
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

  var core = WalletCore.createCore({ deviceKey: (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.DeviceKey) ? function () { return window.Capacitor.Plugins.DeviceKey.get().then(function (r) { return r && r.key; }); } : null, network: NETWORK, apiKey: TRONGRID_API_KEY, feeAddress: CFG.feeAddress, feeBps: CFG.feeBps, evm: CFG.evm === true, lifiFee: CFG.lifiFee, lifiSwapFee: CFG.lifiSwapFee, lifiIntegrator: CFG.lifiIntegrator, bridgeMax: CFG.bridgeMax });
  // ===== الشبكات =====
  var EVM = core.evmEnabled() ? core.evmChains() : {};
  if (location.protocol === 'file:') window.__core = { lock: function () { core.lock(); }, rx: function () { return RX; }, busy: function () { return !!state.txBusy; }, rebase: function (ok) { RX.rebasing = (RX.rebasing || 0) + 1; return rxRebase(ok); } }; // للاختبارات الآلية فقط
  var NETS = [{ key: 'tron', name: 'TRON', short: 'TRC20', color: '#EB0029', native: 'TRX', coins: ['USDT', 'TRX'] }].concat(
    Object.keys(EVM).map(function (k) { var c = EVM[k]; return { key: k, name: c.name, short: c.short, color: c.color, native: c.native, coins: (function (ts) { return ts.slice(0, 2).concat([c.native], ts.slice(2)); })(c.tokens.map(function (t) { return t.sym; })), evm: true }; }));
  function netOf(k) { return NETS.filter(function (n) { return n.key === k; })[0] || NETS[0]; }
  var NET_LOGO = { tron: 'trx', bsc: 'bnb', eth: 'eth', polygon: 'pol' };
  function netLogo(k) { return 'assets/coins/' + (NET_LOGO[k] || 'trx') + '.png'; }
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
  try { state.hidden = localStorage.getItem('sarra.hide') === '1'; } catch (e) {}

  // ===== تنقل =====
  function show(name, push) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    if (name !== 'reveal') $('words2').textContent = ''; // لا تبقى الكلمات في الشاشة بعد مغادرتها
    if (name !== 'backup' && name !== 'pin') state.mnemonic = null; // لا تبقى الكلمات في الذاكرة خارج شاشات الإنشاء
    $('s-' + name).classList.add('active');
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
      if ($('ask-sheet').classList.contains('show')) { $('ask-no').click(); return; }
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
  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2800);
  }


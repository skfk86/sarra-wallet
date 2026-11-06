  // ===== السجل =====
  function emptyMsg(box, text) {
    box.textContent = '';
    var d = document.createElement('div'); d.className = 'hempty';
    d.innerHTML = '<span><svg class="i" viewBox="0 0 24 24"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg></span>';
    var b = document.createElement('small'); b.textContent = text; d.appendChild(b); box.appendChild(d);
  }
  function dayLabel(ms) {
    var d = new Date(ms), n = new Date(), y = new Date(Date.now() - 864e5);
    if (d.toDateString() === n.toDateString()) return 'اليوم';
    if (d.toDateString() === y.toDateString()) return 'أمس';
    return d.toLocaleDateString('ar', { day: 'numeric', month: 'long', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
  }
  function netTag(k) { return k === 'tron' || !k ? 'TRON' : (EVM[k] ? EVM[k].name : k); }
  function renderTxList(box, list, grouped) {
    box.textContent = '';
    if (!list.length) {
      if (!grouped) return emptyMsg(box, 'لا توجد معاملات');
      var em = el('div', null); em.className = 'hempty';
      em.innerHTML = '<span aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>';
      em.appendChild(el('b', null, state.filter === 'in' ? 'لا يوجد استلام بعد' : state.filter === 'out' ? 'لا يوجد إرسال بعد' : 'لا توجد معاملات بعد'));
      em.appendChild(el('small', null, 'ستظهر هنا عملياتك بعد أول إرسال أو استلام أو تبديل'));
      box.appendChild(em); return;
    }
    var lastDay = '', group = box;
    list.forEach(function (t) {
      if (grouped) {
        var dl = dayLabel(t.time);
        if (dl !== lastDay) { lastDay = dl; box.appendChild(el('div', null, dl)).className = 'hday'; group = box.appendChild(el('div', null)); group.className = 'hgroup'; }
      }
      var row = document.createElement('button'); row.type = 'button'; row.className = 'tx' + (grouped ? ' txg' : '');
      row.style.cssText = 'width:100%;background:none;border:0;border-bottom:1px solid var(--row);cursor:pointer;color:inherit;text-align:start';
      var coin = t.coin || 'USDT';
      var kind = t.rec ? t.rec.kind : t.self ? 'self' : t.incoming ? 'recv' : 'send';
      row.setAttribute('aria-label', txTitle(t) + ' ' + t.amount + ' ' + coin + '، عرض التفاصيل');
      row.onclick = function () { openTxDetail(t); };
      var b = document.createElement('span'); b.className = 'b';
      txIcon(b, kind);
      var mid = document.createElement('div'); mid.className = 'grow'; mid.style.cssText = 'display:flex;flex-direction:column;min-width:0';
      var t1 = document.createElement('span'); t1.style.cssText = 'font-size:14px;font-weight:600'; t1.textContent = txTitle(t) + (t.ok === false ? ' · فشلت' : '');
      if (t.ok === false) t1.style.color = 'var(--out)';
      var t2 = document.createElement('span'); t2.className = 'muted'; t2.style.cssText = 'font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      t2.textContent = (grouped ? new Date(t.time).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : new Date(t.time).toLocaleString('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + (t.net ? '' : ' · ' + netTag(t.net)) + (kind === 'swap' || kind === 'bridge' ? ' · ' + netTag(t.net) : ' · ' + shortAddr(t.counterparty));
      if (t.net) { var nl = document.createElement('img'); nl.src = netLogo(t.net); nl.alt = netTag(t.net); nl.title = netTag(t.net); nl.className = 'tx-badge'; b.appendChild(nl); }
      mid.appendChild(t1); mid.appendChild(t2);
      var amt = document.createElement('span'); amt.className = 'ltr';
      amt.style.cssText = 'font-size:14px;font-weight:600;color:' + (t.incoming ? 'var(--in)' : 'var(--tx)');
      amt.textContent = state.hidden ? '••••' : (t.incoming ? '+' : '−') + fmtExact(t.amount) + ' ' + coin;
      var end = document.createElement('div'); end.className = 'tx-end'; end.appendChild(amt);
      var uv = !state.hidden && usdOf(t.amount, coin);
      if (uv) end.appendChild(el('span', null, '≈\u00a0' + (t.incoming ? '+' : '−') + usd(uv)));
      row.appendChild(b); row.appendChild(mid); row.appendChild(end);
      group.appendChild(row);
    });
  }
  var TX_ICONS = {
    recv: ['var(--in-bg)', 'var(--in)', '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>'],
    send: ['var(--out-bg)', 'var(--out)', '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>'],
    self: ['var(--s2)', 'var(--mu)', '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>'],
    swap: ['rgba(64,128,255,.13)', '#3d7bf0', '<path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/>'],
    bridge: ['rgba(150,90,240,.13)', '#8b5cf0', '<path d="M4 18V9a8 8 0 0 1 16 0v9"/><path d="M4 13h16"/>']
  };
  function txIcon(b, kind) { var c = TX_ICONS[kind] || TX_ICONS.send; b.style.cssText = 'background:' + c[0] + ';color:' + c[1]; b.innerHTML = '<svg class="i" viewBox="0 0 24 24">' + c[2] + '</svg>'; }
  function txTitle(t) {
    var r = t.rec;
    if (r && r.kind === 'swap') {
      var tr = r.trade || (/^شراء /.test(r.via || '') ? 'buy' : /^بيع /.test(r.via || '') ? 'sell' : null); // صفقات شاشة التداول
      if (tr === 'buy') return 'شراء ' + r.coin;
      if (tr === 'sell') return 'بيع ' + (r.paidCoin || '');
      return 'تبديل ' + (r.paidCoin || '') + ' ← ' + r.coin;
    }
    if (r && r.kind === 'bridge') return 'نقل إلى ' + netTag(r.toNet);
    return t.self ? 'تحويل لنفس العنوان' : t.incoming ? 'استلام' : 'إرسال';
  }
  // ===== نافذة تفاصيل العملية =====
  function openTxDetail(t) {
    var r = t.rec || {}, kind = r.kind || (t.self ? 'self' : t.incoming ? 'recv' : 'send');
    var url = r.url || (t.txid ? (t.net && t.net !== 'tron' ? core.evmTxUrl(t.net, t.txid) : core.network.explorer + t.txid) : '');
    txIcon($('txd-ic'), kind);
    $('txd-title').textContent = { recv: 'استلام', send: 'إرسال', self: 'تحويل لنفس العنوان', swap: 'تبديل', bridge: 'نقل بين الشبكات' }[kind];
    var st = $('txd-st'), pend = r.status === 'PENDING', fail = t.ok === false || r.status === 'FAILED';
    st.textContent = fail ? 'فشلت' : pend ? 'بانتظار التأكيد' : 'تمت'; st.className = 'txd-st' + (fail ? ' fail' : pend ? ' pend' : '');
    var sign = kind === 'send' ? '−' : kind === 'self' ? '' : '+', a = state.hidden ? '••••' : sign + fmtExact(t.amount) + ' ' + (t.coin || 'USDT');
    $('txd-amt').textContent = a; fitAmt($('txd-amt'), a);
    $('txd-sub').textContent = kind === 'bridge' ? chainLabel(r.net) + ' ← ' + chainLabel(r.toNet) : chainLabel(t.net);
    var dl = $('txd-kv'); dl.textContent = '';
    if (kind === 'swap' || kind === 'bridge') {
      kvRow(dl, 'دفعت', state.hidden ? '••••' : fmtExact(r.paidAmount) + ' ' + (r.paidCoin || ''));
      kvRow(dl, 'استلمت', state.hidden ? '••••' : fmtExact(t.amount) + ' ' + t.coin);
      if (kind === 'bridge') { kvRow(dl, 'من شبكة', chainLabel(r.net)); kvRow(dl, 'إلى شبكة', chainLabel(r.toNet)); }
      else kvRow(dl, 'الشبكة', chainLabel(r.net || t.net));
      if (r.via) kvRow(dl, 'عبر', r.via);
    } else {
      kvRow(dl, 'الشبكة', chainLabel(t.net));
      kvRow(dl, 'العملة', t.coin || 'USDT');
      var who = kind === 'recv' ? (r.from || t.counterparty) : (r.to || t.counterparty);
      if (who) kvRow(dl, kind === 'recv' ? 'من' : 'إلى', shortAddr(who), who);
      else if (kind === 'recv') kvRow(dl, 'من', el('span', 'color:var(--mu)', 'غير معروف'));
    }
    kvRow(dl, 'الوقت', el('span', null, fmtWhen(t.time)));
    if (t.txid) kvRow(dl, 'رقم المعاملة', shortAddr(t.txid), t.txid);
    $('txd-note').hidden = !(r.kind && !t.txid); $('txd-note').textContent = 'هذه العملية محفوظة على جهازك. رقم المعاملة غير متوفر لها، ويمكنك رؤيتها في المستكشف من صفحة عنوانك.';
    $('txd-exp').hidden = !url; $('txd-exp').textContent = 'عرض على ' + explorerName(url);
    $('txd-exp').onclick = function () { if (url) window.open(url, '_blank'); };
    $('txd-sheet').classList.add('show');
  }
  $('txd-close').onclick = function () { $('txd-sheet').classList.remove('show'); };
  $('txd-sheet').addEventListener('click', function (e) { if (e.target === $('txd-sheet')) $('txd-sheet').classList.remove('show'); });
  async function loadHistory() {
    var box = $('history');
    var tron = [];
    try { tron = (await core.getHistory(null, 5)).map(function (t) { t.net = 'tron'; return t; }); }
    catch (e) { if (!lhAll().length) { if (!box.querySelector('button')) emptyMsg(box, WalletCore.errorText(e)); return; } }
    renderTxList(box, withLocal(tron).sort(function (a, b) { return b.time - a.time; }).slice(0, 5));
  }
  function renderEvmHist() {
    var on = Object.keys(EVM).length > 0; $('evm-hist').hidden = !on; if (!on) return;
    var box = $('evm-hist-links'); if (box.childNodes.length) return;
    Object.keys(EVM).forEach(function (k) {
      var c = EVM[k], b = el('button', null); b.type = 'button'; b.className = 'hexp-l';
      var d = document.createElement('img'); d.src = netLogo(k); d.alt = ''; b.appendChild(d);
      b.appendChild(document.createTextNode(c.name + ' ↗'));
      b.onclick = async function () { var u = await core.evmExplorer(k); if (u) window.open(u, '_blank'); };
      box.appendChild(b);
    });
  }
  // ----- سجل موحّد: TRON + شبكات EVM (الكاش في القاعدة، والتحديث عبر دالة history الموقّعة) -----
  state.hnet = 'all'; state.evmHist = {}; state.evmHistAt = {};
  var HIST_TTL = 90000;
  function historyUrl() { return CFG.historyUrl || (P2P_URL ? P2P_URL.replace(/\/p2p$/, '/history') : ''); }
  function buildHnetChips() {
    var box = $('hnet-chips'); if (box.childNodes.length) return;
    var keys = ['all', 'tron'].concat(Object.keys(EVM));
    if (keys.length <= 2) { box.hidden = true; return; }
    keys.forEach(function (k) {
      var b = el('button', null); b.type = 'button'; b.className = 'hchip' + (k === state.hnet ? ' on' : ''); b.dataset.hnet = k; b.setAttribute('role', 'tab');
      if (k === 'all') b.innerHTML = '<svg class="i" viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>';
      else { var lg = document.createElement('img'); lg.src = netLogo(k); lg.alt = ''; b.appendChild(lg); }
      b.appendChild(document.createTextNode(k === 'all' ? 'كل الشبكات' : netTag(k)));
      b.onclick = function () {
        state.hnet = k;
        box.querySelectorAll('.hchip').forEach(function (x) { x.classList.toggle('on', x === b); });
        applyFilter(); loadEvmHistFor(k);
      };
      box.appendChild(b);
    });
  }
  // يقرأ الكاش أولاً (بدون Edge Function)، ثم يحدّث إن كان قديماً والمحفظة مفتوحة
  async function loadEvmChain(k) {
    var c = EVM[k], addr = await core.evmAddress();
    if (!c || !addr || !P2P_REST) return false;
    if (state.evmHistAt[k] && Date.now() - state.evmHistAt[k] < HIST_TTL) return true;
    var raw = null, fresh = false;
    try {
      var rows = await rpc('evm_history_get', { p_chain: c.id, p_addr: addr });
      if (rows && rows[0]) { raw = rows[0].body; fresh = Date.now() - Date.parse(rows[0].fetched_at) < HIST_TTL; }
    } catch (e) { /* الكاش اختياري */ }
    if (!fresh && historyUrl() && core.isUnlocked()) {
      try {
        var body = await core.signRequest('history.evm', { chain: c.id, address: addr });
        var res = await fetch(historyUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        var j = await res.json().catch(function () { return {}; });
        if (res.ok && !j.error) raw = j.items;
        else if (!raw) throw new Error(j.error || 'SERVER');
      } catch (e) { if (!raw) { state.evmHist[k] = state.evmHist[k] || null; throw e; } }
    }
    if (raw) { state.evmHist[k] = core.evmHistoryItems(k, addr, raw); state.evmHistAt[k] = Date.now(); return true; }
    return false;
  }
  async function loadEvmHistFor(which) {
    var keys = which === 'all' ? Object.keys(EVM) : EVM[which] ? [which] : [];
    if (!keys.length) { $('hist-note').hidden = true; return; }
    var failed = [];
    await Promise.all(keys.map(function (k) { return loadEvmChain(k).catch(function () { failed.push(k); }); }));
    var note = $('hist-note');
    if (failed.length) { note.hidden = false; note.textContent = 'تعذّر تحميل سجل ' + failed.map(netTag).join(' و') + ' الآن. يمكنك فتحه من المستكشف أدناه.'; }
    else if (!core.isUnlocked() && keys.some(function (k) { return !state.evmHist[k]; })) { note.hidden = false; note.textContent = 'افتح المحفظة بالرمز لتحديث سجل الشبكات الأخرى.'; }
    else note.hidden = true;
    applyFilter();
  }
  async function loadHistoryFull() {
    renderEvmHist(); buildHnetChips();
    var box = $('history-full');
    var haveTron = state.historyCache && Date.now() - state.fetchedAt.history < FRESH_MS;
    if (haveTron) { applyFilter(); loadEvmHistFor(state.hnet); return; }
    if (!state.historyCache) emptyMsg(box, 'جارٍ التحميل…');
    state.fetchedAt.history = Date.now();
    var tronP = core.getHistory(null, 50).then(function (l) { state.historyCache = l.map(function (t) { t.net = 'tron'; return t; }); }).catch(function (e) {
      state.fetchedAt.history = 0; if (!state.historyCache) state.tronErr = WalletCore.errorText(e);
    });
    var evmP = loadEvmHistFor(state.hnet);
    await tronP; applyFilter(); await evmP;
  }
  // ملخص آخر 30 يوماً بالدولار (للشبكة المختارة)؛ التبديل والنقل لا يُحسبان استلاماً أو إرسالاً
  function renderHistSum(all) {
    var since = Date.now() - 30 * 864e5, inn = 0, out = 0, ni = 0, no = 0;
    all.forEach(function (t) {
      if (t.time < since || t.self || t.ok === false) return;
      var k = t.rec && t.rec.kind; if (k === 'swap' || k === 'bridge') return;
      var v = usdOf(t.amount, t.coin || 'USDT');
      if (t.incoming) { ni++; inn += v || 0; } else { no++; out += v || 0; }
    });
    var f = function (v, n) { return state.hidden ? '••••' : n ? usd(v) : '$0.00'; };
    $('hsum-in').textContent = f(inn, ni); $('hsum-out').textContent = f(out, no);
  }
  function applyFilter() {
    var all = [];
    if (state.hnet === 'all' || state.hnet === 'tron') all = all.concat(state.historyCache || []);
    Object.keys(state.evmHist).forEach(function (k) { if ((state.hnet === 'all' || state.hnet === k) && state.evmHist[k]) all = all.concat(state.evmHist[k]); });
    all = withLocal(all, state.hnet);
    all.sort(function (a, b) { return b.time - a.time; });
    var list = all.filter(function (t) { return state.filter === 'all' || (state.filter === 'in') === !!t.incoming; });
    renderHistSum(all);
    if (!list.length && !lhAll().length && !state.historyCache && state.tronErr && state.hnet !== 'bsc' && state.hnet !== 'eth' && state.hnet !== 'polygon') return emptyMsg($('history-full'), state.tronErr);
    renderTxList($('history-full'), list, true);
  }
  document.querySelectorAll('[data-filter]').forEach(function (c) {
    c.onclick = function () {
      state.filter = c.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(function (x) { x.classList.toggle('on', x === c); x.setAttribute('aria-selected', x === c ? 'true' : 'false'); });
      applyFilter();
    };
  });


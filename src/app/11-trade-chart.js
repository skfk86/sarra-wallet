  // ===== رسم الشموع اليابانية (Canvas بلا مكتبات) =====
  function drawCandles() {
    var kl = TR.kl, cv = $('pr-cv'); if (!kl || !kl.length || !cv.offsetWidth) return;
    var dpr = window.devicePixelRatio || 1, W = cv.offsetWidth, H = cv.offsetHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    var cs = getComputedStyle(document.documentElement), mu = cs.getPropertyValue('--mu').trim() || '#8b99a8', grid = cs.getPropertyValue('--div').trim() || '#e5e7eb', tx = cs.getPropertyValue('--tx').trim() || '#111', bg = cs.getPropertyValue('--s1').trim() || '#fff';
    var UP = '#16A37A', DN = '#E5484D', AX = 58, VOLH = 54, TOP = 8, BOT = 18;
    var n = Math.min(TR.view, kl.length); TR.off = Math.max(0, Math.min(TR.off || 0, kl.length - n));
    var off = kl.length - n - TR.off, s = kl.slice(off, off + n), cw = (W - AX) / n; // TR.off: كم شمعة رجعنا للخلف بالسحب
    var closes = kl.map(function (k) { return k.c; }), m7 = sma(closes, 7), m25 = sma(closes, 25), m99 = sma(closes, 99);
    var hi = -Infinity, lo = Infinity; s.forEach(function (k) { if (k.h > hi) hi = k.h; if (k.l < lo) lo = k.l; });
    [m7, m25, m99].forEach(function (m) { for (var i = off; i < kl.length; i++) if (m[i] != null) { if (m[i] > hi) hi = m[i]; if (m[i] < lo) lo = m[i]; } });
    var pad = (hi - lo) * 0.06 || hi * 0.01; hi += pad; lo -= pad;
    var ph = H - VOLH - TOP - BOT, Y = function (v) { return TOP + (hi - v) / (hi - lo) * ph; }, X = function (i) { return i * cw + cw / 2; };
    // شبكة وأسعار المحور
    x.font = '10px system-ui,sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'left';
    for (var g = 0; g <= 4; g++) {
      var gv = lo + (hi - lo) * g / 4, gy = Y(gv);
      x.strokeStyle = grid; x.lineWidth = 1; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(0, gy); x.lineTo(W - AX, gy); x.stroke(); x.setLineDash([]);
      x.fillStyle = mu; x.fillText(fp(gv), W - AX + 6, gy);
    }
    // الحجم
    var vmax = Math.max.apply(null, s.map(function (k) { return k.v || 0; })) || 1;
    s.forEach(function (k, i) { if (!k.v) return; var vh = k.v / vmax * (VOLH - 6); x.fillStyle = k.c >= k.o ? 'rgba(22,163,122,.28)' : 'rgba(229,72,77,.28)'; x.fillRect(i * cw + cw * 0.15, H - BOT - vh, Math.max(1, cw * 0.7), vh); });
    // الشموع
    s.forEach(function (k, i) {
      var up = k.c >= k.o, col = up ? UP : DN, cx = X(i), bw = Math.max(1, cw * 0.66);
      x.strokeStyle = col; x.lineWidth = 1; x.beginPath(); x.moveTo(Math.round(cx) + 0.5, Y(k.h)); x.lineTo(Math.round(cx) + 0.5, Y(k.l)); x.stroke();
      var y1 = Y(Math.max(k.o, k.c)), y2 = Y(Math.min(k.o, k.c)); x.fillStyle = col; x.fillRect(cx - bw / 2, y1, bw, Math.max(1, y2 - y1));
    });
    // المتوسطات
    [[m7, '#f0b90b'], [m25, '#8b5cf6'], [m99, '#3b82f6']].forEach(function (m) {
      x.strokeStyle = m[1]; x.lineWidth = 1.3; x.beginPath(); var st = false;
      for (var i = 0; i < n; i++) { var v = m[0][off + i]; if (v == null) continue; if (!st) { x.moveTo(X(i), Y(v)); st = true; } else x.lineTo(X(i), Y(v)); }
      x.stroke();
    });
    // خط آخر سعر
    var last = s[s.length - 1], now = kl[kl.length - 1], ly = Y(now.c), lc = now.c >= now.o ? UP : DN; // خط آخر سعر فعلي حتى أثناء تصفّح الماضي
    x.strokeStyle = lc; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(0, ly); x.lineTo(W - AX, ly); x.stroke(); x.setLineDash([]);
    if (ly > TOP && ly < TOP + ph) { x.fillStyle = lc; x.fillRect(W - AX + 1, ly - 9, AX - 2, 18); x.fillStyle = '#fff'; x.font = 'bold 10px system-ui,sans-serif'; x.fillText(fp(now.c), W - AX + 5, ly); }
    // محور الوقت
    x.fillStyle = mu; x.font = '10px system-ui,sans-serif'; x.textAlign = 'center';
    var fmtT = function (t) { var d = new Date(t); return TR.tf === '1d' || TR.tf === '1w' ? (d.getMonth() + 1) + '/' + d.getDate() : ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
    for (var ti = Math.floor(n / 8); ti < n; ti += Math.max(1, Math.floor(n / 4))) x.fillText(fmtT(s[ti].t), X(ti), H - 6);
    // مؤشر اللمس
    var hv = TR.hover == null ? null : Math.max(0, Math.min(n - 1, TR.hover)), k2 = hv == null ? last : s[hv];
    if (hv != null) {
      var hx = X(hv); x.strokeStyle = mu; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(hx, TOP); x.lineTo(hx, H - BOT); x.moveTo(0, Y(k2.c)); x.lineTo(W - AX, Y(k2.c)); x.stroke(); x.setLineDash([]);
      x.fillStyle = tx; x.fillRect(W - AX + 1, Y(k2.c) - 9, AX - 2, 18); x.fillStyle = bg; x.textAlign = 'left'; x.fillText(fp(k2.c), W - AX + 5, Y(k2.c));
    }
    var o = $('pr-ohlc'), ch = (k2.c - k2.o) / k2.o * 100; o.textContent = '';
    [['O', fp(k2.o)], ['H', fp(k2.h)], ['L', fp(k2.l)], ['C', fp(k2.c)]].forEach(function (p) { var sp = el('span', null, p[0] + ' '); sp.appendChild(el('b', null, p[1])); o.appendChild(sp); });
    var cp = el('span', 'color:' + (ch >= 0 ? UP : DN) + ';font-weight:700', (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%'); o.appendChild(cp);
    if (hv != null) { var d = new Date(k2.t); o.appendChild(el('span', null, d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))); }
  }
  (function () {
    // إصبع واحد: سحب يمين/يسار يتصفّح الشموع، ولمسة مطوّلة (أو نقرة) تُظهر بيانات شمعة. إصبعان: تكبير وتصغير
    var cv = $('pr-cv'), AXW = 58, st = null, holdT = null, d0 = null, v0 = 80;
    var cwOf = function () { return (cv.getBoundingClientRect().width - AXW) / Math.min(TR.view, (TR.kl || []).length || 1); };
    var hoverAt = function (x) { if (!TR.kl) return; var r = cv.getBoundingClientRect(); TR.hover = Math.floor((x - r.left) / cwOf()); drawCandles(); };
    var down = function (x) {
      if (!TR.kl) return; st = { x: x, off: TR.off || 0, mode: null, t: Date.now() };
      clearTimeout(holdT); holdT = setTimeout(function () { if (st && !st.mode) { st.mode = 'hover'; hoverAt(st.x); } }, 280);
    };
    var move = function (x) {
      if (!st) return;
      if (!st.mode && Math.abs(x - st.x) > 6) { st.mode = 'pan'; clearTimeout(holdT); TR.hover = null; }
      if (st.mode === 'hover') return hoverAt(x);
      if (st.mode === 'pan') {
        TR.off = Math.max(0, st.off + Math.round((x - st.x) / cwOf())); drawCandles();
        if (TR.kl && TR.off >= TR.kl.length - Math.min(TR.view, TR.kl.length) - 5) loadOlder(); // وصلنا لأول الشارت: نحمّل شموعاً أقدم
      }
    };
    var up = function () {
      clearTimeout(holdT);
      if (st && !st.mode && Date.now() - st.t < 280) { hoverAt(st.x); setTimeout(function () { if (!st) { TR.hover = null; drawCandles(); } }, 2500); } // نقرة: نعرض الشمعة لحظة
      else if (st && st.mode === 'hover') { TR.hover = null; drawCandles(); }
      st = null;
    };
    cv.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) { clearTimeout(holdT); st = null; TR.hover = null; d0 = Math.abs(e.touches[0].clientX - e.touches[1].clientX); v0 = TR.view; return; }
      down(e.touches[0].clientX);
    }, { passive: true });
    cv.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && d0) { e.preventDefault(); var d = Math.abs(e.touches[0].clientX - e.touches[1].clientX); TR.view = Math.max(20, Math.min(200, Math.round(v0 * d0 / Math.max(d, 10)))); drawCandles(); return; }
      if (st && (st.mode || Math.abs(e.touches[0].clientX - st.x) > 6)) e.preventDefault(); // نمنع تمرير الصفحة أثناء السحب الأفقي
      move(e.touches[0].clientX);
    }, { passive: false });
    cv.addEventListener('touchend', function (e) { if (!e.touches.length) { d0 = null; up(); } });
    // الفأرة (للتجربة على الحاسوب): سحب للتصفّح، تمرير للتكبير
    cv.addEventListener('mousedown', function (e) { down(e.clientX); });
    window.addEventListener('mousemove', function (e) { if (st) move(e.clientX); });
    window.addEventListener('mouseup', function () { if (st) up(); });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); TR.view = Math.max(20, Math.min(200, TR.view + (e.deltaY > 0 ? 8 : -8))); drawCandles(); }, { passive: false });
    cv.addEventListener('dblclick', function () { TR.off = 0; TR.view = 80; drawCandles(); }); // نقرتان: العودة لآخر سعر
    window.addEventListener('resize', function () { if (state.stack[state.stack.length - 1] === 'pair') drawCandles(); });
  })();

  // ===== مركز المستخدم (على طريقة منصات التداول) =====
  function plCls(v) { return v > 0 ? 'pl-up' : v < 0 ? 'pl-dn' : ''; }
  function pctTxt(v) { return v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'; }
  // بيانات مركز عملة: الكمية الفعلية (الأقل بين المشترى والموجود)، والقيمة والربح غير المحقق ونسبة العائد
  function trPosView(c) {
    var ps = trPos(c.sym), held = coinTotal(c), p = trPrice(c.sym);
    var q = ps.qty > 0 ? (held == null ? ps.qty : Math.min(ps.qty, held)) : 0, cost = ps.qty > 0 ? ps.cost * (q / ps.qty) : 0;
    var un = q > 0 && p ? q * p - cost : null;
    var last = trAll().filter(function (t) { return t.sym === c.sym && t.side === 'buy' && t.status !== 'FAILED'; })[0];
    return { ps: ps, held: held, p: p, q: q, cost: cost, val: q > 0 && p ? q * p : null, un: un, roi: un != null && cost > 0 ? un / cost * 100 : null, net: last ? last.net : null };
  }
  function trRenderPos() {
    var c = trCoin(TR.sym); if (!c) return;
    var v = trPosView(c), hid = state.hidden, H = function (x) { return hid ? '••••' : x; };
    $('pr-pos-sym').textContent = c.sym;
    var open = v.q > 0; $('pp-empty').hidden = open; $('pp-card').hidden = !open;
    $('pp-logo').src = coinImg(c); $('pp-pair').textContent = c.sym + '/USDT'; $('pp-net').textContent = v.net ? netOf(v.net).name : '—';
    var pl = $('pr-pos-pl'); pl.textContent = H(v.un == null ? '—' : fUsd(v.un, true)); pl.className = 'ltr ' + plCls(v.un);
    var roi = $('pp-roi'); roi.textContent = pctTxt(v.roi); roi.className = 'ltr ' + plCls(v.roi);
    $('pr-pos-q').textContent = H(niceNum(v.q, 8));
    $('pr-pos-v').textContent = H(v.val == null ? '—' : fUsd(v.val));
    $('pr-pos-avg').textContent = v.ps.avg ? fp(v.ps.avg) : '—';
    $('pp-mark').textContent = fp(v.p);
    $('pp-cost').textContent = H(v.cost ? fUsd(v.cost) : '—');
    var re = $('pp-real'); re.textContent = H(v.ps.real ? fUsd(v.ps.real, true) : '$0.00'); re.className = 'ltr ' + plCls(v.ps.real);
    // شريط يوضّح بُعد السعر الحالي عن سعر الدخول (حتى ±20%)
    var bi = $('pp-bar-i'), r = v.roi == null ? 0 : Math.max(-20, Math.min(20, v.roi));
    bi.style.background = r >= 0 ? 'var(--up)' : 'var(--dn)'; bi.style.left = r >= 0 ? '50%' : (50 + r * 2.5) + '%'; bi.style.width = Math.abs(r * 2.5) + '%';
    $('pr-pos-note').textContent = v.held && v.held > v.q + 1e-12 ? 'لديك ' + H(niceNum(v.held, 8)) + ' ' + c.sym + ' إجمالاً؛ ما لم يُشترَ من شاشة التداول لا يدخل في حساب الربح.' : '';
    var tl = trAll().filter(function (t) { return t.sym === c.sym; }), box = $('pr-trades');
    $('pp-n').textContent = tl.length; box.textContent = '';
    if (!tl.length) box.appendChild(el('div', null, 'لا صفقات على ' + c.sym + ' بعد')).className = 'pp-empty';
    tl.slice(0, 30).forEach(function (t) { box.appendChild(trRow(t)); });
  }
  document.querySelectorAll('.pp-tabs button').forEach(function (b) {
    b.onclick = function () { document.querySelectorAll('.pp-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); }); $('pp-pos').hidden = b.dataset.pp !== 'pos'; $('pp-hist').hidden = b.dataset.pp !== 'hist'; };
  });
  // بيع سريع من المركز: يفتح أمر البيع بالنسبة المختارة من الكمية المشتراة
  document.querySelectorAll('.pp-sell button').forEach(function (b) {
    b.onclick = function () {
      var c = trCoin(TR.sym), v = trPosView(c); if (!(v.q > 0)) return;
      if (v.net) TR.net = v.net;
      odOpen('sell'); if (v.net && trNets(c).indexOf(v.net) >= 0) { TR.net = v.net; odRender(); }
      var have = balOn(c.sym, TR.net), q = Math.min(v.q, have == null ? v.q : have) * Number(b.dataset.qs) / 100;
      $('od-amt').value = String(Math.floor(q * 1e8) / 1e8); TR.oq = null; odRender();
    };
  });
  function trRow(t) {
    var r = el('button'); r.type = 'button'; r.className = 'th-row'; r.style.cssText = 'width:100%;background:none;border:0;border-top:1px solid var(--div);color:var(--tx);font:inherit;text-align:start;cursor:pointer';
    var sd = el('span', null, t.side === 'buy' ? 'شراء' : 'بيع'); sd.className = 'sd ' + (t.side === 'buy' ? 'b' : 's'); r.appendChild(sd);
    var d = el('div'); d.appendChild(el('b', null, t.sym + '/USDT · ' + fp(t.price)));
    var dt = new Date(t.time); d.appendChild(el('small', null, dt.toLocaleDateString('ar') + ' · ' + dt.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) + ' · ' + netOf(t.net).name));
    if (t.status === 'PENDING') d.appendChild(el('small', null, 'قيد التنفيذ…')).className = 'pend';
    if (t.status === 'FAILED') d.appendChild(el('small', 'color:var(--err)', 'لم تكتمل'));
    r.appendChild(d);
    var e = el('div', 'flex:0 0 auto;align-items:flex-end'), am = el('span', null, (t.side === 'buy' ? '+' : '−') + niceNum(t.qty, 8) + ' ' + t.sym); am.className = 'am'; e.appendChild(am);
    e.appendChild(el('small', 'direction:ltr', (t.side === 'buy' ? '−' : '+') + fUsd(Number(t.usdt)).replace('$', '') + ' USDT')); r.appendChild(e);
    r.onclick = function () { openTrade(t); };
    return r;
  }
  function openTrade(t) {
    var buy = t.side === 'buy', p = trPrice(t.sym), kv = $('td-kv'); kv.textContent = '';
    var sd = $('td-side'); sd.textContent = buy ? 'شراء' : 'بيع'; sd.className = 'sd ' + (buy ? 'b' : 's');
    $('td-title').textContent = t.sym + '/USDT';
    var st = $('td-st'); st.textContent = t.status === 'SUCCESS' ? '✓ مكتملة' : t.status === 'FAILED' ? 'لم تكتمل' : 'قيد التنفيذ'; st.style.color = t.status === 'SUCCESS' ? 'var(--up)' : t.status === 'FAILED' ? 'var(--err)' : 'var(--warn)';
    $('td-big-l').textContent = buy ? 'الكمية المشتراة' : 'الكمية المباعة'; $('td-qty').textContent = niceNum(t.qty, 8) + ' ' + t.sym;
    var row = function (k, v, cls) { var d = el('div'); d.appendChild(el('dt', null, k)); var dd = el('dd', null, v); dd.className = 'ltr ' + (cls || ''); d.appendChild(dd); kv.appendChild(d); };
    row('سعر التنفيذ', fp(t.price) + ' USDT');
    row(buy ? 'المبلغ المدفوع' : 'المبلغ المستلم', niceNum(t.usdt, 6) + ' USDT');
    if (t.fee) row('عمولة صُرّة', niceNum(t.fee, 6) + ' ' + (buy ? 'USDT' : t.sym));
    row('الشبكة', netOf(t.net).name);
    row('الوقت', new Date(t.time).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
    if (buy && p && t.status !== 'FAILED') { var u = (p - t.price) * Number(t.qty); row('السعر الآن', fp(p)); row('الربح/الخسارة منذ الشراء', fUsd(u, true) + ' (' + pctTxt((p / t.price - 1) * 100) + ')', plCls(u)); }
    if (!buy && p && t.status !== 'FAILED') { var m = (t.price - p) * Number(t.qty); row('السعر الآن', fp(p)); row(m >= 0 ? 'وفّرت بالبيع' : 'فاتك منذ البيع', fUsd(Math.abs(m)), m >= 0 ? 'pl-up' : 'pl-dn'); }
    if (t.id && /^0x|^[0-9a-f]{64}$/i.test(t.id)) row('رقم المعاملة', t.id.slice(0, 10) + '…' + t.id.slice(-6));
    $('td-link').hidden = !t.url; $('td-link').onclick = function () { window.open(t.url, '_blank'); };
    $('td-pair').hidden = state.stack[state.stack.length - 1] === 'pair' && TR.sym === t.sym;
    $('td-pair').onclick = function () { $('td-sheet').classList.remove('show'); $('th-sheet').classList.remove('show'); openPair(t.sym); };
    $('td-sheet').classList.add('show');
  }
  $('td-close').onclick = function () { $('td-sheet').classList.remove('show'); };
  $('td-sheet').onclick = function (e) { if (e.target === this) this.classList.remove('show'); };
  // المراكز المفتوحة في شاشة السوق
  function renderOpen() {
    var box = $('tr-open-l'), list = trCoins().map(function (c) { return { c: c, v: trPosView(c) }; }).filter(function (x) { return x.v.q > 0; });
    $('tr-open').hidden = !list.length; box.textContent = ''; if (!list.length) return;
    $('tr-open-n').textContent = list.length + (list.length === 1 ? ' مركز' : ' مراكز');
    var hid = state.hidden;
    list.sort(function (a, b) { return (b.v.val || 0) - (a.v.val || 0); }).forEach(function (x) {
      var c = x.c, v = x.v, card = el('div'); card.className = 'op'; card.dataset.sym = c.sym;
      var h = el('div'); h.className = 'op-h';
      var sy = el('div'); sy.className = 'pp-sym'; var im = document.createElement('img'); im.src = coinImg(c); im.alt = ''; sy.appendChild(im);
      var nd = el('div'); nd.appendChild(el('b', 'direction:ltr', c.sym + '/USDT')); var tg = el('small', null, 'Spot' + (v.net ? ' · ' + netOf(v.net).name : '')); tg.className = 'pp-tag'; nd.appendChild(tg); sy.appendChild(nd); h.appendChild(sy);
      var pl = el('div'); pl.className = 'pp-pl'; var pb = el('b', null, hid ? '••••' : v.un == null ? '—' : fUsd(v.un, true)); pb.className = 'ltr ' + plCls(v.un); pl.appendChild(pb);
      var pr = el('small', null, pctTxt(v.roi)); pr.className = 'ltr ' + plCls(v.roi); pl.appendChild(pr); h.appendChild(pl); card.appendChild(h);
      var g = el('div'); g.className = 'op-g';
      [['الكمية', hid ? '••••' : niceNum(v.q, 6)], ['الدخول', fp(v.ps.avg)], ['الحالي', fp(v.p)]].forEach(function (k) { var d = el('div'); d.appendChild(el('span', null, k[0])); var b = el('b', null, k[1]); b.className = 'ltr'; d.appendChild(b); g.appendChild(d); });
      card.appendChild(g);
      var a = el('div'); a.className = 'op-a';
      var t1 = el('button', null, 'تفاصيل'); t1.type = 'button'; t1.onclick = function () { openPair(c.sym); };
      var t2 = el('button', null, 'بيع'); t2.type = 'button'; t2.className = 's'; t2.onclick = function () { openPair(c.sym); setTimeout(function () { var q = document.querySelector('.pp-sell button[data-qs="100"]'); if (q) q.click(); }, 50); };
      a.appendChild(t1); a.appendChild(t2); card.appendChild(a);
      box.appendChild(card);
    });
  }
  $('tr-pf-hist').onclick = function () {
    var box = $('th-list'), l = trAll(); box.textContent = '';
    if (!l.length) box.appendChild(el('div', null, 'لا صفقات بعد')).className = 'tr-empty';
    l.forEach(function (t) { box.appendChild(trRow(t)); });
    $('th-sheet').classList.add('show');
  };
  $('th-close').onclick = function () { $('th-sheet').classList.remove('show'); };
  $('th-sheet').onclick = function (e) { if (e.target === this) this.classList.remove('show'); };

  // ===== أمر الشراء/البيع =====
  function odOpen(side) {
    var c = trCoin(TR.sym); if (!c) return;
    TR.side = side; TR.oq = null; var nets = trNets(c);
    // الشبكة الافتراضية: حيث يوجد ما تدفعه (USDT للشراء، العملة للبيع)، مع تفضيل BNB Chain لرخص رسومها
    var pay = side === 'buy' ? 'USDT' : c.sym, pref = nets.slice().sort(function (a, b) { return (a === 'bsc' ? -1 : 0) - (b === 'bsc' ? -1 : 0); });
    TR.net = pref.filter(function (n) { var v = balOn(pay, n); return v != null && v > 0; })[0] || (nets.indexOf(TR.net) >= 0 ? TR.net : pref[0]);
    $('od-amt').value = ''; odRender(); $('od-sheet').classList.add('show');
  }
  function odPay() { var c = trCoin(TR.sym); return TR.side === 'buy' ? 'USDT' : c.sym; }
  function odRender() {
    var c = trCoin(TR.sym), nets = trNets(c), box = $('od-nets');
    document.querySelectorAll('#od-side button').forEach(function (b) { b.classList.toggle('on', b.dataset.side === TR.side); });
    box.textContent = ''; box.hidden = nets.length < 2;
    nets.forEach(function (k) { var n = netOf(k), b = el('button'); b.type = 'button'; b.className = 'chip' + (k === TR.net ? ' on' : ''); b.dataset.net = k;
      var im = document.createElement('img'); im.src = netLogo(k); im.alt = ''; b.appendChild(im); b.appendChild(el('span', null, n.name));
      b.onclick = function () { TR.net = k; TR.oq = null; odRender(); }; box.appendChild(b); });
    var pay = odPay(), v = balOn(pay, TR.net);
    $('od-in-l').textContent = TR.side === 'buy' ? 'تدفع (USDT)' : 'تبيع (' + c.sym + ')'; $('od-unit').textContent = pay;
    $('od-avail').textContent = state.hidden ? '••••' : v == null ? '—' : niceNum(v, 8) + ' ' + pay;
    $('od-q').hidden = !TR.oq; $('od-err').hidden = true;
    // لا يوجد ما تدفعه على هذه الشبكة: نشرح السبب ونقترح الحل بدل أن يبقى «0» بلا تفسير
    var hint = '', hgo = null;
    if (v != null && !(v > 0)) {
      if (TR.side === 'buy') {
        var other = NETS.filter(function (n) { var x = balOn('USDT', n.key); return n.key !== TR.net && x != null && x > 0; })[0];
        hint = c.sym + ' يُشترى على ' + netOf(TR.net).name + ' بعملة USDT الموجودة على نفس الشبكة، ورصيدك من USDT عليها 0.';
        if (other) { hint += ' لديك ' + niceNum(balOn('USDT', other.key), 6) + ' USDT على ' + other.name + ': انقلها أولاً (دقائق ورسوم بسيطة).'; hgo = { t: 'نقل USDT من ' + other.name + ' إلى ' + netOf(TR.net).name, f: other.key }; }
      } else hint = 'لا تملك ' + c.sym + ' على ' + netOf(TR.net).name + ' لتبيعه.';
    }
    $('od-hint').hidden = !hint; $('od-hint-t').textContent = hint;
    var hg = $('od-hint-go'); hg.hidden = !hgo; if (hgo) { var hf = hgo.f; hg.textContent = hgo.t; hg.onclick = function () { $('od-sheet').classList.remove('show'); BR.from = hf; BR.to = TR.net; BR.coin = 'USDT'; show('bridge'); }; }
    var go = $('od-go'); go.classList.toggle('sell', TR.side === 'sell'); go.disabled = !(Number($('od-amt').value) > 0);
    go.textContent = TR.oq ? (TR.side === 'buy' ? 'تأكيد شراء ' : 'تأكيد بيع ') + c.sym : 'عرض السعر';
  }
  function odErr(m) { var e = $('od-err'); e.textContent = m; e.hidden = !m; }
  document.querySelectorAll('#od-side button').forEach(function (b) { b.onclick = function () { TR.side = b.dataset.side; TR.oq = null; $('od-amt').value = ''; odOpen(TR.side); }; });
  $('od-amt').addEventListener('input', function () { TR.oq = null; odRender(); });
  document.querySelectorAll('#od-pct button').forEach(function (b) {
    b.onclick = function () {
      var pay = odPay(), v = balOn(pay, TR.net); if (v == null || !(v > 0)) return;
      var n = netOf(TR.net), keep = pay === 'TRX' && TR.net === 'tron' ? 15 : n.evm && pay === n.native ? 0.001 : 0; // نُبقي رسوم الشبكة
      var a = Math.max(0, (Number(b.dataset.p) === 100 ? v - keep : v * Number(b.dataset.p) / 100));
      $('od-amt').value = String(Math.floor(a * 1e6) / 1e6); TR.oq = null; odRender();
    };
  });
  $('od-cancel').onclick = function () { $('od-sheet').classList.remove('show'); };
  $('od-sheet').onclick = function (e) { if (e.target === this) this.classList.remove('show'); };
  $('pr-buy').onclick = function () { odOpen('buy'); };
  $('pr-sell').onclick = function () { odOpen('sell'); };
  $('od-go').onclick = async function () {
    if (state.txBusy) return;
    if (TR.oq && Date.now() - TR.oq.at < 60000) return odConfirm();
    var c = trCoin(TR.sym), pay = odPay(), amt = $('od-amt').value.trim().replace(',', '.'), v = balOn(pay, TR.net);
    if (!(Number(amt) > 0)) return odErr('أدخل المبلغ');
    if (v != null && Number(amt) > v) return odErr('الرصيد غير كافٍ على ' + netOf(TR.net).name);
    var usdIn = TR.side === 'buy' ? Number(amt) : (trPrice(c.sym) || 0) * Number(amt);
    if (usdIn && usdIn < 1) return odErr('أقل صفقة 1 دولار: المبالغ الأصغر ترفضها خدمات التبديل لأن رسوم الشبكة تقارب المبلغ نفسه');
    var n = netOf(TR.net);
    if (n.evm) { var nat = evmUnits(TR.net, n.native); if (nat != null && nat === 0n) { odErr('تحتاج قليلاً من ' + n.native + ' لرسوم الشبكة'); return openGasHelp(TR.net); } }
    var btn = this; btn.disabled = true; btn.textContent = 'جارٍ جلب السعر…'; odErr('');
    try {
      var q;
      if (TR.net === 'tron') { // TRX ↔ USDT عبر SunSwap
        var dir = TR.side === 'buy' ? 'USDT_TRX' : 'TRX_USDT', sq = await core.quoteSwap(dir, amt), min = sq.outUnits * BigInt(10000 - SWAP_SLIPPAGE_BPS) / 10000n;
        q = { tron: true, dir: dir, amount: amt, toAmount: sq.out, toAmountMin: WalletCore.fromUnits(min, 6), fee: core.feeEnabled() ? core.feeRateText() : null, gas: 'TRX' };
      } else {
        q = await core.bridgeQuote(TR.net, TR.net, pay, amt, TR.side === 'buy' ? c.sym : 'USDT');
      }
      q.at = Date.now(); q.tSide = TR.side; q.tSym = c.sym; q.tNet = TR.net; TR.oq = q;
      var got = TR.side === 'buy' ? c.sym : 'USDT', inN = Number(q.amount), outN = Number(q.toAmount);
      $('od-out').textContent = niceNum(q.toAmount, 8) + ' ' + got;
      $('od-min').textContent = niceNum(q.toAmountMin, 8) + ' ' + got;
      $('od-rate').textContent = '1 ' + c.sym + ' ≈ ' + fp(TR.side === 'buy' ? inN / outN : outN / inN) + ' USDT';
      $('od-fee').textContent = q.tron ? (q.fee || 'مجاناً') : q.appFee ? niceNum(inN * q.appFee, 6) + ' ' + pay + ' (' + (q.appFee * 100).toFixed(1).replace(/\.0$/, '') + '%)' : 'مجاناً';
      $('od-gas').textContent = q.tron ? 'بعملة TRX من رصيدك' : (Number(q.gasNative) ? niceNum(q.gasNative, 6) + ' ' + n.native + ' · ' : '') + (q.gasUsd < 0.01 ? 'أقل من $0.01' : '≈ $' + Number(q.gasUsd || 0).toFixed(2));
    } catch (e) { odErr(WalletCore.errorText(e)); TR.oq = null; }
    finally { btn.disabled = false; odRender(); }
  };
  function odConfirm() {
    var q = TR.oq; $('od-sheet').classList.remove('show');
    var run = function () { odExec(q); };
    var askPin = function () { openPin('verify', function () { state.stack.pop(); show('pair', false); run(); }); };
    if (bioEnabled()) bioVerify(q.tSide === 'buy' ? 'تأكيد الشراء' : 'تأكيد البيع').then(run).catch(askPin); else askPin();
  }
  async function odExec(q) {
    if (state.txBusy || !q || q.used) return; q.used = true; // السعر نفسه لا يُنفَّذ مرتين (نقرتان أو تأكيدان)
    state.txBusy = true; toast(q.tSide === 'buy' ? 'جارٍ الشراء…' : 'جارٍ البيع…');
    var c = trCoin(q.tSym), coinAmt = q.tSide === 'buy' ? q.toAmount : q.amount, usdtAmt = q.tSide === 'buy' ? q.amount : q.toAmount;
    var t = { id: 'T' + Date.now(), sym: q.tSym, side: q.tSide, qty: String(coinAmt), usdt: String(usdtAmt), price: Number(usdtAmt) / Number(coinAmt), net: q.tNet, time: Date.now(), status: 'PENDING', fee: q.appFee ? String(Number(q.amount) * q.appFee) : null };
    var lh = { kind: 'swap', net: q.tNet, coin: q.tSide === 'buy' ? q.tSym : 'USDT', amount: String(q.toAmount), paidAmount: q.amount, paidCoin: q.tSide === 'buy' ? 'USDT' : q.tSym, via: (q.tSide === 'buy' ? 'شراء ' : 'بيع ') + q.tSym + ' · ' + (q.tron ? 'SunSwap' : 'LI.FI'), trade: q.tSide, status: 'PENDING' };
    try {
      if (q.tron) {
        var r = await core.swap(q.dir, q.amount, SWAP_SLIPPAGE_BPS, q.toAmount);
        var ok = r.status === 'SUCCESS'; t.id = r.txid; t.url = r.url; t.status = ok ? 'SUCCESS' : 'FAILED';
        if (ok && r.out) { if (q.tSide === 'buy') t.qty = String(r.out); else t.usdt = String(r.out); t.price = Number(t.usdt) / Number(t.qty); }
        lh.txid = r.txid; lh.url = r.url; lh.status = t.status; lh.amount = String(r.out || q.toAmount);
        trSave(t); lhAdd(lh); state.balances = null; state.historyCache = null;
        toast(ok ? (q.tSide === 'buy' ? 'تم الشراء ✓' : 'تم البيع ✓') : 'لم تكتمل الصفقة', !ok);
      } else {
        var r2 = await core.bridgeExecute(q); rxExpect(q);
        t.id = r2.txid; t.url = core.evmTxUrl ? core.evmTxUrl(q.tNet, r2.txid) : ''; lh.txid = r2.txid; lh.url = t.url;
        trSave(t); lhAdd(lh); state.balances = null; state.evmBal = null; state.historyCache = null;
        state.txBusy = false; trRenderPos(); // أُرسلت: نتابع دون إيقاف التطبيق
        for (var i = 0; i < 45; i++) {
          var st = await core.bridgeStatus(r2.txid, q.tNet, q.tNet).catch(function () { return {}; });
          if (st.status === 'DONE') {
            var ra = stAmount(st, q); if (q.tSide === 'buy') t.qty = ra; else t.usdt = ra; t.price = Number(t.usdt) / Number(t.qty); lh.amount = ra;
            t.status = 'SUCCESS'; lh.status = 'SUCCESS'; if (st.link) lh.url = st.link; trSave(t); lhAdd(lh); toast(q.tSide === 'buy' ? 'تم الشراء ✓' : 'تم البيع ✓'); break;
          }
          if (st.status === 'FAILED' || st.status === 'REFUNDED') { rxUnexpect(q); t.status = 'FAILED'; lh.status = 'FAILED'; trSave(t); lhAdd(lh); toast('لم تكتمل الصفقة وبقي المبلغ في محفظتك', true); break; }
          await new Promise(function (res) { setTimeout(res, i < 15 ? 4000 : 10000); });
        }
        core.evmBalances().then(function (eb) { if (eb) { state.evmBal = eb; trRenderPos(); } }).catch(function () {});
      }
    } catch (e) { toast(WalletCore.errorText(e), true); if (e && e.message === 'LOW_GAS') openGasHelp(q.tNet); }
    finally { state.txBusy = false; TR.oq = null; if (state.stack[state.stack.length - 1] === 'pair') trRenderPos(); }
  }


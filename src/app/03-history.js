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
  // محفظة جديدة فارغة (لا رصيد على أي شبكة ولا عمليات محلية): فشل جلب السجل لا يعني شيئاً، فنعرض «لا معاملات» لا رسالة خطأ
  // (سجل TRON تحديداً: عنوان TRON بلا رصيد ولا عمليات محلية = لا سجل متوقع أصلاً)
  function isFreshWallet() {
    if (lhAll().some(function (r) { return !r.net || r.net === 'tron'; })) return false;
    var b = state.balances; return !b || (!(Number(b.usdt) > 0) && !(Number(b.trx) > 0)); // رصيد لم يُقرأ بعد: لا نفترض خطأ
  }
  function netTag(k) { return k === 'tron' || !k ? 'TRON' : (EVM[k] ? EVM[k].name : k); }
  function renderTxList(box, list, grouped) {
    box.textContent = '';
    if (!list.length) {
      if (!grouped) { box.textContent = ''; var e0 = el('div'); e0.className = 'hempty'; e0.appendChild(mascot('idle', 76)); e0.appendChild(el('small', null, 'لا توجد معاملات بعد. أول تحويل يصلك سيظهر هنا')); box.appendChild(e0); return; }
      var em = el('div', null); em.className = 'hempty';
      em.appendChild(mascot('idle', 88));
      em.appendChild(el('b', null, state.filter === 'in' ? 'لا يوجد استلام بعد' : state.filter === 'out' ? 'لا يوجد إرسال بعد' : 'لا توجد معاملات بعد'));
      em.appendChild(el('small', null, 'ستظهر هنا عملياتك بعد أول إرسال أو استلام أو تبديل'));
      box.appendChild(em); return;
    }
    var lastDay = '', group = box;
    list.forEach(function (t) {
      if (grouped) {
        var dl = dayLabel(t.time);
        if (dl !== lastDay) {
          lastDay = dl; var hd = el('div'); hd.className = 'hday'; hd.appendChild(el('span', null, dl));
          // صافي اليوم بالدولار (استلام − إرسال، بلا تبديل ونقل)
          var net = 0, has = false; list.forEach(function (x) { if (dayLabel(x.time) !== dl || x.ok === false || x.self || (x.rec && (x.rec.kind === 'swap' || x.rec.kind === 'bridge'))) return; var v = usdOf(x.amount, x.coin || 'USDT'); if (v) { has = true; net += x.incoming ? v : -v; } });
          if (has && !state.hidden) hd.appendChild(el('small', null, (net >= 0 ? '+' : '−') + usd(Math.abs(net))));
          box.appendChild(hd); group = box.appendChild(el('div', null)); group.className = 'hgroup';
        }
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
      var t1 = document.createElement('span'); t1.style.cssText = 'font-size:14px;font-weight:600'; var pnd = t.rec && t.rec.status === 'PENDING' && !t.chain && t.ok !== false;
      t1.textContent = txTitle(t);
      if (t.ok === false || pnd) { var pl = el('span', null, t.ok === false ? 'فشلت' : 'قيد التأكيد'); pl.className = 'tx-pill ' + (t.ok === false ? 'fail' : 'pend'); t1.appendChild(pl); row.classList.add(t.ok === false ? 'failed' : 'pending'); }
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
      return 'تبديل ' + (r.paidCoin || '') + ' إلى ' + r.coin;
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
    var st = $('txd-st'), pend = r.status === 'PENDING' && !t.chain, fail = t.ok === false || (r.status === 'FAILED' && !t.chain);
    st.textContent = fail ? 'فشلت' : pend ? 'بانتظار التأكيد' : 'تمت'; st.className = 'txd-st' + (fail ? ' fail' : pend ? ' pend' : '');
    var sign = kind === 'send' ? '−' : kind === 'self' ? '' : '+', a = state.hidden ? '••••' : sign + fmtExact(t.amount) + ' ' + (t.coin || 'USDT');
    $('txd-amt').textContent = a; fitAmt($('txd-amt'), a);
    $('txd-sub').textContent = kind === 'bridge' ? 'من ' + chainLabel(r.net) + ' إلى ' + chainLabel(r.toNet) : chainLabel(t.net);
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
      if (who) { kvRow(dl, kind === 'recv' ? 'من' : 'إلى', shortAddr(who), who); if (kind === 'recv' && r.src) kvRow(dl, 'النوع', srcSpan(r.src)); }
      else if (kind === 'recv') kvRow(dl, 'من', srcSpan(r.src));
    }
    kvRow(dl, 'الوقت', el('span', null, fmtWhen(t.time)));
    if (t.txid) kvRow(dl, 'رقم المعاملة', shortAddr(t.txid), t.txid);
    $('txd-note').hidden = !(r.kind && !t.txid); $('txd-note').textContent = 'هذه العملية محفوظة على جهازك. رقم المعاملة غير متوفر لها، ويمكنك رؤيتها في المستكشف من صفحة عنوانك.';
    $('txd-exp').hidden = !url; $('txd-exp').textContent = 'عرض على ' + explorerName(url);
    $('txd-exp').onclick = function () { if (url) window.open(url, '_blank'); };
    // إرسال مرة أخرى (نفس المستلم والشبكة والعملة) + مشاركة إيصال نصي
    var again = kind === 'send' && (r.to || t.counterparty) && t.net && NETS.some(function (n) { return n.key === t.net; });
    $('txd-again').hidden = !again;
    $('txd-again').onclick = function () {
      $('txd-sheet').classList.remove('show');
      state.sendNet = t.net; state.coin = t.coin || 'USDT'; renderCoinSeg(); show('send');
      $('to').value = r.to || t.counterparty; $('amt').value = ''; $('amt').focus();
      toast('تأكد من العنوان قبل الإرسال');
    };
    $('txd-share').onclick = async function () {
      // صورة إيصال (التقرير): المبلغ والعملة والشبكة والحالة والتاريخ ورقم المعاملة مختصراً، ورمز QR يفتح المعاملة في المستكشف
      // ليتحقق المستلم بنفسه. العنوان مختصر ويُخفى بخيار. بلا أي بيانات خاصة. تعذّر الصورة = الإيصال النصي كما كان
      try {
        var who0 = kind === 'recv' ? (r.from || t.counterparty) : (r.to || t.counterparty);
        var hideAddr = !who0 || !(await askConfirm('إظهار عنوان ' + (kind === 'recv' ? 'المرسل' : 'المستلم') + ' مختصراً في الإيصال؟', false, 'إظهار', 'إخفاء'));
        var png = receiptPng({ title: $('txd-title').textContent, st: $('txd-st').textContent, fail: fail, pend: pend, amt: fmtExact(t.amount), coin: t.coin || 'USDT', sign: sign,
          sub: $('txd-sub').textContent, when: fmtWhen(t.time), tx: t.txid || '', url: url, who: hideAddr ? '' : shortAddr(who0), whoL: kind === 'recv' ? 'من' : 'إلى' });
        if (await shareImage(png, 'sarra-receipt-' + (t.txid ? String(t.txid).slice(0, 10) : Date.now()) + '.png')) return;
      } catch (e) {}
      var lines = ['إيصال عملية · صُرّة', $('txd-title').textContent + ' · ' + $('txd-st').textContent, (state.hidden ? '' : $('txd-amt').textContent), $('txd-sub').textContent, fmtWhen(t.time)];
      if (t.txid) lines.push('رقم المعاملة: ' + t.txid);
      if (url) lines.push(url);
      var text = lines.filter(Boolean).join('\n');
      try { if (P.Share) await P.Share.share({ title: 'إيصال عملية', text: text }); else { copyText(text); toast('نُسخ الإيصال'); } } catch (e) {}
    };
    $('txd-sheet').classList.add('show');
  }
  // ===== رسم صورة الإيصال (Canvas، يمين لليسار) =====
  // تصميم «تذكرة»: شعار وحالة بأيقونة، المبلغ، جدول التفاصيل، حافة مثقّبة، ثم رمز QR للتحقق في المستكشف
  var RC_LOGO = null; (function () { var im = new Image(); im.onload = function () { RC_LOGO = im; }; im.src = 'assets/logo.png'; })();
  function receiptPng(o, noLogo) {
    // التخطيط يُحسب من المحتوى: صفوف التفاصيل ثم رمز QR، والبطاقة والصورة بطولهما
    var rows = [['نوع العملية', o.title], ['الحالة', o.fail ? 'فشلت' : o.pend ? 'بانتظار التأكيد' : 'مكتملة'], ['التاريخ والوقت', o.when]];
    if (o.who) rows.push([o.whoL === 'من' ? 'من عنوان' : 'إلى عنوان', o.who]);
    if (o.tx) rows.push(['رقم المعاملة', o.tx.length > 22 ? o.tx.slice(0, 10) + '…' + o.tx.slice(-8) : o.tx]);
    var hasQr = !!(o.url && typeof qrcode === 'function');
    var cy = 300, iy = cy + 120, ay = iy + 225, py = ay + 70, cut = py + 56 + 64, ry = cut + 78, qy = ry + rows.length * 74 + 24;
    var cardB = hasQr ? qy + 190 + 64 : ry + rows.length * 74 + 20, W = 1080, H = cardB + 190;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d'), FONT = '"IBM Plex Sans Arabic", "Noto Naskh Arabic", system-ui, sans-serif';
    var F = function (w, sz) { return w + ' ' + sz + 'px ' + FONT; };
    var G = '#0E8F68', INK = '#0F1A17', MU = '#6B7A77', LINE = '#E3EBE8';
    var stc = o.fail ? '#D2343A' : o.pend ? '#C27C0E' : G;
    var rr = function (X, Y, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); };
    var T = function (t, X, Y, opt) { x.direction = opt.d || 'rtl'; x.textAlign = opt.a || 'center'; x.font = opt.f; x.fillStyle = opt.c || INK; x.fillText(t, X, Y); };
    x.textBaseline = 'middle';
    // خلفية بتدرّج هادئ
    var bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#E6F4EE'); bg.addColorStop(.35, '#F3F7F5'); bg.addColorStop(1, '#F3F7F5'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
    // الرأس: الشعار والاسم
    var lx = W / 2;
    if (RC_LOGO && !noLogo) { x.save(); rr(lx - 44, 70, 88, 88, 24); x.clip(); x.drawImage(RC_LOGO, lx - 44, 70, 88, 88); x.restore(); }
    T('صُرّة', lx, 200, { f: F(800, 44), c: INK }); T('SARRA PAY · إيصال عملية', lx, 248, { f: F(600, 24), c: MU, d: 'ltr' });
    // البطاقة (تذكرة)
    var cx = 70, cw = W - 140, ch = cardB - cy;
    x.save(); x.shadowColor = 'rgba(15,26,23,.08)'; x.shadowBlur = 40; x.shadowOffsetY = 12; x.fillStyle = '#fff'; rr(cx, cy, cw, ch, 40); x.fill(); x.restore();
    // ثقبان على جانبي خط القطع + خط منقّط
    x.fillStyle = '#F3F7F5'; [cx, cx + cw].forEach(function (px) { x.beginPath(); x.arc(px, cut, 28, 0, Math.PI * 2); x.fill(); });
    x.strokeStyle = LINE; x.lineWidth = 3; x.setLineDash([14, 12]); x.beginPath(); x.moveTo(cx + 48, cut); x.lineTo(cx + cw - 48, cut); x.stroke(); x.setLineDash([]);
    // أيقونة الحالة
    x.fillStyle = stc + '1F'; x.beginPath(); x.arc(lx, iy, 66, 0, Math.PI * 2); x.fill(); x.fillStyle = stc; x.beginPath(); x.arc(lx, iy, 46, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath();
    if (o.fail) { x.moveTo(lx - 16, iy - 16); x.lineTo(lx + 16, iy + 16); x.moveTo(lx + 16, iy - 16); x.lineTo(lx - 16, iy + 16); }
    else if (o.pend) { x.moveTo(lx, iy - 20); x.lineTo(lx, iy); x.lineTo(lx + 14, iy + 12); }
    else { x.moveTo(lx - 20, iy + 1); x.lineTo(lx - 6, iy + 15); x.lineTo(lx + 21, iy - 14); }
    x.stroke();
    T(o.title + (o.fail ? ' · فشلت' : o.pend ? ' · بانتظار التأكيد' : ' · تمت بنجاح'), lx, iy + 120, { f: F(700, 36), c: INK });
    // المبلغ
    var amt = o.sign + o.amt, fs = 104; do { x.font = F(800, fs); fs -= 4; } while (x.measureText(amt + ' ' + o.coin).width > cw - 120 && fs > 44);
    x.direction = 'ltr'; x.textAlign = 'center'; var aw = x.measureText(amt).width; x.font = F(600, Math.round(fs * .5)); var cwid = x.measureText(' ' + o.coin).width;
    var ax = lx - (aw + cwid) / 2;
    x.font = F(800, fs + 4); x.textAlign = 'left'; x.fillStyle = INK; x.fillText(amt, ax, ay); x.font = F(600, Math.round(fs * .5)); x.fillStyle = MU; x.fillText(' ' + o.coin, ax + aw, ay + fs * .12);
    // شارة الشبكة
    x.font = F(600, 28); var nw = x.measureText(o.sub).width + 56; x.fillStyle = '#EEF4F2'; rr(lx - nw / 2, py, nw, 56, 28); x.fill(); T(o.sub, lx, py + 28, { f: F(600, 28), c: '#3E4D49' });
    // جدول التفاصيل
    rows.forEach(function (rw, k) {
      var y = ry + k * 74;
      T(rw[0], cx + cw - 60, y, { f: F(500, 30), c: MU, a: 'right' });
      x.direction = /[؀-ۿ]/.test(rw[1]) ? 'rtl' : 'ltr'; x.textAlign = 'left'; x.font = F(rw[0] === 'الحالة' ? 700 : 600, 30); x.fillStyle = rw[0] === 'الحالة' ? stc : INK; x.fillText(rw[1], cx + 60, y);
    });
    // رمز QR للتحقق
    if (hasQr) {
      var q = qrcode(0, 'M'); q.addData(o.url); q.make(); var n = q.getModuleCount(), cell = Math.floor(190 / n), qs = cell * n, qx = cx + 60;
      x.fillStyle = '#fff'; rr(qx - 14, qy - 14, qs + 28, qs + 28, 18); x.fill(); x.strokeStyle = LINE; x.lineWidth = 2; x.stroke();
      x.fillStyle = INK; for (var r0 = 0; r0 < n; r0++) for (var c0 = 0; c0 < n; c0++) if (q.isDark(r0, c0)) x.fillRect(qx + c0 * cell, qy + r0 * cell, cell, cell);
      x.strokeStyle = LINE; x.lineWidth = 2; x.beginPath(); x.moveTo(cx + 60, qy - 30); x.lineTo(cx + cw - 60, qy - 30); x.stroke();
      T('تحقّق من المعاملة', cx + cw - 60, qy + 40, { f: F(700, 32), c: INK, a: 'right' });
      T('امسح الرمز لفتحها على مستكشف الشبكة.', cx + cw - 60, qy + 92, { f: F(500, 26), c: MU, a: 'right' });
      T('المرجع هو المعاملة على الشبكة لا هذه الصورة.', cx + cw - 60, qy + 136, { f: F(500, 26), c: MU, a: 'right' });
    }
    // التذييل
    T('صُرّة · محفظة غير احتجازية · sarrapay.com', lx, H - 120, { f: F(600, 26), c: MU });
    T('هذا الإيصال للمعلومة وليس وثيقة رسمية.', lx, H - 76, { f: F(500, 24), c: '#9AA7A3' });
    try { return c.toDataURL('image/png'); } catch (e) { if (!noLogo) return receiptPng(o, true); throw e; } // صورة شعار من أصل آخر تمنع التصدير: نعيد الرسم بدونه
  }
  // مشاركة صورة: على الهاتف تُحفظ في مجلد مؤقت ثم نافذة المشاركة (واتساب، حفظ في المعرض…)؛ في المتصفح تنزيل
  async function shareImage(dataUrl, name) {
    var FS = P.Filesystem, b64 = String(dataUrl).split(',')[1]; if (!b64) return false;
    if (FS && P.Share) {
      var w = await FS.writeFile({ path: name, data: b64, directory: 'CACHE' });
      await P.Share.share({ title: 'إيصال عملية', files: [w.uri] }); return true;
    }
    if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) return false; // أصلي بلا الإضافة: إيصال نصي
    var a = document.createElement('a'); a.href = dataUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove(); return true;
  }
  $('txd-close').onclick = function () { $('txd-sheet').classList.remove('show'); };
  $('txd-sheet').addEventListener('click', function (e) { if (e.target === $('txd-sheet')) $('txd-sheet').classList.remove('show'); });
  async function loadHistory() {
    var box = $('history');
    var tron = [];
    try { tron = (await core.getHistory(null, 5)).map(function (t) { t.net = 'tron'; return t; }); }
    catch (e) { if (!lhAll().length) { if (!box.querySelector('button')) { if (isFreshWallet()) renderTxList(box, [], false); else emptyMsg(box, WalletCore.errorText(e)); } return; } }
    renderTxList(box, withLocal(tron).sort(function (a, b) { return b.time - a.time; }).slice(0, 5));
  }
  function renderEvmHist() {
    // الجهاز يحفظ آخر 20 عملية فقط (قرار المالك)؛ كل السجل موجود على الشبكة، وهنا روابطه لكل شبكة
    $('evm-hist').hidden = false;
    var box = $('evm-hist-links'); if (box.childNodes.length) return;
    var t = el('button', null); t.type = 'button'; t.className = 'hexp-l';
    var ti = document.createElement('img'); ti.src = netLogo('tron'); ti.alt = ''; t.appendChild(ti); t.appendChild(document.createTextNode('TRON ↗'));
    t.onclick = async function () { var a = state.lhAddr || await core.getAddress().catch(function () { return ''; }); if (a) window.open((NETWORK === 'mainnet' ? 'https://tronscan.org' : 'https://nile.tronscan.org') + '/#/address/' + a, '_blank'); };
    box.appendChild(t);
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
    // شبكة تعذّر سجلها الكامل لكن عملياتك من هذا الجهاز ظاهرة: لا داعي لتنبيه يربك المستخدم
    failed = failed.filter(function (k) { return !lhAll().some(function (r) { return r.net === k; }) && !(state.evmHist[k] && state.evmHist[k].length); });
    if (!lhAll().length && !Object.keys(state.evmHist).some(function (k) { return state.evmHist[k] && state.evmHist[k].length; }) && isFreshWallet()) failed = []; // محفظة جديدة: لا تنبيه خطأ
    if (failed.length) { note.hidden = false; note.textContent = 'تعذّر تحميل سجل ' + failed.map(netTag).join(' و') + ' الآن. يمكنك فتحه من المستكشف أدناه.'; }
    else if (!core.isUnlocked() && keys.some(function (k) { return !state.evmHist[k]; })) { note.hidden = false; note.textContent = 'افتح المحفظة بالرمز لتحديث سجل الشبكات الأخرى.'; }
    else note.hidden = true;
    applyFilter();
  }
  async function loadHistoryFull() {
    lhRecheck(); // لا ننتظره: يحدّث العمليات العالقة في الخلفية
    renderEvmHist(); buildHnetChips();
    var box = $('history-full');
    var haveTron = state.historyCache && Date.now() - state.fetchedAt.history < FRESH_MS;
    if (haveTron) { applyFilter(); loadEvmHistFor(state.hnet); return; }
    if (!state.historyCache) { box.textContent = ''; var sk = el('div'); sk.className = 'hskel'; for (var si = 0; si < 4; si++) sk.appendChild(el('i')); box.appendChild(sk); }
    state.fetchedAt.history = Date.now();
    var tronP = core.getHistory(null, state.tronLimit || 50).then(function (l) { state.historyCache = l.map(function (t) { t.net = 'tron'; return t; }); }).catch(function (e) {
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
    var q = String($('hist-q').value || '').trim().toLowerCase().replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); });
    var list = all.filter(function (t) {
      if (!(state.filter === 'all' || (state.filter === 'in') === !!t.incoming)) return false;
      if (!q) return true;
      var r = t.rec || {}, hay = [t.txid, t.counterparty, r.to, r.from, t.coin, r.paidCoin, t.amount, r.paidAmount, txTitle(t), netTag(t.net)].join(' ').toLowerCase();
      return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
    });
    $('hist-more').hidden = !!q || !(state.hnet === 'all' || state.hnet === 'tron') || !state.historyCache || state.historyCache.length < (state.tronLimit || 50) || (state.tronLimit || 50) >= 200;
    renderHistSum(all);
    if (!list.length && !lhAll().length && !state.historyCache && state.tronErr && !isFreshWallet() && state.hnet !== 'bsc' && state.hnet !== 'eth' && state.hnet !== 'polygon') return emptyMsg($('history-full'), state.tronErr);
    if (!list.length && q) { var bx = $('history-full'); bx.textContent = ''; var em = el('div'); em.className = 'hempty'; em.appendChild(el('b', null, 'لا نتائج لـ«' + q + '»')); em.appendChild(el('small', null, 'جرّب جزءاً من العنوان أو رقم المعاملة أو المبلغ')); bx.appendChild(em); return; }
    renderTxList($('history-full'), list, true);
  }
  $('hist-q').oninput = function () { $('hist-q-x').hidden = !this.value; applyFilter(); };
  $('hist-q-x').onclick = function () { $('hist-q').value = ''; this.hidden = true; applyFilter(); $('hist-q').focus(); };
  $('hist-refresh').onclick = async function () {
    var b = this; if (b.classList.contains('spin')) return; b.classList.add('spin');
    state.fetchedAt.history = 0; state.evmHistAt = {};
    try { await loadHistoryFull(); } finally { setTimeout(function () { b.classList.remove('spin'); }, 400); }
  };
  // سجل TRON: 50 معاملة أولاً، و«عرض أقدم» يضاعف حتى 200
  $('hist-more').onclick = async function () {
    var b = this; b.disabled = true; b.textContent = 'جارٍ التحميل…';
    state.tronLimit = Math.min(200, (state.tronLimit || 50) * 2);
    try { state.historyCache = (await core.getHistory(null, state.tronLimit)).map(function (t) { t.net = 'tron'; return t; }); state.fetchedAt.history = Date.now(); applyFilter(); }
    catch (e) { toast(WalletCore.errorText(e), true); }
    finally { b.disabled = false; b.textContent = 'عرض معاملات أقدم'; }
  };
  document.querySelectorAll('[data-filter]').forEach(function (c) {
    c.onclick = function () {
      state.filter = c.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(function (x) { x.classList.toggle('on', x === c); x.setAttribute('aria-selected', x === c ? 'true' : 'false'); });
      applyFilter();
    };
  });


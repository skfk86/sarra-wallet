  // ===== استلام =====
  async function loadReceive() {
    rxWatch(); // المستخدم ينتظر تحويلة: فحص أسرع
    renderNetbar($('recv-nets'), state.recvNet, function (k) { state.recvNet = k; loadReceive(); }, 'USDT');
    var n = netOf(state.recvNet), evm = !!n.evm;
    var a = evm ? await core.evmAddress() : await core.getAddress();
    $('recv-label').textContent = 'عنوان محفظتك على شبكة ' + n.name + (evm ? ' (' + n.short + ')' : '');
    $('recv-warn').firstChild.innerHTML = '';
    var w = $('recv-warn').firstChild;
    w.textContent = evm
      ? 'استلم على شبكة ' + n.name + ' (' + n.short + ') فقط، وليس من TRON.'
      : 'استلم على شبكة TRON (TRC20) فقط. الشبكات الأخرى تُضيّع المبلغ.';
    $('recv-fee').firstChild.textContent = evm
      ? '⛽ للإرسال لاحقاً تحتاج قليلاً من ' + n.native + '.'
      : '⛽ للإرسال لاحقاً تحتاج 15 TRX على الأقل.';
    var ad = $('addr'); ad.textContent = '';
    [[a.slice(0, 4), 'hl'], [a.slice(4, -4), ''], [a.slice(-4), 'hl']].forEach(function (x) { var sp = document.createElement('span'); sp.textContent = x[0]; if (x[1]) sp.className = x[1]; ad.appendChild(sp); });
    $('qr-logo').src = netLogo(n.key);
    var rc = $('recv-coins'); rc.textContent = 'يستقبل:';
    n.coins.slice(0, 6).forEach(function (c) { var im = document.createElement('img'); im.src = symLogo(c); im.alt = c; im.title = c; rc.appendChild(im); });
    if (n.coins.length > 6) { var more = document.createElement('span'); more.className = 'rc-more'; more.dir = 'ltr'; more.textContent = '+' + (n.coins.length - 6); rc.appendChild(more); }
    syncRecvPhone();
    var qr = qrcode(0, 'Q'); qr.addData(a); qr.make();
    var img = document.createElement('img');
    img.src = qr.createDataURL(8, 0); img.alt = '';
    $('qr').textContent = ''; $('qr').appendChild(img);
  }
  async function copyText(text) {
    try { if (P.Clipboard) await P.Clipboard.write({ string: text }); else await navigator.clipboard.writeText(text); toast('تم النسخ'); }
    catch (e) { toast('تعذّر النسخ', true); }
  }
  $('copy').onclick = function () { copyText($('addr').textContent); rxWatch(); };
  $('share').onclick = async function () {
    var a = $('addr').textContent;
    var n = netOf(state.recvNet);
    rxWatch();
    try { if (P.Share) await P.Share.share({ title: 'عنوان محفظتي', text: 'عنوان محفظتي على شبكة ' + n.name + ' (' + n.short + '):\n' + a }); else copyText(a); } catch (e) {}
  };

  // ===== إرسال =====
  function coinUnits() {
    if (state.sendNet !== 'tron') return evmUnits(state.sendNet, state.coin);
    var b = state.balances; if (!b) return null;
    return state.coin === 'USDT' ? b.usdtUnits : b.trxUnits;
  }
  function renderCoinSeg() {
    var n = netOf(state.sendNet), seg = $('coin-seg');
    if (n.coins.indexOf(state.coin) < 0) state.coin = n.coins[0];
    seg.style.gridTemplateColumns = 'repeat(' + n.coins.length + ',minmax(0,1fr))'; seg.classList.toggle('scroll', n.coins.length > 4);
    seg.textContent = '';
    n.coins.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.coin = c; var ci = document.createElement('img'); ci.alt = c; ci.src = symLogo(c); b.appendChild(ci); b.appendChild(document.createTextNode(c));
      var on = c === state.coin; b.className = on ? 'on' : ''; b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.onclick = function () { state.coin = c; $('amt').value = ''; renderCoinSeg(); prepareSend(); };
      seg.appendChild(b);
    });
  }
  function prepareSend() {
    $('send-err').hidden = true;
    renderNetbar($('send-nets'), state.sendNet, function (k) { state.sendNet = k; $('amt').value = ''; renderCoinSeg(); prepareSend(); }, state.coin);
    var n = netOf(state.sendNet), b = state.balances;
    $('amt-unit').textContent = state.coin;
    $('to').placeholder = n.evm ? 'عنوان 0x أو معرّف صُرّة' : 'عنوان T أو معرّف صُرّة';
    $('send-net-logo').src = netLogo(n.key); renderRecent(); updUsd();
    $('to-lbl').textContent = n.evm ? 'المستلم على ' + n.name : 'المستلم';
    $('send-warn').firstChild.textContent = n.evm
      ? 'الشبكة: ' + n.name + ' (' + n.short + ')'
      : 'الشبكة: TRON (TRC20)';
    if (n.evm) {
      var u = evmUnits(state.sendNet, state.coin), nu = evmUnits(state.sendNet, n.native);
      $('avail').textContent = u == null ? '—' : fmt(WalletCore.fromUnits(u, evmDec(state.sendNet, state.coin)), 6) + ' ' + state.coin;
      var noGas = nu != null && nu === 0n;
      $('send-fee-note').firstChild.textContent = noGas ? '⛽ لا يوجد ' + n.native + ' لدفع رسوم الشبكة، فلن يتم الإرسال.' : '⛽ الرسوم بعملة ' + n.native + ' · متاح ' + (nu == null ? '—' : fmt(WalletCore.fromUnits(nu, 18), 6));
      $('send-fee-note').style.color = noGas ? 'var(--err)' : '';
      $('send-gas-help').hidden = false; $('send-gas-help').textContent = noGas ? 'كيف أضيفه؟' : 'ما هذا؟';
    } else {
      $('avail').textContent = b ? (state.coin === 'USDT' ? b.usdt : b.trx) + ' ' + state.coin : '—';
      $('send-fee-note').firstChild.innerHTML = ''; $('send-gas-help').hidden = false; $('send-gas-help').textContent = 'ما هذا؟'; $('send-fee-note').style.color = '';
      $('send-fee-note').firstChild.textContent = '⛽ الرسوم بعملة TRX · متاح ' + (b ? b.trx : '—');
      liveFee();
    }
    if (Object.keys(EVM).length && !state.evmBal) core.evmBalances().then(function (eb) { if (!eb) return; state.evmBal = eb; if (state.stack[state.stack.length - 1] === 'send') prepareSend(); }).catch(function () {});
  }
  // تقدير رسوم TRON أثناء الكتابة: يظهر قبل المراجعة كم TRX ستُخصم تقريباً
  var feeT = null, feeSeq = 0;
  function liveFee() {
    clearTimeout(feeT);
    var to = $('to').value.trim();
    if (state.sendNet !== 'tron' || !core.estimateTronFee || !core.isValidAddress(to)) return;
    var seq = ++feeSeq, coin = state.coin;
    feeT = setTimeout(async function () {
      var e = await core.estimateTronFee(to, coin).catch(function () { return null; });
      if (!e || seq !== feeSeq || state.sendNet !== 'tron' || state.coin !== coin) return;
      var u = usdOf(e.trx, 'TRX'), b = state.balances;
      $('send-fee-note').firstChild.textContent = '⛽ الرسوم المتوقعة ≈ ' + e.trx + ' TRX' + (u != null ? ' (≈ $' + u.toFixed(2) + ')' : '') + ' · متاح ' + (b ? b.trx : '—') + (e.freshRecipient && coin === 'USDT' ? ' · مضاعفة لأن المستلم لم يستلم USDT من قبل' : '');
    }, 500);
  }
  $('to').addEventListener('input', liveFee);
  state.coin = state.coin || 'USDT'; renderCoinSeg();
  // آخر المستلمين لكل شبكة (على هذا الجهاز فقط)
  function recentList(net) { return lsJson('sarra.recent.' + net, []); }
  function saveRecent(net, to) { try { var l = recentList(net).filter(function (x) { return x !== to; }); l.unshift(to); localStorage.setItem('sarra.recent.' + net, JSON.stringify(l.slice(0, 5))); } catch (e) {} }
  function renderRecent() {
    var box = $('recent'), l = recentList(state.sendNet); box.textContent = ''; box.hidden = !l.length;
    l.forEach(function (a) { var b = document.createElement('button'); b.type = 'button'; b.textContent = asPhone(a) ? a : a.slice(0, 6) + '…' + a.slice(-4); b.title = a;
      b.onclick = function () { $('to').value = a; $('send-err').hidden = true; }; box.appendChild(b); });
  }
  function updUsd() {
    var c = COINS.filter(function (x) { return x.sym === state.coin; })[0], pr = c && priceOf(c), v = Number($('amt').value);
    $('amt-usd').textContent = pr && pr.usd && v > 0 ? '≈ $' + fmt(v * pr.usd, 2) : '';
  }
  $('amt').addEventListener('input', updUsd);
  // تلميح فوري لخانة المستلم (الشكل فقط؛ التحقق من وجود المستلم وعرض اسمه يتمان عند المراجعة)
  $('to').addEventListener('input', function () {
    var v = this.value.trim(), h = $('to-hint'), digits = v.replace(/[\s\-#@]/g, '').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); });
    h.style.color = '';
    if (!v) h.innerHTML = 'أو اكتب <b>معرّف صُرّة</b> (8 أرقام) بدل العنوان.';
    else if (asSarraId(v)) { h.textContent = '✓ معرّف صُرّة صحيح الشكل. سنعرض لك اسم المستلم للتأكيد قبل الإرسال.'; h.style.color = 'var(--ac)'; }
    else if (/^\d{1,7}$/.test(digits)) h.textContent = 'معرّف صُرّة يتكوّن من 8 أرقام (' + digits.length + '/8).';
    else if (/^\d{9,}$/.test(digits)) { h.textContent = 'عدد الأرقام أكبر من 8. تحقق من المعرّف.'; h.style.color = 'var(--err)'; }
    else h.textContent = '';
  });
  document.querySelectorAll('.pct [data-pct]').forEach(function (b) { b.onclick = function () {
    var u = coinUnits(); if (u == null) return;
    var dec = state.sendNet === 'tron' ? 6 : evmDec(state.sendNet, state.coin);
    $('amt').value = WalletCore.fromUnits(u * BigInt(b.dataset.pct) / 100n, dec); updUsd();
  }; });
  // مسح QR: ماسح Google أولاً (لا يحتاج إذن الكاميرا)، وإن لم يتوفر أو فشل
  // نفتح ماسحاً داخل التطبيق بالكاميرا (jsQR) يعمل على أي هاتف
  var Scanner = P.BarcodeScanner;
  function useScanResult(raw) {
    var addr = String(raw || '').trim().replace(/^(tron|ethereum|bnb|polygon):/i, '').split(/[?&/@]/)[0];
    var evm = state.sendNet !== 'tron';
    if (evm ? core.isEvmAddress(addr) : core.isValidAddress(addr)) { $('to').value = addr; $('send-err').hidden = true; toast('تم قراءة العنوان'); return true; }
    toast(evm ? 'الرمز لا يحتوي عنواناً صحيحاً يبدأ بـ 0x' : 'الرمز لا يحتوي عنوان TRON صحيحاً', true);
    return false;
  }
  function isCancel(e) { return /cancel/i.test((e && (e.message || e.code)) || ''); }
  $('scan').onclick = async function () {
    if (Scanner && typeof Scanner.scan === 'function') {
      try {
        var av = await Scanner.isGoogleBarcodeScannerModuleAvailable();
        if (av && av.available) {
          var r = await Scanner.scan({ formats: ['QR_CODE'] });
          var raw = r && r.barcodes && r.barcodes[0] && r.barcodes[0].rawValue;
          if (raw) useScanResult(raw);
          return;
        }
        // الوحدة غير منزّلة بعد: نبدأ تنزيلها للمرة القادمة ونستخدم الماسح الداخلي الآن
        Scanner.installGoogleBarcodeScannerModule().catch(function () {});
      } catch (e) {
        if (isCancel(e)) return;
      }
    }
    webScan();
  };

  var scanStream = null, scanLoop = 0;
  async function webScan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.jsQR) {
      toast('المسح غير مدعوم على هذا الجهاز. انسخ العنوان والصقه', true);
      return;
    }
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (e) {
      toast(/denied|permission|notallowed/i.test(e && (e.name + e.message)) ? 'اسمح للتطبيق باستخدام الكاميرا من إعدادات الهاتف' : 'تعذّر فتح الكاميرا', true);
      return;
    }
    var video = $('scan-video'), canvas = $('scan-canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    video.srcObject = scanStream;
    $('scanner').hidden = false;
    try { await video.play(); } catch (e) {}
    var tick = function () {
      if (!scanStream) return;
      if (video.readyState >= 2 && video.videoWidth) {
        var w = Math.min(video.videoWidth, 800), hgt = Math.round(video.videoHeight * w / video.videoWidth);
        canvas.width = w; canvas.height = hgt;
        ctx.drawImage(video, 0, 0, w, hgt);
        var img = ctx.getImageData(0, 0, w, hgt);
        var code = window.jsQR(img.data, w, hgt, { inversionAttempts: 'dontInvert' });
        if (code && code.data) { stopScan(); useScanResult(code.data); return; }
      }
      scanLoop = requestAnimationFrame(tick);
    };
    scanLoop = requestAnimationFrame(tick);
  }
  function stopScan() {
    cancelAnimationFrame(scanLoop);
    if (scanStream) scanStream.getTracks().forEach(function (t) { t.stop(); });
    scanStream = null;
    $('scan-video').srcObject = null;
    $('scanner').hidden = true;
  }
  $('scan-close').onclick = stopScan;

  $('paste').onclick = async function () {
    try {
      var r = P.Clipboard ? (await P.Clipboard.read()).value : await navigator.clipboard.readText();
      $('to').value = String(r || '').trim();
    } catch (e) { toast('تعذّر اللصق', true); }
  };
  $('max').onclick = function () {
    var u = coinUnits(); if (u == null) return;
    // عند إرسال كل TRX نترك 2 TRX للرسوم
    if (state.coin === 'TRX') u = u > 2000000n ? u - 2000000n : 0n;
    // عند إرسال كل العملة الأصلية على EVM نترك رسوم الإرسال (وإلا ترفض الشبكة المعاملة)
    var nn = netOf(state.sendNet);
    if (nn.evm && state.coin === nn.native) { var keep = { bsc: 100000000000000n, polygon: 10000000000000000n, eth: 300000000000000n }[nn.key] || 300000000000000n; u = u > keep ? u - keep : 0n; }
    $('amt').value = WalletCore.fromUnits(u, state.sendNet === 'tron' ? 6 : evmDec(state.sendNet, state.coin)); updUsd();
  };
  function sendError(msg) { $('send-err').textContent = msg; $('send-err').hidden = false; }
  // معرّف صُرّة: 8 أرقام لا يبدأ بصفر (الهاتف يبدأ بصفر)
  function asSarraId(v) {
    var s = String(v || '').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).replace(/[\s\-#@]/g, '');
    return /^[1-9]\d{7}$/.test(s) ? s : null;
  }
  function fmtSid(id) { var s = String(id || ''); return s.length === 8 ? s.slice(0, 4) + ' ' + s.slice(4) : s; }
  function recipLabel(v) {
    if (v.id) return (v.name || '') + ' · معرّف ' + fmtSid(v.id) + (v.verified ? ' · موثّق ✓' : '');
    return v.name + ' · ' + v.phone + ' · موثّق ✓';
  }
  // رقم هاتف سوداني؟ (09xxxxxxxx أو +249… بالأرقام العربية أو الإنجليزية)
  var PHONE_GONE = 'الإرسال برقم الهاتف لم يعد متاحاً. اطلب من المستلم معرّف صُرّة (8 أرقام) من شاشة الاستلام، أو عنوان محفظته.';
  function asPhone(v) {
    var s = String(v || '').replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).replace(/[\s\-()]/g, '').replace(/^00/, '+').replace(/^\+?249/, '0');
    return /^0\d{9}$/.test(s) ? s : null;
  }
  $('review').onclick = async function () {
    $('send-err').hidden = true;
    if (navigator.onLine === false) return sendError('لا يوجد اتصال بالإنترنت. تحقق من الاتصال ثم حاول');
    var to = $('to').value.trim(), amt = $('amt').value, via = null;
    var n = netOf(state.sendNet);
    if (n.evm) {
      if (core.isValidAddress(to)) return sendError('هذا عنوان TRON. اختر شبكة TRON للإرسال إليه، أو اطلب من المستلم عنواناً على ' + n.name);
      if (asPhone(to)) return sendError(PHONE_GONE);
      var ephone = null, esid = asSarraId(to), evia = null;
      if (esid) {
        if (!P2P_URL) return sendError('الإرسال بالمعرّف غير متاح في هذه النسخة');
        var eb = $('review'); eb.disabled = true;
        try { evia = esid ? await p2p('id.lookup', { id: esid }) : null; } catch (e) { eb.disabled = false; return sendError(p2pErr(e)); }
        eb.disabled = false;
        if (!evia.evm_address) return sendError('المستلم يستخدم نسخة قديمة من صُرّة، فلم يُسجَّل عنوانه على ' + n.name + ' بعد. أرسل له على شبكة TRON، أو اطلب منه تحديث التطبيق وفتحه');
        to = evia.evm_address;
      }
      if (!core.isEvmAddress(to)) return sendError(WalletCore.errorText(new Error('INVALID_EVM_ADDRESS')));
      var dec = evmDec(state.sendNet, state.coin), eu;
      try { eu = WalletCore.toUnitsFloor(amt, dec); } catch (e) { return sendError(WalletCore.errorText(e)); }
      var have = coinUnits();
      if (have != null && eu > have) return sendError(WalletCore.errorText(new Error('INSUFFICIENT_TOKEN')));
      var nat = evmUnits(state.sendNet, n.native);
      if (nat != null && nat === 0n) return sendError('تحتاج ' + n.native + ' في محفظتك على ' + n.name + ' لدفع رسوم الإرسال');
      state.pending = { to: to, amt: WalletCore.fromUnits(eu, dec), coin: state.coin, net: state.sendNet, phone: ephone || (esid ? String(esid) : null) };
      $('c-amt').textContent = state.pending.amt + ' ' + state.coin;
      if (evia) { $('c-to').textContent = recipLabel(evia); $('c-to').classList.remove('mono'); $('c-to').style.direction = 'rtl'; }
      else { $('c-to').textContent = to; $('c-to').classList.add('mono'); $('c-to').style.direction = ''; }
      $('c-net').textContent = n.name + ' (' + n.short + ')';
      $('c-fee').textContent = 'تُدفع بعملة ' + n.native + ' من رصيدك' + (n.key === 'bsc' || n.key === 'polygon' ? ' (عادة أقل من $0.05)' : '');
      $('c-cheaper').hidden = true; $('c-cheaper-go').hidden = true;
      $('sheet').classList.add('show');
      return;
    }
    $('c-net').textContent = 'TRON (TRC20)';
    $('c-fee').textContent = 'تُدفع بعملة TRX من رصيدك';
    if (!core.isValidAddress(to) && asPhone(to)) return sendError(PHONE_GONE);
    var phone = !core.isValidAddress(to) && (asSarraId(to) ? String(asSarraId(to)) : null);
    if (phone) {
      if (!P2P_URL) return sendError('الإرسال بالمعرّف غير متاح في هذه النسخة');
      var btn = $('review'); btn.disabled = true;
      try { via = await p2p('id.lookup', { id: phone }); to = via.address; }
      catch (e) { btn.disabled = false; return sendError(p2pErr(e)); }
      btn.disabled = false;
    }
    if (!core.isValidAddress(to)) return sendError(WalletCore.errorText(new Error('INVALID_ADDRESS')));
    var units;
    try { units = WalletCore.toUnitsFloor(amt, 6); } catch (e) { return sendError(WalletCore.errorText(e)); }
    var have = coinUnits();
    if (have != null && units > have) return sendError(state.coin === 'USDT' ? WalletCore.errorText(new Error('INSUFFICIENT_USDT')) : 'رصيد TRX غير كافٍ');
    if (state.coin === 'USDT' && state.balances && state.balances.trxUnits < 5000000n) return sendError(WalletCore.errorText(new Error('LOW_TRX_FOR_FEES')));
    var rbtn = $('review'); rbtn.disabled = true; rbtn.textContent = 'جارٍ حساب الرسوم…';
    var est = await Promise.race([core.estimateTronFee ? core.estimateTronFee(to, state.coin) : null, new Promise(function (r) { setTimeout(function () { r(null); }, 6000); })]).catch(function () { return null; });
    rbtn.disabled = false; rbtn.textContent = 'مراجعة الإرسال';
    if (est && state.balances) {
      var needSun = BigInt(Math.round(est.trx * 1e6)) + (state.coin === 'TRX' ? units : 0n);
      if (needSun > state.balances.trxUnits) return sendError('رصيد TRX لا يكفي لرسوم الشبكة: تحتاج تقريباً ' + est.trx + ' TRX' + (state.coin === 'TRX' ? ' فوق المبلغ' : '') + '، ومتاح ' + state.balances.trx + ' TRX');
    }
    $('c-fee').textContent = est ? (est.trx > 0 ? '≈ ' + est.trx + ' TRX' + (usdOf(est.trx, 'TRX') != null ? ' (≈ $' + usdOf(est.trx, 'TRX').toFixed(2) + ')' : '') : 'مجاناً (من طاقتك المجانية)') + (est.freshRecipient && state.coin === 'USDT' ? ' · المستلم لم يستلم USDT من قبل فالرسوم مضاعفة' : '') : 'تُدفع بعملة TRX من رصيدك';
    var bscU = evmUnits('bsc', 'USDT'), cheap = state.coin === 'USDT' && est && est.trx >= 3 && netOf('bsc').key === 'bsc' && EVM.bsc;
    $('c-cheaper').hidden = !cheap; $('c-cheaper-go').hidden = !(cheap && bscU != null && bscU >= units * 1000000000000n);
    if (cheap) $('c-cheaper-t').textContent = '💡 نفس التحويل على BNB Chain (BEP20) يكلّف عادة أقل من $0.05. إن كان المستلم يقبل BEP20 (مثل Binance) فاطلب منه عنوانه على BNB Chain.';
    state.pending = { to: to, amt: WalletCore.fromUnits(units, 6), coin: state.coin, via: via, phone: phone || null };
    $('c-amt').textContent = state.pending.amt + ' ' + state.coin;
    // بالرقم: نعرض الاسم المخفي جزئياً والرقم، ولا نعرض العنوان
    if (via) { $('c-to').textContent = recipLabel(via); $('c-to').classList.remove('mono'); $('c-to').style.direction = 'rtl'; }
    else { $('c-to').textContent = to; $('c-to').classList.add('mono'); $('c-to').style.direction = ''; }
    $('sheet').classList.add('show');
  };
  $('cancel-send').onclick = function () { $('sheet').classList.remove('show'); };
  $('c-cheaper-go').onclick = function () { // ننقل المبلغ نفسه إلى شاشة BNB Chain، والمستلم يُكتب من جديد (عنوان مختلف)
    var a = $('amt').value; $('sheet').classList.remove('show'); state.sendNet = 'bsc'; state.coin = 'USDT'; renderCoinSeg(); prepareSend();
    $('amt').value = a; $('to').value = ''; updUsd(); $('to').focus(); toast('اكتب عنوان المستلم على BNB Chain أو معرّف صُرّة');
  };
  // كل إرسال يحتاج تأكيد الهوية: البصمة إن كانت مفعّلة، وإلا رمز القفل
  $('confirm-send').onclick = function () {
    $('sheet').classList.remove('show');
    var askPin = function () { openPin('verify', function () { doSend(); }); };
    if (bioEnabled()) bioVerify('تأكيد الإرسال').then(doSend).catch(askPin);
    else askPin();
  };

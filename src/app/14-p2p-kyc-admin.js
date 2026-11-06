  // ===== التوثيق =====
  function openVerify(noShow, change) {
    var pf = (state.p2p.me && state.p2p.me.profile) || {}, s = pf.verify_status || 'none';
    state.p2p.verifyChange = !!change && s === 'approved';
    if (state.p2p.verifyChange) s = 'none';
    var st = $('ver-state'), steps = document.querySelectorAll('#s-p2p-verify .steps3 span');
    steps.forEach(function (x, i) { x.classList.toggle('on', i === 0 || (i === 1 && s === 'pending')); });
    st.hidden = s === 'none' && !state.p2p.verifyChange;
    if (state.p2p.verifyChange) { st.className = 'note warn'; st.textContent = 'لتغيير حساب بنكك أرسل بياناتك مع الحساب الجديد (بنفس اسمك). تتوقف إعلاناتك الحالية حتى يُقبل الطلب.'; if (pf.full_name) $('ver-name').value = pf.full_name; }
    $('ver-pending').hidden = s !== 'pending'; document.querySelector('#s-p2p-verify .steps3').hidden = s === 'pending';
    if (s === 'pending') st.hidden = true;
    if (s === 'rejected') { st.className = 'note err'; st.textContent = 'رُفض طلب التوثيق' + (pf.verify_note ? ': ' + pf.verify_note : '') + '. صحّح البيانات وأرسل مرة أخرى.'; }
    $('ver-form').hidden = s === 'pending';
    $('ver-err').hidden = true;
    if (!noShow) show('p2p-verify');
  }
  // تصغير الصورة على الجهاز إلى JPEG حتى ~1280px لتقليل حجم الرفع
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 1280 / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var q = 0.82, out = c.toDataURL('image/jpeg', q);
        while (out.length * 0.75 > 580000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
        resolve(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('BAD_ID_IMAGE')); };
      img.src = url;
    });
  }
  async function sha256Hex(s) {
    var d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(d)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  $('ver-pick').addEventListener('click', function () { state.pickingAt = Date.now(); });
  $('ver-file').onchange = async function () {
    var f = this.files && this.files[0]; if (!f) return;
    try {
      state.p2p.idImg = await compressImage(f);
      $('ver-prev').src = state.p2p.idImg; $('ver-prev').hidden = false; $('ver-pick-txt').hidden = true;
    } catch (e) { toast(p2pErr(e), true); }
  };
  $('ver-go').onclick = async function () {
    var btn = this; $('ver-err').hidden = true;
    if (!state.p2p.idImg) { $('ver-err').textContent = 'أضف صورة الهوية'; $('ver-err').hidden = false; return; }
    btn.disabled = true;
    try {
      await p2p('verify.submit', {
        full_name: $('ver-name').value, phone: asPhone($('ver-phone').value) || $('ver-phone').value, bankak_account: $('ver-acct').value,
        image_sha256: await sha256Hex(state.p2p.idImg), change: !!state.p2p.verifyChange,
        phone_link: $('ver-phone-link').checked, evm: (await core.evmAddress().catch(function () { return null; })) || undefined
      }, false, state.p2p.idImg);
      try { localStorage.setItem('sarra.wantPhone', $('ver-phone-link').checked ? '1' : '0'); } catch (e) {}
      state.p2p.idImg = null; state.p2p.verifyChange = false;
      state.p2p.me = await fetchMe(true); renderMe();
      toast('أُرسل طلب التوثيق');
      openVerify(true);
    } catch (e) { $('ver-err').textContent = p2pErr(e); $('ver-err').hidden = false; }
    btn.disabled = false;
  };
  $('adm-verify').onclick = async function () {
    var box = $('adm-verify-list'); emptyMsg(box, 'جارٍ التحميل…');
    try {
      var list = (await p2p('admin.verify.list')).pending;
      box.textContent = '';
      if (!list.length) return emptyMsg(box, 'لا توجد طلبات توثيق');
      list.forEach(function (v) {
        var c = el('div'); c.className = 'ad';
        c.appendChild(el('b', 'font-size:15px', v.full_name));
        if (v.change_from) c.appendChild(el('span', 'font-size:12px;font-weight:700;color:var(--warn)', 'طلب تغيير حساب: من ' + v.change_from + ' إلى ' + v.bankak_account + ' (الرفض يعيد الحساب القديم)'));
        c.appendChild(el('span', 'font-size:13px;color:var(--mu);direction:ltr;text-align:right', v.phone + ' · بنكك ' + v.bankak_account));
        c.appendChild(el('span', 'font-size:11px;color:var(--mu);direction:ltr;word-break:break-all', v.address));
        if (v.image_url) { var im = el('img', 'width:100%;border-radius:12px'); im.src = v.image_url; im.alt = 'صورة الهوية'; c.appendChild(im); }
        var row = el('div', 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px');
        var ok = el('button', null, 'قبول'); ok.type = 'button'; ok.className = 'btn btn-primary'; ok.style.height = '44px';
        var no = el('button', 'color:var(--err)', 'رفض'); no.type = 'button'; no.className = 'btn btn-ghost'; no.style.height = '44px';
        var decide = async function (approve) {
          var note = approve ? '' : await askConfirm('سبب الرفض (يراه المستخدم):', true);
          if (!approve && !note) return;
          try { await p2p('admin.verify.decide', { address: v.address, approve: approve, note: note }); toast(approve ? 'تم التوثيق' : 'تم الرفض'); c.remove(); }
          catch (e) { toast(p2pErr(e), true); }
        };
        ok.onclick = function () { decide(true); }; no.onclick = function () { decide(false); };
        row.appendChild(ok); row.appendChild(no); c.appendChild(row);
        box.appendChild(c);
      });
    } catch (e) { emptyMsg(box, p2pErr(e)); }
  };

  // ===== طلباتي ولوحة المشرف =====
  var STATUS = {
    awaiting_deposit: ['بانتظار إيداع البائع في الضمان', 'warn'], funded: ['محجوز في الضمان · حوّل المبلغ عبر بنكك', 'ok'],
    paid: ['المشتري أكّد الدفع · بانتظار تأكيد البائع', 'warn'], releasing: ['جارٍ إرسال USDT للمشتري…', 'warn'],
    released: ['اكتملت الصفقة ✓', 'ok'], release_failed: ['تأخر الإرسال · المشرف يتابع', 'err'],
    cancelled: ['أُلغي الطلب', 'warn'], refunding: ['جارٍ إرجاع USDT للبائع…', 'warn'], refunded: ['أُعيد USDT للبائع', 'warn'],
    refund_failed: ['تأخر الإرجاع · المشرف يتابع', 'err'], disputed: ['نزاع مفتوح · المشرف يراجع الأدلة', 'err']
  };
  function renderOrderList(box, list, adminView) {
    box.textContent = '';
    if (!list.length) return emptyMsg(box, adminView ? 'لا توجد نزاعات' : 'لا توجد طلبات');
    list.forEach(function (o) {
      var me = state.p2p.me && state.p2p.me.profile ? state.p2p.me.profile.address : null;
      var mine = adminView ? '' : (o.buyer === me ? 'شراء' : 'بيع');
      var row = el('button', 'width:100%;text-align:start;background:var(--s1);border:1px solid var(--line);border-radius:16px;padding:12px 14px;margin-bottom:8px;display:flex;flex-direction:column;gap:4px;color:inherit;font:inherit;cursor:pointer');
      row.type = 'button';
      row.appendChild(el('b', 'font-size:14px', (mine ? mine + ' ' : '') + fmt(o.amount_usdt) + ' USDT · ' + fmt(o.total_sdg) + ' ج.س'));
      row.appendChild(el('span', 'font-size:12px;color:var(--mu)', (STATUS[o.status] || [o.status])[0] + ' · ' + new Date(o.created_at).toLocaleString('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
      row.onclick = function () { openOrder(o.id); };
      box.appendChild(row);
    });
  }
  $('p2p-orders-btn').onclick = async function () {
    if (!(await ensureProfile())) return;
    $('orders-title').textContent = 'طلباتي'; show('p2p-orders');
    emptyMsg($('orders-list'), 'جارٍ التحميل…');
    try { renderOrderList($('orders-list'), (await p2p('orders.mine')).orders, false); } catch (e) { emptyMsg($('orders-list'), p2pErr(e)); }
  };
  // ===== لوحة الأدمن =====
  state.p2p.band = 3;
  function admRange() {
    var v = Number($('adm-rate').value), b = state.p2p.band;
    $('adm-range').textContent = v > 0 ? 'سيُقبل من ' + fmt(v * (1 - b / 100)) + ' إلى ' + fmt(v * (1 + b / 100)) + ' ج.س' : '';
  }
  $('adm-rate').oninput = admRange;
  document.querySelectorAll('[data-band]').forEach(function (b) {
    b.onclick = function () { state.p2p.band = Number(b.dataset.band); document.querySelectorAll('[data-band]').forEach(function (x) { x.classList.toggle('on', x === b); }); admRange(); };
  });
  $('p2p-admin-btn').onclick = async function () {
    show('p2p-admin');
    var r = state.p2p.rate;
    if (r && r.sdg_per_usdt) {
      $('adm-rate').value = r.sdg_per_usdt; state.p2p.band = r.band_pct || 3;
      document.querySelectorAll('[data-band]').forEach(function (x) { x.classList.toggle('on', Number(x.dataset.band) === state.p2p.band); });
    }
    admRange();
    var box = $('adm-stats'); box.textContent = '';
    try {
      var s = await p2p('admin.stats');
      [['طلبات توثيق', s.pending_verify || 0], ['المستخدمون', s.users], ['إعلانات نشطة', s.active_offers], ['طلبات مفتوحة', s.open_orders], ['نزاعات', s.disputes], ['صفقات مكتملة', s.completed]].forEach(function (x) {
        var c = el('div', 'background:var(--s1);border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:2px');
        c.appendChild(el('span', 'font-size:12px;color:var(--mu)', x[0])); c.appendChild(el('b', 'font-size:20px', String(x[1])));
        box.appendChild(c);
      });
      state.admEarn = s.earnings || null; renderEarn();
    } catch (e) { toast(p2pErr(e), true); }
  };
  state.earnP = 'd30';
  function renderEarn() {
    var e = state.admEarn, k = state.earnP, x = e && e[k];
    document.querySelectorAll('[data-ep]').forEach(function (b) { b.classList.toggle('on', b.dataset.ep === k); });
    $('adm-earn-com').textContent = x ? fmtExact(x.commission) : '—';
    $('adm-earn-sub').textContent = x ? 'من ' + x.trades + ' صفقة مكتملة' : 'يتطلب نشر آخر تحديث لدالة p2p';
    var dl = $('adm-earn-kv'); dl.textContent = '';
    if (x) { kvRow(dl, 'حجم التداول', fmtExact(x.volume) + ' USDT'); kvRow(dl, 'رسوم الشبكة المحصّلة', fmtExact(x.net_fees) + ' USDT'); kvRow(dl, 'أين هي؟', el('span', 'direction:rtl;unicode-bidi:isolate', 'رصيد حسابك في OxaPay')); }
    var ob = $('adm-earn-other'); ob.textContent = '';
    function src(title, text, url, label) {
      var r = el('div'); r.className = 'earn-src'; var d = el('div'); d.appendChild(el('b', null, title)); d.appendChild(el('small', null, text)); r.appendChild(d);
      if (url) { var a = el('button', null, label || 'فتح'); a.type = 'button'; a.className = 'chip'; a.style.flexShrink = '0'; a.onclick = function () { window.open(url, '_blank'); }; r.appendChild(a); }
      ob.appendChild(r);
    }
    if (core.feeEnabled && core.feeEnabled()) src('عمولة التبديل على TRON (' + core.feeRateText() + ')', 'تصل TRX مباشرة إلى عنوان العمولة.', core.network.explorer.replace('#/transaction/', '#/address/') + CFG.feeAddress, 'العنوان');
    else src('عمولة التبديل على TRON', 'غير مفعّلة: لم يُضبط SARRA_FEE_ADDRESS في متغيرات GitHub، فلا تُخصم عمولة.', null);
    if (CFG.lifiFee > 0 || CFG.lifiSwapFee > 0) src('عمولة LI.FI: التبديل ' + ((CFG.lifiSwapFee != null ? CFG.lifiSwapFee : CFG.lifiFee) * 100) + '% · النقل ' + (CFG.lifiFee * 100) + '%', 'تتجمع في عقود LI.FI باسم المُدمِج "' + (CFG.lifiIntegrator || 'surra-sd') + '" وتُسحب من بوابة LI.FI بعد تسجيله وربط محفظتك.', 'https://portal.li.fi', 'البوابة');
    else src('عمولة التبديل والنقل عبر LI.FI', 'غير مفعّلة في هذه النسخة (SARRA_LIFI_FEE = 0).', null);
  }
  document.querySelectorAll('[data-ep]').forEach(function (b) { b.onclick = function () { state.earnP = b.dataset.ep; renderEarn(); }; });
  $('adm-rate-go').onclick = async function () {
    try {
      var r = await p2p('admin.rate.set', { sdg_per_usdt: $('adm-rate').value, band_pct: state.p2p.band });
      renderRate(r.rate, r.range); toast('تم حفظ سعر الصرف');
    } catch (e) { toast(p2pErr(e), true); }
  };
  async function admBan(banned) {
    var a = $('adm-ban-addr').value.trim();
    if (!core.isValidAddress(a)) return toast('عنوان المحفظة غير صحيح', true);
    if (banned && !(await askConfirm('حظر هذه المحفظة من السوق؟ ستتوقف كل إعلاناتها.'))) return;
    try { await p2p('admin.ban', { address: a, banned: banned }); toast(banned ? 'تم الحظر' : 'تم رفع الحظر'); $('adm-ban-addr').value = ''; }
    catch (e) { toast(p2pErr(e), true); }
  }
  $('adm-ban').onclick = function () { admBan(true); };
  $('adm-unban').onclick = function () { admBan(false); };
  $('adm-queue').onclick = async function () {
    $('orders-title').textContent = 'النزاعات والمعاملات المتأخرة'; show('p2p-orders');
    emptyMsg($('orders-list'), 'جارٍ التحميل…');
    try { renderOrderList($('orders-list'), (await p2p('admin.queue')).orders, true); } catch (e) { emptyMsg($('orders-list'), p2pErr(e)); }
  };

  // ===== شاشة الطلب =====
  function openOrder(id, fresh) {
    state.p2p.orderId = id; state.p2p.order = null; state.p2p.orderSig = null;
    $('ord-chat').textContent = ''; $('ord-actions').textContent = ''; $('ord-kv').textContent = '';
    $('ord-status').textContent = 'جارٍ التحميل…'; $('ord-status').className = 'note';
    if (fresh) { state.stack.pop(); }
    show('order');
    refreshOrder('order.get');
  }
  // ===== إيصالات بنكك =====
  function pickReceipt() { state.pickingAt = Date.now(); $('rcpt-file').value = ''; $('rcpt-file').click(); }
  $('rcpt-file').onchange = async function () {
    var f = this.files && this.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) return toast('اختر صورة الإيصال (لقطة شاشة من تطبيق بنكك)', true);
    if (f.size > 15 * 1048576) return toast('الصورة كبيرة جداً', true);
    toast('جارٍ رفع الإيصال…');
    try {
      var data = await compressImage(f);
      var id = state.p2p.orderId;
      var r = await p2p('receipt.upload', { id: id, sha256: await sha256Hex(data) }, false, data);
      if (state.p2p.orderId === id) renderOrder(r);
      toast('تم رفع الإيصال، ويراه البائع الآن');
    } catch (e) { toast(p2pErr(e), true); }
  };
  async function showReceipts() {
    var box = $('rcpt-list'); box.textContent = 'جارٍ التحميل…'; $('rcpt-view').classList.add('show');
    try {
      var list = (await p2p('receipt.list', { id: state.p2p.orderId })).receipts; box.textContent = '';
      list.forEach(function (x) {
        var im = el('img', 'width:100%;border-radius:12px;border:1px solid var(--line);background:var(--s1)'); im.src = x.url; im.alt = 'إيصال';
        box.appendChild(im); box.appendChild(el('span', 'font-size:11px;color:var(--mu);direction:ltr;text-align:right', new Date(x.created_at).toLocaleString('ar-EG')));
      });
      if (!list.length) box.textContent = 'لا توجد إيصالات';
    } catch (e) { box.textContent = p2pErr(e); }
  }
  $('rcpt-close').onclick = function () { $('rcpt-view').classList.remove('show'); $('rcpt-list').textContent = ''; };
  async function refreshOrder(action, params) {
    var id = state.p2p.orderId; if (!id) return;
    try {
      var r = await p2p(action || 'order.get', Object.assign({ id: id }, params || {}));
      if (state.p2p.orderId !== id) return;
      renderOrder(r);
    } catch (e) { toast(p2pErr(e), true); if (action && action !== 'order.get') refreshOrder('order.get'); }
  }
  function kv(dl, k, v, ltr) { var d = el('div'); d.appendChild(el('dt', null, k)); var dd = el('dd', ltr ? 'direction:ltr' : null, v); d.appendChild(dd); dl.appendChild(d); }
  function actionBtn(label, kind, fn) {
    var b = el('button', null, label); b.type = 'button';
    b.className = 'btn ' + (kind === 'primary' ? 'btn-primary' : 'btn-ghost');
    if (kind === 'danger') b.style.cssText = 'color:var(--err)';
    b.onclick = fn; $('ord-actions').appendChild(b); return b;
  }
  async function doAction(act, confirmText, needAuth) {
    var run = function () { refreshOrder('order.action', { action: act, reason: state.p2p.reason || '' }); };
    if (confirmText && !(await askConfirm(confirmText))) return;
    if (needAuth) authorize('تأكيد العملية', run); else run();
  }
  function renderOrder(r) {
    var o = r.order, role = r.role; state.p2p.order = o; state.p2p.role = role;
    var st = STATUS[o.status] || [o.status, 'warn'];
    $('ord-title').textContent = (role === 'buyer' ? 'شراء ' : role === 'seller' ? 'بيع ' : 'نزاع ') + fmt(o.amount_usdt) + ' USDT';
    var other = role === 'buyer' ? o.seller_profile : o.buyer_profile;
    $('ord-sub').textContent = role === 'admin' ? (o.buyer_profile || {}).nickname + ' ← ' + (o.seller_profile || {}).nickname : 'مع ' + ((other || {}).nickname || '—');
    $('ord-status').textContent = st[0]; $('ord-status').className = 'note ' + st[1];
    var dl = $('ord-kv'); dl.textContent = '';
    kv(dl, 'المبلغ بالجنيه', fmt(o.total_sdg) + ' ج.س');
    kv(dl, 'السعر', fmt(o.price_sdg) + ' ج.س / USDT');
    kv(dl, 'الشبكة', netLabel(o.network));
    kv(dl, 'يستلم المشتري', fmt(o.buyer_receives, 6) + ' USDT', true);
    kv(dl, 'العمولة ورسوم الشبكة', fmt(o.fee_usdt, 6) + ' USDT', true);
    if (o.pay_deadline && o.status === 'funded') kv(dl, 'آخر موعد للدفع', new Date(o.pay_deadline).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }));
    if (o.deposit_address && o.status === 'awaiting_deposit') {
      var gw = Math.max(0, Math.round((Number(o.deposit_amount) - Number(o.amount_usdt)) * 1e6) / 1e6);
      kv(dl, 'كمية البيع', fmt(o.amount_usdt, 6) + ' USDT');
      kv(dl, 'رسوم بوابة الضمان', fmt(gw, 6) + ' USDT');
      kv(dl, 'المبلغ الكامل للإيداع', fmt(o.deposit_amount, 6) + ' USDT', true);
      if (role === 'seller') {
        var bep = o.network === 'BEP20', wn = el('div', 'margin-top:4px;line-height:1.8;font-size:13px');
        wn.className = 'note warn';
        wn.textContent = '⚠️ يجب أن يصل إلى الضمان ' + fmt(o.deposit_amount, 6) + ' USDT كاملة (الكمية + رسوم البوابة). أي مبلغ أقل لا يُفعّل الصفقة ويحتاج استرداداً يدوياً. '
          + 'رسوم الشبكة تُدفع منفصلة بعملة ' + (bep ? 'BNB (أقل من 0.01$)' : 'TRX (نحو 13 TRX)') + ' من محفظتك، ولا تُخصم من USDT. '
          + 'اضغط زر "إيداع" هنا فقط، ولا ترسل يدوياً من محفظة أو منصة أخرى.';
        dl.appendChild(wn);
      }
    }
    var showBank = !!o.bankak_account && role !== 'seller';
    $('ord-bank').hidden = !showBank;
    if (showBank) { $('ord-bname').textContent = o.bankak_name; $('ord-bacct').textContent = o.bankak_account; $('ord-bamt').textContent = String(o.total_sdg); }
    var stepIdx = { awaiting_deposit: 0, funded: 1, paid: 2, releasing: 2, released: 3, disputed: 2 }[o.status];
    document.querySelectorAll('#ord-steps span').forEach(function (x, i) { x.classList.toggle('on', stepIdx != null && i <= Math.min(stepIdx, 2)); });
    state.p2p.deadline = o.status === 'funded' ? o.pay_deadline : o.status === 'awaiting_deposit' ? o.deposit_expires_at : null;
    $('ord-timer-lbl').textContent = o.status === 'funded' ? 'الوقت المتبقي للدفع' : 'الوقت المتبقي لإيداع البائع';
    tickTimer();

    $('ord-actions').textContent = '';
    var s = o.status;
    var depKey = 'sarra.dep.' + o.id, depSent = null; try { depSent = localStorage.getItem(depKey); } catch (e) {}
    if (role === 'seller' && s === 'awaiting_deposit' && o.deposit_address && depSent) {
      kv(dl, 'حالة الإيداع', 'أُرسل من محفظتك، بانتظار تأكيد الضمان (دقيقة إلى 5 دقائق)', true);
      actionBtn('تحقق من الإيداع', 'primary', function () { refreshOrder('order.refresh'); });
    } else if (role === 'seller' && s === 'awaiting_deposit' && o.deposit_address) {
      actionBtn('إيداع ' + fmt(o.deposit_amount, 6) + ' USDT في الضمان', 'primary', function () {
        var b = this;
        authorize('إيداع في الضمان', async function () {
          b.disabled = true; toast('جارٍ الإيداع…');
          try { var sent = localStorage.getItem(depKey); if (sent) { toast('أرسلت الإيداع مسبقاً. اضغط "تحقق من الإيداع"'); return; } } catch (e) {}
          try { var dr = o.network === 'BEP20' ? await core.evmSend('bsc', 'USDT', o.deposit_address, String(o.deposit_amount)) : await core.sendUSDT(o.deposit_address, String(o.deposit_amount)); lhAdd({ kind: 'send', net: o.network === 'BEP20' ? 'bsc' : 'tron', coin: 'USDT', amount: String(o.deposit_amount), to: o.deposit_address, via: 'إيداع في ضمان P2P', txid: dr && dr.txid, url: dr && dr.url, status: (dr && dr.status) || 'SUCCESS' }); try { localStorage.setItem(depKey, String(Date.now())); } catch (e) {} state.balances = null; state.historyCache = null; toast('تم الإيداع، بانتظار تأكيد الضمان'); }
          catch (e) { toast(WalletCore.errorText(e), true); }
          b.disabled = false; refreshOrder('order.refresh');
        });
      });
      actionBtn('تحقق من الإيداع', 'ghost', function () { refreshOrder('order.refresh'); });
    }
    var rc = o.receipts || 0;
    if (role === 'buyer' && ['funded', 'paid', 'disputed'].indexOf(s) >= 0 && rc < 3) actionBtn(rc ? '📎 رفع إيصال آخر (' + rc + '/3)' : '📎 رفع إيصال تحويل بنكك', s === 'funded' ? 'ghost' : 'primary', pickReceipt);
    if ((role === 'seller' || role === 'admin') && rc) actionBtn('🧾 عرض إيصال الدفع (' + rc + ')', 'ghost', showReceipts);
    if (role === 'buyer' && s === 'funded') actionBtn('حوّلت المبلغ عبر بنكك', 'primary', function () { doAction('mark_paid', 'هل حوّلت ' + fmt(o.total_sdg) + ' ج.س فعلاً إلى حساب البائع؟ الادعاء الكاذب يؤدي لحظر حسابك.'); });
    if (role === 'seller' && (s === 'funded' || s === 'paid')) actionBtn('استلمت المبلغ · حرّر USDT', 'primary', function () { doAction('release', 'تأكد أن ' + fmt(o.total_sdg) + ' ج.س وصلت فعلاً إلى حسابك في بنكك. لا يمكن التراجع بعد التحرير.', true); });
    if ((role === 'buyer' || role === 'seller') && s === 'paid') actionBtn('فتح نزاع', 'danger', async function () {
      var reason = await askConfirm('اكتب سبب النزاع باختصار. سيراجع المشرف المحادثة وإيصال بنكك.', true);
      if (!reason) return; state.p2p.reason = reason; doAction('dispute');
    });
    if (s === 'awaiting_deposit' && role !== 'admin') actionBtn('إلغاء الطلب', 'danger', function () { doAction('cancel', 'إلغاء الطلب؟'); });
    if (role === 'buyer' && s === 'funded') actionBtn('إلغاء الطلب (يعود USDT للبائع)', 'danger', function () { doAction('cancel', 'إلغاء الطلب؟ لا تلغِ إن كنت قد حوّلت المبلغ. يُعاد USDT للبائع بعد خصم ' + netFeeOf(o) + ' USDT رسوم الشبكة.'); });
    if (role === 'seller' && s === 'funded' && o.pay_deadline && Date.now() > Date.parse(o.pay_deadline)) actionBtn('انتهت المهلة · استرد USDT', 'danger', function () { doAction('cancel', 'استرداد USDT وإلغاء الطلب؟ يُخصم ' + netFeeOf(o) + ' USDT رسوم شبكة الإرسال من المبلغ المُعاد.', true); });
    if (role === 'admin') {
      // فشل سابق مجهول النتيجة: قد يكون OxaPay أرسل المال فعلاً، فإعادة المحاولة قد تدفع مرتين
      var unk = /^UNKNOWN_RESULT/.test(o.payout_error || ''), warnTxt = unk ? '⚠️ المحاولة السابقة انقطعت ولا نعرف نتيجتها. افتح لوحة OxaPay ← Payouts وتأكد أنه لا توجد دفعة لهذا الطلب قبل المتابعة، وإلا سيُدفع المبلغ مرتين. ' : '';
      if (o.payout_error) kv(dl, 'خطأ الإرسال', o.payout_error);
      if (['disputed', 'release_failed'].indexOf(s) >= 0) actionBtn('حكم: حرّر للمشتري', 'primary', function () { doAction('admin_release', warnTxt + 'تحرير USDT للمشتري؟', true); });
      if (['disputed', 'refund_failed', 'funded'].indexOf(s) >= 0) actionBtn('حكم: أرجع للبائع', 'danger', function () { doAction('admin_refund', warnTxt + 'إرجاع USDT للبائع؟', true); });
      if (o.dispute_reason) kv(dl, 'سبب النزاع', o.dispute_reason);
    }

    var chat = $('ord-chat'), atBottom = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 10;
    chat.textContent = '';
    if (!r.messages.length) chat.appendChild(el('span', 'font-size:13px;color:var(--mu)', 'لا رسائل بعد'));
    r.messages.forEach(function (m) {
      var mine = m.sender === (state.p2p.me && state.p2p.me.profile && state.p2p.me.profile.address);
      var who = m.sender === o.buyer ? 'المشتري' : m.sender === o.seller ? 'البائع' : 'المشرف';
      var b = el('div', 'max-width:85%;padding:8px 12px;border-radius:14px;font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word;' + (mine ? 'align-self:flex-start;background:var(--ok-bg)' : 'align-self:flex-end;background:var(--s2)'));
      b.appendChild(el('span', 'display:block;font-size:11px;color:var(--mu)', mine ? 'أنت' : who));
      b.appendChild(document.createTextNode(m.body));
      chat.appendChild(b);
    });
    if (atBottom) chat.scrollTop = chat.scrollHeight;
  }
  $('ord-send').onclick = async function () {
    var v = $('ord-msg').value.trim(); if (!v) return;
    $('ord-msg').value = '';
    await refreshOrder('message.send', { body: v });
  };
  $('ord-msg').onkeydown = function (e) { if (e.key === 'Enter') $('ord-send').click(); };
  $('ord-copy').onclick = function () { copyText($('ord-bacct').textContent); };
  $('ord-copy-amt').onclick = function () { copyText($('ord-bamt').textContent); };
  function tickTimer() {
    var d = state.p2p.deadline; $('ord-timer').hidden = !d;
    if (!d) return;
    var left = Math.max(0, Math.floor((Date.parse(d) - Date.now()) / 1000));
    $('ord-timer-val').textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
    $('ord-timer-val').style.color = left < 120 ? 'var(--err)' : '';
  }
  setInterval(function () { if (state.stack[state.stack.length - 1] === 'order') tickTimer(); }, 1000);
  // تحديث تلقائي للطلب المفتوح كل 6 ثوانٍ
  // شاشة الطلب: كل 6 ثوانٍ نفحص "نسخة" الطلب من قاعدة البيانات (رقمان فقط، بدون Edge Function)،
  // ونجلب الطلب كاملاً من الخادم فقط عندما يتغير شيء (حالة جديدة أو رسالة جديدة).
  // البائع بانتظار الإيداع: نسأل OxaPay عبر الخادم كل 30 ثانية احتياطاً لإشعار الإيداع.
  var orderTick = 0;
  setInterval(async function () {
    var cur = state.stack[state.stack.length - 1];
    if (cur !== 'order' || !state.p2p.orderId || document.hidden || !core.isUnlocked()) return;
    orderTick++;
    var o = state.p2p.order, id = state.p2p.orderId;
    if (o && o.status === 'awaiting_deposit' && state.p2p.role === 'seller' && orderTick % 5 === 0) return refreshOrder('order.refresh');
    // انتهت مهلة الإيداع: الخادم يلغي الطلب عند أول سؤال، فنسأله
    if (o && o.status === 'awaiting_deposit' && o.deposit_expires_at && Date.now() > Date.parse(o.deposit_expires_at) + 60000 && orderTick % 5 === 0) return refreshOrder('order.get');
    var tok = state.p2p.me && state.p2p.me.profile && state.p2p.me.profile.inbox_token;
    if (!tok || state.p2p.role === 'admin') return refreshOrder('order.get');
    try {
      var ver = await rpc('p2p_order_ver', { p_token: tok, p_order: id });
      if (state.p2p.orderId !== id) return;
      var sig = ver ? ver.v + ':' + ver.m + ':' + ver.s : 'x';
      if (sig !== state.p2p.orderSig) { state.p2p.orderSig = sig; refreshOrder('order.get'); }
    } catch (e) { if (e.message === 'NO_REST' || orderTick % 3 === 0) refreshOrder('order.get'); }
  }, 6000);


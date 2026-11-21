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
        if (v.dups && v.dups.length) {
          var banned = v.dups.some(function (d) { return d.banned; });
          c.appendChild(el('span', 'font-size:12px;font-weight:700;color:var(--err)', '⚠️ نفس رقم الهاتف أو حساب بنكك مستخدم في ' + v.dups.length + ' محفظة أخرى' + (banned ? '، منها محفظة محظورة' : '') + '. قد يكون شخصاً يفتح حسابات متعددة أو ينتحل هوية غيره: ' + v.dups.map(function (d) { return d.address.slice(0, 6) + '…' + d.address.slice(-4) + (d.banned ? ' (محظورة)' : d.verified ? ' (موثّقة)' : ''); }).join('، ')));
        }
        if (v.image_url) { var im = el('img', 'width:100%;border-radius:12px'); im.src = v.image_url; im.alt = 'صورة الهوية'; c.appendChild(im); }
        var row = el('div', 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px');
        var ok = el('button', null, 'قبول'); ok.type = 'button'; ok.className = 'btn btn-primary'; ok.style.height = '44px';
        var no = el('button', 'color:var(--err)', 'رفض'); no.type = 'button'; no.className = 'btn btn-ghost'; no.style.height = '44px';
        var decide = async function (approve) {
          if (approve && !(await askConfirm('قبول توثيق ' + v.full_name + '؟ تأكد أن الاسم في الهوية يطابق الاسم المكتوب، وأن الصورة واضحة. بعد القبول يستطيع البيع في السوق.' + (v.dups && v.dups.length ? ' ⚠️ انتبه: بياناته مكررة في محفظة أخرى.' : '')))) return;
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
    released: ['اكتملت الصفقة', 'ok'], release_failed: ['تأخر الإرسال · المشرف يتابع', 'err'],
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
      state.admEarn = s.earnings || null; renderEarn(); state.admGw = s.gateway || null; renderGw(state.admGw);
    } catch (e) { toast(p2pErr(e), true); }
  };
  // ملخص بوابة الدفع: يأتي ضمن admin.stats (الخادم يتحقق أن الطالب أدمن)، فلا يراه غيرك
  function renderGw(g) {
    var dl = $('adm-gw-kv'); dl.textContent = '';
    if (!g) { $('adm-gw-earned').textContent = '—'; $('adm-gw-sub').textContent = 'يظهر بعد تشغيل pay-setup ثم push-setup'; return; }
    var hid = state.hidden, m = function (v) { return hid ? '••••' : fmtExact(v); };
    $('adm-gw-earned').textContent = m(g.earned);
    $('adm-gw-sub').textContent = 'منها ' + m(g.earned_30d) + ' في آخر 30 يوماً';
    kvRow(dl, 'إجمالي ما وصلك من الشحن', m(g.received));
    kvRow(dl, 'رصيد التجار المتبقي', m(g.owed));
    kvRow(dl, 'الهدايا الممنوحة', m(g.gifts));
    if (Number(g.grace_debt) > 0) kvRow(dl, 'ديون هامش السماح', m(g.grace_debt));
    kvRow(dl, 'التجار', g.active_30d + ' نشط من ' + g.merchants);
    kvRow(dl, 'مبيعات التجار (30 يوماً)', m(g.volume_30d) + ' · ' + g.paid_30d + ' فاتورة');
  }
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
      var nv; try { nv = Number(WalletCore.normAmount($('adm-rate').value)); } catch (e) { nv = NaN; }
      if (!(nv > 0)) return toast('اكتب السعر رقماً صحيحاً، مثل 2700 أو 2,700', true);
      // سعر الصرف يحدد نطاق الأسعار المقبولة لكل الإعلانات: خطأ كتابة (270 بدل 2700) يوقف السوق كله. نؤكد التغيير الكبير
      var cur = state.p2p.rate && Number(state.p2p.rate.sdg_per_usdt), b2 = state.p2p.band || 3;
      var chg = cur > 0 ? Math.abs(nv / cur - 1) : 0;
      if (!(await askConfirm((chg > 0.15 ? '⚠️ السعر الجديد يختلف ' + (chg * 100).toFixed(0) + '% عن الحالي (' + cur + '). تأكد أنه ليس خطأ كتابة: ' : '') + 'حفظ سعر الصرف ' + nv + ' ج.س؟ ستُقبل الإعلانات بين ' + Math.round(nv * (1 - b2 / 100)) + ' و' + Math.round(nv * (1 + b2 / 100)) + ' فقط، وتختفي الإعلانات خارج هذا النطاق.'))) return;
      var r = await p2p('admin.rate.set', { sdg_per_usdt: String(nv), band_pct: state.p2p.band });
      state.p2p.rate = r.rate; state.p2p.range = r.range; renderRate(r.rate, r.range); toast('تم حفظ سعر الصرف');
    } catch (e) { toast(p2pErr(e), true); }
  };
  async function admBan(banned) {
    var a = $('adm-ban-addr').value.trim();
    if (!core.isValidAddress(a) && !/^0x[0-9a-fA-F]{40}$/.test(a)) return toast('اكتب عنوان TRON (يبدأ بـ T) أو عنوان 0x', true);
    if (banned && !(await askConfirm('حظر هذه المحفظة؟ تتوقف إعلاناتها في السوق، ولا تستطيع فتح صفقات، ويتوقف متجرها في بوابة الدفع.'))) return;
    try { var r = await p2p('admin.ban', { address: a, banned: banned }); toast((banned ? 'تم حظر ' : 'رُفع الحظر عن ') + (r && r.address ? r.address.slice(0, 6) + '…' + r.address.slice(-4) : 'المحفظة')); $('adm-ban-addr').value = ''; }
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
  // أيقونات خطية حقيقية (SVG بنمط Lucide) بدل الرموز التعبيرية: حادة على كل الشاشات وتتبع لون السمة
  var OI = {
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    hourglass: '<path d="M6 2h12M6 22h12"/><path d="M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4"/>',
    scale: '<path d="M12 3v18M7 21h10M5 7h14"/><path d="m5 7-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v4M12 17.5v.5"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    receipt: '<path d="M5 2v20l3-2 2 2 2-2 2 2 2-2 3 2V2l-3 2-2-2-2 2-2-2-2 2z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>'
  };
  function oIcon(name, size) { var sp = document.createElement('span'); sp.className = 'oic'; sp.innerHTML = '<svg class="i" viewBox="0 0 24 24"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '>' + (OI[name] || OI.alert) + '</svg>'; return sp; }
  function actionBtn(label, kind, fn, icon) {
    var b = el('button', null, label); b.type = 'button';
    if (icon) { b.insertBefore(oIcon(icon, 18), b.firstChild); b.style.display = 'flex'; b.style.alignItems = 'center'; b.style.justifyContent = 'center'; b.style.gap = '8px'; }
    b.className = 'btn ' + (kind === 'primary' ? 'btn-primary' : 'btn-ghost');
    if (kind === 'danger') b.style.cssText = 'color:var(--err)';
    b.onclick = fn; $('ord-actions').appendChild(b); return b;
  }
  async function doAction(act, confirmText, needAuth, extra) {
    var run = function () { refreshOrder('order.action', Object.assign({ action: act, reason: state.p2p.reason || '' }, extra || {})); };
    if (confirmText && !(await askConfirm(confirmText))) return;
    if (needAuth) authorize('تأكيد العملية', run); else run();
  }
  function renderOrder(r) {
    state.p2p.lastOrder = r;
    var o = r.order, role = r.role; state.p2p.order = o; state.p2p.role = role;
    var st = STATUS[o.status] || [o.status, 'warn'];
    $('ord-title').textContent = (role === 'buyer' ? 'شراء ' : role === 'seller' ? 'بيع ' : 'نزاع ') + fmt(o.amount_usdt) + ' USDT';
    var other = role === 'buyer' ? o.seller_profile : o.buyer_profile;
    $('ord-sub').textContent = role === 'admin' ? (o.buyer_profile || {}).nickname + ' ← ' + (o.seller_profile || {}).nickname : 'مع ' + ((other || {}).nickname || '—');
    $('ord-status').textContent = titleOf(o, role) || st[0];
    // بطاقة الحالة: ماذا حدث، وماذا بعد، لكل طرف (بدل سطر حالة صغير)
    var H = heroOf(o, role); $('ord-hero').className = 'bn-status ord-hero ' + st[1]; $('ord-hero-i').textContent = ''; $('ord-hero-i').appendChild(oIcon(H[0], 22)); $('ord-hero-d').textContent = H[1];
    var won = o.status === 'released' && role === 'buyer';
    $('ord-win').hidden = !won;
    if (won && !$('ord-win').querySelector('.mascot-w')) $('ord-win').insertBefore(mascot('celebrate', 110, 'مبروك!'), $('ord-win').firstChild);
    if (won) { $('ord-win-amt').textContent = '+' + fmt(o.buyer_receives, 6) + ' USDT'; $('ord-win-s').textContent = 'على ' + netLabel(o.network) + ' · مقابل ' + fmt(o.total_sdg) + ' ج.س'; }
    var closed = ['released', 'refunded', 'cancelled'].indexOf(o.status) >= 0;

    var dl = $('ord-kv'); dl.textContent = '';
    $('ord-big').textContent = fmt(o.total_sdg) + ' ج.س';
    kv(dl, 'السعر', fmt(o.price_sdg) + ' ج.س / USDT');
    kv(dl, 'الشبكة', netLabel(o.network));
    kv(dl, 'يستلم المشتري', fmt(o.buyer_receives, 6) + ' USDT', true);
    kv(dl, 'العمولة ورسوم الشبكة', fmt(o.fee_usdt, 6) + ' USDT', true);
    kv(dl, 'الكمية', fmt(o.amount_usdt, 6) + ' USDT', true);
    kv(dl, 'رقم الطلب', String(o.id).slice(0, 8).toUpperCase());
    if (o.created_at) kv(dl, 'وقت الإنشاء', new Date(o.created_at).toLocaleString('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
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
    // بعد انتهاء الصفقة لا معنى لبطاقة «حوّل المبلغ إلى…»، وقد تدفع المشتري لتحويل ثانٍ بالخطأ
    var showBank = !!o.bankak_account && role !== 'seller' && ['funded', 'paid', 'disputed'].indexOf(o.status) >= 0;
    $('ord-bank').hidden = !showBank;
    document.querySelectorAll('#ord-bank .bn-steps>li').forEach(function (li, i) { li.hidden = i > 0 && o.status !== 'funded'; });
    if (showBank) { $('ord-bname').textContent = o.bankak_name; $('ord-bacct').textContent = o.bankak_account; $('ord-bamt').textContent = String(o.total_sdg); }
    var stepIdx = { awaiting_deposit: 0, funded: 1, paid: 2, releasing: 2, released: 3, disputed: 2 }[o.status];
    var dsp = o.status === 'disputed';
    document.querySelectorAll('#ord-steps span').forEach(function (x, i) { x.classList.toggle('on', stepIdx != null && i <= Math.min(stepIdx, 2) && !(dsp && i >= 1)); x.classList.toggle('bad', dsp && i === 1); });
    state.p2p.deadline = o.status === 'funded' ? o.pay_deadline : o.status === 'awaiting_deposit' ? o.deposit_expires_at : null;
    $('ord-timer-lbl').textContent = o.status === 'funded' ? 'ادفع خلال' : 'إيداع البائع خلال';
    tickTimer();

    $('ord-actions').textContent = '';
    var s = o.status;
    var depKey = 'sarra.dep.' + o.id, depSent = null; try { depSent = localStorage.getItem(depKey); } catch (e) {}
    if (role === 'seller' && s === 'awaiting_deposit' && o.deposit_address && depSent) {
      kv(dl, 'حالة الإيداع', 'أُرسل من محفظتك، بانتظار تأكيد الضمان (دقيقة إلى 5 دقائق)', true);
      actionBtn('تحقق من الإيداع', 'primary', function () { refreshOrder('order.refresh'); });
      // الإرسال الأول انتهى بخطأ غامض ولم يخرج فعلاً؟ إعادة المحاولة متاحة لكن بعد تحذير صريح، وإلا قد يُدفع الإيداع مرتين
      actionBtn('لم يخرج الإيداع؟ أعد المحاولة', 'ghost', async function () {
        if (!(await askConfirm('افتح سجل المعاملات وتأكد أن إيداع ' + fmt(o.deposit_amount, 6) + ' USDT إلى الضمان لم يخرج من محفظتك. إن كان قد خرج فلا تعد المحاولة، وإلا ستدفع مرتين. هل تأكدت؟'))) return;
        try { localStorage.removeItem(depKey); } catch (e) {} refreshOrder('order.get');
      });
    } else if (role === 'seller' && s === 'awaiting_deposit' && o.deposit_address) {
      actionBtn('إيداع ' + fmt(o.deposit_amount, 6) + ' USDT في الضمان', 'primary', function () {
        var b = this;
        authorize('إيداع في الضمان', async function () {
          b.disabled = true; toast('جارٍ الإيداع…');
          try { var sent = localStorage.getItem(depKey); if (sent) { toast('أرسلت الإيداع مسبقاً. اضغط "تحقق من الإيداع"'); return; } } catch (e) {}
          // إيداع قبل نهاية المهلة بقليل قد يصل بعد الإلغاء، فيُعاد ناقصاً رسوم الشبكة
          if (o.deposit_expires_at && Date.now() > Date.parse(o.deposit_expires_at) - 120000) { b.disabled = false; return toast('مهلة الإيداع على وشك الانتهاء. ألغِ هذا الطلب وافتح طلباً جديداً حتى لا يصل الإيداع متأخراً', true); }
          // نسجّل المحاولة قبل الإرسال: خطأ شبكة بعد خروج المعاملة لا يجوز أن يسمح بإيداع ثانٍ بضغطة واحدة
          try { localStorage.setItem(depKey, String(Date.now())); } catch (e) {}
          try { var dr = o.network === 'BEP20' ? await core.evmSend('bsc', 'USDT', o.deposit_address, String(o.deposit_amount)) : await core.sendUSDT(o.deposit_address, String(o.deposit_amount)); lhAdd({ kind: 'send', net: o.network === 'BEP20' ? 'bsc' : 'tron', coin: 'USDT', amount: String(o.deposit_amount), to: o.deposit_address, via: 'إيداع في ضمان P2P', txid: dr && dr.txid, url: dr && dr.url, status: (dr && dr.status) || 'SUCCESS' }); try { localStorage.setItem(depKey, String(Date.now())); } catch (e) {} state.balances = null; state.historyCache = null; toast('تم الإيداع، بانتظار تأكيد الضمان'); }
          catch (e) {
            // خطأ قبل الإرسال مؤكد (رصيد، رسوم، قفل…): لم يخرج شيء، فنسمح بالمحاولة مباشرة
            if (e && /^(INSUFFICIENT|LOW_|LOCKED|INVALID|BAD_|SELF_SEND)/.test(e.message || '')) { try { localStorage.removeItem(depKey); } catch (e2) {} }
            toast(WalletCore.errorText(e), true);
          }
          b.disabled = false; refreshOrder('order.refresh');
        });
      });
      actionBtn('تحقق من الإيداع', 'ghost', function () { refreshOrder('order.refresh'); });
    }
    var rc = o.receipts || 0;
    if (role === 'buyer' && ['funded', 'paid', 'disputed'].indexOf(s) >= 0 && rc < 3) actionBtn(rc ? 'رفع إيصال آخر (' + rc + '/3)' : 'رفع إيصال تحويل بنكك', s === 'funded' ? 'ghost' : 'primary', pickReceipt, 'clip');
    if ((role === 'seller' || role === 'admin') && rc) actionBtn('عرض إيصال الدفع (' + rc + ')', 'ghost', showReceipts, 'receipt');
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
      // نتيجة مجهولة: تأكيد ثانٍ صريح يُرسل للخادم (الخادم يرفض بدونه)
      var adminDo = async function (act, q) {
        if (unk && !(await askConfirm('هل فتحت OxaPay ← Payouts وتأكدت بنفسك أنه لا توجد أي دفعة بالوصف «Sarra P2P … ' + o.id + '»؟ إن لم تتأكد فاضغط إلغاء.'))) return;
        doAction(act, warnTxt + q, true, unk ? { confirmed_unpaid: true } : null);
      };
      if (s === 'releasing' || s === 'refunding') kv(dl, 'تنبيه', 'الصفقة عالقة في منتصف الدفع منذ أكثر من 10 دقائق. راجع OxaPay ← Payouts: إن وُجدت الدفعة فلا تفعل شيئاً وأبلغ المطوّر لتحديث الحالة.');
      if (['disputed', 'release_failed'].indexOf(s) >= 0) actionBtn('حكم: حرّر للمشتري', 'primary', function () { adminDo('admin_release', 'تحرير USDT للمشتري؟'); });
      if (['disputed', 'refund_failed', 'funded'].indexOf(s) >= 0) actionBtn('حكم: أرجع للبائع', 'danger', function () { adminDo('admin_refund', s === 'funded' ? 'المشتري لم يضغط «حوّلت» بعد، لكنه قد يكون حوّل فعلاً. راسله أولاً. إرجاع USDT للبائع؟' : 'إرجاع USDT للبائع؟'); });
      // الدفعة موجودة فعلاً في OxaPay لكن الحالة عالقة: تسجيلها منتهية بلا دفع جديد (بدل «أبلغ المطوّر»)
      var stuck = (s === 'releasing' || s === 'refunding') || (unk && (s === 'release_failed' || s === 'refund_failed'));
      if (stuck) {
        var rel = s === 'releasing' || s === 'release_failed';
        actionBtn(rel ? 'وجدت الدفعة في OxaPay · سجّلها «حُرّرت»' : 'وجدت الدفعة في OxaPay · سجّلها «أُعيدت»', 'ghost', async function () {
          var tid = await askConfirm('اكتب رقم الدفعة (Track ID) من OxaPay ← Payouts للطلب ' + o.id + '. هذا لا يرسل أي مال، فقط يسجّل أن الدفعة تمت. لا تفعل هذا إن لم ترَ الدفعة بعينك.', true);
          if (!tid) return; tid = String(tid).trim();
          if (tid.length < 4) return toast('اكتب رقم الدفعة كما يظهر في OxaPay', true);
          authorize('تأكيد العملية', function () { refreshOrder('order.action', { action: rel ? 'admin_mark_released' : 'admin_mark_refunded', confirmed_paid: true, payout_track_id: tid }); });
        });
      }
      if (o.dispute_reason) kv(dl, 'سبب النزاع', o.dispute_reason);
    }

    renderChat(r);
  }
  // ===== المحادثة: شاشة منفصلة (على طريقة Binance P2P) =====
  function seenKey(id) { return 'sarra.chatSeen.' + id; }
  function initial(n) { n = String(n || '').trim(); return n ? n.charAt(0).toUpperCase() : '؟'; }
  function hm(t) { var d = new Date(t); return isNaN(d) ? '' : d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }); }
  function dayOf(t) { var d = new Date(t); return isNaN(d) ? '' : d.toLocaleDateString('ar', { day: 'numeric', month: 'long' }); }
  function renderChat(r) {
    var o = r.order, role = r.role, msgs = r.messages || [], meAddr = state.p2p.me && state.p2p.me.profile && state.p2p.me.profile.address;
    var other = role === 'buyer' ? o.seller_profile : role === 'seller' ? o.buyer_profile : null, oname = role === 'admin' ? 'محادثة الطلب' : ((other || {}).nickname || '—');
    var otherRole = role === 'buyer' ? 'البائع' : role === 'seller' ? 'المشتري' : 'المشتري والبائع';
    // بطاقة المحادثة في شاشة الطلب + شارة غير المقروء
    var seen = 0; try { seen = Number(localStorage.getItem(seenKey(o.id)) || 0); } catch (e) {}
    var onChat = state.stack[state.stack.length - 1] === 'order-chat';
    if (onChat) { seen = msgs.length; try { localStorage.setItem(seenKey(o.id), String(seen)); } catch (e) {} }
    var unread = Math.max(0, msgs.slice(Math.min(seen, msgs.length)).filter(function (m) { return m.sender !== meAddr; }).length);
    $('ord-cc-av').textContent = $('oc-av').textContent = initial(oname);
    $('ord-cc-name').textContent = role === 'admin' ? 'محادثة الطلب' : oname + (other && other.verified ? ' ✓' : '');
    var last = msgs[msgs.length - 1];
    $('ord-cc-last').textContent = last ? (last.sender === meAddr ? 'أنت: ' : '') + last.body.replace(/^📎\s*/, '') : 'لا رسائل بعد · ابدأ المحادثة';
    $('ord-cc-n').hidden = !unread; $('ord-cc-n').textContent = unread > 9 ? '9+' : String(unread); $('ord-unread').hidden = !unread;
    // رأس شاشة المحادثة
    $('oc-name').textContent = oname;
    var pf = other || {}; $('oc-meta').textContent = role === 'admin' ? 'أنت المشرف' : otherRole + (pf.verified ? ' · موثّق ✓' : '') + (pf.trades_completed != null ? ' · ' + pf.trades_completed + ' صفقة' : '') + (pf.completion != null ? ' · ' + pf.completion + '%' : '');
    $('oc-o-t').textContent = (role === 'buyer' ? 'شراء ' : role === 'seller' ? 'بيع ' : '') + fmt(o.amount_usdt) + ' USDT · ' + fmt(o.total_sdg) + ' ج.س';
    $('oc-o-s').textContent = (STATUS[o.status] || [o.status])[0];
    var closed = ['released', 'refunded', 'cancelled'].indexOf(o.status) >= 0 && role !== 'admin';
    $('ord-msg-row').hidden = closed; $('ord-chat-note').hidden = !closed;
    $('oc-attach').hidden = !(role === 'buyer' && ['funded', 'paid', 'disputed'].indexOf(o.status) >= 0 && (o.receipts || 0) < 3);
    renderMsgs(r, meAddr, otherRole, onChat);
    renderQuick(o, role, closed);
  }
  // ===== الرسائل =====
  // تجميع الرسائل المتتالية من نفس المرسل، وقت وعلامة إرسال لكل رسالة، فواصل «اليوم/أمس»، رسائل النظام في الوسط،
  // وتحذيرات احتيال تلقائية: رقم حساب غير حساب الطلب، أو دعوة للتواصل خارج التطبيق، أو طلب تحرير قبل الدفع
  var SCAM = [
    [/(wa\.me|whats ?app|واتس|واتساب|telegram|t\.me|تيليجرام|تلغرام|تلجرام|signal|سيجنال|imo|ايمو|ماسنجر|messenger)/i, 'دعوة للتواصل خارج التطبيق. المحادثة هنا هي دليلك الوحيد عند النزاع، فلا تنتقل لتطبيق آخر.'],
    [/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|me|app|link|xyz|site|top|info)\b)/i, 'رابط خارجي. لا تفتح روابط من الطرف الآخر ولا تدخل فيها بيانات محفظتك أو بنكك.'],
    [/(كلمات (الاسترداد|السر|المرور)|العبارة السرية|seed|recovery phrase|private key|المفتاح الخاص|رمز التحقق|otp|كود التفعيل|الرمز السري|pin)/i, 'طلب بيانات سرية. لا أحد (ولا الدعم) يحتاج كلماتك السرية أو رمز PIN أو رمز التحقق. من يطلبها محتال.'],
    [/(حرر|حرّر|release).{0,25}(قبل|أولاً|اولا|وبعدين|بعدين|ثم)/i, 'طلب تحرير قبل الدفع. لا تحرّر USDT أبداً قبل أن ترى المبلغ في تطبيق بنكك.']
  ];
  function scamNote(body, o, fromOther) {
    if (!fromOther) return '';
    for (var k = 0; k < SCAM.length; k++) if (SCAM[k][0].test(body)) return SCAM[k][1];
    // رقم حساب أو هاتف (7 أرقام فأكثر) يختلف عن حساب بنكك في الطلب
    var acct = String(o.bankak_account || ''), nums = String(body).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).match(/\d[\d\s-]{6,}\d/g) || [];
    for (var n = 0; n < nums.length; n++) { var d = nums[n].replace(/\D/g, ''); if (d.length >= 7 && d !== acct && d !== String(o.total_sdg).replace(/\D/g, '')) return 'رقم حساب أو هاتف مختلف عن حساب الطلب. حوّل فقط إلى الحساب الظاهر في تفاصيل الطلب، والدفع لغيره لا يحميه الضمان.'; }
    return '';
  }
  function dayLabel(t) {
    var d = new Date(t); if (isNaN(d)) return '';
    var a = new Date(); a.setHours(0, 0, 0, 0); var b = new Date(d); b.setHours(0, 0, 0, 0); var diff = Math.round((a - b) / 864e5);
    return diff === 0 ? 'اليوم' : diff === 1 ? 'أمس' : d.toLocaleDateString('ar', { day: 'numeric', month: 'long', year: d.getFullYear() !== a.getFullYear() ? 'numeric' : undefined });
  }
  function renderMsgs(r, meAddr, otherRole, onChat) {
    var o = r.order, role = r.role, msgs = (r.messages || []).slice();
    (state.p2p.outbox || []).forEach(function (m) { if (m.order === o.id) msgs.push(m); });
    var chat = $('ord-chat'), atBottom = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 40 || !chat.childNodes.length;
    var prevCount = Number(chat.dataset.count || 0);
    chat.textContent = '';
    if (!msgs.length) {
      var em = el('div'); em.className = 'chat-empty';
      em.appendChild(oIcon('chat', 34)); em.appendChild(el('b', null, 'ابدأ المحادثة مع ' + otherRole));
      em.appendChild(el('span', null, 'اكتب هنا فقط: المحادثة داخل صُرّة محفوظة وهي دليلك إن حدث نزاع.'));
      chat.appendChild(em);
    }
    var lastDay = '', lastSender = null, lastT = 0;
    msgs.forEach(function (m, idx) {
      var d = dayLabel(m.created_at); if (d && d !== lastDay) { var dl = el('div'); dl.className = 'chat-day'; dl.appendChild(el('span', null, d)); chat.appendChild(dl); lastDay = d; lastSender = null; }
      var sys = m.sys === true || (m.sys == null && m.sender === o.buyer && /^📎/.test(m.body));
      if (sys) {
        var sb = el('div'); sb.className = 'chat-sys'; sb.appendChild(oIcon('receipt', 14)); sb.appendChild(el('span', null, String(m.body).replace(/^📎\s*/, '')));
        var st = hm(m.created_at); if (st) sb.appendChild(el('time', null, st));
        chat.appendChild(sb); lastSender = null; return;
      }
      var mine = m.sender === meAddr, isAdm = m.sender !== o.buyer && m.sender !== o.seller;
      var who = isAdm ? 'المشرف' : m.sender === o.buyer ? 'المشتري' : 'البائع';
      var t = Date.parse(m.created_at) || 0, next = msgs[idx + 1];
      var first = lastSender !== m.sender || t - lastT > 300000;
      var last = !next || next.sender !== m.sender || (Date.parse(next.created_at) || 0) - t > 300000 || dayLabel(next.created_at) !== d || next.sys;
      lastSender = m.sender; lastT = t;
      var row = el('div'); row.className = 'msg ' + (mine ? 'me' : 'them') + (isAdm ? ' adm' : '') + (first ? ' first' : '') + (last ? ' last' : '') + (m.pending ? ' pending' : '') + (m.failed ? ' failed' : '');
      if (first && !mine && (role === 'admin' || isAdm)) { var wl = el('span', null, isAdm ? 'المشرف · صُرّة' : who); wl.className = 'msg-who'; if (isAdm) wl.insertBefore(oIcon('shield', 12), wl.firstChild); row.appendChild(wl); }
      var b = el('div'); b.className = 'bubble';
      var tx = el('p'); tx.setAttribute('dir', 'auto'); tx.textContent = m.body; b.appendChild(tx);
      var meta = el('span'); meta.className = 'msg-meta';
      meta.appendChild(el('time', null, m.pending ? '' : hm(m.created_at)));
      if (mine) meta.appendChild(oIcon(m.failed ? 'alert' : m.pending ? 'clock' : 'check', 13));
      b.appendChild(meta); row.appendChild(b);
      if (m.failed) { var rt = el('button', null, 'لم تُرسل · اضغط لإعادة المحاولة'); rt.type = 'button'; rt.className = 'msg-retry'; rt.onclick = function () { dropOut(m); sendMsg(m.body); }; row.appendChild(rt); }
      var warn = scamNote(m.body, o, !mine && !isAdm);
      if (warn) { var wn = el('div'); wn.className = 'msg-warn'; wn.appendChild(oIcon('alert', 14)); wn.appendChild(el('span', null, warn)); row.appendChild(wn); }
      chat.appendChild(row);
    });
    chat.dataset.count = String(msgs.length);
    var gained = msgs.length - prevCount;
    if (atBottom || onChat && gained > 0 && msgs[msgs.length - 1] && msgs[msgs.length - 1].sender === meAddr) { setTimeout(function () { chat.scrollTop = chat.scrollHeight; }, 0); $('oc-down').hidden = true; }
    else if (gained > 0 && prevCount) { $('oc-down').hidden = false; $('oc-down-n').textContent = String(gained); }
  }
  // ردود سريعة مناسبة لدور كل طرف ومرحلة الطلب
  function renderQuick(o, role, closed) {
    var q = $('oc-quick'); q.textContent = '';
    var L = closed ? [] : role === 'buyer' ? ({ awaiting_deposit: ['السلام عليكم، في انتظار إيداعك في الضمان'], funded: ['حوّلت المبلغ، أرجو التأكد والتحرير', 'سأحوّل الآن', 'رفعت الإيصال'], paid: ['حوّلت المبلغ، أرجو التأكد والتحرير', 'هل وصلك المبلغ؟'], disputed: ['أرفقت الإيصال كدليل'] })[o.status]
      : role === 'seller' ? ({ awaiting_deposit: ['أودعت USDT في الضمان، تفضّل بالتحويل'], funded: ['أرجو التحويل إلى الحساب الظاهر فقط', 'أرسل صورة الإيصال من فضلك'], paid: ['جارٍ التأكد من وصول المبلغ', 'لم يصلني المبلغ بعد، أرسل الإيصال من فضلك', 'وصل المبلغ، سأحرّر الآن'], disputed: ['لم يصلني أي مبلغ في بنكك'] })[o.status] : [];
    (L || []).forEach(function (t) { var c = el('button', null, t); c.type = 'button'; c.className = 'qrep'; c.onclick = function () { sendMsg(t); }; q.appendChild(c); });
    q.hidden = !(L && L.length);
  }
  function dropOut(m) { state.p2p.outbox = (state.p2p.outbox || []).filter(function (x) { return x !== m; }); }
  async function sendMsg(v) {
    v = String(v || '').trim(); if (!v || !state.p2p.orderId) return;
    var id = state.p2p.orderId, m = { order: id, sender: state.p2p.me && state.p2p.me.profile && state.p2p.me.profile.address, body: v, created_at: new Date().toISOString(), pending: true };
    state.p2p.outbox = (state.p2p.outbox || []).concat([m]);
    if (state.p2p.lastOrder) renderChat(state.p2p.lastOrder);
    try {
      var r = await p2p('message.send', { id: id, body: v });
      dropOut(m); if (state.p2p.orderId === id) renderOrder(r);
    } catch (e) {
      m.pending = false; m.failed = true; toast(p2pErr(e), true);
      if (state.p2p.lastOrder) renderChat(state.p2p.lastOrder);
    }
  }
  function openChat() { show('order-chat'); $('ord-chat').dataset.count = '0'; $('ord-chat').textContent = ''; if (state.p2p.lastOrder) renderChat(state.p2p.lastOrder); msgSize(); }
  $('ord-chat-open').onclick = openChat; $('ord-chat-card').onclick = openChat;
  $('oc-order').onclick = function () { state.stack.pop(); show('order', false); };
  $('oc-attach').onclick = function () { pickReceipt(); };
  function msgSize() { var t = $('ord-msg'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; var n = t.value.length; $('oc-count').hidden = n < 800; $('oc-count').textContent = n + '/1000'; $('ord-send').disabled = !t.value.trim(); }
  $('ord-send').onclick = function () { var v = $('ord-msg').value.trim(); if (!v) return; $('ord-msg').value = ''; msgSize(); sendMsg(v); $('ord-msg').focus(); };
  $('ord-msg').oninput = msgSize;
  $('ord-msg').onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('ord-send').click(); } };
  $('oc-down').onclick = function () { var c = $('ord-chat'); c.scrollTop = c.scrollHeight; $('oc-down').hidden = true; };
  $('ord-chat').onscroll = function () { var c = this; if (c.scrollTop + c.clientHeight >= c.scrollHeight - 40) $('oc-down').hidden = true; };
  $('ord-copy').onclick = function () { copyText($('ord-bacct').textContent); };
  $('ord-copy-amt').onclick = function () { copyText($('ord-bamt').textContent); };
  // عنوان حالة قصير وموجّه لكل طرف (مثل «ادفع للبائع»)، والشرح التفصيلي تحته
  function titleOf(o, role) {
    var b = role === 'buyer', sl = role === 'seller';
    return ({
      awaiting_deposit: b ? 'بانتظار إيداع البائع' : sl ? 'أودع USDT في الضمان' : 'بانتظار إيداع البائع',
      funded: b ? 'ادفع للبائع' : sl ? 'بانتظار دفع المشتري' : 'محجوز في الضمان',
      paid: b ? 'بانتظار تحرير البائع' : sl ? 'تحقق من الدفع ثم حرّر' : 'المشتري أكّد الدفع',
      disputed: 'نزاع قيد المراجعة', releasing: 'جارٍ تحرير USDT', released: 'اكتملت الصفقة',
      refunding: 'جارٍ الاسترداد', refunded: 'أُعيدت USDT للبائع', cancelled: 'أُلغي الطلب'
    })[o.status];
  }
  function heroOf(o, role) {
    var b = role === 'buyer', sl = role === 'seller', amt = fmt(o.total_sdg) + ' ج.س';
    switch (o.status) {
      case 'awaiting_deposit': return ['hourglass', b ? 'ينتظر البائع إيداع USDT في الضمان. لا تحوّل أي مبلغ الآن؛ سيظهر حساب بنكك هنا بعد الحجز.' : sl ? 'أودع USDT في الضمان من الزر أدناه لتبدأ الصفقة. المشتري لن يحوّل قبل ذلك.' : 'بانتظار إيداع البائع.'];
      case 'funded': return ['lock', b ? 'USDT محجوزة لك بأمان في الضمان. حوّل ' + amt + ' إلى الحساب أدناه، ارفع الإيصال، ثم اضغط «حوّلت المبلغ».' : sl ? 'عملتك في الضمان. انتظر تحويل المشتري، ولا تحرّر قبل أن ترى المبلغ في تطبيق بنكك.' : 'محجوز في الضمان.'];
      case 'paid': return ['clock', b ? 'أبلغنا البائع بتحويلك. سيتأكد من وصول المبلغ في بنكك ثم يحرّر USDT، وغالباً خلال دقائق. إن تأخر طويلاً أو لم يرد فافتح نزاعاً.' : sl ? 'المشتري يقول إنه حوّل ' + amt + '. افتح تطبيق بنكك وتأكد من وصول المبلغ فعلاً، ثم حرّر.' : 'المشتري أكّد الدفع.'];
      case 'disputed': return ['scale', 'المشرف يراجع المحادثة والإيصالات. USDT محجوزة في الضمان ولن تُحرَّر لأي طرف قبل القرار. أضف أي دليل في المحادثة' + (o.dispute_reason ? '. سبب النزاع: «' + o.dispute_reason + '»' : '') + '.'];
      case 'releasing': return ['hourglass', 'جارٍ إرسال USDT إلى المشتري. يستغرق عادة أقل من دقيقة.'];
      case 'released': return ['check', b ? 'تمت الصفقة بنجاح، ووصلت USDT إلى محفظتك.' : sl ? 'تمت الصفقة بنجاح. أُرسلت USDT للمشتري.' : 'اكتملت.'];
      case 'refunding': return ['undo', 'جارٍ إعادة USDT إلى البائع.'];
      case 'refunded': return ['undo', sl ? 'أُعيدت USDT إلى محفظتك (بعد خصم رسوم الشبكة).' : 'أُعيدت USDT إلى البائع وأُغلق الطلب.'];
      case 'cancelled': return ['x', 'أُلغي الطلب ولم يُحجز أو يُحوَّل شيء.'];
      default: return ['alert', 'تأخر الإرسال، والمشرف يتابع الطلب. أموالك محفوظة في الضمان.'];
    }
  }
  $('ord-win-go').onclick = function () { resetTo('home'); };
  function tickTimer() {
    var d = state.p2p.deadline; $('ord-timer').hidden = !d;
    if (!d) return;
    var left = Math.max(0, Math.floor((Date.parse(d) - Date.now()) / 1000));
    var hh = Math.floor(left / 3600), mm = Math.floor(left % 3600 / 60), ss = left % 60, p2 = function (x) { return String(x).padStart(2, '0'); };
    $('ord-timer-val').textContent = (hh ? hh + ':' + p2(mm) : p2(mm)) + ':' + p2(ss);
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
    if ((cur !== 'order' && cur !== 'order-chat') || !state.p2p.orderId || document.hidden || !core.isUnlocked()) return;
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


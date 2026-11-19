  // ===== بوابة الدفع للتجار: إدارة حساب التاجر (الطلبات موقّعة بالمحفظة، مثل P2P) =====
  var PAY_URL = CFG.payUrl || (P2P_URL ? P2P_URL.replace(/\/p2p\/?$/, '/pay') : '');
  var PAY_DOCS = CFG.payDocs || 'https://docs.sarrapay.com/';
  var MC = { data: null, busy: false };
  var MC_ERRORS = {
    BAD_NAME: 'اكتب اسم المتجر (من حرفين إلى 40 حرفاً)',
    BAD_WEBHOOK_URL: 'رابط الإشعار يجب أن يبدأ بـ https:// وأن يكون لموقع عام',
    BAD_AMOUNT: 'اكتب مبلغاً صحيحاً، بخانتين عشريتين كحد أقصى',
    AMOUNT_TOO_SMALL: 'أقل مبلغ للشحن 1 USDT',
    AMOUNT_TOO_LARGE: 'المبلغ أكبر من الحد المسموح',
    NETWORK_NOT_CONFIGURED: 'الشحن على هذه الشبكة غير متاح حالياً. اختر شبكة أخرى',
    BAD_NETWORK: 'اختر شبكة الشحن',
    TRY_AGAIN: 'حاول مرة أخرى',
    NETWORK: 'تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً',
    NOT_FOUND: 'بوابة الدفع غير مفعّلة على الخادم بعد',
    NO_WEBHOOK_URL: 'أضف رابط إشعار الدفع أولاً من «تعديل البيانات»',
    NOT_FINAL: 'الفاتورة ما زالت بانتظار الدفع، فلا إشعار لها بعد'
  };
  function mcErr(e) { var c = e && e.message; return MC_ERRORS[c] || p2pErr(e); }
  async function payApi(action, params) {
    await ensureUnlocked();
    var res;
    try { res = await fetch(PAY_URL + '/v1/merchant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await core.signRequest(action, params || {})) }); }
    catch (e) { throw new Error('NETWORK'); }
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || j.error) throw new Error(j.error || (res.status === 404 ? 'NOT_FOUND' : 'SERVER'));
    return j;
  }
  function mcView(v) { $('mc-load').hidden = v !== 'load'; $('mc-form').hidden = v !== 'form'; $('mc-dash').hidden = v !== 'dash'; }
  function mcShowErr(t) { $('mc-err').textContent = t || ''; $('mc-err').hidden = !t; }
  function mcForm() {
    var m = MC.data && MC.data.merchant;
    $('mc-name').value = m ? m.name : ''; $('mc-hook').value = m && m.webhook_url ? m.webhook_url : '';
    $('mc-save').textContent = m ? 'حفظ التعديلات' : 'تفعيل بوابة الدفع'; $('mc-cancel').hidden = !m; mcShowErr(''); mcView('form');
  }
  var MC_ST = { pending: 'بانتظار الدفع', paid: 'مدفوعة', expired: 'منتهية', cancelled: 'ملغاة' };
  var MC_EV = { 'invoice.paid': 'دفع', 'invoice.expired': 'انتهاء', 'invoice.cancelled': 'إلغاء' };
  var MC_IC = { ok: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>' };
  function mcSvg(k, st) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" style="' + (st || 'width:13px;height:13px') + '">' + MC_IC[k] + '</svg>'; }
  function mcPill(cls, ic, txt) { var p = el('span', ''); p.className = 'mc-st ' + cls; p.innerHTML = mcSvg(ic, 'width:12px;height:12px;stroke-width:2.6'); p.appendChild(document.createTextNode(txt)); return p; }
  // خطوات البدء: تختفي كلها عند اكتمالها
  function mcSteps(m, d) {
    var paid = (d.invoices || []).some(function (x) { return x.kind === 'payment' && x.status === 'paid' && !x.test; });
    var steps = [
      [true, 'تفعيل المتجر باسم «' + m.name + '»'],
      [!!m.test_key_hint, 'أنشئ مفتاحاً تجريبياً وجرّب الربط بدون مال'],
      [!!m.webhook_url, 'أضف رابط إشعار الدفع لخادمك (اختياري، ومُستحسن)'],
      [Number(m.credit) > 0, 'اشحن رصيد رسوم البوابة'],
      [!!m.key_hint, 'أنشئ المفتاح الحقيقي وضعه في خادمك'],
      [paid, 'استقبل أول دفعة حقيقية']
    ];
    var box = $('mc-steps'); box.textContent = '';
    steps.forEach(function (x, i) {
      var r = el('div', ''); r.className = 'mc-step' + (x[0] ? ' done' : '');
      var c = el('i', ''); if (x[0]) c.innerHTML = '<svg viewBox="0 0 24 24">' + MC_IC.ok + '</svg>'; else c.textContent = String(i + 1);
      r.appendChild(c); r.appendChild(el('span', '', x[1])); box.appendChild(r);
    });
    $('mc-start').hidden = steps.every(function (x) { return x[0]; });
  }
  function mcAddrs(m) {
    var box = $('mc-addrs'); box.textContent = '';
    [['TRON', m.tron_addr], ['BNB · Ethereum · Polygon', m.evm_addr]].forEach(function (a) {
      if (!a[1]) return;
      var r = el('div', ''); r.className = 'mc-addr';
      r.appendChild(el('b', '', a[0])); r.appendChild(el('code', '', a[1]));
      var b = el('button', ''); b.type = 'button'; b.setAttribute('aria-label', 'نسخ العنوان'); b.innerHTML = mcSvg('copy', 'width:16px;height:16px');
      b.onclick = function () { copyText(a[1]); }; r.appendChild(b); box.appendChild(r);
    });
  }
  function mcRender() {
    var d = MC.data, m = d && d.merchant;
    if (!m) return mcForm();
    $('mc-credit').textContent = niceNum(m.credit, 2); $('mc-shop').textContent = m.name; mcSteps(m, d); mcAddrs(m);
    $('mc-fee').textContent = 'العمولة ' + d.fee_pct + '% من كل فاتورة مدفوعة، وأقلها ' + d.fee_min + ' USDT. الفواتير التي لم تُدفع والتجريبية مجانية.';
    var sel = $('mc-top-net'); sel.textContent = '';
    (d.topup_networks || []).forEach(function (k) { var o = el('option', '', ({ tron: 'TRON', bsc: 'BNB Chain', polygon: 'Polygon', eth: 'Ethereum' })[k] || (d.networks && d.networks[k]) || k); o.value = k; sel.appendChild(o); });
    if (sel.querySelector('option[value=bsc]')) sel.value = 'bsc';
    $('mc-top').disabled = !(d.topup_networks || []).length;
    $('mc-key-state').textContent = m.key_hint ? 'مفعّل، وينتهي بـ ' + m.key_hint + '. إنشاء مفتاح جديد يوقف القديم فوراً.' : 'لم تنشئ مفتاحاً بعد. تحتاجه لاستقبال دفعات حقيقية.';
    $('mc-key-new').textContent = m.key_hint ? 'إنشاء مفتاح جديد' : 'إنشاء مفتاح API';
    $('mc-tkey-state').textContent = m.test_key_hint ? 'مفعّل، وينتهي بـ ' + m.test_key_hint + '. فواتيره تُدفع بزر «محاكاة الدفع»، لا تخصم من رصيدك، وتُحذف تلقائياً بعد 3 دقائق من انتهائها.' : 'للتجربة بدون مال: فواتير sk_test_ تُدفع بزر «محاكاة الدفع»، لا تخصم من رصيدك، وتُحذف تلقائياً بعد 3 دقائق من انتهائها.';
    $('mc-tkey-new').textContent = m.test_key_hint ? 'إنشاء مفتاح تجريبي جديد' : 'إنشاء مفتاح تجريبي';
    $('mc-hooktest').hidden = !m.webhook_url; $('mc-secret-copy').hidden = !m.webhook_url;
    $('mc-hook-view').textContent = m.webhook_url || 'لم تضف رابطاً. بدونه يجب أن يسأل خادمك عن حالة الفاتورة بنفسه.';
    var box = $('mc-inv'); box.textContent = '';
    var list = (d.invoices || []).filter(function (x) { return x.kind === 'payment'; });
    if (!list.length) box.appendChild(el('span', 'font-size:13px;color:var(--mu)', 'لا فواتير بعد. أنشئ أول فاتورة من خادمك عبر الـ API.'));
    list.slice(0, 10).forEach(function (x) {
      var r = el('div', 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--div);font-size:14px');
      var a = el('div', 'display:flex;flex-direction:column;min-width:0;gap:2px');
      a.appendChild(el('b', 'direction:ltr;text-align:right', niceNum(x.amount, 2) + ' ' + (x.currency || 'USDT')));
      var when = x.paid_at || x.created_at;
      a.appendChild(el('span', 'font-size:12px;color:var(--mu);overflow:hidden;text-overflow:ellipsis;white-space:nowrap', (x.order_id || x.id) + ' · ' + (x.network_name || x.network) + (when ? ' · ' + new Date(when).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' }) : '')));
      r.appendChild(a);
      var right = el('div', 'display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none');
      right.appendChild(mcPill(x.status, x.status === 'paid' ? 'ok' : x.status === 'pending' ? 'clock' : 'x', MC_ST[x.status] || x.status));
      if (x.test) { var t = el('span', '', 'تجريبية'); t.className = 'mc-tag test'; right.appendChild(t); }
      r.appendChild(right);
      box.appendChild(r);
    });
    $('mc-hooks-card').hidden = !m.webhook_url;
    mcView('dash');
    if (m.webhook_url && !MC.hooks) mcLoadHooks();
  }
  // سجل الإشعارات: آخر 30 محاولة، مع إعادة إرسال لكل فاتورة
  async function mcLoadHooks() {
    var box = $('mc-hooks');
    try { MC.hooks = (await payApi('pay.hooks')).hooks || []; } catch (e) { box.textContent = ''; box.appendChild(el('span', 'font-size:13px;color:var(--danger)', mcErr(e))); return; }
    box.textContent = '';
    if (!MC.hooks.length) { box.appendChild(el('span', 'font-size:13px;color:var(--mu)', 'لم يُرسل أي إشعار بعد.')); return; }
    MC.hooks.slice(0, 15).forEach(function (h) {
      var r = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:1px solid var(--div);font-size:13px');
      var a = el('div', 'display:flex;flex-direction:column;min-width:0');
      var hb = el('div', 'display:flex;align-items:center;gap:6px;flex-wrap:wrap'); hb.appendChild(mcPill(h.ok ? 'paid' : 'bad', h.ok ? 'ok' : 'x', h.status ? 'HTTP ' + h.status : 'تعذّر الوصول')); hb.appendChild(el('b', 'font-size:13px', 'حدث ' + (MC_EV[h.event] || h.event))); a.appendChild(hb);
      a.appendChild(el('span', 'font-size:11.5px;color:var(--mu);direction:ltr;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', h.invoice_id + ' · ' + new Date(h.at).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' })));
      r.appendChild(a);
      var b = el('button', 'flex:none;width:auto;height:32px;padding:0 12px;font-size:12.5px', 'إعادة'); b.type = 'button'; b.className = 'btn btn-ghost';
      b.onclick = mcDo(b, async function () {
        var x = await payApi('pay.resend', { id: h.invoice_id });
        toast(x.ok ? 'أُعيد الإرسال، وردّ خادمك بـ ' + x.status : (x.status ? 'خادمك ردّ بـ ' + x.status : 'تعذّر الوصول إلى رابطك'), !x.ok);
        MC.hooks = null; mcLoadHooks();
      });
      r.appendChild(b); box.appendChild(r);
    });
  }
  async function openMerchant() {
    show('merchant'); $('mc-key-box').hidden = true; $('mc-key').textContent = '';
    // أثناء التحميل: هيكل البطاقات بدل نص «جارٍ التحميل»، وعند الخطأ رسالة واضحة مكانه
    var msg = function (t) { $('mc-load-t').textContent = t || ''; $('mc-load-t').hidden = !t; $('mc-skel').hidden = !!t; $('mc-load').setAttribute('aria-busy', t ? 'false' : 'true'); };
    if (!PAY_URL) { msg('بوابة الدفع غير متاحة في هذه النسخة.'); return mcView('load'); }
    if (MC.data) mcRender(); else { msg(''); mcView('load'); }
    try { MC.data = await payApi('pay.me'); mcRender(); }
    catch (e) { if (!MC.data) { msg(mcErr(e)); mcView('load'); } }
  }
  // يمنع النقر المتكرر ويعرض الخطأ في مكانه
  function mcDo(btn, fn) {
    return async function () {
      if (MC.busy) return; MC.busy = true; btn.disabled = true; mcShowErr('');
      try { await fn(); } catch (e) { var t = mcErr(e); if (!$('mc-form').hidden) mcShowErr(t); else toast(t, true); }
      MC.busy = false; btn.disabled = false;
    };
  }
  $('mc-save').onclick = mcDo($('mc-save'), async function () {
    var name = $('mc-name').value.trim(), hook = $('mc-hook').value.trim();
    if (name.length < 2) throw new Error('BAD_NAME');
    if (hook && !/^https:\/\/[^\s]+\.[^\s]+$/.test(hook)) throw new Error('BAD_WEBHOOK_URL');
    var evm = null; try { evm = await core.evmAddress(); } catch (e) {}
    var r = await payApi('pay.save', { name: name, webhook_url: hook || null, evm_addr: evm });
    MC.data = Object.assign(MC.data || {}, r); if (!MC.data.invoices) MC.data.invoices = [];
    mcRender(); toast('تم الحفظ');
  });
  $('mc-cancel').onclick = function () { mcRender(); };
  $('mc-edit').onclick = mcForm;
  $('mc-key-new').onclick = mcDo($('mc-key-new'), async function () {
    var r = await payApi('pay.key');
    $('mc-key-kind').textContent = 'مفتاحك الحقيقي الجديد'; $('mc-key').textContent = r.api_key; $('mc-key-box').hidden = false;
    MC.data.merchant.key_hint = r.api_key.slice(-4); $('mc-key-state').textContent = 'مفتاحك الجديد جاهز، وأي مفتاح قديم توقف.'; mcSteps(MC.data.merchant, MC.data); $('mc-key-new').textContent = 'إنشاء مفتاح جديد';
  });
  $('mc-tkey-new').onclick = mcDo($('mc-tkey-new'), async function () {
    var r = await payApi('pay.key', { test: true });
    $('mc-key').textContent = r.api_key; $('mc-key-box').hidden = false;
    MC.data.merchant.test_key_hint = r.api_key.slice(-4); mcRender(); $('mc-key-kind').textContent = 'مفتاحك التجريبي الجديد'; $('mc-key-box').hidden = false;
  });
  $('mc-hooks-load').onclick = function () { MC.hooks = null; mcLoadHooks(); };
  $('mc-hooktest').onclick = mcDo($('mc-hooktest'), async function () {
    var r = await payApi('pay.hooktest');
    if (r.ok) toast('وصل الإشعار، وردّ خادمك بـ ' + r.status);
    else toast(r.status ? 'خادمك ردّ بـ ' + r.status + '. يجب أن يرد بـ 200' : 'تعذّر الوصول إلى رابطك خلال 8 ثوانٍ', true);
  });
  $('mc-key-copy').onclick = function () { copyText($('mc-key').textContent); };
  $('mc-secret-copy').onclick = function () { copyText(MC.data.merchant.webhook_secret); };
  $('mc-docs').onclick = function () { window.open(PAY_DOCS, '_blank'); };
  $('mc-top').onclick = mcDo($('mc-top'), async function () {
    var amt = $('mc-top-amt').value.trim().replace(',', '.');
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(amt)) throw new Error('BAD_AMOUNT');
    var r = await payApi('pay.topup', { amount: amt, network: $('mc-top-net').value });
    $('mc-top-amt').value = '';
    window.open(r.invoice.pay_url, '_blank'); // صفحة الدفع: المبلغ الدقيق والعنوان، ويُضاف الرصيد تلقائياً بعد التأكيد
  });

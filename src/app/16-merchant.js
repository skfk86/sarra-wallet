  // ===== بوابة الدفع للتجار: إدارة حساب التاجر (الطلبات موقّعة بالمحفظة، مثل P2P) =====
  var PAY_URL = CFG.payUrl || (P2P_URL ? P2P_URL.replace(/\/p2p\/?$/, '/pay') : '');
  var PAY_DOCS = CFG.payDocs || 'https://skfk86.github.io/sarra-wallet/api.html';
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
    NO_WEBHOOK_URL: 'أضف رابط إشعار الدفع أولاً من «تعديل البيانات»'
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
  var MC_ST = { pending: 'بانتظار الدفع', paid: 'مدفوعة', expired: 'منتهية' };
  function mcRender() {
    var d = MC.data, m = d && d.merchant;
    if (!m) return mcForm();
    $('mc-credit').textContent = niceNum(m.credit, 2); $('mc-shop').textContent = m.name;
    $('mc-fee').textContent = 'نخصم ' + d.fee_pct + '% عن كل فاتورة مدفوعة (بحد أدنى ' + d.fee_min + ' USDT). الفواتير غير المدفوعة مجانية.';
    var sel = $('mc-top-net'); sel.textContent = '';
    (d.topup_networks || []).forEach(function (k) { var o = el('option', '', (d.networks && d.networks[k]) || k); o.value = k; sel.appendChild(o); });
    if (sel.querySelector('option[value=bsc]')) sel.value = 'bsc';
    $('mc-top').disabled = !(d.topup_networks || []).length;
    $('mc-key-state').textContent = m.key_hint ? 'مفتاحك الحالي ينتهي بـ ' + m.key_hint + '. إنشاء مفتاح جديد يوقف القديم فوراً.' : 'لم تنشئ مفتاحاً بعد. تحتاجه ليتصل خادمك بالبوابة.';
    $('mc-key-new').textContent = m.key_hint ? 'إنشاء مفتاح جديد' : 'إنشاء مفتاح API';
    $('mc-tkey-state').textContent = m.test_key_hint ? 'مفتاحك التجريبي ينتهي بـ ' + m.test_key_hint + '. فواتيره تُدفع بزر «محاكاة الدفع» ولا تخصم من رصيدك.' : 'للتجربة بدون مال: فواتير sk_test_ تُدفع بزر «محاكاة الدفع»، ولا تخصم من رصيدك.';
    $('mc-tkey-new').textContent = m.test_key_hint ? 'إنشاء مفتاح تجريبي جديد' : 'إنشاء مفتاح تجريبي';
    $('mc-hooktest').hidden = !m.webhook_url;
    $('mc-hook-view').textContent = m.webhook_url || 'لم تضف رابط إشعار. خادمك يستعلم عن الفاتورة بنفسه.';
    var box = $('mc-inv'); box.textContent = '';
    var list = (d.invoices || []).filter(function (x) { return x.kind === 'payment'; });
    if (!list.length) box.appendChild(el('span', 'font-size:13px;color:var(--mu)', 'لا فواتير بعد. أنشئ أول فاتورة من خادمك عبر الـ API.'));
    list.slice(0, 10).forEach(function (x) {
      var r = el('div', 'display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--div);font-size:14px');
      var a = el('div', 'display:flex;flex-direction:column;min-width:0');
      a.appendChild(el('b', 'direction:ltr;text-align:right', niceNum(x.amount, 2) + ' USDT' + (x.test ? ' · تجريبية' : '')));
      a.appendChild(el('span', 'font-size:12px;color:var(--mu);overflow:hidden;text-overflow:ellipsis;white-space:nowrap', (x.order_id || x.id) + ' · ' + (x.network_name || x.network)));
      r.appendChild(a);
      r.appendChild(el('span', 'font-size:12px;font-weight:700;white-space:nowrap;color:' + (x.status === 'paid' ? 'var(--ac)' : 'var(--mu)'), MC_ST[x.status] || x.status));
      box.appendChild(r);
    });
    mcView('dash');
  }
  async function openMerchant() {
    show('merchant'); $('mc-key-box').hidden = true; $('mc-key').textContent = '';
    if (!PAY_URL) { $('mc-load').textContent = 'بوابة الدفع غير متاحة في هذه النسخة.'; return mcView('load'); }
    if (MC.data) mcRender(); else { $('mc-load').textContent = 'جارٍ التحميل…'; mcView('load'); }
    try { MC.data = await payApi('pay.me'); mcRender(); }
    catch (e) { if (!MC.data) { $('mc-load').textContent = mcErr(e); mcView('load'); } }
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
    $('mc-key').textContent = r.api_key; $('mc-key-box').hidden = false;
    MC.data.merchant.key_hint = r.api_key.slice(-4); $('mc-key-state').textContent = 'مفتاحك الجديد جاهز. المفتاح القديم توقف.'; $('mc-key-new').textContent = 'إنشاء مفتاح جديد';
  });
  $('mc-tkey-new').onclick = mcDo($('mc-tkey-new'), async function () {
    var r = await payApi('pay.key', { test: true });
    $('mc-key').textContent = r.api_key; $('mc-key-box').hidden = false;
    MC.data.merchant.test_key_hint = r.api_key.slice(-4); mcRender(); $('mc-key-box').hidden = false;
  });
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

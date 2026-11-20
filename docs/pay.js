// منطق صفحة الدفع (ملف خارجي: سياسة المحتوى تمنع أي سكربت مضمّن في هذه الصفحة الحساسة)
(function () {
  // الدومين أولاً، ورابط Supabase المباشر احتياطاً إن تعذّر الوصول (انقطاع DNS مثلاً)
  var BASES = ['https://api.sarrapay.com', 'https://osdojhpsfbcqguoctbpk.supabase.co/functions/v1/pay'];
  async function apiFetch(path, opt) {
    var last; for (var i = 0; i < BASES.length; i++) { try { return await fetch(BASES[i] + path, opt); } catch (e) { last = e; } }
    throw last;
  }
  var $ = function (i) { return document.getElementById(i); }, id = new URLSearchParams(location.search).get('i') || (location.pathname.match(/inv_[0-9a-f]{20}/) || [''])[0];
  var views = ['load', 'pay', 'paid', 'exp', 'cxl', 'err'], inv = null, timer = null, drawn = false;
  function view(v) { views.forEach(function (x) { $('v-' + x).hidden = x !== v; }); }
  var ERR_IC = null;
  function err(t, d, retry) { if (ERR_IC === null) ERR_IC = $('v-err').querySelector('.sic svg').innerHTML; $('err-t').textContent = t; $('err-d').textContent = d; $('err-tips').hidden = !!retry; $('err-retry').hidden = !retry; $('v-err').querySelector('.sic svg').innerHTML = retry ? '<path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8"/><path d="M19 12.9a10 10 0 0 0-2.3-1.6"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M22 8.8A15 15 0 0 0 11 5"/><path d="m2 2 20 20"/>' : ERR_IC; view('err'); }
  function tick() {
    if (!inv || inv.status !== 'pending') return;
    var ms = Date.parse(inv.expires_at) - Date.now();
    if (ms <= 0) { inv.status = 'expired'; return render(); }
    var s = Math.floor(ms / 1000); $('left').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  // رابط الرجوع للمتجر: نضيف رقم الفاتورة وحالتها ليعرف المتجر النتيجة (ويتحقق منها من خادمه، لا من الرابط)
  var CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
  function retUrl(st) {
    try { var u = new URL(inv.success_url); if (u.protocol !== 'https:') return ''; u.searchParams.set('sarra_invoice', inv.id); u.searchParams.set('sarra_status', st); return u.toString(); } catch (e) { return ''; }
  }
  var redirTimer = null;
  function setRet(elId, st) {
    var a = $(elId), u = inv.success_url ? retUrl(st) : '';
    a.hidden = !u; if (!u) return '';
    a.href = u; a.textContent = 'الرجوع إلى ' + (inv.merchant || 'المتجر') + ' '; a.insertAdjacentHTML('beforeend', CHEV);
    return u;
  }
  function render() {
    document.querySelectorAll('.cur').forEach(function (e) { e.textContent = inv.currency || 'USDT'; });
    $('merchant').textContent = inv.merchant || 'الدفع عبر صُرّة'; $('desc').textContent = inv.description || '';
    $('test').hidden = !inv.test; $('real').hidden = !!inv.test; $('simc').hidden = !inv.test;
    if (inv.test) { $('samt').textContent = inv.pay_amount; $('snet').textContent = inv.network_name; }
    if (inv.status === 'paid') {
      $('paid-amt').textContent = inv.pay_amount;
      $('paid-m').textContent = inv.merchant || '—'; $('paid-net').textContent = inv.network_name || '';
      $('paid-at').textContent = inv.paid_at ? new Date(inv.paid_at).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
      var tx = inv.tx || '', EXP = { bsc: 'https://bscscan.com/tx/', polygon: 'https://polygonscan.com/tx/', eth: 'https://etherscan.io/tx/', tron: 'https://tronscan.org/#/transaction/' };
      $('paid-txrow').hidden = !tx || inv.test;
      if (tx) { $('paid-tx').textContent = tx.slice(0, 8) + '…' + tx.slice(-6); var ex = EXP[inv.network]; if (ex) $('paid-tx').href = ex + tx;
        $('paid-cpy').onclick = function () { try { navigator.clipboard.writeText(tx); this.textContent = 'تم'; } catch (e) {} }; }
      var u = setRet('ret-paid', 'paid');
      $('paid-note').hidden = !!u;
      if (u && !redirTimer) { // رجوع تلقائي بعد 6 ثوانٍ مع شريط تقدّم، ويمكن الضغط فوراً
        var left = 6; $('ret-cd').hidden = false;
        var step = function () { $('ret-txt').textContent = 'ستعود إلى المتجر تلقائياً خلال ' + left + ' ثوانٍ'; $('ret-bar').style.width = (left / 6 * 100) + '%'; if (left-- <= 0) { clearInterval(redirTimer); location.href = u; } };
        step(); redirTimer = setInterval(step, 1000);
      }
      if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {}
      return view('paid');
    }
    if (inv.status === 'expired') { setRet('ret-exp', 'expired'); return view('exp'); }
    if (inv.status === 'cancelled') { setRet('ret-cxl', 'cancelled'); return view('cxl'); }
    $('amt').textContent = inv.pay_amount; $('addr').textContent = inv.address;
    $('net').textContent = $('net2').textContent = inv.network_name;
    if (!inv.test && !drawn && window.sarraQR) { try { $('qr').innerHTML = sarraQR.svg(inv.address, 2); drawn = true; } catch (e) {} }
    view('pay'); tick();
  }
  async function load(first) {
    try {
      var r = await apiFetch('/v1/public/' + id, { cache: 'no-store' }), j = await r.json();
      if (r.status === 404) return err('الفاتورة غير موجودة', 'تأكد من الرابط، أو اطلب رابطاً جديداً من المتجر.');
      if (!r.ok || !j.invoice) throw 0;
      inv = j.invoice; render();
      // نتابع بعد الانتهاء أيضاً لفترة: الدفعات المتأخرة قليلاً تُقبل
      if (inv.status === 'paid' || inv.status === 'cancelled' || (inv.status === 'expired' && Date.now() - Date.parse(inv.expires_at) > 25 * 60000)) clearInterval(timer);
    } catch (e) { if (first) err('تعذّر الاتصال', 'تحقق من الإنترنت ثم أعد المحاولة. فاتورتك لم تتأثر.', true); }
  }
  $('sim').onclick = async function () {
    var b = this; b.disabled = true; b.textContent = 'جارٍ…';
    try { var r = await apiFetch('/v1/public/' + id + '/simulate', { method: 'POST' }), j = await r.json(); if (j.invoice) { inv = j.invoice; render(); clearInterval(timer); return; } b.textContent = 'تعذّر: ' + (j.error || r.status); }
    catch (e) { b.textContent = 'تعذّر الاتصال'; }
    b.disabled = false; setTimeout(function () { b.textContent = 'محاكاة الدفع'; }, 2500);
  };
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.onclick = function () {
      var t = $(b.dataset.copy).textContent, old = b.textContent, done = function () { b.textContent = 'تم النسخ'; setTimeout(function () { b.textContent = old; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () {});
      else { var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); done(); } catch (e) {} a.remove(); }
    };
  });
  $('err-retry').onclick = function () { view('load'); load(true); };
  if (!/^inv_[0-9a-f]{20}$/.test(id)) return err('رابط الدفع غير صالح', 'الرابط ناقص أو تغيّر أثناء النسخ. اطلب من المتجر إرسال رابط الدفع مرة أخرى.');
  load(true); timer = setInterval(function () { load(false); }, 8000); setInterval(tick, 1000);
})();

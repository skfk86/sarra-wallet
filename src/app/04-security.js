  // ===== الأمان =====
  function prepareSecurity() {
    $('sw-hide').setAttribute('aria-checked', state.hidden ? 'true' : 'false');
    $('sec-net').textContent = netName();
    $('sw-bio').setAttribute('aria-checked', bioEnabled() ? 'true' : 'false');
    bioAvailable().then(function (ok) { $('bio-row').hidden = !ok; });
    syncPhoneRow();
  }
  $('sw-hide').onclick = function () { setHidden(!state.hidden); };
  // استقبال التحويلات برقم الهاتف: للموثّقين فقط
  async function syncPhoneRow() {
    $('phone-row').hidden = true; $('sec-acc').parentNode.hidden = !P2P_URL; $('sec-acc').parentNode.previousElementSibling.hidden = !P2P_URL;
    if (!P2P_URL) return;
    try {
      var me = (state.p2p.me && state.p2p.me.profile) ? state.p2p.me : await fetchMe(false);
      // الحالة المحفوظة "غير موثّق" قد تكون قديمة (قبِل المشرف التوثيق بعدها): نتحقق من الخادم
      if (me.profile.verify_status !== 'approved') me = await fetchMe(true);
      state.p2p.me = me = await autoPhoneLink(me); var pf = me.profile;
      $('sw-phone').setAttribute('aria-checked', pf.phone_link ? 'true' : 'false');
      $('phone-sub').textContent = pf.verify_status !== 'approved' ? 'يتطلب توثيق حسابك أولاً'
        : pf.phone_link ? 'يستطيع من يعرف رقمك ' + (pf.phone_masked || '') + ' أن يرسل لك على كل الشبكات' : 'الرقم الموثّق: ' + (pf.phone_masked || '');
    } catch (e) {}
  }
  $('sw-phone').onclick = async function () {
    if (!(await ensureProfile())) return;
    var pf = state.p2p.me.profile, on = !pf.phone_link;
    if (on && pf.verify_status !== 'approved') { try { state.p2p.me = await fetchMe(true); pf = state.p2p.me.profile; } catch (e) {} }
    if (on && pf.verify_status !== 'approved') {
      if (await askConfirm('استقبال التحويلات برقم هاتفك متاح للحسابات الموثّقة، لأن رقمك يُراجَع مع هويتك. وثّق حسابك الآن؟')) openVerify();
      return;
    }
    if (on && !(await askConfirm('من يعرف رقمك سيستطيع أن يرسل لك USDT، وسيرى اسمك الأول والحرف الأول من اسم والدك فقط. لن يُعرض عنوان محفظتك. تفعيل؟'))) return;
    try {
      await p2p('phone.link', { on: on, evm: on ? await core.evmAddress() : undefined });
      state.p2p.me = await fetchMe(true); renderMe(); syncPhoneRow();
      toast(on ? 'تم التفعيل: يمكن الإرسال إليك برقم هاتفك' : 'تم الإيقاف');
    } catch (e) { toast(p2pErr(e), true); }
  };
  // بعد قبول التوثيق: نفعّل الاستقبال بالرقم تلقائياً إن اختاره المستخدم عند التوثيق
  async function autoPhoneLink(me) {
    return me; // أُلغي الاستلام برقم الهاتف: معرّف صُرّة يكفي
    var pf = me && me.profile; if (!pf || pf.verify_status !== 'approved') return me;
    var evm = null; try { evm = await core.evmAddress(); } catch (e) {}
    // مفعّل لكن بلا عنوان 0x (قبل دعم كل الشبكات): نضيفه بصمت
    if (pf.phone_link) {
      if (evm && !pf.evm_address) { try { await p2p('phone.link', { on: true, evm: evm }); me = await fetchMe(true); } catch (e) {} }
      return me;
    }
    var want; try { want = localStorage.getItem('sarra.wantPhone'); } catch (e) {}
    if (want !== '1') return me;
    try { await p2p('phone.link', { on: true, evm: evm || undefined }); localStorage.removeItem('sarra.wantPhone'); me = await fetchMe(true); toast('تم تفعيل الاستقبال برقم هاتفك'); }
    catch (e) { if (/PHONE_TAKEN/.test(e && e.message)) try { localStorage.removeItem('sarra.wantPhone'); } catch (x) {} }
    return me;
  }
  var ACC_ST = { none: ['غير موثّق', 'وثّق حسابك مرة واحدة لتفتح: نشر إعلانات البيع والشراء في السوق، وشارة "موثّق" بجانب اسمك.'],
    pending: ['قيد المراجعة', 'أرسلت بياناتك، وسيراجعها المشرف قريباً. ستصلك الميزات فور القبول.'],
    rejected: ['مرفوض', 'رُفض الطلب. صحّح بياناتك وأرسلها مرة أخرى.'],
    approved: ['موثّق ✓', 'حسابك موثّق. يمكنك تعديل رقمك أو حساب بنكك في أي وقت، ويُراجع التعديل قبل اعتماده.'] };
  async function openAccount() {
    show('account');
    if (state.p2p.me && state.p2p.me.profile) renderAccount();
    else { $('acc-hint').textContent = 'جارٍ التحميل…'; $('acc-go').disabled = true; }
    if (!(await ensureProfile())) { $('acc-hint').textContent = 'تعذّر الاتصال. حاول لاحقاً.'; return; }
    renderAccount();
    // تحديث صامت في الخلفية (قد تكون حالة التوثيق تغيّرت)
    try { var me = await fetchMe(true); me = await autoPhoneLink(me); state.p2p.me = me; if (state.stack[state.stack.length - 1] === 'account') renderAccount(); } catch (e) {}
  }
  // احتفال قبول التوثيق: يظهر مرة واحدة عند تحوّل الحالة من "قيد المراجعة" إلى "موثّق"
  function checkApproval(key, me) {
    try {
      var k = key + '.vs', prev = localStorage.getItem(k), now = me && me.profile && me.profile.verify_status;
      if (now) localStorage.setItem(k, now);
      if (prev === 'pending' && now === 'approved') celebrate();
    } catch (e) {}
  }
  function celebrate() {
    var box = $('celebrate').querySelector('.box'); box.querySelectorAll('i').forEach(function (x) { x.remove(); });
    var colors = ['#16a37a', '#f5b301', '#ef4444', '#3b82f6', '#a855f7'];
    for (var i = 0; i < 26; i++) { var c = document.createElement('i'); c.style.left = (Math.random() * 100) + '%'; c.style.background = colors[i % 5]; c.style.animationDelay = (Math.random() * .6) + 's'; box.appendChild(c); }
    $('celebrate').classList.add('show');
  }
  $('cel-ok').onclick = function () { $('celebrate').classList.remove('show'); if (state.stack[state.stack.length - 1] === 'account' && state.p2p.me) renderAccount(); };
  $('sec-acc').onclick = function () { openAccount(); };
  $('acc-sid-copy').onclick = function () { var id = state.p2p.me && state.p2p.me.profile.sarra_id; if (id) copyText(String(id)); };
  function renderAccount() {
    var pf = state.p2p.me.profile, st = pf.verify_status || 'none', t = ACC_ST[st] || ACC_ST.none;
    var name = st === 'approved' || st === 'pending' ? (pf.full_name || pf.nickname) : (pf.nickname || 'حسابي');
    $('acc-name').textContent = name; $('acc-av').textContent = String(name || 'ص').trim().charAt(0) || 'ص';
    $('acc-badge').textContent = t[0]; $('acc-badge').className = 'acc-pill ' + (st === 'approved' ? 'ok' : st === 'pending' ? 'wait' : st === 'rejected' ? 'bad' : '');
    $('acc-sid').textContent = pf.sarra_id ? fmtSid(pf.sarra_id) : '— —';
    $('acc-pending').hidden = st !== 'pending';
    $('acc-hint').textContent = st === 'pending' ? '' : t[1] + (st === 'rejected' && pf.verify_note ? ' السبب: ' + pf.verify_note : '');
    $('acc-hint').hidden = st === 'pending';
    var hasData = st === 'approved' || st === 'pending';
    $('acc-name2').textContent = pf.full_name || '—'; $('acc-phone').textContent = pf.phone_masked || '—'; $('acc-bank').textContent = pf.bankak_account || '—';
    document.querySelectorAll('#acc-data .li:not(#acc-go)').forEach(function (r) { r.hidden = !hasData; });
    $('acc-data-h').textContent = hasData ? 'بيانات التوثيق' : 'التوثيق';
    var go = $('acc-go'); go.hidden = st === 'pending'; go.disabled = false;
    go.querySelector('.t').firstChild.textContent = st === 'approved' ? 'تعديل البيانات' : 'وثّق حسابك';
    go.querySelector('small').textContent = st === 'approved' ? 'يُراجَع التعديل قبل اعتماده' : 'الاسم ورقم الهاتف وحساب بنكك وصورة الهوية';
    $('acc-data').hidden = st === 'pending'; $('acc-data-h').hidden = st === 'pending';
    var on = !!pf.phone_link, pb = $('acc-phone-btn');
    pb.setAttribute('aria-checked', on ? 'true' : 'false');
    $('acc-phone-on').textContent = on ? 'من يعرف رقمك ' + (pf.phone_masked || '') + ' يرسل لك على كل الشبكات' : st === 'approved' ? 'غير مفعّل' : 'يتطلب توثيق الحساب';
  }
  $('acc-go').onclick = function () { var st = state.p2p.me.profile.verify_status; openVerify(false, st === 'approved'); };
  $('acc-phone-btn').onclick = async function () {
    var pf = state.p2p.me.profile;
    if (!pf.phone_link && pf.verify_status !== 'approved') { try { localStorage.setItem('sarra.wantPhone', '1'); } catch (e) {} return openVerify(); }
    await $('sw-phone').onclick(); renderAccount();
  };
  async function syncRecvSid() {
    if (!P2P_URL) return;
    try { var me = (state.p2p.me && state.p2p.me.profile) ? state.p2p.me : await fetchMe(false); state.p2p.me = me;
      var sid = me.profile.sarra_id; if (!sid) me = state.p2p.me = await fetchMe(true), sid = me.profile.sarra_id;
      if (sid) { $('recv-sid-v').textContent = fmtSid(sid); $('recv-sid').hidden = false; } } catch (e) {}
  }
  $('recv-sid-copy').onclick = function () { rxWatch(); copyText(String((state.p2p.me && state.p2p.me.profile.sarra_id) || '')); };
  $('recv-sid-share').onclick = async function () { rxWatch();
    var sid = String((state.p2p.me && state.p2p.me.profile.sarra_id) || ''); if (!sid) return;
    var text = 'معرّف صُرّة الخاص بي: ' + fmtSid(sid) + '\nأرسل لي USDT مباشرة من تطبيق صُرّة بكتابة هذا المعرّف بدل عنوان المحفظة.';
    try { if (P.Share) await P.Share.share({ title: 'معرّف صُرّة', text: text }); else copyText(sid); } catch (e) {}
  };
  async function syncRecvPhone() {
    syncRecvSid();
    $('recv-phone').hidden = true; return;
    try {
      var me = (state.p2p.me && state.p2p.me.profile) ? state.p2p.me : await fetchMe(false);
      state.p2p.me = me = await autoPhoneLink(me); var pf = me.profile;
      $('recv-phone-t').textContent = pf.phone_link ? 'يمكن الإرسال إليك برقمك ' + (pf.phone_masked || '') : 'استقبل برقم هاتفك بدل هذا العنوان الطويل';
      b.hidden = false;
    } catch (e) {}
  }
  $('recv-phone').onclick = openAccount;
  $('sw-bio').onclick = function () {
    if (bioEnabled()) { bioDisable().then(function () { prepareSecurity(); toast('تم إيقاف البصمة'); }); return; }
    openPin('verify', async function (pin) {
      try {
        await bioVerify('تفعيل البصمة');
        await bioSavePin(pin);
        setBioFlag(true);
        toast('تم تفعيل البصمة');
      } catch (e) { toast('لم يتم تفعيل البصمة', true); }
      resetTo('security');
    });
  };
  $('lock-now').onclick = function () { core.lock(); openPin('unlock'); };
  $('sec-reveal').onclick = function () {
    openPin('verify', async function (pin) {
      try {
        var m = await core.revealMnemonic(pin);
        fillWords($('words2'), m, true);
        state.stack.pop(); // لا نرجع لشاشة الرمز
        show('reveal');
      } catch (e) { toast(WalletCore.errorText(e), true); }
    });
  };
  $('reveal-done').onclick = function () { $('words2').textContent = ''; resetTo('security'); };
  $('sec-pin').onclick = function () {
    openPin('verify', function (pin) {
      state.oldPin = pin;
      $('pin-err').textContent = '';
      setPinMode('newpin');
    });
  };
  $('sec-wipe').onclick = function () { $('wipe-sheet').classList.add('show'); };
  $('wipe-no').onclick = function () { $('wipe-sheet').classList.remove('show'); };
  $('wipe-yes').onclick = function () {
    $('wipe-sheet').classList.remove('show');
    openPin('verify', function () { wipeAndRestart('wiped'); });
  };


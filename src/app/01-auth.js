  // ===== كلمات الاسترجاع =====
  function fillWords(ol, m, revealed) {
    ol.textContent = '';
    m.split(' ').forEach(function (w, i) {
      var li = document.createElement('li');
      var n = document.createElement('span'); n.textContent = i + 1;
      var t = document.createElement('span'); t.className = 'mono';
      t.textContent = revealed ? w : '••••••';
      if (!revealed) t.style.color = 'var(--dot)';
      li.appendChild(n); li.appendChild(t); ol.appendChild(li);
    });
  }
  // الكلمات لا تُكتب في الشاشة إطلاقاً قبل الضغط على "إظهار"
  function renderWords(m, revealed) {
    fillWords($('words'), m, revealed);
    $('reveal').hidden = !!revealed;
    if (!revealed) { $('agree').checked = false; $('backup-next').disabled = true; }
  }
  $('reveal').onclick = function () { renderWords(state.mnemonic, true); };
  $('agree').onchange = function () { $('backup-next').disabled = !this.checked; };
  $('backup-next').onclick = function () { openPin('create'); };

  $('import-next').onclick = function () {
    var m = $('mn-in').value;
    if (!core.validateMnemonic(m)) {
      $('import-err').textContent = 'الكلمات غير صحيحة. تأكد من الترتيب والإملاء.';
      $('import-err').hidden = false;
      return;
    }
    state.mnemonic = m;
    $('mn-in').value = '';
    openPin('create');
  };

  // ===== رمز القفل =====
  // الأوضاع: create → confirm (محفظة جديدة) | unlock | verify (تأكيد قبل عملية حساسة) | newpin → newconfirm (تغيير الرمز)
  var PIN_TEXT = {
    create: ['أنشئ رمز القفل', '6 أرقام لفتح التطبيق وتأكيد كل عملية'],
    confirm: ['أعد إدخال الرمز', 'للتأكيد'],
    unlock: ['أدخل رمز القفل', 'لفتح محفظتك'],
    verify: ['أدخل رمز القفل', 'للمتابعة'],
    newpin: ['الرمز الجديد', 'اختر 6 أرقام جديدة'],
    newconfirm: ['أعد إدخال الرمز الجديد', 'للتأكيد']
  };
  function setPinMode(mode) {
    state.pinMode = mode; state.pin = ''; state.pinBusy = false;
    $('forgot-pin').hidden = mode !== 'unlock';
    $('pin-title').textContent = PIN_TEXT[mode][0];
    $('pin-sub').textContent = PIN_TEXT[mode][1];
    var bk = $('bio-key');
    if (bk) bk.style.visibility = (bioEnabled() && (mode === 'unlock' || mode === 'verify')) ? 'visible' : 'hidden';
    renderDots();
  }

  // ===== البصمة =====
  // رمز PIN يُحفظ في Android Keystore خلف البصمة، ولا يُقرأ إلا بعد التحقق منها
  var BIO_SERVER = 'com.sarra.wallet';
  var Bio = P.NativeBiometric;
  function bioEnabled() { try { return !!Bio && localStorage.getItem('sarra.bio') === '1'; } catch (e) { return false; } }
  function setBioFlag(v) { try { localStorage.setItem('sarra.bio', v ? '1' : '0'); } catch (e) {} }
  async function bioAvailable() {
    if (!Bio) return false;
    try { var r = await Bio.isAvailable(); return !!r.isAvailable; } catch (e) { return false; }
  }
  function bioVerify(title) {
    return Bio.verifyIdentity({ reason: title, title: title, subtitle: 'صُرّة', negativeButtonText: 'استخدم الرمز' }).then(async function () {
      // إن أُقفلت المحفظة في الخلفية نعيد فتحها بالرمز المحفوظ بالبصمة، وإلا تفشل العملية بـ "افتح القفل أولاً"
      if (!core.isUnlocked()) { var c = await Bio.getCredentials({ server: BIO_SERVER }); await core.unlock(c.password); }
    });
  }
  async function bioForPin() {
    if (!bioEnabled()) return;
    try {
      await bioVerify(state.pinMode === 'unlock' ? 'فتح المحفظة' : 'تأكيد هويتك');
      var c = await Bio.getCredentials({ server: BIO_SERVER });
      if (c && c.password && !state.pinBusy) { state.pinBusy = true; state.pin = c.password; renderDots(); pinComplete(); }
    } catch (e) { /* أُلغيت البصمة: يكمل المستخدم بالرمز */ }
  }
  async function bioSavePin(pin) {
    await Bio.setCredentials({ username: 'pin', password: pin, server: BIO_SERVER });
  }
  async function bioDisable() {
    try { if (Bio) await Bio.deleteCredentials({ server: BIO_SERVER }); } catch (e) {}
    setBioFlag(false);
  }

  function openPin(mode, cb) {
    state.firstPin = ''; state.pinCb = cb || null;
    $('pin-err').textContent = '';
    $('pin-top').style.visibility = mode === 'unlock' ? 'hidden' : 'visible';
    setPinMode(mode);
    if (mode === 'unlock') resetTo('pin'); else show('pin');
    if (mode === 'unlock' && bioEnabled()) setTimeout(bioForPin, 350);
  }
  function renderDots() {
    var d = $('dots'); d.textContent = '';
    for (var i = 0; i < 6; i++) { var s = document.createElement('span'); s.className = 'dot' + (i < state.pin.length ? ' on' : ''); d.appendChild(s); }
    d.setAttribute('aria-label', state.pin.length + ' من 6 أرقام');
  }
  (function buildKeypad() {
    var kp = $('keypad');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      if (k === '') {
        b.className = 'key fn'; b.id = 'bio-key'; b.setAttribute('aria-label', 'الدخول بالبصمة');
        b.style.visibility = 'hidden';
        b.innerHTML = '<svg class="i" style="width:28px;height:28px" viewBox="0 0 24 24"><path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2"/></svg>';
        b.onclick = function () { bioForPin(); };
      }
      else if (k === 'del') {
        b.className = 'key fn'; b.setAttribute('aria-label', 'حذف');
        b.innerHTML = '<svg class="i" style="width:24px;height:24px" viewBox="0 0 24 24"><path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/></svg>';
        b.onclick = function () { if (state.pinBusy) return; state.pin = state.pin.slice(0, -1); renderDots(); };
      } else {
        b.className = 'key'; b.textContent = k;
        b.onclick = function () {
          if (state.pinBusy || state.pin.length >= 6) return;
          state.pin += k; renderDots();
          if (state.pin.length === 6) { state.pinBusy = true; setTimeout(pinComplete, 120); }
        };
      }
      kp.appendChild(b);
    });
  })();
  async function lockMsg(e) {
    if (e && e.message === 'LOCKED_OUT') {
      var ms = await core.lockoutRemaining();
      return 'محاولات كثيرة خاطئة. حاول بعد ' + Math.max(1, Math.ceil(ms / 60000)) + ' دقيقة';
    }
    return WalletCore.errorText(e);
  }
  function pinError(msg) {
    state.pinBusy = false;
    $('pin-err').textContent = msg;
    var d = $('dots'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
    state.pin = ''; renderDots();
  }
  async function pinComplete() {
    var pin = state.pin, mode = state.pinMode;
    $('pin-err').textContent = '';

    if (mode === 'create' || mode === 'newpin') {
      state.firstPin = pin;
      return setPinMode(mode === 'create' ? 'confirm' : 'newconfirm');
    }
    if (mode === 'confirm' || mode === 'newconfirm') {
      if (pin !== state.firstPin) { setPinMode(mode === 'confirm' ? 'create' : 'newpin'); return pinError('الرمزان غير متطابقين، حاول مجدداً'); }
      $('pin-sub').textContent = 'جارٍ التأمين…';
      try {
        if (mode === 'confirm') {
          await core.saveWallet(state.mnemonic, pin);
          state.mnemonic = null; state.firstPin = '';
          resetTo('home');
          showIntro();
        } else {
          await core.changePin(state.oldPin, pin);
          if (bioEnabled()) { try { await bioSavePin(pin); } catch (e) { await bioDisable(); } }
          state.oldPin = null; state.firstPin = '';
          resetTo('security');
          toast('تم تغيير رمز القفل');
        }
      } catch (e) { setPinMode(mode === 'confirm' ? 'create' : 'newpin'); pinError(await lockMsg(e)); }
      return;
    }
    if (mode === 'verify') {
      $('pin-sub').textContent = 'جارٍ التحقق…';
      try {
        if (core.isUnlocked()) await core.verifyPin(pin); else await core.unlock(pin); // يعيد فتح المحفظة إن أُقفلت
        var cb = state.pinCb; state.pinCb = null;
        if (cb) cb(pin);
      } catch (e) { setPinMode('verify'); pinError(await lockMsg(e)); }
      return;
    }
    // unlock
    $('pin-sub').textContent = 'جارٍ التحقق…';
    try {
      await core.unlock(pin);
      // بعد القفل التلقائي نعيدك لنفس الشاشة التي كنت فيها بدل الرئيسية
      var rs = state.resume; state.resume = null;
      if (rs && rs.length && rs[rs.length - 1] !== 'pin') { state.stack = rs.slice(0, -1); show(rs[rs.length - 1]); } else resetTo('home');
    }
    catch (e) { setPinMode('unlock'); pinError(await lockMsg(e)); }
  }


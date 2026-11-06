  // ===== سوق P2P =====
  // كل طلب يُوقَّع بمفتاح المحفظة على الجهاز؛ الخادم يتحقق من التوقيع ولا يرى المفتاح أبداً
  var P2P_URL = CFG.p2pUrl || '';
  var P2P_ERRORS = {
    BAD_AMOUNT: 'المبلغ غير صحيح', BAD_MESSAGE: 'طلب غير صالح. حدّث التطبيق', BAD_NONCE: 'طلب غير صالح. حاول مرة أخرى', BAD_WINDOW: 'اختر مهلة الدفع',
    DB_ERROR: 'خطأ مؤقت في الخادم. حاول بعد قليل', SERVER_ERROR: 'خطأ مؤقت في الخادم. حاول بعد قليل', SERVER: 'تعذّر الاتصال بالخادم. حاول بعد قليل',
    FEE_TOO_HIGH: 'المبلغ صغير جداً مقارنة بالرسوم', NETWORK: 'لا يوجد اتصال بالإنترنت أو الخادم لا يرد', UNAUTHORIZED: 'تعذّر التحقق من المحفظة. أعد فتح التطبيق',
    UNKNOWN_ACTION: 'هذه الميزة تحتاج تحديث التطبيق', OPEN_ORDERS: 'لديك صفقات مفتوحة. أكملها أولاً', CANCELLED: 'أُلغيت العملية', REPLAY: 'أُرسل الطلب مرتين. حاول مرة أخرى',
    BAD_RECEIPT_TYPE: 'الملف ليس صورة صالحة. ارفع لقطة شاشة من تطبيق بنكك', RECEIPT_TOO_SMALL: 'الصورة صغيرة أو غير واضحة. ارفع لقطة شاشة كاملة', RECEIPT_TOO_LARGE: 'الصورة كبيرة جداً', MAX_RECEIPTS: 'وصلت للحد الأقصى: 3 إيصالات للصفقة',
    NO_PROFILE: 'اختر اسمك في السوق أولاً', BANNED: 'هذا الحساب موقوف في السوق',
    OFFER_UNAVAILABLE: 'الإعلان لم يعد متاحاً', NETWORK_NOT_SUPPORTED: 'تداول P2P متاح على شبكة BNB Smart Chain فقط', OWN_OFFER: 'لا يمكنك الشراء من إعلانك',
    AMOUNT_UNAVAILABLE: 'الكمية خارج حدود الإعلان أو غير متوفرة', TOO_MANY_OPEN: 'لديك 3 طلبات مفتوحة. أكملها أولاً',
    ESCROW_UNAVAILABLE: 'خدمة الضمان غير متاحة الآن. حاول لاحقاً', INVALID_STATE: 'حالة الطلب تغيّرت. حدّث الصفحة',
    PAY_WINDOW_OPEN: 'لا يمكن الإلغاء قبل انتهاء مهلة الدفع', NOT_ALLOWED: 'غير مسموح', NOT_FOUND: 'الطلب غير موجود',
    EXPIRED_REQUEST: 'وقت هاتفك غير مضبوط. فعّل الوقت التلقائي من الإعدادات', BAD_SIGNATURE: 'تعذّر التحقق من المحفظة',
    MIN_TOO_LOW: 'أقل صفقة 10 USDT', MAX_LT_MIN: 'أكبر صفقة يجب أن تكون أكبر من الأقل', AMOUNT_LT_MIN: 'الكمية المعروضة أقل من أقل صفقة',
    BAD_BANKAK_ACCOUNT: 'رقم حساب بنكك غير صحيح (أرقام فقط)', BAD_BANKAK_NAME: 'اكتب اسم صاحب الحساب',
    BAD_PRICE_SDG: 'اكتب السعر', BAD_MIN_USDT: 'اكتب أقل صفقة', BAD_MAX_USDT: 'اكتب أكبر صفقة', BAD_AMOUNT_USDT: 'اكتب الكمية',
    BAD_NICKNAME: 'الاسم من 2 إلى 24 حرفاً', EMPTY_MESSAGE: 'اكتب رسالة', ORDER_CLOSED: 'الطلب مغلق',
    RATE_NOT_SET: 'لم يُحدَّد سعر الصرف بعد. حاول لاحقاً', PRICE_OUT_OF_RANGE: 'السعر خارج النطاق المسموح',
    MAX_OFFERS: 'لديك 3 إعلانات نشطة. أوقف واحداً أولاً', BAD_RATE: 'سعر الصرف غير صحيح', BAD_BAND: 'اختر الهامش',
    BAD_ADDRESS: 'عنوان المحفظة غير صحيح',
    ID_NOT_FOUND: 'لا يوجد مستخدم صُرّة بهذا المعرّف. تأكد من الأرقام الثمانية', BAD_ID: 'المعرّف 8 أرقام',
    RATE_LIMITED_ID_LOOKUP: 'محاولات بحث كثيرة اليوم، حاول غداً',
    PHONE_NOT_FOUND: 'الإرسال برقم الهاتف لم يعد متاحاً. استخدم معرّف صُرّة', PHONE_TAKEN: 'هذا الرقم مرتبط بمحفظة أخرى',
    RATE_LIMITED_PHONE_LOOKUP: 'بحثت عن أرقام كثيرة اليوم. حاول غداً أو استخدم عنوان المحفظة', SELF_SEND: 'لا يمكنك الإرسال إلى نفسك',
    VERIFY_REQUIRED: 'وثّق حسابك أولاً لتنشر إعلان بيع', VERIFY_PENDING: 'طلب توثيقك قيد المراجعة', ALREADY_VERIFIED: 'حسابك موثّق',
    BAD_FULL_NAME: 'اكتب اسمك كاملاً كما في الهوية', BAD_PHONE: 'رقم الهاتف غير صحيح (مثل 0912345678)', BAD_ID_IMAGE: 'صورة الهوية غير واضحة أو كبيرة جداً. التقط صورة أخرى',
    UPLOAD_FAILED: 'تعذّر رفع الصورة. حاول مرة أخرى', RATE_LIMITED_VERIFY: 'محاولات توثيق كثيرة اليوم',
    INSUFFICIENT_SELLER_USDT: 'رصيدك من USDT أقل من الكمية المعروضة (مع إعلاناتك النشطة)', SELLER_NEEDS_TRX: 'تحتاج 15 TRX على الأقل في محفظتك لرسوم الإيداع', SELLER_NEEDS_BNB: 'تحتاج 0.0003 BNB على الأقل (أقل من 0.2$) في محفظتك على BNB Chain لرسوم الإيداع', EVM_REQUIRED: 'حدّث التطبيق وافتح السوق مرة أخرى لتفعيل BNB Chain لحسابك', BAD_PAYOUT_ADDRESS: 'عنوان الاستلام غير صالح',
    SELLER_INSUFFICIENT: 'البائع لم يعد يملك هذه الكمية. اختر إعلاناً آخر', BALANCE_CHECK_FAILED: 'تعذّر فحص الرصيد على الشبكة. حاول بعد قليل',
    RATE_LIMITED_REQ: 'طلبات كثيرة جداً. انتظر دقيقة', RATE_LIMITED_OFFER_CREATE: 'وصلت الحد اليومي للإعلانات (5)',
    RATE_LIMITED_ORDER_CREATE: 'وصلت الحد اليومي للطلبات (10)', RATE_LIMITED_ORDER_CANCEL: 'إلغاءات كثيرة اليوم. حاول غداً',
    RATE_LIMITED_MESSAGE: 'رسائل كثيرة. انتظر قليلاً', RATE_LIMITED_PROFILE: 'غيّرت اسمك كثيراً اليوم'
  };
  // قراءة عامة عبر قاعدة البيانات مباشرة (أرخص بكثير من Edge Function)؛ عند فشلها نرجع للخادم
  var P2P_REST = CFG.p2pRest || '', P2P_KEY = CFG.p2pKey || '';
  async function rpc(fn, args) {
    if (!P2P_REST || !P2P_KEY) throw new Error('NO_REST');
    var res = await fetch(P2P_REST + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: P2P_KEY }, body: JSON.stringify(args || {}) });
    if (!res.ok) throw new Error('REST_' + res.status);
    return res.json();
  }
  function p2pErr(e) {
    var c = e && e.message; if (P2P_ERRORS[c]) return P2P_ERRORS[c];
    if (/^RATE_LIMITED/.test(c || '')) return 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى';
    var t = c && WalletCore.errorText(e);
    // لا نعرض رمزاً إنجليزياً خاماً للمستخدم أبداً
    if (!t || /^[A-Z][A-Z0-9_]{3,}$/.test(t) || t === c) return 'حدث خطأ غير متوقع. حاول مرة أخرى، وإن تكرر راسل الدعم (' + (c || '?') + ')';
    return t;
  }
  // إن أُقفلت المحفظة (في الخلفية مثلاً) نطلب الرمز فوراً ثم نكمل العملية نفسها، بدل رسالة نصية بلا لوحة أرقام
  document.addEventListener('pointerdown', function () { state.lastTap = Date.now(); }, true);
  function ensureUnlocked() {
    if (core.isUnlocked()) return Promise.resolve();
    if (state.unlockWait) return state.unlockWait.p;
    // طلبات الخلفية (التحديث الدوري) لا تفتح لوحة الرمز فجأة: فقط ما بدأه المستخدم بلمسة
    if (Date.now() - (state.lastTap || 0) > 4000) return Promise.reject(new Error('LOCKED'));
    // ألغى المستخدم للتو: لا نعيد فتح اللوحة تلقائياً عند الرجوع للشاشة (يحاول مجدداً بنفسه)
    if (state.unlockCancelAt && Date.now() - state.unlockCancelAt < 4000) return Promise.reject(new Error('CANCELLED'));
    // شاشة فتح القفل ظاهرة أصلاً (بداية التشغيل أو القفل التلقائي): ننتظرها بدل فتح لوحة ثانية
    if (state.pinMode === 'unlock' && state.stack[state.stack.length - 1] === 'pin') return new Promise(function (res) { var t = setInterval(function () { if (core.isUnlocked()) { clearInterval(t); res(); } }, 400); });
    var w = {}; w.p = new Promise(function (res, rej) { w.resolve = res; w.reject = rej; });
    state.unlockWait = w;
    var back = state.stack[state.stack.length - 1];
    openPin('verify', function () { state.unlockWait = null; state.stack.pop(); if (back && back !== 'pin') show(back, false); w.resolve(); });
    $('pin-sub').textContent = 'أُقفلت المحفظة للحماية. أدخل رمزك للمتابعة';
    if (bioEnabled()) setTimeout(bioForPin, 350);
    return w.p;
  }
  async function p2p(action, params, isPublic, attachment) {
    if (!isPublic) await ensureUnlocked();
    var body = isPublic ? Object.assign({ action: action }, params || {}) : await core.signRequest(action, params || {});
    if (attachment) body.attachment = attachment;
    var res;
    try { res = await fetch(P2P_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { throw new Error('NETWORK'); }
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || j.error) throw new Error(j.error || 'SERVER');
    return j;
  }
  function fmt(n, d) { return niceNum(n, d == null ? 2 : d); }
  function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }

  state.p2p = { tab: 'market', me: null, offer: null, orderId: null, poll: 0 };

  // نافذة تأكيد من تصميم التطبيق (بدل confirm/prompt)؛ withInput يطلب نصاً
  function askConfirm(text, withInput) {
    return new Promise(function (resolve) {
      $('ask-text').textContent = text;
      $('ask-field').hidden = !withInput; $('ask-in').value = '';
      $('ask-sheet').classList.add('show');
      var done = function (v) { $('ask-sheet').classList.remove('show'); resolve(v); };
      $('ask-yes').onclick = function () {
        if (withInput) { var t = $('ask-in').value.trim(); if (!t) { $('ask-in').focus(); return; } done(t); } else done(true);
      };
      $('ask-no').onclick = function () { done(null); };
    });
  }

  // تأكيد العمليات الحساسة (البصمة أو الرمز) ثم الرجوع لنفس الشاشة
  function authorize(title, fn) {
    var back = state.stack[state.stack.length - 1];
    var viaPin = function () { openPin('verify', function () { state.stack.pop(); show(back, false); fn(); }); };
    if (bioEnabled()) bioVerify(title).then(fn).catch(viaPin); else viaPin();
  }

  // الملف يُنشأ تلقائياً على الخادم باسم افتراضي؛ لا نسأل المستخدم عن اسمه
  // بيانات حسابك في السوق تُحفظ على الجهاز 6 ساعات: فتح التطبيق لا يكلّف الخادم شيئاً.
  // تُحدَّث فوراً بعد أي تغيير (الاسم، التوثيق، نشر إعلان) لأن تلك المواضع تطلبها من جديد.
  var ME_TTL = 6 * 3600 * 1000;
  async function fetchMe(force) {
    var key = 'sarra.me.' + (await core.getAddress());
    var evm = null; if (EVM.bsc) try { evm = await core.evmAddress(); } catch (e) {}
    if (!force) {
      // نتجاوز النسخة المحفوظة إن لم يُسجَّل عنوان BNB Chain بعد (يلزم لاستلام ضمان BEP20)
      var cm = cacheGet(key, ME_TTL, 'me'); if (cm && cm.profile && (!evm || cm.profile.evm_address === evm)) return cm;
    }
    var me = await p2p('me', evm ? { evm: evm } : {});
    cachePut(key, 'me', me);
    checkApproval(key, me);
    return me;
  }
  async function ensureProfile() {
    if (state.p2p.me && state.p2p.me.profile) return true;
    try { state.p2p.me = await fetchMe(false); } catch (e) { toast(p2pErr(e), true); return false; }
    renderMe(); pollMyOrders();
    return !!state.p2p.me.profile;
  }
  function renderMe() {
    var me = state.p2p.me; if (!me || !me.profile) return;
    $('p2p-nick-btn').textContent = 'اسمك في السوق: ' + me.profile.nickname + ' ✎';
    $('p2p-admin-btn').hidden = !me.is_admin;
    if (me.rate) { state.p2p.rate = me.rate; state.p2p.range = me.range; }
    if (me.fee_bps != null) state.p2p.feeBps = me.fee_bps;
    if (me.min_trade != null) state.p2p.minTrade = me.min_trade;
    if (me.net_fee != null) state.p2p.netFee = Number(me.net_fee);
    if (me.net_fee_bep != null) state.p2p.netFeeBep = Number(me.net_fee_bep);
  }
  $('p2p-nick-btn').onclick = async function () {
    if (!(await ensureProfile())) return;
    $('nick-in').value = state.p2p.me.profile.nickname; $('nick-err').hidden = true; $('nick-sheet').classList.add('show');
  };
  $('nick-no').onclick = function () { $('nick-sheet').classList.remove('show'); };
  $('nick-go').onclick = async function () {
    try {
      await p2p('profile.set', { nickname: $('nick-in').value });
      state.p2p.me = await fetchMe(true); renderMe();
      $('nick-sheet').classList.remove('show'); toast('تم حفظ اسمك');
    } catch (e) { $('nick-err').textContent = p2pErr(e); $('nick-err').hidden = false; }
  };
  function renderRate(rate, range) {
    if (rate) state.p2p.rate = rate;
    if (range !== undefined) state.p2p.range = range;
    var r = state.p2p.rate, rg = state.p2p.range;
    $('p2p-rate').hidden = !(r && r.sdg_per_usdt);
    if (r && r.sdg_per_usdt) {
      $('p2p-rate-val').textContent = fmt(r.sdg_per_usdt) + ' ج.س';
      $('p2p-rate-range').textContent = rg ? 'الإعلانات بين ' + fmt(rg.min) + ' و ' + fmt(rg.max) : '';
    }
  }

  async function loadP2P() {
    if (!P2P_URL) { emptyMsg($('p2p-list'), 'السوق غير مفعّل في هذه النسخة'); return; }
    var box = $('p2p-list');
    if (state.p2p.tab === 'mine') {
      if (!(await ensureProfile())) { emptyMsg(box, 'اختر اسمك في السوق لعرض إعلاناتك'); return; }
      emptyMsg(box, 'جارٍ التحميل…');
      try {
        var mine = (await p2p('offers.mine')).offers;
        box.textContent = '';
        if (!mine.length) return emptyMsg(box, 'لا توجد إعلانات. اضغط "+ إعلان بيع"');
        mine.forEach(function (o) {
          var c = el('div', 'background:var(--s1);border:1px solid var(--line);border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:6px;margin-bottom:10px');
          c.appendChild(el('span', 'font-size:12px;font-weight:700;color:' + (o.side === 'buy' ? 'var(--ac)' : 'var(--danger)'), o.side === 'buy' ? 'إعلان شراء' : 'إعلان بيع'));
          c.appendChild(el('b', 'font-size:17px', fmt(o.price_sdg) + ' ج.س / USDT · ' + netLabel(o.network)));
          c.appendChild(el('span', 'font-size:13px;color:var(--mu)', (o.side === 'buy' ? 'المطلوب ' : 'المتاح ') + fmt(o.available_usdt) + ' USDT · الحدود ' + fmt(o.min_usdt) + '–' + fmt(o.max_usdt)));
          c.appendChild(el('span', 'font-size:13px;color:' + (o.active ? 'var(--ac)' : 'var(--mu)'), o.active ? 'نشط' : 'متوقف'));
          if (o.active) {
            var b = el('button', 'height:40px;border-radius:12px;background:var(--s2);border:0;color:var(--err);font:inherit;font-weight:600;cursor:pointer', 'إيقاف الإعلان');
            b.type = 'button';
            b.onclick = async function () { try { await p2p('offer.close', { id: o.id }); toast('تم إيقاف الإعلان'); loadP2P(); } catch (e) { toast(p2pErr(e), true); } };
            c.appendChild(b);
          }
          box.appendChild(c);
        });
      } catch (e) { emptyMsg(box, p2pErr(e)); }
      return;
    }
    var side = state.p2p.tab === 'sell' ? 'buy' : 'sell';
    state.p2p.cache = state.p2p.cache || {};
    var c0 = state.p2p.cache[side];
    if (c0 && Date.now() - c0.at < 30000) { state.p2p.offers = c0.offers; state.p2p.listSide = side; renderOffers(); return; }
    emptyMsg(box, 'جارٍ التحميل…');
    try {
      var r;
      try { r = await rpc('p2p_offers', { p_side: side }); }
      catch (e) { r = await p2p('offers.list', { side: side }, true); }
      if (r.fee_bps != null) state.p2p.feeBps = r.fee_bps;
      if (r.min_trade != null) state.p2p.minTrade = r.min_trade;
      if (r.net_fee != null) state.p2p.netFee = Number(r.net_fee);
      if (r.net_fee_bep != null) state.p2p.netFeeBep = Number(r.net_fee_bep);
      renderRate(r.rate, r.range);
      if (!state.p2p.me) ensureProfile();
      box.textContent = '';
      // تداول P2P على BNB Smart Chain فقط (الخادم يرفض غيرها أيضاً؛ هذا يخفي إعلانات TRON القديمة)
      r.offers = (r.offers || []).filter(function (o) { return o.network === 'BEP20'; });
      state.p2p.offers = r.offers; state.p2p.listSide = side; state.p2p.cache[side] = { at: Date.now(), offers: r.offers };
      renderOffers();
    } catch (e) { emptyMsg(box, p2pErr(e)); }
  }
  function renderOffers() {
    var box = $('p2p-list'), want = Number($('p2p-amt').value) || 0;
    var list = (state.p2p.offers || []).filter(function (o) { return !want || (want >= Number(o.min_usdt) && want <= Math.min(Number(o.max_usdt), Number(o.available_usdt))); });
    box.textContent = '';
    if (!list.length) return emptyMsg(box, want ? 'لا إعلان يناسب ' + fmt(want) + ' USDT' : state.p2p.listSide === 'buy' ? 'لا يوجد من يريد الشراء الآن' : 'لا توجد إعلانات بيع الآن');
    list.forEach(function (o) {
        var sp = o.seller_profile || {}, isBuyAd = o.side === 'buy';
        var c = el('div'); c.className = 'ad' + (isBuyAd ? ' ad-b' : '');
        var top = el('div'); top.className = 'ad-top';
        top.appendChild(el('span', null, (sp.nickname || '؟').charAt(0))).className = 'ad-av';
        var wi = el('div', 'display:flex;flex-direction:column;gap:2px;min-width:0;flex-grow:1');
        var nm = el('div', 'display:flex;align-items:center;gap:6px;min-width:0');
        nm.appendChild(el('b', 'font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', sp.nickname || 'بائع'));
        if (sp.verified) { var vb = el('span', null, 'موثّق ✓'); vb.className = 'vbadge'; nm.appendChild(vb); }
        wi.appendChild(nm);
        var meta = el('div'); meta.className = 'ad-meta';
        meta.appendChild(el('span', null, (sp.trades_completed || 0) + ' صفقة'));
        if (sp.completion != null) meta.appendChild(el('span', null, 'إتمام ' + sp.completion + '%'));
        if (sp.disputes_lost) meta.appendChild(el('span', 'color:var(--err)', 'خسر ' + sp.disputes_lost + ' نزاع'));
        wi.appendChild(meta);
        top.appendChild(wi);
        top.appendChild(el('span', null, '⏱ ' + o.pay_window_min + ' د')).className = 'ad-win';
        c.appendChild(top);
        var mid = el('div'); mid.className = 'ad-mid';
        var price = el('div', 'display:flex;flex-direction:column;gap:2px;min-width:0');
        price.appendChild(el('span', 'font-size:11px;color:var(--mu)', 'السعر لكل USDT'));
        var pv = el('div', 'display:flex;align-items:baseline;gap:4px');
        pv.appendChild(el('b', 'font-size:24px;direction:ltr;letter-spacing:-.5px', fmt(o.price_sdg)));
        pv.appendChild(el('span', 'font-size:12px;color:var(--mu);font-weight:600', 'ج.س'));
        price.appendChild(pv); mid.appendChild(price);
        var nt = el('span', null, netLabel(o.network)); nt.className = 'ad-net' + (o.network === 'BEP20' ? ' bsc' : ''); mid.appendChild(nt);
        c.appendChild(mid);
        var inf = el('div'); inf.className = 'ad-info';
        [[isBuyAd ? 'يريد أن يشتري منك حتى' : 'المتاح', fmt(o.available_usdt) + ' USDT'], ['الحدود', fmt(o.min_usdt) + ' – ' + fmt(Math.min(o.max_usdt, o.available_usdt)) + ' USDT']].forEach(function (x) {
          var d = el('div'); d.appendChild(el('span', null, x[0])); d.appendChild(el('b', null, x[1])); inf.appendChild(d);
        });
        c.appendChild(inf);
        var bot = el('div'); bot.className = 'ad-bot';
        var tg = el('span', null, isBuyAd ? 'يدفع عبر بنكك' : 'بنكك'); tg.className = 'tag-bk'; bot.appendChild(tg);
        var go = el('button', null, isBuyAd ? 'بيع له' : 'شراء');
        go.className = 'ad-go' + (isBuyAd ? ' btn-sell' : '');
        go.type = 'button';
        go.onclick = function () { state.p2p.offer = o; openBuy(want); };
        bot.appendChild(go);
        c.appendChild(bot);
        box.appendChild(c);
    });
  }
  $('p2p-amt').oninput = renderOffers;
  document.querySelectorAll('[data-p2ptab]').forEach(function (b) {
    b.onclick = function () {
      state.p2p.tab = b.dataset.p2ptab;
      $('p2p-hint').hidden = state.p2p.tab === 'mine';
      $('p2p-hint').querySelector('span').textContent = state.p2p.tab === 'sell'
        ? 'تودع USDT في الضمان، يحوّل لك المشتري بالجنيه، ثم تحرّرها بعد وصول المبلغ.'
        : 'لا تحوّل أي مبلغ قبل ظهور "محجوز في الضمان".';
      $('p2p-filter').hidden = state.p2p.tab === 'mine';
      document.querySelectorAll('[data-p2ptab]').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
      loadP2P();
    };
  });

  // ===== الشراء =====
  async function openBuy(prefill) {
    var o = state.p2p.offer, sp = o.seller_profile || {}, sell = o.side === 'buy';
    if (sell) {
      // البيع لإعلان شراء يتطلب التوثيق (لتستلم على حسابك الموثّق في بنكك)
      if (!(await ensureProfile())) return;
      var pf = state.p2p.me.profile;
      if (pf.verify_status !== 'approved') { try { state.p2p.me = await fetchMe(true); renderMe(); pf = state.p2p.me.profile; } catch (e) {} }
      if (pf.verify_status !== 'approved') { toast('وثّق حسابك أولاً لتبيع', true); openVerify(); return; }
      $('buy-sellnote').hidden = false;
      $('buy-sellnote').firstChild.textContent = 'ستستلم على حسابك الموثّق: ' + pf.full_name + ' · ' + pf.bankak_account + '. ستودع الكمية في الضمان من محفظتك على BNB Smart Chain (تحتاج قليلاً من BNB للرسوم).';
      // رصيدك أنت كبائع (من الشبكة مباشرة، بدون الخادم)
      state.p2p.myBal = null; $('buy-mybal').hidden = false; $('buy-mybal').className = 'note ok'; $('buy-mybal').firstChild.textContent = 'جارٍ فحص رصيدك…';
      // التداول على BNB Smart Chain فقط: نقرأ رصيدك من هذه الشبكة (وليس من TRON)
      core.evmBalances().then(function (eb) {
        if (!eb) throw new Error('EVM_NETWORK');
        state.evmBal = eb;
        var u = evmUnits('bsc', 'USDT'), nb = evmUnits('bsc', EVM.bsc.native);
        state.p2p.myBal = { usdt: Number(WalletCore.fromUnits(u == null ? 0n : u, evmDec('bsc', 'USDT'))), bnb: Number(WalletCore.fromUnits(nb == null ? 0n : nb, 18)) };
        calcBuy();
      }).catch(function () { $('buy-mybal').hidden = true; });
    } else { $('buy-sellnote').hidden = true; $('buy-mybal').hidden = true; state.p2p.myBal = null; }
    $('buy-title').textContent = sell ? 'بيع USDT' : 'شراء USDT';
    $('buy-total-l').textContent = sell ? 'ستستلم عبر بنكك' : 'ستحوّل عبر بنكك';
    $('buy-recv-l').textContent = sell ? 'يستلم المشتري' : 'ستستلم في محفظتك';
    $('buy-go').textContent = sell ? 'فتح طلب البيع' : 'فتح الطلب';
    $('buy-go').classList.toggle('btn-sell', sell);
    var box = $('buy-offer'); box.textContent = '';
    var who = el('div', 'display:flex;align-items:center;gap:12px');
    who.appendChild(el('span', 'width:44px;height:44px;flex-shrink:0;border-radius:50%;background:var(--ok-bg);color:var(--ac);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px', (sp.nickname || '؟').charAt(0)));
    var wi = el('div', 'display:flex;flex-direction:column;gap:3px;min-width:0;flex-grow:1');
    var nm = el('div', 'display:flex;align-items:center;gap:6px;min-width:0');
    nm.appendChild(el('b', 'font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', sp.nickname || (sell ? 'مشترٍ' : 'بائع')));
    if (sp.verified) { var vb = el('span', null, 'موثّق ✓'); vb.className = 'vbadge'; nm.appendChild(vb); }
    wi.appendChild(nm);
    wi.appendChild(el('span', 'font-size:12px;color:var(--mu)', (sp.trades_completed || 0) + ' صفقة' + (sp.completion != null ? ' · إتمام ' + sp.completion + '%' : '') + (sp.disputes_lost ? ' · خسر ' + sp.disputes_lost + ' نزاع' : '')));
    who.appendChild(wi);
    var tg = el('span', null, 'بنكك'); tg.className = 'tag-bk'; who.appendChild(tg);
    box.appendChild(who);
    var hero = el('div'); hero.className = 'buy-hero';
    var hl = el('div', 'display:flex;flex-direction:column;gap:2px');
    hl.appendChild(el('span', 'font-size:12px;color:var(--mu)', 'السعر لكل USDT'));
    var hp = el('div', 'display:flex;align-items:baseline;gap:5px');
    hp.appendChild(el('b', 'font-size:28px;direction:ltr;letter-spacing:-.5px', fmt(o.price_sdg)));
    hp.appendChild(el('span', 'font-size:13px;color:var(--mu);font-weight:600', 'ج.س'));
    hl.appendChild(hp); hero.appendChild(hl);
    var hn = el('span', null, netLabel(o.network)); hn.className = 'ad-net' + (o.network === 'BEP20' ? ' bsc' : ''); hero.appendChild(hn);
    box.appendChild(hero);
    var maxNow = Math.min(Number(o.max_usdt), Number(o.available_usdt));
    var grid = el('div'); grid.className = 'stat-grid';
    [[sell ? 'يريد شراء' : 'المتاح', fmt(o.available_usdt) + ' USDT'],
     ['الحدود', fmt(o.min_usdt) + ' – ' + fmt(maxNow) + ' USDT'], ['مهلة الدفع', o.pay_window_min + ' دقيقة'], ['رسوم الشبكة', netFeeOf(o) + ' USDT']].forEach(function (x) {
      var s = el('div'); s.className = 'stat'; s.appendChild(el('span', null, x[0])); s.appendChild(el('b', null, x[1])); grid.appendChild(s);
    });
    box.appendChild(grid);
    $('buy-sub').textContent = (sell ? 'تبيع لـ ' : 'تشتري من ') + (sp.nickname || '—') + ' · ' + fmt(o.price_sdg) + ' ج.س / USDT';
    $('buy-amt-l').textContent = sell ? 'كم USDT ستبيع؟' : 'كم USDT تريد؟';
    $('buy-range').textContent = 'بين ' + fmt(o.min_usdt) + ' و ' + fmt(maxNow);
    var steps = sell
      ? ['تفتح الطلب وتودع الكمية في الضمان من محفظتك.', 'يحوّل لك المشتري المبلغ بالجنيه عبر بنكك خلال ' + o.pay_window_min + ' دقيقة.', 'تتأكد من وصول المبلغ إلى حسابك، ثم تحرّر USDT للمشتري.']
      : ['تفتح الطلب، ويحجز البائع USDT في الضمان.', 'تحوّل المبلغ بالجنيه إلى حساب البائع في بنكك خلال ' + o.pay_window_min + ' دقيقة، ثم تضغط "حوّلت".', 'يتأكد البائع من وصول المبلغ، فيصلك USDT في محفظتك.'];
    var fl = $('buy-flow'); fl.textContent = ''; steps.forEach(function (t) { fl.appendChild(el('li', null, t)); });
    setBuyUnit('usdt');
    $('buy-amt').value = prefill ? String(prefill) : ''; $('buy-sdg').value = ''; $('buy-err').hidden = true; calcBuy();
    show('p2p-buy');
  }
  function netFeeOf(o) { return o && o.network === 'BEP20' ? (state.p2p.netFeeBep != null ? state.p2p.netFeeBep : 0.3) : (state.p2p.netFee || 1); }
  function netLabel(n) { return n === 'BEP20' ? 'BNB Chain' : 'TRON'; }
  function calcBuy() {
    var o = state.p2p.offer; if (!o) return;
    var v = 0; try { v = Number(WalletCore.fromUnits(WalletCore.toUnitsFloor($('buy-amt').value, 6), 6)); } catch (e) {}
    var ok = v >= Number(o.min_usdt) && v <= Math.min(Number(o.max_usdt), Number(o.available_usdt));
    var net = netFeeOf(o);
    var fee = Math.round((Math.floor(v * (state.p2p.feeBps || 50) / 10000 * 1e6) / 1e6 + net) * 1e6) / 1e6;
    $('buy-total').textContent = v ? fmt(v * o.price_sdg) + ' ج.س' : '—';
    $('buy-conv').textContent = v ? (state.p2p.buyUnit === 'sdg' ? '≈ ' + fmt(v, 6) + ' USDT' : '≈ ' + fmt(v * o.price_sdg) + ' ج.س') : '—';
    var inRange = !v || ok; $('buy-range').style.color = inRange ? '' : 'var(--err)';
    var bf = $('buy-fee'); bf.textContent = v ? fmt(fee, 6) + ' USDT' : '—';
    if (v) bf.appendChild(el('small', 'display:block;font-size:11px;font-weight:400;color:var(--mu)', ((state.p2p.feeBps || 50) / 100) + '%' + (net ? ' + ' + net + ' رسوم الشبكة' : '')));
    $('buy-recv').textContent = v ? fmt(v - fee, 6) + ' USDT' : '—';
    // البيع لإعلان شراء: أنت البائع، فنتحقق من رصيدك قبل فتح الطلب برسالة موجهة لك
    var mb = state.p2p.myBal;
    if (o.side === 'buy' && mb) {
      var lowU = v > 0 && mb.usdt < v, lowT = mb.bnb < 0.0003;
      $('buy-mybal').className = 'note ' + (lowU || lowT ? 'err' : 'ok');
      $('buy-mybal').firstChild.textContent = 'رصيدك على BNB Chain: ' + fmt(mb.usdt) + ' USDT · ' + fmt(mb.bnb, 5) + ' BNB' +
        (lowU ? ' — لتبيع ' + fmt(v) + ' USDT تحتاجها في محفظتك على BNB Chain أولاً' : lowT ? ' — تحتاج 0.0003 BNB على الأقل لرسوم الإيداع في الضمان' : '');
      if (lowU || lowT) ok = false;
    }
    $('buy-go').disabled = !ok;
  }
  $('buy-amt').oninput = calcBuy;
  function setBuyUnit(u) {
    state.p2p.buyUnit = u;
    document.querySelectorAll('[data-unit]').forEach(function (b) { b.classList.toggle('on', b.dataset.unit === u); });
    $('buy-amt').hidden = u !== 'usdt'; $('buy-sdg').hidden = u !== 'sdg';
    $('buy-unit-l').textContent = u === 'usdt' ? 'USDT' : 'ج.س';
    var o = state.p2p.offer, v = Number($('buy-amt').value) || 0;
    if (u === 'sdg' && o) $('buy-sdg').value = v ? String(Math.round(v * o.price_sdg * 100) / 100) : '';
    calcBuy();
  }
  document.querySelectorAll('[data-unit]').forEach(function (b) { b.onclick = function () { setBuyUnit(b.dataset.unit); }; });
  // الإدخال بالجنيه: نحوّله إلى USDT (بدقة 6 خانات، للأسفل حتى لا يتجاوز المبلغ)
  $('buy-sdg').oninput = function () {
    var o = state.p2p.offer;
    var raw = String(this.value).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).replace(/[٫,]/g, '.');
    var s = Number(raw.replace(/[^\d.]/g, '')) || 0;
    $('buy-amt').value = s && o ? String(Math.floor(s / o.price_sdg * 1e6) / 1e6) : '';
    calcBuy();
  };
  $('buy-max').onclick = function () {
    var o = state.p2p.offer; if (!o) return;
    var mx = Math.min(Number(o.max_usdt), Number(o.available_usdt));
    if (o.side === 'buy' && state.p2p.myBal) mx = Math.min(mx, Math.floor(state.p2p.myBal.usdt * 1e6) / 1e6);
    $('buy-amt').value = String(mx);
    if (state.p2p.buyUnit === 'sdg') $('buy-sdg').value = String(Math.round(mx * o.price_sdg * 100) / 100);
    calcBuy();
  };
  $('buy-go').onclick = async function () {
    var btn = this; $('buy-err').hidden = true;
    if (!(await ensureProfile())) return;
    btn.disabled = true;
    try {
      var r = await p2p('order.create', { offer_id: state.p2p.offer.id, amount: WalletCore.fromUnits(WalletCore.toUnitsFloor($('buy-amt').value, 6), 6) });
      state.p2p.cache = {}; openOrder(r.order.id, true);
    } catch (e) {
      var msg = p2pErr(e), sellToBuyer = state.p2p.offer && state.p2p.offer.side === 'buy';
      if (sellToBuyer && e.message === 'INSUFFICIENT_SELLER_USDT') msg = 'لتبيع لهذا المشتري تحتاج الكمية كاملة من USDT في محفظتك، ورصيدك أقل منها.';
      if (sellToBuyer && (e.message === 'SELLER_NEEDS_TRX' || e.message === 'SELLER_NEEDS_BNB')) msg = 'لتبيع تحتاج 0.0003 BNB على الأقل في محفظتك على BNB Chain لدفع رسوم الإيداع في الضمان.';
      if (sellToBuyer && e.message === 'SELLER_NEEDS_BNB') msg = 'لتبيع على BNB Chain تحتاج 0.0003 BNB على الأقل (أقل من 0.2$) لرسوم الإيداع.';
      $('buy-err').textContent = msg; $('buy-err').hidden = false; btn.disabled = false;
    }
  };

  // ===== إعلان جديد =====
  state.p2p.win = 15;
  document.querySelectorAll('[data-win]').forEach(function (b) {
    b.onclick = function () { state.p2p.win = Number(b.dataset.win); document.querySelectorAll('[data-win]').forEach(function (x) { x.classList.toggle('on', x === b); }); };
  });
  $('p2p-new-btn').onclick = async function () {
    if (!(await ensureProfile())) return;
    try { state.p2p.me = await fetchMe(true); renderMe(); } catch (e) {}
    var pf = state.p2p.me && state.p2p.me.profile;
    if (!pf || pf.verify_status !== 'approved') { openVerify(); return; }
    var r = state.p2p.rate, rg = state.p2p.range;
    $('new-err').hidden = true;
    if (!r || !r.sdg_per_usdt || !rg) { toast('لم يُحدَّد سعر الصرف بعد. حاول لاحقاً', true); return; }
    $('new-payee').textContent = pf.full_name + ' · ' + pf.bankak_account;
    state.p2p.bal = null; setNewSide(state.p2p.tab === 'sell' ? 'buy' : 'sell');
    $('new-price').value = String(r.sdg_per_usdt);
    $('new-range').textContent = 'السعر المرجعي ' + fmt(r.sdg_per_usdt) + ' ج.س · المسموح من ' + fmt(rg.min) + ' إلى ' + fmt(rg.max);
    show('p2p-new');
  };
  $('new-price').oninput = function () {
    var rg = state.p2p.range, v = Number(this.value);
    $('new-range').style.color = rg && v && (v < rg.min || v > rg.max) ? 'var(--err)' : '';
  };
  async function loadSellerBalance() {
    var n = $('new-bal'); n.className = 'note ok'; n.firstChild.textContent = 'جارٍ فحص رصيدك…'; state.p2p.bal = null;
    try {
      var bep = state.p2p.newNet === 'BEP20';
      var b = await p2p('balance.check', { network: state.p2p.newNet });
      state.p2p.bal = b;
      var low = bep ? Number(b.bnb) < Number(b.min_bnb || 0.0003) : Number(b.trx) < 15;
      n.className = 'note ' + (low || Number(b.usdt) < (state.p2p.minTrade || 10) ? 'err' : 'ok');
      n.firstChild.textContent = bep
        ? 'رصيدك على BNB Chain: ' + fmt(b.usdt) + ' USDT · ' + b.bnb + ' BNB · يمكنك عرض حتى ' + sellable(b.usdt) + ' USDT' + (low ? ' — تحتاج ' + (b.min_bnb || '0.0003') + ' BNB على الأقل للرسوم (أقل من 0.2$)' : '')
        : 'رصيدك على TRON: ' + fmt(b.usdt) + ' USDT · ' + fmt(b.trx) + ' TRX' + (low ? ' — تحتاج 15 TRX على الأقل للرسوم' : '');
    } catch (e) { n.className = 'note err'; n.firstChild.textContent = p2pErr(e); }
  }
  state.p2p.newSide = 'sell'; state.p2p.newNet = 'BEP20';
  document.querySelectorAll('[data-pnet]').forEach(function (b) {
    b.onclick = function () {
      state.p2p.newNet = b.dataset.pnet;
      document.querySelectorAll('[data-pnet]').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
      $('new-sellnote-t').textContent = state.p2p.newNet === 'BEP20'
        ? 'عند كل صفقة تودع الكمية + 1.5% تقريباً رسوم بوابة الضمان (بـ USDT)، وتحتاج قليلاً من BNB (نحو 0.0003) لرسوم الشبكة. لذلك يعرض التطبيق أقصى كمية يمكنك بيعها فعلاً.'
        : 'عند كل صفقة تودع الكمية + 1.5% تقريباً رسوم بوابة الضمان (بـ USDT)، وتحتاج 15 TRX على الأقل لرسوم الشبكة. لذلك يعرض التطبيق أقصى كمية يمكنك بيعها فعلاً.';
      state.p2p.bal = null; if (state.p2p.newSide === 'sell') loadSellerBalance();
    };
  });
  function setNewSide(s) {
    state.p2p.newSide = s;
    document.querySelectorAll('[data-side]').forEach(function (b) { var on = b.dataset.side === s; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    var buy = s === 'buy';
    $('new-bal').hidden = buy; $('new-payee-card').hidden = buy; $('new-sellnote').hidden = buy; $('new-buynote').hidden = !buy; $('new-all').hidden = buy;
    $('new-go').textContent = buy ? 'نشر إعلان الشراء' : 'نشر إعلان البيع';
    if (!buy && !state.p2p.bal) loadSellerBalance();
  }
  document.querySelectorAll('[data-side]').forEach(function (b) { b.onclick = function () { setNewSide(b.dataset.side); }; });
  $('new-change-acct').onclick = async function () {
    if (!(await askConfirm('تغيير حساب بنكك يتطلب مراجعة جديدة لبياناتك، وتتوقف إعلاناتك الحالية حتى يُقبل الطلب. متابعة؟'))) return;
    openVerify(false, true);
  };
  // نترك 1.5% لرسوم بوابة الضمان التي يدفعها البائع عند الإيداع
  function sellable(u) { return String(Math.floor(Number(u) / 1.015 * 100) / 100); }
  $('new-all').onclick = function () { if (state.p2p.bal) { var v = sellable(state.p2p.bal.usdt); $('new-amount').value = v; if (!$('new-max').value) $('new-max').value = v; } };
  $('new-go').onclick = async function () {
    var btn = this; $('new-err').hidden = true; btn.disabled = true;
    var num = function (id) { try { return WalletCore.fromUnits(WalletCore.toUnitsFloor($(id).value, 6), 6); } catch (e) { return '0'; } };
    try {
      await p2p('offer.create', {
        price_sdg: num('new-price'), amount_usdt: num('new-amount'), min_usdt: num('new-min'), max_usdt: num('new-max'),
        pay_window_min: state.p2p.win, side: state.p2p.newSide, network: state.p2p.newNet
      });
      state.p2p.cache = {}; toast('تم نشر الإعلان');
      state.p2p.tab = 'mine';
      document.querySelectorAll('[data-p2ptab]').forEach(function (x) { x.classList.toggle('on', x.dataset.p2ptab === 'mine'); });
      resetTo('p2p');
    } catch (e) { $('new-err').textContent = p2pErr(e); $('new-err').hidden = false; }
    btn.disabled = false;
  };


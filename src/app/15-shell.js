  // ===== قبل أن تبدأ (يظهر مرة واحدة بعد إنشاء المحفظة) =====
  function showIntro() {
    var seen = false;
    try { seen = localStorage.getItem('sarra.intro') === '1'; } catch (e) {}
    if (!seen) $('intro-sheet').classList.add('show');
  }
  $('intro-ok').onclick = function () {
    try { localStorage.setItem('sarra.intro', '1'); } catch (e) {}
    $('intro-sheet').classList.remove('show');
  };

  // ===== نسيت الرمز =====
  $('forgot-pin').onclick = function () { $('forgot-sheet').classList.add('show'); };
  $('forgot-no').onclick = function () { $('forgot-sheet').classList.remove('show'); };
  $('forgot-yes').onclick = async function () {
    $('forgot-sheet').classList.remove('show');
    await wipeAndRestart('import');
  };

  // بعد حذف المحفظة نعيد تشغيل التطبيق من الصفر: لا يبقى في الذاكرة أي شيء من المحفظة القديمة
  // (الرصيد والسجل على الشاشة، بيانات السوق، رمز الصندوق، الشارات، الطلب المفتوح...)
  async function wipeAndRestart(next) {
    try { var pt = localStorage.getItem(pushKey()); if (pt && core.isUnlocked()) await Promise.race([p2p('push.unregister', { token: pt }), new Promise(function (r) { setTimeout(r, 3000); })]); } catch (e) {} // لا إشعارات لمحفظة محذوفة
    try { if (PN) await PN.unregister(); } catch (e) {}
    await core.wipe();
    await bioDisable();
    try {
      // السجل المحلي وإشعارات الاستلام تخص المحفظة المحذوفة: تُحذف معها
      Object.keys(localStorage).forEach(function (k) { if (/^sarra\.(me|lh|rx|rxb|bal|tr|kl|push)\.|^sarra\.(rxe|exactAsked)$/.test(k)) localStorage.removeItem(k); });
      sessionStorage.setItem('sarra.after-wipe', next);
    } catch (e) {}
    location.reload();
  }

  // ===== تنبيه الطلبات التي تنتظر إجراءً منك (لا إشعارات خارجية، نفحص كل 30 ثانية والتطبيق مفتوح) =====
  function needsMyAction(o, me) {
    if (o.seller === me) return o.status === 'awaiting_deposit' || o.status === 'paid';
    if (o.buyer === me) return o.status === 'funded';
    return false;
  }
  // فحص خفيف عبر "صندوق" في قاعدة البيانات: رقم واحد، بدون توقيع ولا Edge Function.
  // كل 30 ثانية إن كان لديك طلب مفتوح أو إعلان نشط، وإلا عند فتح التطبيق فقط (واحتياطياً كل 10 دقائق)، ويتوقف والتطبيق في الخلفية.
  state.p2p.pending = 0;
  var pollTimer = null;
  function setBadges(n) { ['p2p-badge', 'orders-badge'].forEach(function (id) { $(id).hidden = !n; $(id).textContent = String(n); }); }
  async function pollMyOrders() {
    clearTimeout(pollTimer);
    var next = 600000;
    try {
      if (P2P_URL && !document.hidden && core.isUnlocked()) {
        if (!state.p2p.me || !state.p2p.me.profile) { state.p2p.me = await fetchMe(false); renderMe(); }
        var tok = state.p2p.me.profile.inbox_token, n, busy;
        if (tok) {
          var ib = await rpc('p2p_inbox', { p_token: tok }).catch(function () { return null; });
          if (ib) { n = ib.action; busy = ib.open > 0 || ib.offers > 0; }
        }
        if (n == null) {
          var me = state.p2p.me.profile.address, list = (await p2p('orders.mine')).orders;
          n = list.filter(function (o) { return needsMyAction(o, me); }).length;
          busy = list.some(function (o) { return ['awaiting_deposit', 'funded', 'paid'].indexOf(o.status) >= 0; });
        }
        if (n > state.p2p.pending) toast(n === 1 ? 'لديك طلب ينتظر إجراءً منك' : 'لديك ' + n + ' طلبات تنتظر إجراءً منك');
        state.p2p.pending = n; setBadges(n);
        if (busy) next = 30000;
      }
    } catch (e) {}
    pollTimer = setTimeout(pollMyOrders, next);
  }
  pollTimer = setTimeout(pollMyOrders, 8000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pollMyOrders(); });

  // ===== القائمة الجانبية =====
  var APP_VERSION = CFG.version || '';

  // ===== التحديثات (للنسخة الموزّعة خارج Google Play): مرة يومياً نسأل GitHub عن آخر إصدار منشور =====
  var UPDATE_PAGE = CFG.updatePage || 'https://skfk86.github.io/sarra-wallet/';
  async function checkUpdate() {
    if (CFG.channel === 'play' || !APP_VERSION || navigator.onLine === false) return;
    var c = lsJson('sarra.upd', null), tag = c && Date.now() - c.at < 86400000 ? c.tag : null;
    if (!tag) {
      try {
        var r = await fetch('https://api.github.com/repos/' + (CFG.updateRepo || 'skfk86/sarra-wallet') + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
        if (!r.ok) return; tag = (await r.json()).tag_name || ''; cachePut('sarra.upd', 'tag', tag);
      } catch (e) { return; }
    }
    var newer = SarraLogic.cmpVersion(tag, APP_VERSION) > 0;
    $('upd-card').hidden = !newer;
    if (newer) $('upd-ver').textContent = 'الإصدار ' + String(tag).replace(/^v/i, '') + ' · لديك ' + APP_VERSION;
  }
  $('upd-card').onclick = function () { window.open(UPDATE_PAGE, '_blank'); };
  setTimeout(checkUpdate, 4000);
  function openDrawer(on) {
    $('drawer').classList.toggle('show', on); $('drawer-bg').classList.toggle('show', on);
    $('drawer').setAttribute('aria-hidden', on ? 'false' : 'true'); $('menu-btn').setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  $('menu-btn').onclick = function () { $('drawer-ver').textContent = APP_VERSION ? 'الإصدار ' + APP_VERSION : ''; openDrawer(true); };
  $('drawer-bg').onclick = function () { openDrawer(false); };
  document.querySelectorAll('[data-menu]').forEach(function (b) {
    b.onclick = function () {
      openDrawer(false);
      var m = b.dataset.menu;
      if (m === 'security') return resetTo('security');
      if (m === 'coins') { openCoinsHelp(); return; }
      if (m === 'about') { $('about-swapfee').textContent = core.feeEnabled() ? core.feeRateText() : '0%'; var pc = function (x) { return (Math.round((Number(x) || 0) * 10000) / 100) + '%'; }; $('about-evmfee').textContent = pc(CFG.lifiSwapFee != null ? CFG.lifiSwapFee : CFG.lifiFee); $('about-brfee').textContent = pc(CFG.lifiFee); $('about-ver').textContent = APP_VERSION ? 'الإصدار ' + APP_VERSION + ' · ' + netName() : netName(); show('about'); }
      if (m === 'apps') { renderApps(); show('apps'); }
      if (m === 'account') openAccount();
      if (m === 'support') openSupport();
      if (m === 'privacy') show('privacy');
    };
  });
  // تطبيقات المطوّر: الرابط إلى Google Play (اسم الحزمة إن عُرف، وإلا بحث باسم التطبيق)
  var OTHER_APPS = [
    { name: 'طقس السودان', sub: 'ود السحاب', desc: 'طقس 67 مدينة سودانية، رادار الأمطار والغبار، ومستشار زراعي.', icon: '⛅', bg: '#E3F1FF', pkg: CFG.weatherPkg || '', q: 'طقس السودان ود السحاب' },
    { name: 'CodeNile', sub: 'تعلّم البرمجة بالعربي', desc: 'تحديات JavaScript يومية ومسارات تعليمية من الصفر.', icon: '💻', bg: '#EDE7FF', pkg: 'com.codenile.app', q: 'CodeNile' }
  ];
  function playUrl(a) { return a.pkg ? 'https://play.google.com/store/apps/details?id=' + a.pkg : 'https://play.google.com/store/search?q=' + encodeURIComponent(a.q) + '&c=apps'; }
  function renderApps() {
    var box = $('apps-list'); box.textContent = '';
    OTHER_APPS.forEach(function (a) {
      var c = el('div'); c.className = 'app-card';
      var ic = el('span', 'background:' + a.bg, a.icon); ic.className = 'app-ic'; c.appendChild(ic);
      var t = el('div', 'flex-grow:1;display:flex;flex-direction:column;gap:2px;min-width:0');
      t.appendChild(el('b', 'font-size:16px', a.name));
      t.appendChild(el('span', 'font-size:12px;color:var(--ac);font-weight:600', a.sub));
      t.appendChild(el('span', 'font-size:12px;color:var(--mu);line-height:1.6', a.desc));
      c.appendChild(t);
      var go = el('button', 'height:36px;padding:0 14px;border-radius:10px;background:var(--ac);color:var(--on-ac);border:0;font:inherit;font-weight:700;font-size:13px;cursor:pointer;flex-shrink:0', 'تحميل');
      go.type = 'button'; go.onclick = function () { window.open(playUrl(a), '_blank'); };
      c.appendChild(go);
      box.appendChild(c);
    });
  }

  // ===== المظهر: تلقائي / ليلي / نهاري =====
  function applyTheme(pref) {
    var dark = pref === 'dark' || (pref === 'auto' && !(window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches));
    var t = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    var bg = dark ? '#0B0F14' : '#F3F5F8';
    document.querySelector('meta[name=theme-color]').setAttribute('content', bg);
    var SB = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.StatusBar;
    if (SB) { SB.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(function () {}); SB.setBackgroundColor({ color: bg }).catch(function () {}); }
    document.querySelectorAll('[data-theme-opt]').forEach(function (b) { var on = b.dataset.themeOpt === pref; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
  }
  var themePref = 'auto'; try { themePref = localStorage.getItem('sarra.theme') || 'auto'; } catch (e) {}
  applyTheme(themePref);
  document.querySelectorAll('[data-theme-opt]').forEach(function (b) {
    b.onclick = function () { themePref = b.dataset.themeOpt; try { localStorage.setItem('sarra.theme', themePref); } catch (e) {} applyTheme(themePref); };
  });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () { if (themePref === 'auto') applyTheme('auto'); });

  // ===== البداية =====
  (async function start() {
    var has = false;
    try { has = await core.hasWallet(); } catch (e) { showFatal(e); }
    var after = null;
    try { after = sessionStorage.getItem('sarra.after-wipe'); sessionStorage.removeItem('sarra.after-wipe'); } catch (e) {}
    if (has) openPin('unlock');
    else {
      resetTo('welcome');
      if (after === 'import') routes.import();
      if (after === 'wiped') toast('تم حذف المحفظة من هذا الجهاز');
    }
  })();

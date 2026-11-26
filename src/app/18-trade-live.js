  // ===== التداول: تحديث لحظي عبر WebSocket (بيانات سوق Binance العامة، بلا حساب) =====
  // قائمة الأسواق: miniTicker لكل العملات (السعر والتغيّر والأعلى والأدنى والحجم خلال 24 ساعة).
  // شاشة الزوج: شمعة الإطار الحالي لحظة بلحظة (kline). الاتصال يُفتح فقط والشاشة ظاهرة، ويُغلق عند مغادرتها.
  // عند تعذّر الاتصال (حجب أو انقطاع) يبقى الاستطلاع كل 10 ثوانٍ كما كان، والمؤشر يقول «متأخر».
  var WS_URL = 'wss://data-stream.binance.vision/stream?streams=';
  var LV = { ws: null, key: '', fails: 0, retryAt: 0, lastMsg: 0, dirty: false, live: false };

  function lvWanted() {
    var cur = state.stack[state.stack.length - 1];
    if (document.hidden || (cur !== 'trade' && cur !== 'pair') || typeof WebSocket === 'undefined') return null;
    var syms = trCoins().map(function (c) { return String(BN_SYM[c.sym] || '').toLowerCase(); }).filter(Boolean);
    if (!syms.length) return null;
    var streams = syms.map(function (s) { return s + '@miniTicker'; });
    if (cur === 'pair' && TR.sym && BN_SYM[TR.sym]) streams.push(String(BN_SYM[TR.sym]).toLowerCase() + '@kline_' + TR.tf);
    return streams.join('/');
  }
  // مؤشر الحالة: «مباشر» (بث لحظي)، «كل 10 ث» (استطلاع فقط)، «غير متصل» (تعذّر الاثنان: أسعار محفوظة)
  function lvLabel(k) {
    var b = $('tr-live'); if (!b) return;
    b.classList.toggle('off', k !== 'live'); b.classList.toggle('down', k === 'down');
    b.lastChild.textContent = k === 'live' ? 'مباشر' : k === 'poll' ? 'كل 10 ث' : 'غير متصل';
  }
  function lvSetLive(on) { LV.live = on; lvLabel(on ? 'live' : TR.tickAt && Date.now() - TR.tickAt < 30000 ? 'poll' : 'down'); }
  function lvClose() {
    if (LV.ws) { try { LV.ws.onclose = null; LV.ws.close(); } catch (e) {} }
    LV.ws = null; LV.key = ''; lvSetLive(false);
  }
  function lvOpen(key) {
    lvClose();
    if (Date.now() < LV.retryAt) return;
    var ws; try { ws = new WebSocket(WS_URL + key); } catch (e) { lvFail(); return; }
    LV.ws = ws; LV.key = key;
    ws.onopen = function () { LV.fails = 0; LV.lastMsg = Date.now(); lvSetLive(true); };
    ws.onmessage = function (ev) { LV.lastMsg = Date.now(); try { lvMsg(JSON.parse(ev.data)); } catch (e) {} };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
    ws.onclose = function () { if (LV.ws === ws) { LV.ws = null; LV.key = ''; lvSetLive(false); lvFail(); } };
  }
  // إعادة المحاولة بمهلة متزايدة (5ث، 10ث، 20ث… حتى دقيقتين)، والاستطلاع يعمل خلالها
  function lvFail() { LV.fails++; LV.retryAt = Date.now() + Math.min(120000, 5000 * Math.pow(2, LV.fails - 1)); }

  var SYM_OF = null;
  function lvSym(bn) {
    if (!SYM_OF) { SYM_OF = {}; Object.keys(BN_SYM).forEach(function (s) { SYM_OF[String(BN_SYM[s]).toUpperCase()] = s; }); }
    return SYM_OF[String(bn || '').toUpperCase()];
  }
  function lvMsg(m) {
    var d = m && m.data; if (!d) return;
    if (d.e === '24hrMiniTicker') {
      var sym = lvSym(d.s); if (!sym) return;
      var c = Number(d.c), o = Number(d.o);
      if (!(c > 0)) return;
      TR.tick[sym] = { p: c, chg: o > 0 ? (c - o) / o * 100 : (TR.tick[sym] || {}).chg, hi: Number(d.h), lo: Number(d.l), vol: Number(d.q) };
      TR.tickAt = Date.now(); TR.tickTried = true; LV.dirty = true;
    } else if (d.e === 'kline' && d.k) {
      var k = d.k, ks = lvSym(d.s);
      if (ks !== TR.sym || k.i !== TR.tf || !TR.kl || !TR.kl.length) return;
      var bar = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.q }, last = TR.kl[TR.kl.length - 1];
      if (bar.t === last.t) TR.kl[TR.kl.length - 1] = bar;
      else if (bar.t > last.t) { TR.kl.push(bar); }
      LV.dirty = true;
    }
  }
  // رسم واحد كل 700ms على الأكثر مهما كثرت الرسائل (عشرات في الثانية)، فلا يثقل الهاتف
  setInterval(function () {
    if (state.stack[state.stack.length - 1] !== 'pair' && document.body.classList.contains('chart-fs')) { document.querySelector('.pr-chart').classList.remove('fs'); document.body.classList.remove('chart-fs'); } // غادر الشاشة: لا يبقى الشارت مكبّراً
    var want = lvWanted();
    if (!want) { if (LV.ws) lvClose(); return; }
    if (want !== LV.key || !LV.ws) { if (want !== LV.key || Date.now() >= LV.retryAt) lvOpen(want); }
    // اتصال مفتوح بلا رسائل لأكثر من 15 ثانية (Binance يرسل كل ثانية): منقطع فعلياً، فنغلقه ويعود الاستطلاع فوراً
    if (LV.ws && LV.live && Date.now() - LV.lastMsg > 15000) { lvClose(); lvFail(); }
    if (!LV.dirty) return;
    LV.dirty = false;
    var cur = state.stack[state.stack.length - 1];
    if (cur === 'trade') renderTrade(); else if (cur === 'pair') { trRenderTop(); drawCandles(); }
  }, 700);
  document.addEventListener('visibilitychange', function () { if (document.hidden) lvClose(); });

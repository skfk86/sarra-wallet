  // ===== عرض المبالغ: فواصل آلاف دون أي تقريب (الخانات العشرية كما هي) =====
  // عرض الأرقام بذكاء: لا أصفار طويلة. 0.00000000000495 ← 0.0₁₁495، و1234.5678 ← 1,234.57
  // d: أقصى خانات عشرية للأرقام العادية. الأرقام الأصغر من ذلك تُعرض بأهم 4 أرقام بدل أن تظهر 0
  // logic/format.js
  function niceNum(v, d) { return SarraLogic.niceNum(v, d); }
  function fmtExact(v) { return SarraLogic.fmtExact(v); }
  // حجم الخط يصغّر تدريجياً مع طول الرقم كي لا يخرج عن الشاشة
  function fitAmt(node, text) {
    var n = String(text).length;
    node.style.fontSize = (n <= 9 ? 40 : n <= 13 ? 32 : n <= 17 ? 26 : n <= 23 ? 21 : 17) + 'px';
  }
  function chainLabel(k) {
    if (!k || k === 'tron') return 'TRON (TRC20)';
    var c = EVM[k]; return c ? c.name + ' (' + c.short + ')' : String(k);
  }
  function explorerName(url) { return SarraLogic.explorerName(url); } // logic/registry.js

  function kvRow(dl, k, v, copy) {
    var d = document.createElement('div'), dt = el('dt', null, k), dd = el('dd', null);
    if (v instanceof Node) dd.appendChild(v); else { dd.textContent = v; dd.className = 'ltr'; }
    if (copy) { var b = el('button', null, 'نسخ'); b.type = 'button'; b.className = 'cp'; b.onclick = function () { copyText(copy); b.textContent = 'تم'; setTimeout(function () { b.textContent = 'نسخ'; }, 1500); }; dd.appendChild(b); }
    d.appendChild(dt); d.appendChild(dd); dl.appendChild(d);
  }
  function fmtWhen(ms) { return new Date(ms).toLocaleString('ar', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  // شاشة النتيجة: كل نص مشتق من العملية الفعلية (عملة، شبكة، مستكشف)، لا نصوص ثابتة
  // o: { kind:'send'|'swap', status, amt, coin, net, to, toFull, paid?, route?, txid, url, time }
  function showSuccess(o) {
    var pend = o.status === 'PENDING';
    $('ok-title').textContent = pend ? 'أُرسلت العملية، بانتظار التأكيد' : o.kind === 'swap' ? 'تم التبديل بنجاح' : 'تم الإرسال بنجاح';
    $('ok-ring').classList.toggle('pend', pend);
    var a = fmtExact(o.amt); $('ok-amt').textContent = a; fitAmt($('ok-amt'), a);
    $('ok-coin').textContent = o.coin + (o.kind === 'send' ? ' · ' + chainLabel(o.net) : '');
    var dl = $('ok-kv'); dl.textContent = '';
    kvRow(dl, 'الحالة', el('span', pend ? 'color:var(--warn)' : 'color:var(--ac)', pend ? 'بانتظار التأكيد على الشبكة' : 'تمت'));
    if (o.kind === 'swap') { kvRow(dl, 'دفعت', fmtExact(o.paid)); kvRow(dl, 'الشبكة', o.route || chainLabel(o.net)); }
    else { kvRow(dl, 'إلى', o.to, o.toFull); kvRow(dl, 'الشبكة', chainLabel(o.net)); }
    kvRow(dl, 'الوقت', el('span', null, fmtWhen(o.time || Date.now())));
    if (o.txid) kvRow(dl, 'رقم المعاملة', shortAddr(o.txid), o.txid);
    $('explorer').textContent = 'عرض على ' + explorerName(o.url);
    $('explorer').hidden = !o.url;
    state.lastTx = { txid: o.txid, url: o.url };
    if (o.kind === 'send') lhAdd({ kind: 'send', net: o.net, coin: o.coin, amount: String(o.amt), to: o.toFull || o.to, txid: o.txid, url: o.url, status: o.status });
    else if (o.kind === 'swap') { var pp = String(o.paid || '').split(' '); lhAdd({ kind: 'swap', net: o.net, coin: o.coin, amount: String(o.amt), paidAmount: pp[0], paidCoin: pp[1], via: o.route, txid: o.txid, url: o.url, status: o.status }); }
    if (o.txid) { RX.own[o.txid] = 1; }
  }


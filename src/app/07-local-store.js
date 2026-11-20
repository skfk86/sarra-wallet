  // ===== السجل المحلي: كل عملية ناجحة من هذا الجهاز تُحفظ هنا (لا يحتاج أي خدمة خارجية) =====
  // {id, kind: send|recv|swap|bridge, net, toNet?, coin, amount, paidCoin?, paidAmount?, to?, from?, txid?, url?, status, time, via?}
  // مفتاح السجل مربوط بعنوان المحفظة (لكل محفظة سجلها)؛ العنوان يُحفظ عند فتح الرئيسية
  function lhKey() { return 'sarra.lh.' + (state.lhAddr || ''); }
  function lhAll() { return lsJson(lhKey(), []); }
  function lhAdd(r) {
    if (!state.lhAddr) return;
    try {
      r.time = r.time || Date.now(); r.id = r.txid || ('L' + r.time + Math.random().toString(36).slice(2, 6));
      var l = lhAll().filter(function (x) { return x.id !== r.id; }); l.unshift(r);
      localStorage.setItem(lhKey(), JSON.stringify(l.slice(0, 300)));
      state.historyCache = null; state.fetchedAt.history = 0;
    } catch (e) {}
    vaultSoon();
  }
  // عمليات تبديل/نقل بقيت «قيد التنفيذ» لأن التطبيق أُغلق قبل تأكيدها: نسأل عن نتيجتها عند فتح السجل أو السوق
  var lhRechecking = false;
  async function lhRecheck() {
    if (lhRechecking || !core.bridgeStatus || !state.lhAddr) return; lhRechecking = true;
    try {
      var stuck = lhAll().filter(function (r) { return r.status === 'PENDING' && r.txid && r.net && Date.now() - (r.time || 0) > 120000 &&
        ((r.kind === 'swap' || r.kind === 'bridge') && (/^0x[0-9a-fA-F]{64}$/.test(r.txid) || r.net === 'tron' && /^[0-9a-fA-F]{64}$/.test(r.txid)) || r.kind === 'send'); }).slice(0, 5);
      var changed = false;
      for (var i = 0; i < stuck.length; i++) {
        var r = stuck[i];
        if (r.kind === 'send') { // الإرسال: نقرأ إيصال المعاملة من الشبكة
          var ts = core.txStatus ? await core.txStatus(r.net, r.txid, r.coin !== netOf(r.net).native) : 'PENDING';
          if (ts === 'PENDING') continue; r.status = ts;
        } else if (r.net === 'tron' && !r.toNet) { // تبديل SunSwap على TRON (ليس عبر LI.FI): نتيجة العقد من الشبكة
          var t2 = core.txStatus ? await core.txStatus('tron', r.txid, true).catch(function () { return 'PENDING'; }) : 'PENDING';
          if (t2 === 'PENDING') continue; r.status = t2;
        } else { // نقل عبر LI.FI، من EVM أو من TRON
          var st = await core.bridgeStatus(r.txid, r.net, r.toNet || r.net).catch(function () { return null; });
          if (st && st.status === 'DONE') { r.status = 'SUCCESS'; if (st.link) r.url = st.link; if (st.partial && st.recvSym) r.coin = st.recvSym; }
          else if (st && (st.status === 'FAILED' || st.status === 'REFUNDED')) r.status = 'FAILED';
          else continue;
        }
        lhAdd(r); changed = true;
      }
      if (changed && state.stack[state.stack.length - 1] === 'history') loadHistoryFull();
    } finally { lhRechecking = false; }
  }
  // ===== خزنة السجل المشفّرة على الخادم: سجل المعاملات وصفقات التداول يبقيان بعد حذف التطبيق وإعادة تثبيته =====
  var vaultT = null;
  function vaultSoon() { if (!P2P_URL || !state.lhAddr) return; clearTimeout(vaultT); vaultT = setTimeout(vaultPush, 4000); }
  async function vaultPush() {
    if (!core.isUnlocked() || !state.lhAddr || !core.vaultSeal) return;
    try {
      var blob = await core.vaultSeal({ v: 1, at: Date.now(), lh: lhAll().slice(0, 300), tr: trAll().slice(0, 500) });
      await p2p('vault.put', { blob: blob }); state.vaultAt = Date.now();
    } catch (e) { vaultT = setTimeout(vaultPush, 60000); } // نعيد المحاولة بهدوء
  }
  function vMerge(a, b, max) { return SarraLogic.mergeRecords(a, b, max); } // logic/records.js
  async function vaultRestore() {
    if (!P2P_URL || !core.vaultOpen || state.vaultDone) return; state.vaultDone = 1;
    try {
      var r = await p2p('vault.get', {}); if (!r || !r.blob) { if (lhAll().length || trAll().length) vaultSoon(); return; }
      var v = await core.vaultOpen(r.blob);
      var lh0 = lhAll(), tr0 = trAll(), lh = vMerge(lh0, v.lh, 300), tr = vMerge(tr0, v.tr, 500);
      try { localStorage.setItem(lhKey(), JSON.stringify(lh)); localStorage.setItem(trKey(), JSON.stringify(tr)); } catch (e) {}
      if (lh.length !== lh0.length || tr.length !== tr0.length) { state.historyCache = null; state.fetchedAt.history = 0; if (state.stack[state.stack.length - 1] === 'trade') renderTrade(); }
      if (lh.length !== (v.lh || []).length || tr.length !== (v.tr || []).length) vaultSoon(); // عندنا ما ليس في الخزنة
    } catch (e) { state.vaultDone = 0; }
  }
  // تحويل سجل محلي إلى صف في قائمة السجل
  function lhRow(r) {
    var incoming = r.kind === 'recv' || r.kind === 'swap' || r.kind === 'bridge';
    return { txid: r.txid, net: r.kind === 'bridge' ? r.toNet || r.net : r.net, coin: r.coin, amount: r.amount, incoming: incoming,
      counterparty: r.kind === 'recv' ? r.from : r.to, time: r.time, ok: r.status !== 'FAILED', rec: r };
  }
  // دمج سجل الشبكة (TRON) مع المحلي: نفس رقم المعاملة يُعرض مرة واحدة ومعه تفاصيله المحلية (تبديل، نقل…)
  function withLocal(list, netFilter) {
    var loc = lhAll(), byTx = {}; loc.forEach(function (r) { if (r.txid) byTx[r.txid] = r; });
    var seen = {};
    var out = (list || []).map(function (t) { var r = t.txid && byTx[t.txid]; if (r) { seen[r.id] = 1; t.rec = r; if (r.kind === 'swap' || r.kind === 'bridge') { var x = lhRow(r); x.net = t.net; return x; } } return t; });
    loc.forEach(function (r) {
      if (seen[r.id]) return;
      var row = lhRow(r);
      if (netFilter && netFilter !== 'all' && row.net !== netFilter && r.net !== netFilter) return;
      if (r.txid && out.some(function (t) { return t.txid === r.txid; })) return;
      out.push(row);
    });
    return out;
  }


// مطابقة إشعار الخادم بالاستلام المكتشف (EVM) برمز المعاملة لا بالمبلغ والوقت وحدهما.
// منطق صافٍ بلا واجهة: يعمل في المتصفح (window.SarraLogic) وفي Node (require) للاختبار
(function (root) {
  'use strict';
  var TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  var low = function (a) { return String(a || '').toLowerCase().replace(/^0x/, ''); };
  // مجموع قيم سجلات Transfer لعقد العملة tokenAddr إلى العنوان toAddr داخل إيصال معاملة واحدة (BigInt، 0n إن لم يوجد)
  function transferRawTo(logs, tokenAddr, toAddr) {
    var tok = low(tokenAddr), to = low(toAddr), sum = 0n;
    (logs || []).forEach(function (l) {
      if (!l || low(l.address) !== tok || !l.topics || l.topics.length < 3) return;
      if (String(l.topics[0]).toLowerCase() !== TRANSFER || low(l.topics[2]).slice(-40) !== to) return;
      try { sum += BigInt(l.data && l.data !== '0x' ? l.data : '0x0'); } catch (e) {}
    });
    return sum;
  }
  // المرشحون: إشعارات بنفس الشبكة والعملة، فيها رمز معاملة، لم تُستخدم لاستلام آخر، وأحدث من 15 دقيقة
  function hintCandidates(hints, net, sym, now) {
    return (hints || []).filter(function (h) { return h && h.chain === net && h.sym === sym && /^0x[0-9a-fA-F]{64}$/.test(h.tx || '') && !h.used && now - h.at < 15 * 60000; });
  }
  var api = { transferRawTo: transferRawTo, hintCandidates: hintCandidates };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SarraLogic = Object.assign(root.SarraLogic || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);

// منطق السجلات والصفقات: دمج الخزنة، وحساب المركز والربح/الخسارة بمتوسط التكلفة
// منطق صافٍ بلا واجهة: يعمل في المتصفح (window.SarraLogic) وفي Node (require) للاختبار
(function (root) {
  'use strict';
  // دمج قائمتين بالمعرّف: الحالة النهائية (نجاح/فشل) تغلب «قيد التنفيذ»، ثم الأحدث. الناتج من الأحدث للأقدم بحد max
  function mergeRecords(a, b, max) {
    var m = {}, rank = function (x) { return x && x.status && x.status !== 'PENDING' ? 1 : 0; };
    (a || []).concat(b || []).forEach(function (x) { if (!x || !x.id) return; var o = m[x.id]; if (!o || rank(x) > rank(o) || (rank(x) === rank(o) && (x.time || 0) >= (o.time || 0))) m[x.id] = x; });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (x, y) { return (y.time || 0) - (x.time || 0); }).slice(0, max);
  }
  // مركز عملة من سجل الصفقات: الكمية، والتكلفة المتبقية، ومتوسط سعر الشراء، والربح المحقق
  // trades: [{ sym, side:'buy'|'sell', qty, usdt, time, status }] — الصفقات الفاشلة لا تُحتسب
  function position(trades, sym) {
    var qty = 0, cost = 0, real = 0, n = 0;
    (trades || []).filter(function (t) { return t.sym === sym && t.status !== 'FAILED'; }).sort(function (a, b) { return a.time - b.time; }).forEach(function (t) {
      var q = Number(t.qty), u = Number(t.usdt); if (!(q > 0) || !(u >= 0)) return; n++;
      if (t.side === 'buy') { qty += q; cost += u; }
      else { var sq = Math.min(q, qty), avg = qty > 0 ? cost / qty : 0; real += u * (sq / q) - avg * sq; cost -= avg * sq; qty -= sq; }
    });
    return { qty: qty, cost: cost, avg: qty > 0 ? cost / qty : null, real: real, n: n };
  }
  var api = { mergeRecords: mergeRecords, position: position };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SarraLogic = Object.assign(root.SarraLogic || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);

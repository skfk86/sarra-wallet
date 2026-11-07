// عرض الأرقام والمبالغ: بلا أصفار طويلة، وقطع بلا تقريب
// منطق صافٍ بلا واجهة: يعمل في المتصفح (window.SarraLogic) وفي Node (require) للاختبار
(function (root) {
  'use strict';
  var SUB = '₀₁₂₃₄₅₆₇₈₉';
  function niceNum(v, d) {
    var n = Number(String(v == null ? '' : v).replace(/,/g, ''));
    if (!isFinite(n)) return String(v == null ? '' : v);
    if (n === 0) return '0';
    var a = Math.abs(n), sign = n < 0 ? '−' : '';
    d = d == null ? 6 : d;
    if (a >= 1) return sign + a.toLocaleString('en-US', { maximumFractionDigits: a >= 1000 ? Math.min(d, 2) : Math.min(d, 4) });
    if (a >= 1e-4) return sign + a.toLocaleString('en-US', { maximumSignificantDigits: 4, maximumFractionDigits: Math.max(d, 8) });
    // صغير جداً: نعدّ الأصفار بعد الفاصلة ونكتبها رقماً صغيراً، ثم أهم 3 أرقام
    var e = Math.floor(Math.log10(a)), zeros = -e - 1, digits = (a / Math.pow(10, e)).toFixed(2).replace('.', '').replace(/0+$/, '');
    var sub = String(zeros).split('').map(function (c) { return SUB[+c]; }).join('');
    return sign + '0.0' + sub + digits;
  }
  function fmtExact(v) {
    var t = String(v == null ? '' : v).trim().replace(/,/g, '');
    var m = /^(\d+)(?:\.(\d+))?$/.exec(t); if (!m) return String(v == null ? '' : v);
    var whole = m[1].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (whole === '0' && m[2] && /^0{4,}/.test(m[2])) return niceNum(t); // 0.00000123 ← 0.0₅123
    // لا نعرض ذيلاً طويلاً من الكسور (مثل 0.000312456789012345 BNB): 6 أرقام بعد الفاصلة للمبالغ ≥ 1،
    // و6 أرقام معنوية لما دون 1. قطعٌ لا تقريب، فلا يظهر مبلغ أكبر من الحقيقي
    var fr = m[2] || '';
    if (whole !== '0') fr = fr.slice(0, 6); else { var z = (/^0*/.exec(fr) || [''])[0].length; fr = fr.slice(0, z + 6); }
    fr = fr.replace(/0+$/, '');
    return fr ? whole + '.' + fr : whole;
  }
  // مقارنة إصدارات: '1.0.10' > '1.0.9'، وتقبل 'v1.2.0'. تعيد 1 أو 0 أو -1، و0 لأي قيمة غير صالحة
  function cmpVersion(a, b) {
    var p = function (v) { var m = String(v || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/); return m ? [+m[1], +m[2], +m[3]] : null; };
    var x = p(a), y = p(b); if (!x || !y) return 0;
    for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
    return 0;
  }
  var api = { niceNum: niceNum, fmtExact: fmtExact, cmpVersion: cmpVersion };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SarraLogic = Object.assign(root.SarraLogic || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);

// يُطبَّق قبل الرسم حتى لا تومض الشاشة باللون الخطأ
(function () {
  var pref = 'auto'; try { pref = localStorage.getItem('sarra.theme') || 'auto'; } catch (e) {}
  var dark = pref === 'dark' || (pref === 'auto' && !(window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches));
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
// الخط لا يوقف فتح التطبيق: يُحمَّل كـ print ثم يُفعَّل بعد وصوله (بديل onload داخل الصفحة، فسياسة المحتوى تمنع أي سكربت مضمّن)
document.addEventListener('DOMContentLoaded', function () {
  var l = document.getElementById('font-css'); if (!l) return;
  var on = function () { l.media = 'all'; };
  if (l.sheet) on(); else l.addEventListener('load', on);
});

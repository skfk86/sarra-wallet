// إظهار أي خطأ على الشاشة بدل شاشة سوداء
function showFatal(e) {
  var box = document.getElementById('fatal');
  if (!box) {
    box = document.createElement('div'); box.id = 'fatal';
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:100;background:#2A1416;border:1px solid #5A262B;color:#FFB3B8;border-radius:14px;padding:12px;font:12px/1.6 monospace;direction:ltr;white-space:pre-wrap;max-height:40vh;overflow:auto';
    (document.body || document.documentElement).appendChild(box);
  }
  box.textContent += (e && (e.stack || e.message) || String(e)) + '\n';
}
window.addEventListener('error', function (ev) { showFatal(ev.error || ev.message); });
window.addEventListener('unhandledrejection', function (ev) { showFatal(ev.reason); });

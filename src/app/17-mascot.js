  // ===== «صُرّي»: شخصية صُرّة =====
  // صُرّة قماش مربوطة من أعلاها بألوان الشعار، بوجه بسيط. SVG داخل الصفحة + حركات CSS: بلا مكتبة ولا ملفات،
  // تعمل بلا إنترنت وتحترم سياسة المحتوى، وتتوقف تماماً عند «تقليل الحركة» في إعدادات الهاتف.
  // الحالات: happy (نجاح إرسال: عملة تطير)، receive (استلام: عملة تسقط فيها)، celebrate (اكتمال صفقة: قصاصات)،
  // wait (بانتظار التأكيد: عينان تتلفتان)، idle (شاشة فارغة: تتنفس وترمش وتلوّح)
  var MASCOT_N = 0;
  function mascot(mood, size) {
    var id = 'm' + (++MASCOT_N), s = size || 120;
    var coin = '<g class="m-coin"><circle r="11" fill="#FFC83D" stroke="#E0A000" stroke-width="2"/><text y="4.5" text-anchor="middle" font-size="13" font-weight="900" fill="#9A6B00" font-family="system-ui,sans-serif" direction="ltr">$</text></g>';
    var conf = '';
    if (mood === 'celebrate') {
      var cols = ['#22D3EE', '#FFC83D', '#16A37A', '#F472B6', '#3B82F6', '#A78BFA'];
      for (var i = 0; i < 14; i++) {
        var a = (i / 14) * Math.PI * 2, dx = Math.round(Math.cos(a) * (55 + (i % 3) * 12)), dy = Math.round(Math.sin(a) * (45 + (i % 2) * 14)) - 20;
        conf += '<rect class="m-cf" x="-3" y="-5" width="6" height="10" rx="2" fill="' + cols[i % cols.length] + '" style="--dx:' + dx + 'px;--dy:' + dy + 'px;--r:' + (i * 47 % 360) + 'deg;animation-delay:' + (0.15 + (i % 4) * 0.04) + 's"/>';
      }
    }
    var mouth = mood === 'wait' ? '<path d="M52 92q8 4 16 0" stroke="#0B2A6B" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
      : '<path class="m-mouth" d="M48 89q12 12 24 0" stroke="#0B2A6B" stroke-width="3.4" fill="#fff" stroke-linecap="round" stroke-linejoin="round"/>';
    var arm = mood === 'idle' ? '<path class="m-wave" d="M96 88q14-6 16-22" stroke="url(#' + id + 'g)" stroke-width="7" fill="none" stroke-linecap="round"/>' : '';
    var html =
      '<svg class="mascot m-' + mood + '" viewBox="0 0 120 130" width="' + s + '" height="' + Math.round(s * 130 / 120) + '" role="img" aria-label="صُرّي، شخصية صُرّة">' +
      '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22D3EE"/><stop offset=".55" stop-color="#1E6BF0"/><stop offset="1" stop-color="#0B2FB8"/></linearGradient>' +
      '<linearGradient id="' + id + 't" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3FA9FF"/><stop offset="1" stop-color="#1450E0"/></linearGradient></defs>' +
      '<ellipse class="m-shadow" cx="60" cy="124" rx="30" ry="5" fill="rgba(11,47,184,.18)"/>' +
      '<g class="m-body">' +
        (mood === 'receive' ? '<g class="m-drop" transform="translate(60 18)">' + coin + '</g>' : '') +
        '<path d="M60 36c-26 0-44 22-44 52 0 22 16 34 44 34s44-12 44-34c0-30-18-52-44-52z" fill="url(#' + id + 'g)"/>' +
        '<path d="M30 70c4-14 14-24 26-27" stroke="rgba(255,255,255,.35)" stroke-width="5" fill="none" stroke-linecap="round"/>' +
        '<path d="M44 38q16-10 32 0l-4 6q-12-6-24 0z" fill="url(#' + id + 't)"/>' +
        '<g class="m-knot"><path d="M58 30q-16-14-24-6q8 8 22 10z" fill="url(#' + id + 't)"/><path d="M62 30q16-14 24-6q-8 8-22 10z" fill="url(#' + id + 't)"/><circle cx="60" cy="32" r="5" fill="#1450E0"/></g>' +
        '<g class="m-eyes"><ellipse cx="46" cy="74" rx="6.5" ry="8" fill="#fff"/><ellipse cx="74" cy="74" rx="6.5" ry="8" fill="#fff"/>' +
          '<g class="m-pupils"><circle cx="47" cy="75" r="3.6" fill="#0B2A6B"/><circle cx="75" cy="75" r="3.6" fill="#0B2A6B"/><circle cx="48.3" cy="73.4" r="1.2" fill="#fff"/><circle cx="76.3" cy="73.4" r="1.2" fill="#fff"/></g></g>' +
        '<ellipse cx="36" cy="86" rx="5" ry="3" fill="#FF8FB1" opacity=".55"/><ellipse cx="84" cy="86" rx="5" ry="3" fill="#FF8FB1" opacity=".55"/>' +
        mouth + arm +
        '<text x="60" y="113" text-anchor="middle" font-size="13" font-weight="800" fill="rgba(255,255,255,.9)" font-family="system-ui,sans-serif">$</text>' +
      '</g>' +
      (mood === 'happy' ? '<g class="m-fly" transform="translate(60 26)">' + coin + '</g>' : '') +
      (conf ? '<g class="m-conf" transform="translate(60 60)">' + conf + '</g>' : '') +
      '</svg>';
    var w = document.createElement('span'); w.className = 'mascot-w'; w.innerHTML = html;
    return w;
  }
  // يضع الشخصية في حاوية (يستبدل ما فيها)
  function putMascot(box, mood, size) { if (!box) return; box.textContent = ''; box.appendChild(mascot(mood, size)); }

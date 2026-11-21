  // ===== «زَرُوق»: شخصية صُرّة =====
  // زَرُوق: صُرّة قماش صغيرة بلون صُرّة الأخضر. بأسلوب الشخصيات التعليمية (مثل Duolingo):
  // عينان كبيرتان معبّرتان، جسم ينضغط ويتمدد عند القفز (squash & stretch)، تحضير قبل القفزة وارتداد عند الهبوط،
  // ذراعان وقدمان، فقاعة كلام، وتتفاعل عند لمسها. SVG + CSS فقط: بلا مكتبات، بلا إنترنت، ومتوافقة مع سياسة المحتوى،
  // وتتوقف حركتها تماماً عند «تقليل الحركة» في إعدادات الهاتف.
  // الحالات: happy (نجاح)، receive (استلام عملة)، celebrate (احتفال)، wait (انتظار)، idle (شاشة فارغة)
  var MASCOT_N = 0;
  var MASCOT_NAME = 'زَرُوق';
  function mascot(mood, size, say) {
    var id = 'm' + (++MASCOT_N), s = size || 120, happyEyes = mood === 'happy' || mood === 'celebrate';
    var coin = '<g class="m-coin"><circle r="11" fill="#FFC83D" stroke="#D99A00" stroke-width="2.5"/><circle r="7" fill="none" stroke="#FFE08A" stroke-width="1.5"/><text y="4.5" text-anchor="middle" font-size="12" font-weight="900" fill="#9A6B00" font-family="system-ui,sans-serif" direction="ltr">$</text></g>';
    var conf = '';
    if (mood === 'celebrate') {
      var cols = ['#22D3EE', '#FFC83D', '#58CC02', '#FF4B91', '#3B82F6', '#A78BFA', '#FF9600'];
      for (var i = 0; i < 18; i++) {
        var a = (i / 18) * Math.PI * 2, dx = Math.round(Math.cos(a) * (60 + (i % 3) * 14)), dy = Math.round(Math.sin(a) * (50 + (i % 2) * 16)) - 26;
        conf += (i % 3 === 0 ? '<circle class="m-cf" r="3.5"' : '<rect class="m-cf" x="-3" y="-6" width="6" height="12" rx="2"') +
          ' fill="' + cols[i % cols.length] + '" style="--dx:' + dx + 'px;--dy:' + dy + 'px;--r:' + (i * 53 % 360) + 'deg;animation-delay:' + (0.42 + (i % 5) * 0.03) + 's"/>';
      }
    }
    // العينان: كبيرتان ببؤبؤ لامع وجفن يرمش؛ في الفرح تصبحان قوسين مبتسمين (^ ^)
    var eyes = happyEyes
      ? '<g class="m-eyes-h"><path d="M37 74q8-11 16 0" stroke="#062A20" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M67 74q8-11 16 0" stroke="#062A20" stroke-width="5" fill="none" stroke-linecap="round"/></g>'
      : '<g class="m-eyes"><ellipse cx="45" cy="72" rx="10" ry="12" fill="#fff"/><ellipse cx="75" cy="72" rx="10" ry="12" fill="#fff"/>' +
        '<g class="m-pupils"><circle cx="46.5" cy="74" r="6" fill="#062A20"/><circle cx="76.5" cy="74" r="6" fill="#062A20"/><circle cx="49" cy="71" r="2.2" fill="#fff"/><circle cx="79" cy="71" r="2.2" fill="#fff"/><circle cx="44.5" cy="77" r="1" fill="#fff" opacity=".7"/><circle cx="74.5" cy="77" r="1" fill="#fff" opacity=".7"/></g>' +
        '<g class="m-lids"><rect x="34" y="58" width="22" height="0" fill="url(#' + id + 'g)"/><rect x="64" y="58" width="22" height="0" fill="url(#' + id + 'g)"/></g></g>';
    var mouth = mood === 'wait' ? '<path d="M53 94q7 3 14 0" stroke="#062A20" stroke-width="3.6" fill="none" stroke-linecap="round"/>'
      : '<path d="M46 89q14 17 28 0z" fill="#062A20"/><path d="M52 96q8 5 16 0q-8-5-16 0z" fill="#FF6B8B"/>';
    var armUp = mood === 'celebrate' || mood === 'happy';
    var arms = armUp
      ? '<path class="m-arm m-arm-l" d="M22 84q-14-8-14-26" stroke="url(#' + id + 'a)" stroke-width="9" fill="none" stroke-linecap="round"/><path class="m-arm m-arm-r" d="M98 84q14-8 14-26" stroke="url(#' + id + 'a)" stroke-width="9" fill="none" stroke-linecap="round"/>'
      : '<path class="m-arm m-arm-l" d="M22 88q-12 6-14 18" stroke="url(#' + id + 'a)" stroke-width="9" fill="none" stroke-linecap="round"/><path class="m-arm m-arm-r' + (mood === 'idle' ? ' m-wave' : '') + '" d="' + (mood === 'idle' ? 'M98 86q14-6 16-24' : 'M98 88q12 6 14 18') + '" stroke="url(#' + id + 'a)" stroke-width="9" fill="none" stroke-linecap="round"/>';
    var html =
      '<svg class="mascot m-' + mood + '" viewBox="0 0 120 140" width="' + s + '" height="' + Math.round(s * 140 / 120) + '" role="img" aria-label="' + MASCOT_NAME + '، شخصية صُرّة">' +
      '<defs>' +
        '<linearGradient id="' + id + 'g" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#7CF5CF"/><stop offset=".5" stop-color="#2BD9A0"/><stop offset="1" stop-color="#0B8A63"/></linearGradient>' +
        '<linearGradient id="' + id + 'a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2BD9A0"/><stop offset="1" stop-color="#0B8A63"/></linearGradient>' +
        '<linearGradient id="' + id + 't" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9CF7D8"/><stop offset="1" stop-color="#119B70"/></linearGradient>' +
      '</defs>' +
      '<ellipse class="m-shadow" cx="60" cy="134" rx="32" ry="5" fill="rgba(11,138,99,.2)"/>' +
      (mood === 'happy' ? '<g class="m-fly">' + coin + '</g>' : '') +
      '<g class="m-jump"><g class="m-body">' +
        (mood === 'receive' ? '<g class="m-drop">' + coin + '</g>' : '') +
        // القدمان
        '<ellipse class="m-foot" cx="44" cy="127" rx="11" ry="6" fill="#0B8A63"/><ellipse class="m-foot" cx="76" cy="127" rx="11" ry="6" fill="#0B8A63"/>' +
        arms +
        // الجسم: صُرّة منتفخة بظل سفلي يعطيها عمقاً
        '<path d="M60 36c-27 0-46 23-46 54 0 23 17 36 46 36s46-13 46-36c0-31-19-54-46-54z" fill="url(#' + id + 'g)"/>' +
        '<path d="M18 100c6 16 20 24 42 24s36-8 42-24c-6 10-20 16-42 16s-36-6-42-16z" fill="rgba(6,42,32,.22)"/>' +
        '<path d="M29 72c4-15 14-26 27-29" stroke="rgba(255,255,255,.45)" stroke-width="6" fill="none" stroke-linecap="round"/>' +
        // العنق والعقدة
        '<path d="M43 39q17-11 34 0l-4 7q-13-7-26 0z" fill="url(#' + id + 't)"/>' +
        '<g class="m-knot"><path d="M58 31q-18-16-27-7q9 10 25 11z" fill="url(#' + id + 't)"/><path d="M62 31q18-16 27-7q-9 10-25 11z" fill="url(#' + id + 't)"/><circle cx="60" cy="33" r="6" fill="#119B70"/><circle cx="58.5" cy="31.5" r="2" fill="rgba(255,255,255,.5)"/></g>' +
        eyes +
        '<ellipse cx="32" cy="88" rx="6.5" ry="4" fill="#FF8FB1" opacity=".6"/><ellipse cx="88" cy="88" rx="6.5" ry="4" fill="#FF8FB1" opacity=".6"/>' +
        mouth +
      '</g></g>' +
      (conf ? '<g class="m-conf" transform="translate(60 64)">' + conf + '</g>' : '') +
      '</svg>';
    var w = document.createElement('span'); w.className = 'mascot-w';
    if (say) { var b = document.createElement('span'); b.className = 'm-say'; b.textContent = say; w.appendChild(b); }
    var holder = document.createElement('span'); holder.innerHTML = html; w.appendChild(holder.firstChild);
    // اللمس: يقفز ويضحك (حركة قصيرة لا تتكرر أثناء تشغيلها)
    w.addEventListener('click', function () {
      var sv = w.querySelector('.mascot'); if (!sv || sv.classList.contains('m-tap')) return;
      sv.classList.add('m-tap'); try { if (P.Haptics) P.Haptics.impact({ style: 'LIGHT' }); } catch (e) {}
      setTimeout(function () { sv.classList.remove('m-tap'); }, 700);
    });
    return w;
  }
  // يضع الشخصية في حاوية (يستبدل ما فيها)
  function putMascot(box, mood, size, say) { if (!box) return; box.textContent = ''; box.appendChild(mascot(mood, size, say)); }

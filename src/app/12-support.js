  // ===== الدعم الفني وحذف البيانات =====
  function supportUrl() { return CFG.supportUrl || (P2P_URL ? P2P_URL.replace(/\/p2p$/, '/support') : ''); }
  var SUP_TOPIC = { send: 'الإرسال والاستلام', p2p: 'سوق P2P', swap: 'التبديل', bridge: 'النقل بين الشبكات', account: 'الحساب والتوثيق', other: 'أخرى' };
  async function support(action, params) {
    var url = supportUrl(); if (!url) throw new Error('NETWORK');
    await ensureUnlocked();
    var body = await core.signRequest(action, params || {}), res;
    try { res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { throw new Error('NETWORK'); }
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || j.error) throw new Error(j.error || 'SERVER');
    return j;
  }
  function ticketCard(t, admin) {
    var c = el('div'); c.className = 'card'; c.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:14px';
    c.appendChild(el('span', 'font-size:12px;color:var(--mu)', (SUP_TOPIC[t.topic] || '') + ' · ' + new Date(t.created_at).toLocaleDateString('ar-EG') + ' · ' + (t.status === 'open' ? 'بانتظار الرد' : 'تم الرد')));
    if (admin) c.appendChild(el('span', 'font-size:11px;color:var(--mu);direction:ltr;text-align:right;word-break:break-all', t.address));
    c.appendChild(el('div', 'font-size:14px;line-height:1.8;white-space:pre-wrap', t.body));
    if (t.reply) c.appendChild(el('div', 'font-size:14px;line-height:1.8;white-space:pre-wrap;background:var(--ok-bg);border:1px solid var(--ok-bd);border-radius:12px;padding:10px', '💬 الدعم: ' + t.reply));
    return c;
  }
  function openSupport() { show('support'); $('sup-err').hidden = true; loadTickets(); }
  async function loadTickets() {
    var box = $('sup-list'); box.textContent = 'جارٍ التحميل…';
    try { var l = (await support('ticket.mine')).tickets; box.textContent = ''; if (!l.length) box.appendChild(el('span', 'font-size:13px;color:var(--mu)', 'لا توجد تذاكر بعد')); l.forEach(function (t) { box.appendChild(ticketCard(t)); }); }
    catch (e) { box.textContent = p2pErr(e); }
  }
  $('sup-send').onclick = async function () {
    var b = $('sup-body').value.trim(), btn = this; $('sup-err').hidden = true;
    if (b.length < 5) { $('sup-err').textContent = 'اكتب تفاصيل المشكلة'; $('sup-err').hidden = false; return; }
    if (/\b([a-z]{3,8}\s+){11,}[a-z]{3,8}\b/i.test(b)) { $('sup-err').textContent = 'يبدو أنك كتبت كلمات الاسترجاع. احذفها فوراً: لا تشاركها مع أحد، حتى الدعم.'; $('sup-err').hidden = false; return; }
    btn.disabled = true;
    try { await support('ticket.create', { topic: $('sup-topic').value, body: b }); $('sup-body').value = ''; toast('وصلت رسالتك، وسنرد عليك هنا'); loadTickets(); }
    catch (e) { $('sup-err').textContent = e.message === 'RATE_LIMITED' ? 'أرسلت تذاكر كثيرة اليوم. انتظر الرد' : p2pErr(e); $('sup-err').hidden = false; }
    btn.disabled = false;
  };
  $('del-data').onclick = async function () {
    if (!(await askConfirm('سيُمسح اسمك ورقم هاتفك وحساب بنكك وتوثيقك وتذاكرك من خوادمنا، وتتوقف إعلاناتك. محفظتك وأموالك لا تتأثر. متابعة؟'))) return;
    authorize('تأكيد حذف البيانات', async function () {
      try { await support('account.delete'); try { localStorage.removeItem('sarra.me.' + (await core.getAddress())); localStorage.removeItem('sarra.wantPhone'); } catch (x) {} state.p2p.me = null; toast('تم حذف بياناتك من الخوادم'); }
      catch (e) { toast(e.message === 'OPEN_ORDERS' ? 'لديك صفقة مفتوحة. أنهِها أولاً ثم احذف بياناتك' : p2pErr(e), true); }
    });
  };
  $('adm-tickets').onclick = async function () {
    var box = $('adm-tickets-list'); box.textContent = 'جارٍ التحميل…';
    try {
      var l = (await support('admin.tickets')).tickets; box.textContent = '';
      if (!l.length) box.textContent = 'لا توجد تذاكر مفتوحة';
      l.forEach(function (t) {
        var c = ticketCard(t, true), r = el('button', null, t.reply ? 'تعديل الرد' : 'رد'); r.type = 'button'; r.className = 'btn btn-ghost'; r.style.height = '40px';
        r.onclick = async function () { var txt = await askConfirm('ردك على التذكرة:', true); if (!txt) return; try { await support('admin.reply', { id: t.id, reply: txt }); toast('أُرسل الرد'); $('adm-tickets').onclick(); } catch (e) { toast(p2pErr(e), true); } };
        c.appendChild(r); box.appendChild(c);
      });
    } catch (e) { box.textContent = p2pErr(e); }
  };

# الإشعارات من الإعدادات: حالة الإذن، زر «تفعيل» يطلبه ويسجّل الجهاز، والمرفوض نهائياً يشرح الخطوات، والمفعّل يرسل إشعاراً تجريبياً
import asyncio, sys
from playwright.async_api import async_playwright
S=sys.argv[1]
INIT="""window.__perm = '%s'; window.__exact = 'granted'; window.__exactOpen = 0; window.__ask = 0; window.__reg = 0; window.__ln = []; window.__lsn = {};
const perm = async () => ({ receive: window.__perm, display: window.__perm });
window.Capacitor = { Plugins: {
  PushNotifications: { checkPermissions: perm, requestPermissions: async () => { window.__ask++; if (window.__perm === 'prompt') window.__perm = window.__grant; return perm(); },
    register: async () => { window.__reg++; }, addListener: async (n, f) => { window.__lsn[n] = (window.__lsn[n] || 0) + 1; }, createChannel: async () => {} },
  LocalNotifications: { checkPermissions: perm, requestPermissions: perm, checkExactNotificationSetting: async () => ({ exact_alarm: window.__exact }), changeExactNotificationSetting: async () => { window.__exactOpen++; window.__exact = 'granted'; }, schedule: async (o) => { window.__ln.push(o.notifications[0].body); } }
} };"""
async def scenario(pw, start, grant):
  b=await pw.chromium.launch(); ctx=await b.new_context(viewport={'width':360,'height':780}); pg=await ctx.new_page()
  errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
  await ctx.add_init_script(INIT % start + "window.__grant='%s';" % grant)
  await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
  await pg.route('https://mock.supabase.co/**', lambda r: r.fulfill(json={'ok':True}))
  await pg.goto('file://'+S+'/index.html')
  async def pin(d):
    for c in d: await pg.click(f'#keypad button:text-is("{c}")')
    await pg.wait_for_timeout(2500)
  await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
  await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1000); await pg.click('#intro-ok'); await pg.wait_for_timeout(2500)
  await pg.click('.tab[data-tab=security]'); await pg.wait_for_timeout(600)
  return b, pg, errs
async def main():
  async with async_playwright() as pw:
    # 1) لم يُسأل بعد ثم يوافق: الزر «تفعيل» يطلب الإذن ويسجّل الجهاز، والمستمعون لا يتكررون
    b,pg,errs=await scenario(pw,'prompt','prompt')
    await pg.evaluate("window.__perm='prompt'")  # كأن المستخدم تجاهل نافذة الفتح الأولى
    await pg.click('.tab[data-tab=home]'); await pg.wait_for_timeout(300); await pg.click('.tab[data-tab=security]'); await pg.wait_for_timeout(600)
    assert await pg.inner_text('#notif-go')=='تفعيل' and 'غير مفعّلة' in await pg.inner_text('#notif-st'), await pg.inner_text('#notif-st'); print('✓ الإعدادات تعرض حالة الإشعارات وزر «تفعيل»')
    await pg.evaluate("window.__grant='granted'"); n0=await pg.evaluate("window.__ask"); await pg.click('#notif-go'); await pg.wait_for_timeout(1800)
    st=await pg.evaluate("[window.__ask, window.__reg, window.__lsn.registration||0]")
    assert st[0]>n0 and st[1]>=1 and st[2]==1, st; assert await pg.inner_text('#notif-go')=='تجربة', await pg.inner_text('#notif-go'); print('✓ «تفعيل» يطلب الإذن ويسجّل الجهاز، دون تكرار المستمعين', st)
    await pg.click('#notif-go'); await pg.wait_for_timeout(300); assert any('تعمل' in x for x in await pg.evaluate("window.__ln")); print('✓ «تجربة» ترسل إشعاراً محلياً')
    # الإذن الثاني «المنبّهات والتذكيرات» متوقف: الحالة تقول ذلك و«السماح» يفتح صفحته
    await pg.evaluate("window.__exact='denied'"); await pg.click('.tab[data-tab=home]'); await pg.wait_for_timeout(300); await pg.click('.tab[data-tab=security]'); await pg.wait_for_timeout(700)
    assert 'المنبّهات والتذكيرات' in await pg.inner_text('#notif-st') and await pg.inner_text('#notif-go')=='السماح', await pg.inner_text('#notif-st')
    await pg.click('#notif-go'); await pg.wait_for_timeout(1500)
    assert await pg.evaluate("window.__exactOpen")==1 and await pg.inner_text('#notif-go')=='تجربة'; print('✓ الإذن الثاني (المنبّهات والتذكيرات): حالته ظاهرة و«السماح» يفتح صفحته')
    assert not errs, errs; await b.close()
    # 2) مرفوض نهائياً: لا زر بلا فائدة، بل شرح خطوات إعدادات الهاتف
    b,pg,errs=await scenario(pw,'denied','denied')
    assert 'متوقفة' in await pg.inner_text('#notif-st') and await pg.inner_text('#notif-go')=='كيف أفعّلها؟'
    await pg.click('#notif-go'); await pg.wait_for_timeout(300); t=await pg.inner_text('#toast'); assert 'إعدادات الهاتف' in t, t; print('✓ المرفوض نهائياً: شرح خطوات التفعيل من إعدادات الهاتف')
    assert not errs, errs; await b.close()
asyncio.run(main())

# المحفظة مقفلة في الذاكرة أثناء الاستخدام: أي عملية تحتاج توقيعاً تفتح لوحة الرمز ثم تكمل نفسها، والرجوع يلغيها بوضوح
import asyncio, sys, json
from playwright.async_api import async_playwright
S=sys.argv[1]
calls=[]
async def edge(route):
  b=json.loads(route.request.post_data); m=json.loads(b['message']) if 'message' in b else {'action':b['action'],'params':{}}
  a=m['action']; calls.append(a)
  def ok(d): return route.fulfill(json=d)
  if a=='me': return await ok({'profile':{'address':'x','nickname':'n','verify_status':'none','sarra_id':48291736},'fee_bps':50,'net_fee':'1','min_trade':10,'rate':{'sdg_per_usdt':9000,'band_pct':3},'range':{'min':8730,'max':9270}})
  if a=='ticket.mine': return await ok({'tickets':[]})
  return await ok({'offers':[],'orders':[],'rate':{'sdg_per_usdt':9000,'band_pct':3},'range':{'min':8730,'max':9270}})
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':780})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]})); await pg.route('https://mock.supabase.co/**', edge)
    await pg.route('https://mock.supabase.co/functions/v1/market**', lambda r: r.fulfill(status=404, json={}))
    await pg.route('https://mock.supabase.co/rest/**', lambda r: r.fulfill(json=None))
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(1500)
    vis=lambda i: pg.locator('#'+i).is_visible()
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(800); await pg.click('#intro-ok')
    # 1) سوق P2P ← إعلاناتي وهي مقفلة
    await pg.click('.tab[data-tab=p2p]'); await pg.wait_for_timeout(1200)
    await pg.evaluate('window.__core.lock()')
    await pg.click('[data-p2ptab=mine]'); await pg.wait_for_timeout(600)
    assert await vis('s-pin') and await pg.locator('#keypad button').count()>=10 and 'للمتابعة' in await pg.inner_text('#pin-sub'); print('✓ إعلاناتي والمحفظة مقفلة: تظهر لوحة الرمز (لا نص فقط)')
    n=calls.count('offers.mine'); await pin('123456')
    assert await vis('s-p2p') and calls.count('offers.mine')>n and 'لا توجد إعلانات' in await pg.inner_text('#p2p-list'); print('✓ بعد الرمز: يعود للسوق ويكمل عرض إعلاناتي تلقائياً')
    # 2) الرجوع من لوحة الرمز يلغي العملية دون تعليق
    await pg.click('[data-p2ptab=market]'); await pg.wait_for_timeout(500)
    await pg.evaluate('window.__core.lock()')
    await pg.click('[data-p2ptab=mine]'); await pg.wait_for_timeout(600)
    assert await vis('s-pin'); await pg.click('#pin-top [data-back]'); await pg.wait_for_timeout(500)
    assert await vis('s-p2p'); print('✓ الرجوع من لوحة الرمز يعيدك للسوق دون تعليق')
    # 3) حسابي (صفحة الأمان) وهي مقفلة
    await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('sarra.me.')).forEach(k=>localStorage.removeItem(k))"); await pg.evaluate('window.__core.lock()')
    await pg.click('.tab[data-tab=security]'); await pg.wait_for_timeout(400); await pg.click('#sec-acc'); await pg.wait_for_timeout(800)
    if await vis('s-pin'): await pin('123456')
    await pg.wait_for_timeout(800); assert await vis('s-account') and '4829' in await pg.inner_text('#acc-sid'); print('✓ حسابي والمحفظة مقفلة: الرمز ثم تُعرض البيانات ومعرّف صُرّة')
    # 4) الدعم الفني وهو مقفل
    await pg.click('#s-account [data-back]'); await pg.wait_for_timeout(300); await pg.click('.tab[data-tab=home]'); await pg.wait_for_timeout(1500)
    await pg.click('#menu-btn'); await pg.wait_for_timeout(300); await pg.evaluate('window.__core.lock()')
    await pg.click('[data-menu=support]'); await pg.wait_for_timeout(800)
    assert await vis('s-pin'); await pin('123456'); await pg.wait_for_timeout(800)
    assert await vis('s-support') and 'ticket.mine' in calls and 'لا توجد تذاكر' in await pg.inner_text('#sup-list'); print('✓ الدعم الفني والمحفظة مقفلة: الرمز ثم تُحمّل التذاكر')
    # 5) التحديث الدوري في الخلفية لا يفتح لوحة الرمز فجأة
    await pg.click('#s-support [data-back]'); await pg.wait_for_timeout(5000); await pg.evaluate('window.__core.lock()'); await pg.wait_for_timeout(9000)
    assert not await vis('s-pin'); print('✓ التحديث في الخلفية لا يقاطعك بلوحة الرمز')
    assert not errs, errs
    await b.close()
asyncio.run(main())

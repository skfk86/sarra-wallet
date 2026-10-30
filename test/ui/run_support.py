# الدعم الفني، سياسة الخصوصية، وحذف البيانات
import asyncio, sys, json
from playwright.async_api import async_playwright
S=sys.argv[1]
T=[]; DEL=[]
async def sup(route):
  b=json.loads(route.request.post_data); m=json.loads(b['message']); a,p=m['action'],m['params']
  assert b['signature'].startswith('0x')
  if a=='ticket.create': T.insert(0,{'id':len(T)+1,'topic':p['topic'],'body':p['body'],'status':'open','created_at':'2026-10-30T10:00:00Z'}); return await route.fulfill(json={'ticket':T[0]})
  if a=='ticket.mine': return await route.fulfill(json={'tickets':T})
  if a=='account.delete': DEL.append(1); return await route.fulfill(json={'ok':True})
  return await route.fulfill(status=400,json={'error':'NOT_ALLOWED'})
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':780})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.route('https://mock.supabase.co/functions/v1/support', sup)
    await pg.route('https://mock.supabase.co/functions/v1/p2p', lambda r: r.fulfill(json={'offers':[]}))
    await pg.route('https://mock.supabase.co/rest/**', lambda r: r.fulfill(json=None))
    await pg.route('https://mock.supabase.co/functions/v1/market**', lambda r: r.fulfill(status=404, json={}))
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1000); await pg.click('#intro-ok')
    await pg.click('#menu-btn'); await pg.wait_for_timeout(400); await pg.click('[data-menu=support]'); await pg.wait_for_timeout(800)
    assert await pg.locator('#s-support').is_visible() and 'لا توجد تذاكر' in await pg.inner_text('#sup-list'); print('✓ الدعم الفني من القائمة الجانبية')
    await pg.fill('#sup-body','abandon ability able about above absent absorb abstract absurd abuse access accident'); await pg.click('#sup-send'); await pg.wait_for_timeout(400)
    assert not T and 'كلمات الاسترجاع' in await pg.inner_text('#sup-err'); print('✓ يمنع إرسال كلمات الاسترجاع للدعم بالخطأ')
    await pg.select_option('#sup-topic','p2p'); await pg.fill('#sup-body','الصفقة متوقفة منذ ساعة'); await pg.click('#sup-send'); await pg.wait_for_timeout(1200)
    assert T and T[0]['topic']=='p2p' and 'متوقفة' in await pg.inner_text('#sup-list'); print('✓ التذكرة تُرسل موقّعة وتظهر في "تذاكري"')
    await pg.click('#s-support [data-back]'); await pg.click('#menu-btn'); await pg.wait_for_timeout(400); await pg.click('[data-menu=privacy]'); await pg.wait_for_timeout(400)
    t=await pg.inner_text('#s-privacy'); assert 'كلمات الاسترجاع' in t and 'OxaPay' in t; print('✓ سياسة الخصوصية داخل التطبيق')
    await pg.click('#del-data'); await pg.wait_for_timeout(300); await pg.click('#ask-yes'); await pg.wait_for_timeout(500)
    if await pg.locator('#keypad').is_visible(): await pin('123456')
    await pg.wait_for_timeout(1000); assert DEL==[1]; print('✓ حذف البيانات من الخوادم بعد تأكيد ورمز القفل')
    assert not errs, errs
    await b.close()
asyncio.run(main())

# القائمة الجانبية: عن التطبيق وتطبيقاتنا الأخرى
import asyncio, sys
from playwright.async_api import async_playwright
S=sys.argv[1]; OUT=sys.argv[2] if len(sys.argv)>2 else None
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':780})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    opened=[]; await pg.expose_function('rec', lambda u: opened.append(u))
    await pg.add_init_script("window.open=function(u){window.rec&&rec(u);return null}")
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1000); await pg.click('#intro-ok')
    async def no_overflow(name):
      bad=await pg.evaluate('''Array.from(document.querySelectorAll('.screen.active *, .drawer.show *')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>window.innerWidth+1||r.left<-1)}).slice(0,3).map(e=>e.tagName+'#'+e.id)''')
      assert not bad, (name,bad); print('✓ لا شيء يخرج عن الشاشة (360px):', name)
    for theme in ['dark','light']:
      await pg.evaluate(f"document.querySelector('[data-theme-opt={theme}]').click()")
      await pg.click('#menu-btn'); await pg.wait_for_timeout(400)
      assert await pg.locator('#drawer.show').count()==1 and 'الإصدار 0.1.0' in await pg.inner_text('#drawer'); 
      if theme=='dark': print('✓ زر القائمة يفتح القائمة الجانبية مع رقم الإصدار'); await no_overflow('القائمة')
      if OUT: await pg.screenshot(path=f'{OUT}/{theme}-drawer.png')
      await pg.click('[data-menu=about]'); await pg.wait_for_timeout(400)
      assert await pg.locator('#s-about').is_visible() and await pg.locator('#drawer.show').count()==0
      t=await pg.inner_text('#s-about'); assert 'غير احتجازية' in t and '0.5%' in t
      if theme=='dark': print('✓ صفحة "عن التطبيق" بالرسوم والأمان'); await no_overflow('عن التطبيق')
      if OUT: await pg.screenshot(path=f'{OUT}/{theme}-about.png', full_page=True)
      await pg.click('#s-about [data-back]'); await pg.wait_for_timeout(300)
      await pg.click('#menu-btn'); await pg.wait_for_timeout(300); await pg.click('[data-menu=apps]'); await pg.wait_for_timeout(400)
      t=await pg.inner_text('#apps-list'); assert 'طقس السودان' in t and 'CodeNile' in t
      if theme=='dark':
        print('✓ صفحة "تطبيقاتنا الأخرى"'); await no_overflow('تطبيقاتنا')
        await pg.locator('#apps-list button').nth(1).click(); await pg.wait_for_timeout(200)
        assert opened and 'com.codenile.app' in opened[-1], opened; print('✓ زر التحميل يفتح صفحة التطبيق في Google Play')
      if OUT: await pg.screenshot(path=f'{OUT}/{theme}-apps.png')
      await pg.click('#s-apps [data-back]'); await pg.wait_for_timeout(300)
      await pg.click('#menu-btn'); await pg.wait_for_timeout(300); await pg.click('#drawer-bg', position={'x':20,'y':300}); await pg.wait_for_timeout(400)
      assert await pg.locator('#drawer.show').count()==0
      if theme=='dark': print('✓ الضغط خارج القائمة يغلقها')
    assert not errs, errs
    await b.close()
asyncio.run(main())

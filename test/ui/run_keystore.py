# Android Keystore: المحفظة تُشفَّر بـ PIN + سرّ الجهاز، وفقدان السرّ يعطي رسالة استعادة واضحة
import asyncio, sys, json
from playwright.async_api import async_playwright
S=sys.argv[1]
INIT="""window.__dk = 'q'.repeat(43)+'=';
window.Capacitor = { Plugins: { DeviceKey: { get: async () => { if (!window.__dk) throw new Error('DEVICE_KEY_LOST'); return { key: window.__dk }; } } } };"""
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); ctx=await b.new_context(viewport={'width':360,'height':780}); pg=await ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await ctx.add_init_script(INIT)
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1500)
    box=json.loads(await pg.evaluate("localStorage.getItem('sarra.vault.v1') || Object.keys(localStorage).filter(k=>k.indexOf('vault')>=0).map(k=>localStorage.getItem(k))[0]"))
    assert box['v']==2 and box['dk']==1 and 'ct' in box and 'abandon' not in json.dumps(box), box.keys()
    print('✓ المحفظة الجديدة مشفّرة بـ PIN + سرّ Android Keystore، ولا تظهر الكلمات في التخزين')
    # إعادة التشغيل: يفتح بنفس السرّ
    await pg.reload(); await pg.wait_for_timeout(1500); await pin('123456'); await pg.wait_for_timeout(1000)
    assert await pg.locator('#s-home').is_visible(); print('✓ بعد إعادة التشغيل يفتح القفل بنفس الرمز')
    # فقدان سرّ الجهاز
    await ctx.add_init_script("window.__dk = null;")
    await pg.reload(); await pg.wait_for_timeout(1500); await pin('123456'); await pg.wait_for_timeout(800)
    body=await pg.inner_text('body')
    assert 'كلماتك' in body and 'مفتاح الحماية' in body, body[:300]
    print('✓ فقدان سرّ الجهاز: رسالة تطلب الاستعادة بالكلمات بدل "رمز خاطئ"')
    assert not errs, errs
    await b.close()
asyncio.run(main())

# التحديث من sarrapay.com/version.json: تنبيه فقط ولا يمنع الإرسال أو الاستلام، وأي فشل أو قيمة غير صالحة = التطبيق عادي
import asyncio, sys, json
from playwright.async_api import async_playwright
S=sys.argv[1]
async def scenario(pw, name, handler):
  b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':780})
  errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
  await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
  await pg.route('https://sarrapay.com/version.json', handler)
  await pg.goto('file://'+S+'/index.html')
  async def pin(d):
    for c in d: await pg.click(f'#keypad button:text-is("{c}")')
    await pg.wait_for_timeout(2500)
  await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
  await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1000); await pg.click('#intro-ok')
  await pg.wait_for_timeout(5500)
  card=await pg.locator('#upd-card').is_visible(); must=await pg.locator('#upd-card.must').count()==1
  # الإرسال والاستلام يفتحان كالعادة (شاشة أو ورقة اختيار العملة)
  async def opens(go, scr):
    await pg.click(f'.action[data-go={go}]'); await pg.wait_for_timeout(700)
    ok=await pg.locator(f'#s-{scr}.active').count()==1 or await pg.locator('#coin-sheet.show').count()==1
    await pg.evaluate("document.getElementById('coin-sheet')&&document.getElementById('coin-sheet').classList.remove('show')")
    return ok
  send_ok=await opens('send','send')
  await pg.evaluate("document.querySelector('[data-tab=home],[data-go=home]') && document.querySelector('[data-tab=home],[data-go=home]').click()")
  await pg.wait_for_timeout(500)
  send_ok=send_ok and await opens('receive','receive')
  await b.close()
  return card, must, send_ok, errs

async def main():
  async with async_playwright() as pw:
    r=await scenario(pw,'must', lambda rt: rt.fulfill(json={'latest':'0.3.0','min':'0.2.0'}))
    assert r[0] and r[1], r; assert r[2], 'send/receive blocked'; assert not r[3], r[3]
    print('✓ إصدار أقدم من min: بطاقة حمراء وتنبيه فقط، والإرسال والاستلام يفتحان كالعادة')
    r=await scenario(pw,'fail', lambda rt: rt.abort())
    assert not r[0] and r[2] and not r[3], r; print('✓ فشل جلب version.json: لا بطاقة، والتطبيق يعمل عادياً')
    r=await scenario(pw,'500', lambda rt: rt.fulfill(status=500, body='x'))
    assert not r[0] and r[2] and not r[3], r; print('✓ رد 500: لا بطاقة، والتطبيق يعمل عادياً')
    r=await scenario(pw,'bad', lambda rt: rt.fulfill(body='{not json', content_type='application/json'))
    assert not r[0] and r[2] and not r[3], r; print('✓ JSON تالف: لا بطاقة، والتطبيق يعمل عادياً')
    r=await scenario(pw,'junk', lambda rt: rt.fulfill(json={'latest':'abc','min':'<script>'}))
    assert not r[0] and r[2] and not r[3], r; print('✓ قيم غير صالحة: تُتجاهل، والتطبيق يعمل عادياً')
    r=await scenario(pw,'badmin', lambda rt: rt.fulfill(json={'latest':'0.1.0','min':'9.9'}))
    assert not r[0] and r[2] and not r[3], r; print('✓ min بصيغة غير صالحة: يُتجاهل، فلا تنبيه إجباري')
asyncio.run(main())

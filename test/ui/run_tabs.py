# التنقل السريع بين الأقسام: لا رسائل "فشل الاتصال"، ولا طلبات زائدة، وإعادة المحاولة بعد رفض 429
import asyncio, sys, json
from playwright.async_api import async_playwright
S=sys.argv[1]; hits={'hist':0,'p2p':0}; first429=[True]
async def hist(route):
  hits['hist']+=1
  if first429[0]: first429[0]=False; return await route.fulfill(status=429, json={'Error':'rate limit'})
  await route.fulfill(json={'data':[]})
async def p2p(route):
  hits['p2p']+=1
  await route.fulfill(json={'offers':[],'fee_bps':50,'min_trade':10,'rate':{'sdg_per_usdt':9000,'band_pct':3},'range':{'min':8730,'max':9270},'profile':{'address':'x','nickname':'n'}})
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':390,'height':844})
    toasts=[]
    await pg.expose_function('rec', lambda t: toasts.append(t))
    await pg.route('**/v1/accounts/**', hist); await pg.route('https://mock.supabase.co/**', p2p)
    await pg.route('https://mock.supabase.co/functions/v1/market**', lambda r: r.fulfill(status=404, json={}))
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(2500); await pg.click('#intro-ok')
    await pg.evaluate("new MutationObserver(()=>{const t=document.querySelector('.toast.show'); if(t) rec(t.textContent)}).observe(document.body,{subtree:true,attributes:true,childList:true})")
    h0=dict(hits)
    for i in range(4):
      for t in ['history','p2p','security','home']:
        await pg.click(f'.tab[data-tab={t}]'); await pg.wait_for_timeout(250)
    await pg.wait_for_timeout(1500)
    net=[t for t in toasts if 'الاتصال' in t]
    print('history requests during 16 switches:', hits['hist']-h0['hist'], '| p2p:', hits['p2p']-h0['p2p'], '| network error toasts:', net)
    assert not net and hits['hist']-h0['hist']<=4  # يشمل فحص الاستلام الدوري (كل ~12 ث)
    # انقطاع الإنترنت: شريط واضح، والرصيد المحفوظ يبقى ظاهراً، والإرسال يُمنع برسالة مفهومة
    bal0=await pg.inner_text('#s-home .hero-card')
    await pg.context.set_offline(True); await pg.evaluate("window.dispatchEvent(new Event('offline'))"); await pg.wait_for_timeout(300)
    assert await pg.locator('#offline-bar').is_visible(); print('✓ شريط «لا يوجد اتصال»')
    assert await pg.inner_text('#s-home .hero-card')==bal0; print('✓ الرصيد يبقى ظاهراً أثناء الانقطاع')
    await pg.click('.actions [data-go=send]'); await pg.wait_for_timeout(400)
    await pg.fill('#to','TK3aZ4bR8xLkP2vN9cW3jH5sD6fGa12pLw'); await pg.fill('#amt','1'); await pg.click('#review'); await pg.wait_for_timeout(300)
    assert 'لا يوجد اتصال' in await pg.inner_text('#send-err'); print('✓ الإرسال يُمنع برسالة واضحة')
    await pg.context.set_offline(False); await pg.evaluate("window.dispatchEvent(new Event('online'))"); await pg.wait_for_timeout(300)
    assert await pg.locator('#offline-bar').is_hidden(); print('✓ الشريط يختفي عند عودة الاتصال')
    print('OK')
    await b.close()
asyncio.run(main())

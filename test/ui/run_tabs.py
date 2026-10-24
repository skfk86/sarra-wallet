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
    assert not net and hits['hist']-h0['hist']<=2
    print('OK')
    await b.close()
asyncio.run(main())

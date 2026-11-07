# لقطات متجر Google Play: 1080×2160 (نسبة 2:1) ببيانات وهمية من نفس خوادم الاختبار
# التشغيل: SHOTS_OUT=store bash test/ui/run.sh  (ONLY=store_shots.py)
import asyncio, sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
def load(name):  # يحمّل منطق المحاكاة من ملف اختبار دون تشغيل سيناريوه
  src=open(os.path.join(os.path.dirname(__file__), name)).read().rsplit('asyncio.run(main())',1)[0]
  ns={'__file__':os.path.join(os.path.dirname(__file__), name)}; exec(compile(src,name,'exec'), ns); return ns
S=sys.argv[1]; OUT=os.environ.get('SHOTS_OUT') or sys.argv[2]
import run_evm as E
T=load('run_trade.py'); P=load('run_p2p.py')
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':720}, device_scale_factor=3); E.PG.append(pg)
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    PR={'tether':(1,0.01),'usd-coin':(1,-0.02),'tron':(0.25,2.5),'binancecoin':(600,-1.2),'ethereum':(3000,0.8),'polygon-ecosystem-token':(0.5,-3.1)}
    def spark(i): return [100+10*math.sin(k/6)+(k if i!='tron' else -k) for k in range(168)]
    async def cg(r):
      if 'coins/markets' in r.request.url: return await r.fulfill(json=[{'id':i,'current_price':v[0],'price_change_percentage_24h':v[1],'sparkline_in_7d':{'price':spark(i)}} for i,v in PR.items()])
      return await r.fulfill(status=404, json={})
    await pg.route('https://api.coingecko.com/**', cg)
    await pg.route('https://data-api.binance.vision/**', T['binance'])
    await pg.route('https://li.quest/**', T['lifi'])
    for host in ['bsc-dataseed.bnbchain.org','bsc-rpc.publicnode.com','ethereum-rpc.publicnode.com','polygon-bor-rpc.publicnode.com']:
      await pg.route(f'https://{host}/**', E.rpc); await pg.route(f'https://{host}', E.rpc)
    await pg.route('https://mock.supabase.co/**', P['handler'])
    await pg.route('https://mock.supabase.co/functions/v1/market**', lambda r: r.fulfill(status=404, json={}))
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    shot=lambda n: pg.screenshot(path=f'{OUT}/{n}.png')
    await shot('00-welcome')
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('135790'); await pin('135790'); await pg.wait_for_timeout(2500); await pg.click('#intro-ok'); await pg.wait_for_timeout(3000)
    await shot('01-home')
    await pg.click('.actions [data-go=receive]'); await pg.wait_for_timeout(1500); await shot('03-receive')
    await pg.click('#s-receive [data-back]'); await pg.wait_for_timeout(500)
    await pg.click('.actions [data-go=swap]'); await pg.wait_for_timeout(1500); await shot('05-swap')
    await pg.click('#s-swap [data-back]'); await pg.wait_for_timeout(500)
    await pg.click('.tab[data-tab=trade]'); await pg.wait_for_timeout(1500); await shot('06-market')
    await pg.click('#tr-list .tr-row[data-sym=BTC]'); await pg.wait_for_timeout(2500); await shot('02-trade')
    await pg.click('#s-pair [data-back]'); await pg.wait_for_timeout(500)
    await pg.click('.tab[data-tab=p2p]'); await pg.wait_for_timeout(1800); await shot('04-p2p')
    await b.close()
asyncio.run(main())

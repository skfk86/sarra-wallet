# حذف المحفظة ثم إنشاء جديدة: لا يبقى شيء من القديمة (الشاشة، بيانات السوق، الشارات، التخزين)
import asyncio, sys, json
from playwright.async_api import async_playwright
S=sys.argv[1]; n={'me':0}
async def edge(route):
  b=json.loads(route.request.post_data); a=b.get('action') or json.loads(b['message'])['action']
  if a=='me':
    n['me']+=1
    nick='المحفظة_الأولى' if n['me']==1 else 'المحفظة_الجديدة'
    return await route.fulfill(json={'profile':{'address':'x','nickname':nick,'verify_status':'approved','full_name':'محمد أحمد','bankak_account':'••••1234'},'is_admin':True,'fee_bps':50,'net_fee':'1','min_trade':10,'rate':{'sdg_per_usdt':9000,'band_pct':3},'range':{'min':8730,'max':9270}})
  if a=='orders.mine': return await route.fulfill(json={'orders':[{'id':'o1','seller':'x','buyer':'y','status':'awaiting_deposit','amount_usdt':10,'total_sdg':90000,'created_at':'2026-10-29T00:00:00Z'}] if n['me']==1 else []})
  return await route.fulfill(json={'offers':[],'fee_bps':50,'min_trade':10,'rate':{'sdg_per_usdt':9000,'band_pct':3},'range':{'min':8730,'max':9270}})
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':390,'height':844})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.route('https://mock.supabase.co/**', edge)
    await pg.route('https://mock.supabase.co/functions/v1/market**', lambda r: r.fulfill(status=404, json={}))
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    async def create():
      await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
      await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1000)
      if await pg.locator('#intro-ok').is_visible(): await pg.click('#intro-ok')
    await create()
    await pg.click('.tab[data-tab=p2p]'); await pg.wait_for_timeout(1500)
    assert 'المحفظة_الأولى' in await pg.inner_text('#p2p-nick-btn')
    await pg.wait_for_timeout(9000)
    old_badge=await pg.locator('#p2p-badge').is_visible()
    keys=await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('sarra.me.')&&!k.endsWith('.vs')).length")
    assert keys==1; print('✓ المحفظة الأولى: بيانات السوق محفوظة، والشارة', 'ظاهرة' if old_badge else 'مخفية')
    # حذف
    await pg.click('.tab[data-tab=security]'); await pg.click('#sec-wipe'); await pg.click('#wipe-yes'); await pin('123456')
    await pg.wait_for_timeout(2500)
    assert await pg.locator('#s-welcome').is_visible(); print('✓ بعد الحذف: شاشة البداية')
    assert await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('sarra.me.')&&!k.endsWith('.vs')).length")==0; print('✓ بيانات السوق المحفوظة على الجهاز حُذفت')
    # محفظة جديدة
    await create()
    await pg.click('.tab[data-tab=p2p]'); await pg.wait_for_timeout(1500)
    t=await pg.inner_text('#p2p-nick-btn')
    assert 'المحفظة_الجديدة' in t and 'الأولى' not in t, t; print('✓ المحفظة الجديدة تعرض بياناتها هي فوراً (بدون الخروج من التطبيق)')
    assert not await pg.locator('#p2p-badge').is_visible(); print('✓ لا شارات طلبات من المحفظة القديمة')
    assert not errs, errs
    await b.close()
asyncio.run(main())

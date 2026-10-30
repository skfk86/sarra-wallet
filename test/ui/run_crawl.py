# زاحف شامل: يزور كل الشاشات والنوافذ (والمحفظة مفتوحة ثم مقفلة) ويبحث عن أخطاء خفية:
# أخطاء JavaScript، رموز إنجليزية خام، undefined/NaN/null، نص "[object"، وتجاوز عرض الشاشة
import asyncio, sys, json, re
sys.path.insert(0, __import__('os').path.dirname(__file__))
import run_evm as E
from playwright.async_api import async_playwright
S=sys.argv[1]
async def edge(route):
  req=route.request
  if req.method!='POST': return await route.fulfill(status=404, json={})
  b=json.loads(req.post_data or '{}'); m=json.loads(b['message']) if 'message' in b else {'action':b.get('action'),'params':{}}
  a=m.get('action')
  if a=='me': return await route.fulfill(json={'profile':{'address':'x','nickname':'مستخدم-1','verify_status':'none','sarra_id':48291736,'trades_completed':0,'cancels':0},'fee_bps':50,'net_fee':'1','net_fee_bep':'0.3','min_trade':10,'rate':{'sdg_per_usdt':9000,'band_pct':3},'range':{'min':8730,'max':9270}})
  if a=='ticket.mine': return await route.fulfill(json={'tickets':[]})
  return await route.fulfill(json={'offers':[],'orders':[],'fee_bps':50,'net_fee':'1','min_trade':10,'rate':{'sdg_per_usdt':9000,'band_pct':3},'range':{'min':8730,'max':9270}})
BAD=re.compile(r'\bundefined\b|\bNaN\b|\[object|\bnull\b|(?<![A-Za-z(])[A-Z]{2,}_[A-Z_]{2,}(?![A-Za-z)])')
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':740}); E.PG.append(pg)
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.route('https://api.coingecko.com/**', lambda r: r.fulfill(status=429, json={}))
    await pg.route('https://li.quest/**', lambda r: r.fulfill(status=404, json={}))
    for host in ['bsc-dataseed.bnbchain.org','bsc-rpc.publicnode.com','ethereum-rpc.publicnode.com','polygon-bor-rpc.publicnode.com']:
      await pg.route(f'https://{host}/**', E.rpc); await pg.route(f'https://{host}', E.rpc)
    await pg.route('https://mock.supabase.co/**', edge)
    await pg.route('https://mock.supabase.co/rest/**', lambda r: r.fulfill(json=None))
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(1500)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1500); await pg.click('#intro-ok'); await pg.wait_for_timeout(1500)
    problems=[]; VIS=[]
    async def scan(label):
      await pg.wait_for_timeout(700)
      r=await pg.evaluate('''()=>{const out=[];const W=window.innerWidth;
        const roots=[document.querySelector('.screen.active'),...document.querySelectorAll('.sheet-bg.show')].filter(Boolean);
        for(const root of roots){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const el=n.parentElement;if(!el||!el.offsetParent&&getComputedStyle(el).position!=='fixed')continue;const t=n.textContent.trim();if(t)out.push(t)}
          for(const el of root.querySelectorAll('*')){if(el.closest('.netbar,.seg.scroll,.recv-coins'))continue;const b=el.getBoundingClientRect();if(b.width>0&&b.height>0&&(b.right>W+1||b.left<-1))out.push('@@OVERFLOW '+el.tagName+'#'+el.id+'.'+el.className)}}
        return {screen:(document.querySelector('.screen.active')||{}).id,texts:out}}''')
      VIS.append((label, r['screen'], len(r['texts'])))
      for t in r['texts']:
        if t.startswith('@@OVERFLOW') or BAD.search(t): problems.append((label, r['screen'], t[:120]))
    async def go(sel, label, back=True):
      try:
        await pg.click(sel, timeout=4000)
      except Exception as e:
        problems.append((label,'CLICK',sel)); return
      await scan(label)
      if back:
        if await pg.locator('.sheet-bg.show').count():
          await pg.keyboard.press('Escape'); await pg.evaluate("document.querySelectorAll('.sheet-bg.show').forEach(s=>s.classList.remove('show'))")
        if await pg.locator('.screen.active [data-back]').count() and await pg.locator('.screen.active [data-back]').first.is_visible():
          await pg.click('.screen.active [data-back]'); await pg.wait_for_timeout(300)
        if await pg.locator('#s-pin.active').count():
          await pin('123456')
    async def tour(tag):
      await pg.click('.tab[data-tab=home]'); await scan(tag+'الرئيسية')
      for g in ['send','receive','swap','bridge']:
        await pg.click('.tab[data-tab=home]'); await go('.actions [data-go='+g+']', tag+g)
      await pg.click('.tab[data-tab=home]'); await go('#assets [data-asset=BNB]', tag+'عملة BNB')
      await pg.click('.tab[data-tab=home]'); await go('#assets [data-asset=BTC]', tag+'عملة BTC')
      await pg.click('.tab[data-tab=history]'); await scan(tag+'السجل')
      await pg.click('.tab[data-tab=p2p]'); await scan(tag+'السوق')
      for t in ['sell','mine','market']:
        await go('[data-p2ptab='+t+']', tag+'P2P '+t, back=False)
        if await pg.locator('#s-pin.active').count(): await pin('123456'); await scan(tag+'P2P '+t+' بعد الرمز')
      await go('#p2p-orders-btn', tag+'طلباتي')
      await pg.click('.tab[data-tab=p2p]'); await go('#p2p-new-btn', tag+'إعلان جديد')
      await pg.click('.tab[data-tab=security]'); await scan(tag+'الأمان')
      await go('#sec-acc', tag+'حسابي')
      for m in ['coins','support','privacy','about','apps']:
        await pg.click('.tab[data-tab=home]'); await pg.click('#menu-btn'); await pg.wait_for_timeout(300); await go('[data-menu='+m+']', tag+'القائمة '+m)
    await tour('مفتوحة: ')
    await pg.evaluate('window.__core.lock()')
    await tour('مقفلة: ')
    # أي لوحة رمز ظهرت يجب أن تكون بلوحة أرقام
    print('  زار', len(VIS), 'حالة شاشة')
    await pg.evaluate("document.querySelector('.screen.active').insertAdjacentHTML('beforeend','<p>TEST undefined BAD_CODE_X</p>')"); n0=len(problems); await scan('فحص الكاشف'); assert len(problems)>n0; problems=problems[:n0]; print('✓ الكاشف نفسه يلتقط الأخطاء (فحص ذاتي)')
    for p in problems: print('PROBLEM', p)
    assert not problems, len(problems)
    assert not errs, errs
    print('✓ الزاحف: كل الشاشات والنوافذ (مفتوحة ومقفلة) بلا رموز خام أو undefined/NaN أو تجاوز للشاشة أو أخطاء JavaScript')
    await b.close()
asyncio.run(main())

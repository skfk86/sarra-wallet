# معرّف صُرّة: يظهر في الاستلام وحسابي، والتحويل به على TRON وBNB Chain، وحركة المراجعة، واحتفال القبول
import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__file__))
import run_evm as E
from playwright.async_api import async_playwright
S=sys.argv[1]
FR='TFr'+'i'*31; FE='0x3333333333333333333333333333333333333333'
st={'vs':'pending','evm_reg':None,'lookups':[]}
async def p2p(route):
  b=json.loads(route.request.post_data); m=json.loads(b['message']) if 'message' in b else {'action':b.get('action'),'params':{}}
  a,p=m['action'],m['params']
  if a=='me':
    if p.get('evm'): st['evm_reg']=p['evm']
    return await route.fulfill(json={'profile':{'address':'x','nickname':'علوش','sarra_id':48291736,'verify_status':st['vs'],'full_name':'علوش محمد','phone_masked':'091•••678','bankak_account':'••••5521','phone_link':st['vs']=='approved'},'fee_bps':50,'net_fee':'1','min_trade':10,'rate':{'sdg_per_usdt':2700,'band_pct':3},'range':{'min':2619,'max':2781}})
  if a=='id.lookup':
    st['lookups'].append(p['id'])
    if p['id']!='73519024': return await route.fulfill(status=400,json={'error':'ID_NOT_FOUND'})
    return await route.fulfill(json={'address':FR,'evm_address':FE,'name':'سارة أ•••','verified':True,'id':73519024})
  return await route.fulfill(json={'offers':[]})
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':780}); E.PG.append(pg)
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.route('https://mock.supabase.co/functions/**', p2p)
    await pg.route('https://mock.supabase.co/rest/**', lambda r: r.fulfill(json=None))
    await pg.route('https://mock.supabase.co/functions/v1/market**', lambda r: r.fulfill(status=404, json={}))
    for host in ['bsc-dataseed.bnbchain.org','bsc-rpc.publicnode.com','ethereum-rpc.publicnode.com','polygon-bor-rpc.publicnode.com']:
      await pg.route(f'https://{host}/**', E.rpc); await pg.route(f'https://{host}', E.rpc)
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1500); await pg.click('#intro-ok')
    # الاستلام: المعرّف
    await pg.click('.actions [data-go=receive]'); await pg.wait_for_timeout(1500)
    assert '4829 1736' in await pg.inner_text('#recv-sid'); print('✓ معرّف صُرّة في صفحة الاستلام، مع زر نسخ')
    assert st['evm_reg'] and st['evm_reg'].startswith('0x'); print('✓ التطبيق يسجّل عنوان 0x تلقائياً ليستلم بالمعرّف على كل الشبكات')
    await pg.click('#recv-nets [data-net=bsc]'); await pg.wait_for_timeout(500); assert await pg.locator('#recv-sid').is_visible(); await pg.click('#s-receive [data-back]')
    # حسابي: قيد المراجعة = حركة
    await pg.click('.tab[data-tab=security]'); await pg.wait_for_timeout(600); await pg.click('#sec-acc'); await pg.wait_for_timeout(1500)
    assert await pg.locator('#acc-pending .rv-anim').is_visible() and '4829 1736' in await pg.inner_text('#acc-sid'); print('✓ حسابي: المعرّف، وحركة "نراجع بياناتك" أثناء المراجعة')
    # القبول: احتفال مرة واحدة
    st['vs']='approved'; await pg.click('#s-account [data-back]'); await pg.wait_for_timeout(1500)
    assert await pg.locator('#celebrate.show').count()==1 and 'تم توثيق حسابك' in await pg.inner_text('#celebrate'); print('✓ احتفال "تم توثيق حسابك" عند القبول')
    await pg.click('#cel-ok'); await pg.click('#sec-acc'); await pg.wait_for_timeout(1500)
    assert await pg.locator('#celebrate.show').count()==0 and not await pg.locator('#acc-pending').is_visible(); print('✓ الاحتفال يظهر مرة واحدة فقط'); await pg.click('#s-account [data-back]')
    # الإرسال بالمعرّف على TRON
    await pg.click('.tab[data-tab=home]'); await pg.click('.actions [data-go=send]'); await pg.wait_for_timeout(600)
    await pg.click('#send-nets [data-net=tron]'); await pg.wait_for_timeout(300)
    await pg.fill('#to','1111 2222'); await pg.fill('#amt','1'); await pg.click('#review'); await pg.wait_for_timeout(800)
    assert 'لا يوجد مستخدم' in await pg.inner_text('#send-err'); print('✓ معرّف غير موجود: رسالة واضحة')
    await pg.fill('#to','7351 9024'); await pg.click('#review'); await pg.wait_for_timeout(800)
    t=await pg.inner_text('#c-to'); assert 'سارة' in t and '7351 9024' in t and FR not in t, t
    await pg.click('#confirm-send'); await pin('123456'); await pg.wait_for_timeout(5000)
    log=await pg.evaluate('window.__log'); assert ['USDT',FR,'1000000'] in log, log; print('✓ بالمعرّف على TRON: يصل لعنوان T الخاص بالمستلم')
    # الإرسال بالمعرّف على BNB Chain
    await pg.click('[data-go=home]') if await pg.locator('#s-success').is_visible() else None
    await pg.click('.actions [data-go=send]'); await pg.wait_for_timeout(1500)
    await pg.click('#send-nets [data-net=bsc]'); await pg.click('#coin-seg [data-coin=USDT]')
    await pg.fill('#to','73519024'); await pg.fill('#amt','1'); await pg.click('#review'); await pg.wait_for_timeout(800)
    n=len(E.sent); await pg.click('#confirm-send'); await pin('123456'); await pg.wait_for_timeout(6000)
    tx=await pg.evaluate("r=>ethers.Transaction.from(r).data", E.sent[-1][1]); assert len(E.sent)>n and FE[2:] in tx.lower(), tx
    print('✓ بنفس المعرّف على BNB Chain: يصل لعنوان 0x الخاص بالمستلم')
    assert not errs, errs
    await b.close()
asyncio.run(main())

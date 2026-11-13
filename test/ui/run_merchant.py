# بوابة الدفع للتجار: شاشة التاجر في التطبيق بخادم وهمي يحاكي دالة pay
import asyncio, sys, json
from playwright.async_api import async_playwright
S=sys.argv[1]
st={'m':None,'signed':0,'calls':[],'fail':None}
INFO={'fee_pct':0.5,'fee_min':'0.02','topup_networks':['tron','bsc'],'networks':{'tron':'TRON (TRC20)','bsc':'BNB Chain (BEP20)','polygon':'Polygon','eth':'Ethereum (ERC20)'}}
INV=[{'id':'inv_'+'a'*20,'kind':'payment','status':'paid','amount':'25','pay_amount':'25.004321','network':'bsc','network_name':'BNB Chain (BEP20)','order_id':'ORDER-1001'},
     {'id':'inv_'+'b'*20,'kind':'payment','status':'pending','amount':'10','pay_amount':'10.001234','network':'tron','network_name':'TRON (TRC20)','order_id':None},
     {'id':'inv_'+'c'*20,'kind':'topup','status':'paid','amount':'5','pay_amount':'5.000111','network':'bsc','network_name':'BNB Chain (BEP20)','order_id':None}]
async def handler(route):
  url=route.request.url
  if not url.endswith('/pay/v1/merchant'): return await route.fulfill(status=200,json={'offers':[],'fee_bps':50,'net_fee':'1','min_trade':10,'rate':{'sdg_per_usdt':2700,'band_pct':3},'range':None,'profile':{'nickname':'x','verify_status':'none'},'ok':True,'blob':None})
  b=json.loads(route.request.post_data); m=json.loads(b['message']); assert b['signature'].startswith('0x') and m['address'].startswith('T') and m['nonce']; st['signed']+=1
  a,p=m['action'],m['params']; st['calls'].append((a,p))
  if st['fail']: c=st['fail']; st['fail']=None; return await route.fulfill(status=400,json={'error':c})
  if a=='pay.me': return await route.fulfill(json={'merchant':st['m'],'invoices':INV if st['m'] else [],**INFO} if st['m'] else {'merchant':None,**INFO})
  if a=='pay.save':
    st['m']={'name':p['name'],'tron_addr':m['address'],'evm_addr':p.get('evm_addr'),'webhook_url':p.get('webhook_url'),'webhook_secret':'whsec_'+'1'*48,'key_hint':(st['m'] or {}).get('key_hint'),'credit':'1','active':True}
    return await route.fulfill(json={'merchant':st['m'],**INFO})
  if a=='pay.key':
    if p.get('test'): st['m']['test_key_hint']='cafe'; return await route.fulfill(json={'api_key':'sk_test_'+'8'*44+'cafe'})
    k='sk_live_'+'9'*44+'beef'; st['m']['key_hint']='beef'; return await route.fulfill(json={'api_key':k})
  if a=='pay.hooktest': return await route.fulfill(json=st.pop('hook',{'ok':True,'status':200}))
  if a=='pay.topup': return await route.fulfill(json={'invoice':{'id':'inv_'+'d'*20,'pay_url':'https://skfk86.github.io/sarra-wallet/pay.html?i=inv_'+'d'*20,'pay_amount':p['amount']+'.000777'}})
  return await route.fulfill(status=400,json={'error':'BAD_ACTION'})
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':780})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.route('https://mock.supabase.co/**', handler)
    await pg.add_init_script("window.__opened=[];window.open=function(u){window.__opened.push(u);return null}")
    await pg.goto('file://'+S+'/index.html')
    step=lambda m: print('✓',m)
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    async def no_overflow(name):
      w=await pg.evaluate("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth")
      bad=await pg.evaluate('''Array.from(document.querySelectorAll('.screen.active *')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>window.innerWidth+1||r.left<-1)}).slice(0,3).map(e=>e.tagName+'#'+e.id)''')
      assert w<=0 and not bad, (name,w,bad); step('لا شيء يخرج عن الشاشة (360px): '+name)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1200); await pg.click('#intro-ok'); await pg.wait_for_timeout(1500)
    await pg.click('#menu-btn'); await pg.wait_for_timeout(300); await pg.click('[data-menu=merchant]'); await pg.wait_for_timeout(1500)
    assert await pg.locator('#s-merchant').is_visible() and await pg.locator('#mc-form').is_visible() and not await pg.locator('#mc-dash').is_visible()
    step('تاجر جديد: يظهر نموذج التفعيل، والطلب موقّع بالمحفظة'); assert st['signed']>=1 and st['calls'][0][0]=='pay.me'
    await pg.click('#mc-save'); await pg.wait_for_timeout(300)
    assert 'اسم المتجر' in await pg.inner_text('#mc-err') and not any(c[0]=='pay.save' for c in st['calls']); step('اسم فارغ: يُرفض محلياً دون طلب للخادم')
    await pg.fill('#mc-name','متجر النيل'); await pg.fill('#mc-hook','http://shop.example.com/hook'); await pg.click('#mc-save'); await pg.wait_for_timeout(300)
    assert 'https' in await pg.inner_text('#mc-err'); step('رابط إشعار غير https: يُرفض')
    await pg.fill('#mc-hook','https://shop.example.com/hook'); await pg.click('#mc-save'); await pg.wait_for_timeout(1200)
    sv=[c for c in st['calls'] if c[0]=='pay.save'][0][1]
    assert sv['name']=='متجر النيل' and sv['webhook_url']=='https://shop.example.com/hook', sv
    assert await pg.locator('#mc-dash').is_visible() and await pg.inner_text('#mc-shop')=='متجر النيل' and await pg.inner_text('#mc-credit')=='1'; step('التفعيل: تظهر لوحة التاجر برصيد تجريبي 1 USDT')
    assert '0.5%' in await pg.inner_text('#mc-fee') and 'لم تنشئ مفتاحاً' in await pg.inner_text('#mc-key-state') and not await pg.locator('#mc-key-box').is_visible(); step('العمولة معروضة، ولا مفتاح بعد')
    await no_overflow('لوحة التاجر')
    await pg.click('#mc-key-new'); await pg.wait_for_timeout(1200)
    k=await pg.inner_text('#mc-key'); assert k.startswith('sk_live_') and k.endswith('beef') and await pg.locator('#mc-key-box').is_visible() and 'لن يظهر مرة أخرى' in await pg.inner_text('#mc-key-box'); step('مفتاح API: يظهر مرة واحدة مع تحذير الحفظ')
    await no_overflow('المفتاح ظاهر')
    await pg.fill('#mc-top-amt','abc'); await pg.click('#mc-top'); await pg.wait_for_timeout(500)
    assert not any(c[0]=='pay.topup' for c in st['calls']); step('مبلغ شحن غير صحيح: لا يُرسل للخادم')
    assert await pg.input_value('#mc-top-net')=='bsc' and await pg.locator('#mc-top-net option').count()==2
    await pg.fill('#mc-top-amt','5'); await pg.dblclick('#mc-top'); await pg.wait_for_timeout(1500)
    tp=[c for c in st['calls'] if c[0]=='pay.topup']; op=await pg.evaluate('window.__opened')
    assert len(tp)==1 and tp[0][1]=={'amount':'5','network':'bsc'} and len(op)==1 and 'pay.html?i=inv_' in op[0], (tp,op); step('شحن الرصيد: نقرتان = طلب واحد، وتُفتح صفحة الدفع')
    # خروج ورجوع: المفتاح لا يُعرض ثانية، والفواتير تظهر
    await pg.click('#s-merchant [data-back]'); await pg.wait_for_timeout(400)
    await pg.click('#menu-btn'); await pg.wait_for_timeout(300); await pg.click('[data-menu=merchant]'); await pg.wait_for_timeout(1500)
    assert not await pg.locator('#mc-key-box').is_visible() and await pg.inner_text('#mc-key')=='' and 'beef' in await pg.inner_text('#mc-key-state'); step('الرجوع للشاشة: المفتاح لا يُعرض مرة أخرى')
    inv=await pg.inner_text('#mc-inv'); assert 'ORDER-1001' in inv and 'مدفوعة' in inv and 'بانتظار الدفع' in inv and inv.count('USDT')==2, inv; step('آخر الفواتير: فواتير الدفع فقط (بدون فواتير الشحن) مع حالتها')
    await pg.click('#mc-edit'); await pg.wait_for_timeout(300)
    assert await pg.input_value('#mc-name')=='متجر النيل' and await pg.locator('#mc-cancel').is_visible()
    st['fail']='BAD_WEBHOOK_URL'; await pg.click('#mc-save'); await pg.wait_for_timeout(1000)
    assert 'https' in await pg.inner_text('#mc-err') and await pg.locator('#mc-form').is_visible(); step('خطأ من الخادم يظهر بالعربية في مكانه')
    await pg.click('#mc-cancel'); await pg.wait_for_timeout(300); assert await pg.locator('#mc-dash').is_visible()
    await pg.click('#mc-tkey-new'); await pg.wait_for_timeout(1200)
    k=await pg.inner_text('#mc-key'); assert k.startswith('sk_test_') and await pg.locator('#mc-key-box').is_visible() and 'cafe' in await pg.inner_text('#mc-tkey-state') and 'beef' in await pg.inner_text('#mc-key-state'), k
    assert [c for c in st['calls'] if c[0]=='pay.key'][-1][1]=={'test':True}; step('مفتاح تجريبي: منفصل عن الحقيقي، ويظهر مرة واحدة')
    assert await pg.locator('#mc-hooktest').is_visible()
    await pg.click('#mc-hooktest'); await pg.wait_for_timeout(1200); assert '200' in await pg.inner_text('#toast'), await pg.inner_text('#toast')
    st['hook']={'ok':False,'status':500}; await pg.wait_for_timeout(2500); await pg.click('#mc-hooktest'); await pg.wait_for_timeout(1200); assert '500' in await pg.inner_text('#toast'); step('إشعار تجريبي: يعرض رد خادم التاجر (نجاح أو فشل)')
    await pg.click('#mc-docs'); assert 'api.html' in (await pg.evaluate('window.__opened'))[-1]; step('زر التوثيق يفتح صفحة المطوّرين')
    print('أخطاء JavaScript:', errs or 'لا يوجد'); assert not errs
    await b.close()
asyncio.run(main())

# بوابة الدفع للتجار: شاشة التاجر في التطبيق بخادم وهمي يحاكي دالة pay
import asyncio, sys, json
from playwright.async_api import async_playwright
S=sys.argv[1]
st={'m':None,'signed':0,'calls':[],'fail':None}
TOPUP_TRON='TFeeZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'
INFO={'grace':'0.5','low_at':'1','bonus':[{'min':'50','pct':15},{'min':'20','pct':10}],'fee_pct':0.5,'fee_min':'0.02','topup_networks':['tron','bsc'],'networks':{'tron':'TRON (TRC20)','bsc':'BNB Chain (BEP20)','polygon':'Polygon','eth':'Ethereum (ERC20)'}}
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
  if a=='pay.hooks': return await route.fulfill(json={'hooks':[{'invoice_id':'inv_'+'a'*20,'event':'invoice.paid','status':500,'ok':False,'at':'2026-11-19T10:00:00Z'},{'invoice_id':'inv_'+'b'*20,'event':'invoice.cancelled','status':200,'ok':True,'at':'2026-11-19T09:00:00Z'}]})
  if a=='pay.resend': return await route.fulfill(json={'ok':True,'status':200})
  if a=='pay.hooktest': return await route.fulfill(json=st.pop('hook',{'ok':True,'status':200}))
  if a=='pay.topup':
    bonus='2' if float(p['amount'])>=20 else '0'
    return await route.fulfill(json={'invoice':{'id':'inv_'+'d'*20,'kind':'topup','network':p['network'],'address':TOPUP_TRON if p['network']=='tron' else '0x'+'ab'*20,'amount':p['amount'],'bonus':bonus,'expires_at':'2099-01-01T00:00:00Z','pay_url':'https://skfk86.github.io/sarra-wallet/pay.html?i=inv_'+'d'*20,'pay_amount':p['amount']+'.000777'}})
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
    assert await pg.locator('#mc-start').is_visible() and await pg.locator('#mc-steps .mc-step.done').count()==3; step('خطوات البدء: تظهر مع ما اكتمل منها')
    if len(sys.argv)>2: await pg.screenshot(path=sys.argv[2]+'/mc-new.png')
    await pg.click('#mc-key-new'); await pg.wait_for_timeout(1200)
    k=await pg.inner_text('#mc-key'); assert k.startswith('sk_live_') and k.endswith('beef') and await pg.locator('#mc-key-box').is_visible() and 'لن يظهر مرة أخرى' in await pg.inner_text('#mc-key-box'); step('مفتاح API: يظهر مرة واحدة مع تحذير الحفظ')
    await no_overflow('المفتاح ظاهر')
    await pg.fill('#mc-top-amt','abc'); await pg.click('#mc-top'); await pg.wait_for_timeout(500)
    assert not any(c[0]=='pay.topup' for c in st['calls']); step('مبلغ شحن غير صحيح: لا يُرسل للخادم')
    assert await pg.input_value('#mc-top-net')=='bsc' and await pg.locator('#mc-top-net option').count()==2
    await pg.fill('#mc-top-amt','5'); await pg.dblclick('#mc-top'); await pg.wait_for_timeout(1500)
    assert await pg.locator('#ask-sheet.show').count()==1 and await pg.inner_text('#ask-yes')=='ادفع من محفظتي' and '5.000777' in await pg.inner_text('#ask-text'); step('بعد إنشاء الشحن: اختيار الدفع من المحفظة أو صفحة دفع، مع المبلغ الدقيق')
    await pg.click('#ask-no'); await pg.wait_for_timeout(400)
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
    await pg.wait_for_timeout(800)
    hk=await pg.inner_text('#mc-hooks'); assert await pg.locator('#mc-hooks-card').is_visible() and 'HTTP 500' in hk and 'إلغاء' in hk, hk
    n=len([c for c in st['calls'] if c[0]=='pay.resend']); await pg.locator('#mc-hooks button').first.click(); await pg.wait_for_timeout(1200)
    rs=[c for c in st['calls'] if c[0]=='pay.resend']; assert len(rs)==n+1 and rs[-1][1]=={'id':'inv_'+'a'*20} and '200' in await pg.inner_text('#toast'), rs
    step('سجل الإشعارات: يعرض الحدث ورد خادم التاجر، وزر «إعادة» يعيد إرسال إشعار الفاتورة')
    if len(sys.argv)>2:
      await pg.evaluate('window.scrollTo(0,0)'); await pg.screenshot(path=sys.argv[2]+'/mc-dash.png',full_page=True)
    await pg.click('#mc-docs'); assert 'docs.sarrapay.com' in (await pg.evaluate('window.__opened'))[-1]; step('زر التوثيق يفتح صفحة المطوّرين')
    # الباقات وتنبيه الرصيد المنخفض وهامش السماح
    pk=await pg.inner_text('#mc-packs'); assert '+2 مكافأة' in pk and '+7.5 مكافأة' in pk and 'بلا مكافأة' in pk, pk
    await pg.locator('#mc-packs .mc-pack').nth(1).click(); assert await pg.input_value('#mc-top-amt')=='20' and await pg.locator('#mc-packs .mc-pack.on').count()==1; step('باقات الشحن: 5 و20 و50 مع مكافأتها، والنقر يملأ المبلغ')
    assert not await pg.locator('#mc-low').is_visible() and 'سالب 0.5' in await pg.inner_text('#mc-grace'); step('هامش السماح موضّح، ولا تنبيه والرصيد كافٍ')
    st['m']['credit']='-0.2'; st['m']['low_credit']=True
    await pg.click('#s-merchant [data-back]'); await pg.wait_for_timeout(400); await pg.click('#menu-btn'); await pg.wait_for_timeout(300); await pg.click('[data-menu=merchant]'); await pg.wait_for_timeout(1500)
    assert await pg.locator('#mc-low.neg').is_visible() and 'سالب' in await pg.inner_text('#mc-low-t'); step('رصيد سالب: تنبيه أحمر يشرح هامش السماح والخصم التلقائي')
    c=await pg.evaluate("JSON.parse(localStorage.getItem('sarra.mc'))"); assert c['low'] and c['neg'], c; step('حالة الرصيد تُحفظ لتنبيه الرئيسية (بلا أسرار)')
    # الدفع من المحفظة نفسها: العنوان والمبلغ مقفلان، والتغيير يمنع الإرسال
    await pg.select_option('#mc-top-net','tron'); await pg.fill('#mc-top-amt','20'); await pg.click('#mc-top'); await pg.wait_for_timeout(1200)
    assert '22' in await pg.inner_text('#ask-text'); await pg.click('#ask-yes'); await pg.wait_for_timeout(800)
    assert await pg.locator('#s-send.active').count()==1 and await pg.input_value('#to')==TOPUP_TRON and await pg.input_value('#amt')=='20.000777'
    assert await pg.evaluate("document.getElementById('amt').readOnly && document.getElementById('to').readOnly && document.getElementById('max').disabled"); step('ادفع من محفظتي: الإرسال مفتوح بالعنوان والمبلغ الدقيق، مقفلين')
    await pg.evaluate("window.__core.st().pending={to:'"+TOPUP_TRON+"',amt:'19',coin:'USDT'}"); await pg.evaluate("document.getElementById('confirm-send').click()"); await pg.wait_for_timeout(500)
    assert 'لن تُطابق' in await pg.inner_text('#toast'), await pg.inner_text('#toast'); step('تغيير المبلغ (حتى برمجياً) يمنع الإرسال: لا دفعة لا تُطابق الفاتورة')
    await pg.click('#s-send [data-back]'); await pg.wait_for_timeout(400)
    assert await pg.evaluate("!window.__core.st().payLock && !document.getElementById('amt').readOnly && !document.getElementById('max').disabled"); step('مغادرة الإرسال تفك القفل، فالإرسال العادي لا يتأثر')
    print('أخطاء JavaScript:', errs or 'لا يوجد'); assert not errs
    await b.close()
asyncio.run(main())

# نقل بين الشبكات عبر LI.FI (خدمة وهمية): TRON → BNB Chain و BNB Chain → TRON
import asyncio, sys, json
from urllib.parse import urlparse, parse_qs
sys.path.insert(0, __import__('os').path.dirname(__file__))
import run_evm as E
from playwright.async_api import async_playwright
S=sys.argv[1]
Q=[]; ST=[]; EVIL={'on':None}
DIA='0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'; ME_T='TQ7mZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'; APPR='TApprZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'
async def lifi(route):
  u=urlparse(route.request.url); q={k:v[0] for k,v in parse_qs(u.query).items()}
  if u.path.endswith('/quote'):
    Q.append(q)
    if q['fromChain']=='TRN':
      return await route.fulfill(json={'tool':'symbiosis','toolDetails':{'name':'Symbiosis'},'estimate':{'toAmount':str(int(q['fromAmount'])*10**12*99//100),'toAmountMin':str(int(q['fromAmount'])*10**12*98//100),
        'approvalAddress':'TApprZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf','feeCosts':[{'amountUSD':'0.40'}],'gasCosts':[{'amountUSD':'1.10'}],'executionDuration':60},
        'action':{'fromAmount':q['fromAmount'],'toAddress':q['toAddress'],'fromToken':{'address':q['fromToken']},'toToken':{'address':q['toToken']}},
        'transactionRequest':{'customData':{'tronTransaction':{'txID':'brtx1','raw_data':{'contract':[{'type':'TriggerSmartContract','parameter':{'value':{'owner_address':('TOTHERx4bR8xLkP2vN9cW3jH5sD6fGa19xKf' if EVIL['on']=='owner' else ME_T),'contract_address':APPR,'call_value':0}}}]},'raw_data_hex':'0a'}}}})
    return await route.fulfill(json={'tool':'allbridge','estimate':{'toAmount':str(int(q['fromAmount'])//10**12*99//100),'toAmountMin':'1','approvalAddress':DIA,
        'feeCosts':[],'gasCosts':[{'amountUSD':'0.05','amount':'80000000000000'}],'executionDuration':300},
        'action':{'fromAmount':q['fromAmount'],'toAddress':('TEvilZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf' if EVIL['on']=='dest' else q['toAddress'])},
        'transactionRequest':{'to':('0x9999999999999999999999999999999999999999' if EVIL['on']=='to' else DIA),'data':'0xdeadbeef','value':'0x0','gasLimit':'0x30d40','chainId':56}})
  if u.path.endswith('/status'):
    ST.append(q); return await route.fulfill(json={'status':'DONE','substatus':'COMPLETED','lifiExplorerLink':'https://scan.li.fi/tx/x'})
  await route.fulfill(status=404, json={})
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':780}); E.PG.append(pg)
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.route('https://api.coingecko.com/**', lambda r: r.fulfill(json={}))
    await pg.route('https://li.quest/**', lifi)
    for host in ['bsc-dataseed.bnbchain.org','bsc-rpc.publicnode.com','ethereum-rpc.publicnode.com','polygon-bor-rpc.publicnode.com']:
      await pg.route(f'https://{host}/**', E.rpc); await pg.route(f'https://{host}', E.rpc)
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(2500); await pg.click('#intro-ok'); await pg.wait_for_timeout(2000)
    assert await pg.locator('#act-bridge').is_visible(); print('✓ زر "نقل" في الصفحة الرئيسية')
    await pg.click('#act-bridge'); await pg.wait_for_timeout(800)
    assert await pg.get_attribute('#br-from [data-net=tron]','aria-selected')=='true' and await pg.get_attribute('#br-to [data-net=bsc]','aria-selected')=='true'
    coins=await pg.locator('#br-coin button').all_inner_texts(); assert coins==['USDT','TRX'], coins; print('✓ من TRON إلى BNB Chain: العملات المشتركة فقط (USDT وTRX)')
    assert '125.5' in await pg.inner_text('#br-bal'); print('✓ رصيد الشبكة المرسِلة ظاهر')
    await pg.fill('#br-amt','500'); await pg.click('#br-quote-btn'); await pg.wait_for_timeout(400)
    assert 'غير كافٍ' in await pg.inner_text('#br-err'); print('✓ رفض مبلغ أكبر من الرصيد')
    await pg.fill('#br-amt','100'); await pg.click('#br-quote-btn'); await pg.wait_for_timeout(800)
    q=Q[-1]; assert q['fromChain']=='TRN' and q['toChain']=='56' and q['fromAmount']=='100000000' and q['fromAddress'].startswith('T') and q['toAddress'].startswith('0x') and q['integrator']=='sarra-wallet' and 'fee' not in q, q
    print('✓ طلب السعر صحيح: 100 USDT من محفظتك على TRON إلى عنوانك 0x على BNB Chain، بدون عمولة إضافية')
    out=await pg.inner_text('#br-out'); fee=await pg.inner_text('#br-fee')
    assert '99' in out and 'BNB Chain' in out and fee=='≈ $1.10' and await pg.inner_text('#br-plat')=='≈ $0.40' and 'TRX' in await pg.inner_text('#br-quote'), (out,fee); assert await pg.inner_text('#br-app')=='مجاناً'; print('✓ بطاقة السعر: ستستلم ~99 USDT، الرسوم $1.50، المسار Symbiosis')
    await pg.click('#br-go'); await pin('123456'); await pg.wait_for_timeout(3000)
    log=await pg.evaluate('window.__log')
    kinds=[l[0] for l in log]; assert 'APPROVE' in kinds and kinds.index('APPROVE')<kinds.index('SIGN')<kinds.index('BROADCAST'), log
    ap=[l for l in log if l[0]=='APPROVE'][0]; assert ap[1]=='TApprZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf' and str(ap[2])=='100000000', ap
    print('✓ موافقة بالمبلغ المطلوب فقط، ثم توقيع معاملة الجسر وبثّها على TRON')
    for _ in range(20):
      if ST: break
      await pg.wait_for_timeout(500)
    assert ST and ST[0]['txHash']=='brtx1' and ST[0]['fromChain']=='TRN'
    await pg.wait_for_timeout(500)
    assert 'تم النقل بنجاح' in await pg.inner_text('#br-track-t'); print('✓ تتبّع الحالة حتى "تم النقل بنجاح"')
    # BNB Chain → TRON
    await pg.click('#br-from [data-net=bsc]'); await pg.wait_for_timeout(1500)
    assert await pg.get_attribute('#br-to [data-net=tron]','aria-selected')=='true'
    await pg.fill('#br-amt','10'); await pg.click('#br-quote-btn'); await pg.wait_for_timeout(800)
    q=Q[-1]; assert q['fromChain']=='56' and q['toChain']=='TRN' and q['fromAmount']==str(10*10**18) and q['toAddress'].startswith('T'), q
    n=len(E.sent); await pg.click('#br-go'); await pin('123456')
    for _ in range(40):
      if len(E.sent)-n>=2: break
      await pg.wait_for_timeout(500)
    new=E.sent[n:]; assert len(new)==2, len(new)
    t=[await pg.evaluate("r=>{const t=ethers.Transaction.from(r);return {to:t.to,data:t.data,cid:Number(t.chainId)}}", x[1]) for x in new]
    assert t[0]['data'].startswith('0x095ea7b3') and t[1]['to']==DIA and t[1]['data']=='0xdeadbeef' and t[1]['cid']==56, t
    print('✓ من BNB Chain إلى TRON: موافقة ERC20 ثم معاملة الجسر موقّعة على السلسلة 56')
    for _ in range(40):
      if 'تم النقل' in await pg.inner_text('#br-track-t'): break
      await pg.wait_for_timeout(500)
    # هجمات: خدمة النقل (أو وسيط) تعيد معاملة مختلفة عمّا رآه المستخدم
    for kind,label in [('to','عقد غير عقد LI.FI الرسمي'),('dest','وجهة غير محفظتك')]:
      EVIL['on']=kind; n=len(E.sent)
      await pg.fill('#br-amt','5'); await pg.click('#br-quote-btn'); await pg.wait_for_timeout(800)
      await pg.click('#br-go'); await pin('123456'); await pg.wait_for_timeout(1500)
      assert len(E.sent)==n and 'لا تطابق' in await pg.inner_text('#br-err'), (kind, await pg.inner_text('#br-err'))
      print('✓ هجوم مرفوض قبل التوقيع: '+label+' (لم تُبث أي معاملة)')
    EVIL['on']='owner'
    await pg.click('#br-from [data-net=tron]'); await pg.wait_for_timeout(1200)
    lg=len(await pg.evaluate('window.__log'))
    await pg.fill('#br-amt','5'); await pg.click('#br-quote-btn'); await pg.wait_for_timeout(800)
    await pg.click('#br-go'); await pin('123456'); await pg.wait_for_timeout(2500)
    new=[l[0] for l in (await pg.evaluate('window.__log'))[lg:]]
    assert 'SIGN' not in new and 'لا تطابق' in await pg.inner_text('#br-err'), new; print('✓ هجوم مرفوض على TRON: معاملة باسم محفظة أخرى لا تُوقَّع')
    EVIL['on']=None
    # التبديل داخل BNB Chain: USDT ← BNB
    await pg.click('#s-bridge [data-back]'); await pg.wait_for_timeout(400); await pg.click('.actions [data-go=swap]'); await pg.wait_for_timeout(1200)
    assert await pg.locator('#sw-nets').is_visible() and await pg.locator('#swap-evm').is_visible() and not await pg.locator('#swap-on').is_visible(); print('✓ شاشة التبديل تفتح على BNB Chain افتراضياً')
    assert await pg.get_attribute('#es-from [data-coin=USDT]','aria-checked')=='true' and await pg.get_attribute('#es-to [data-coin=BNB]','aria-checked')=='true'
    await pg.fill('#es-amt','5'); await pg.click('#es-quote-btn'); await pg.wait_for_timeout(800)
    q=Q[-1]; assert q['fromChain']=='56' and q['toChain']=='56' and q['toToken']=='0x0000000000000000000000000000000000000000' and q['fromAmount']==str(5*10**18) and q['toAddress']==q['fromAddress'], q
    assert await pg.locator('#es-quote').is_visible() and '5 USDT' in await pg.inner_text('#es-pay') and 'BNB' in await pg.inner_text('#es-fee')
    if len(sys.argv)>2: await pg.screenshot(path=sys.argv[2]+'/swap.png')
    print('✓ تفاصيل الخصم: تدفع، عمولة صُرّة، رسوم المنصة، رسوم الشبكة بـ BNB'); print('✓ سعر التبديل USDT ← BNB داخل نفس الشبكة وإلى محفظتك نفسها')
    n=len(E.sent); await pg.click('#es-go'); await pin('123456')
    for _ in range(40):
      if len(E.sent)-n>=2: break
      await pg.wait_for_timeout(500)
    t=[await pg.evaluate("r=>{const t=ethers.Transaction.from(r);return {to:t.to,data:t.data,cid:Number(t.chainId)}}", x[1]) for x in E.sent[n:]]
    assert len(t)==2 and t[0]['data'].startswith('0x095ea7b3') and t[1]['to']==DIA and t[1]['cid']==56, t; print('✓ التبديل: موافقة ثم معاملة LI.FI موقّعة على BNB Chain')
    await pg.click('#sw-nets [data-net=tron]'); await pg.wait_for_timeout(600)
    assert not await pg.locator('#swap-evm').is_visible(); print('✓ اختيار TRON يعيد التبديل عبر SunSwap')
    bad=await pg.evaluate('''Array.from(document.querySelectorAll('.screen.active *')).filter(e=>!e.closest('.netbar')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>window.innerWidth+1||r.left<-1)}).length''')
    assert bad==0, bad; print('✓ لا تجاوز لعرض الشاشة')
    assert not errs, errs
    await b.close()
asyncio.run(main())

# نقل بين الشبكات عبر LI.FI (خدمة وهمية): TRON → BNB Chain و BNB Chain → TRON
import asyncio, sys, json
from urllib.parse import urlparse, parse_qs
sys.path.insert(0, __import__('os').path.dirname(__file__))
import run_evm as E
from playwright.async_api import async_playwright
S=sys.argv[1]
Q=[]; ST=[]; EVIL={'on':None}
DIA='0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'; ME_T='TQ7mZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'; APPR='TApprZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'
import hashlib
def cid(x): return 728126428 if x=='TRN' else int(x)
def thex(a): return '41'+a[1:21].encode().hex()
def pb(f,v):
  def vi(n):
    o=b''
    while True:
      b=n&127; n>>=7
      if n: o+=bytes([b|128])
      else: return o+bytes([b])
  return vi(f<<3)+vi(v) if isinstance(v,int) else vi(f<<3|2)+vi(len(v))+v
def tron_raw(owner,contract,data,call_value=0,fee=150000000):
  trig=pb(1,bytes.fromhex(thex(owner)))+pb(2,bytes.fromhex(thex(contract)))+(pb(3,call_value) if call_value else b'')+pb(4,data)
  anyv=pb(1,b'type.googleapis.com/protocol.TriggerSmartContract')+pb(2,trig)
  raw=pb(1,b'\x12\x34')+pb(4,b'\x01'*8)+pb(8,1700000000000)+pb(11,pb(1,31)+pb(2,anyv))+pb(14,1700000000000)+pb(18,fee)
  return raw.hex(), hashlib.sha256(raw).hexdigest()
def act(q,to=None): return {'fromAmount':q['fromAmount'],'toAddress':to or q['toAddress'],'fromAddress':q['fromAddress'],'fromChainId':cid(q['fromChain']),'toChainId':cid(q['toChain']),'fromToken':{'address':q['fromToken']},'toToken':{'address':q['toToken']}}
def evm_data(q): return '0xdeadbeef'+'00'*12+(q['toAddress'][2:].lower() if q['toAddress'].startswith('0x') else '11'*20)+'00'*32
async def lifi(route):
  u=urlparse(route.request.url); q={k:v[0] for k,v in parse_qs(u.query).items()}
  if u.path.endswith('/quote'):
    Q.append(q)
    if q['fromChain']=='TRN':
      rh,txid=tron_raw('TOTHERx4bR8xLkP2vN9cW3jH5sD6fGa19xKf' if EVIL['on']=='owner' else ME_T, APPR, bytes.fromhex('deadbeef'+'00'*12+('99'*20 if EVIL['on']=='recv' else q['toAddress'][2:].lower())), 60000000 if EVIL['on']=='value' else 0)
      if EVIL['on']=='txid': txid='ab'*32
      return await route.fulfill(json={'tool':'symbiosis','toolDetails':{'name':'Symbiosis'},'estimate':{'toAmount':str(int(q['fromAmount'])*10**12*99//100),'toAmountMin':str(int(q['fromAmount'])*10**12*98//100),
        'approvalAddress':APPR,'feeCosts':[{'amountUSD':'0.40'}],'gasCosts':[{'amountUSD':'1.10'}],'executionDuration':60},
        'action':act(q),
        'transactionRequest':{'customData':{'tronTransaction':{'txID':txid,'raw_data':{'contract':[{'type':'TriggerSmartContract','parameter':{'value':{'owner_address':ME_T,'contract_address':APPR,'call_value':0}}}]},'raw_data_hex':rh}}}})
    return await route.fulfill(json={'tool':'allbridge','estimate':{'toAmount':str(int(q['fromAmount'])//10**12*99//100),'toAmountMin':'1','approvalAddress':DIA,
        'feeCosts':[],'gasCosts':[{'amountUSD':'0.05','amount':'80000000000000'}],'executionDuration':300},
        'action':dict(act(q,'TEvilZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf' if EVIL['on']=='dest' else None),**({'toChainId':1} if EVIL['on']=='chain' else {})),
        'transactionRequest':{'to':('0x9999999999999999999999999999999999999999' if EVIL['on']=='to' else DIA),'data':('0xdeadbeef'+'00'*64 if EVIL['on']=='recv' else evm_data(q)),'value':'0x0','gasLimit':'0x30d40','chainId':cid(q['fromChain'])}})
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
    await pg.click('#br-go'); await pg.click('#brc-ok'); await pin('123456'); await pg.wait_for_timeout(3000)
    log=await pg.evaluate('window.__log')
    kinds=[l[0] for l in log]; assert 'APPROVE' in kinds and kinds.index('APPROVE')<kinds.index('SIGN')<kinds.index('BROADCAST'), log
    ap=[l for l in log if l[0]=='APPROVE'][0]; assert ap[1]=='TApprZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf' and str(ap[2])=='100000000', ap
    print('✓ موافقة بالمبلغ المطلوب فقط، ثم توقيع معاملة الجسر وبثّها على TRON')
    for _ in range(20):
      if ST: break
      await pg.wait_for_timeout(500)
    assert ST and len(ST[0]['txHash'])==64 and ST[0]['fromChain']=='TRN'
    await pg.wait_for_timeout(500)
    assert 'تم النقل بنجاح' in await pg.inner_text('#br-track-t'); print('✓ تتبّع الحالة حتى "تم النقل بنجاح"')
    # BNB Chain → TRON
    await pg.click('#br-from [data-net=bsc]'); await pg.wait_for_timeout(1500)
    assert await pg.get_attribute('#br-to [data-net=tron]','aria-selected')=='true'
    await pg.fill('#br-amt','10'); await pg.click('#br-quote-btn'); await pg.wait_for_timeout(800)
    q=Q[-1]; assert q['fromChain']=='56' and q['toChain']=='TRN' and q['fromAmount']==str(10*10**18) and q['toAddress'].startswith('T'), q
    n=len(E.sent); await pg.click('#br-go'); await pg.click('#brc-ok'); await pin('123456')
    for _ in range(40):
      if len(E.sent)-n>=2: break
      await pg.wait_for_timeout(500)
    new=E.sent[n:]; assert len(new)==2, len(new)
    t=[await pg.evaluate("r=>{const t=ethers.Transaction.from(r);return {to:t.to,data:t.data,cid:Number(t.chainId)}}", x[1]) for x in new]
    assert t[0]['data'].startswith('0x095ea7b3') and t[1]['to']==DIA and t[1]['data'].startswith('0xdeadbeef') and t[1]['cid']==56, t
    print('✓ من BNB Chain إلى TRON: موافقة ERC20 ثم معاملة الجسر موقّعة على السلسلة 56')
    for _ in range(40):
      if 'تم النقل' in await pg.inner_text('#br-track-t'): break
      await pg.wait_for_timeout(500)
    # هجمات: خدمة النقل (أو وسيط) تعيد معاملة مختلفة عمّا رآه المستخدم
    for kind,label in [('to','عقد غير عقد LI.FI الرسمي'),('dest','وجهة غير محفظتك'),('chain','شبكة وجهة مختلفة')]:
      EVIL['on']=kind; n=len(E.sent)
      await pg.fill('#br-amt','5'); await pg.click('#br-quote-btn'); await pg.wait_for_timeout(800)
      await pg.click('#br-go'); await pg.click('#brc-ok'); await pin('123456'); await pg.wait_for_timeout(1500)
      assert len(E.sent)==n and 'لا تطابق' in await pg.inner_text('#br-err'), (kind, await pg.inner_text('#br-err'))
      print('✓ هجوم مرفوض قبل التوقيع: '+label+' (لم تُبث أي معاملة)')
    await pg.click('#br-from [data-net=tron]'); await pg.wait_for_timeout(1200)
    for kind,label in [('owner','معاملة باسم محفظة أخرى'),('recv','مستلم مختلف داخل البيانات الموقَّعة'),('value','سحب TRX زائد'),('txid','بصمة لا تطابق البايتات')]:
      EVIL['on']=kind; lg=len(await pg.evaluate('window.__log'))
      await pg.fill('#br-amt','5'); await pg.click('#br-quote-btn'); await pg.wait_for_timeout(800)
      await pg.click('#br-go'); await pg.click('#brc-ok'); await pin('123456'); await pg.wait_for_timeout(2500)
      new=[l[0] for l in (await pg.evaluate('window.__log'))[lg:]]
      assert 'SIGN' not in new and not any('approve' in str(x).lower() for x in new) and 'لا تطابق' in await pg.inner_text('#br-err'), (kind,new,await pg.inner_text('#br-err')); print('✓ هجوم مرفوض على TRON: '+label+' (لا توقيع ولا موافقة)')
    EVIL['on']=None
    # التبديل داخل BNB Chain: USDT ← BNB
    await pg.click('#s-bridge [data-back]'); await pg.wait_for_timeout(400); await pg.click('.actions [data-go=swap]'); await pg.wait_for_timeout(1200)
    assert await pg.locator('#sw-nets').is_visible() and await pg.locator('#swap-evm').is_visible() and not await pg.locator('#swap-on').is_visible(); print('✓ شاشة التبديل تفتح على BNB Chain افتراضياً')
    assert await pg.get_attribute('#es-from [data-coin=USDT]','aria-checked')=='true' and await pg.get_attribute('#es-to [data-coin=BNB]','aria-checked')=='true'
    await pg.click('#es-flip'); await pg.wait_for_timeout(200)
    assert await pg.get_attribute('#es-from [data-coin=BNB]','aria-checked')=='true' and await pg.get_attribute('#es-to [data-coin=USDT]','aria-checked')=='true'
    await pg.click('#es-pct [data-pct="100"]'); v=float(await pg.input_value('#es-amt')); assert 0 < v < 0.01, v
    await pg.click('#es-flip'); await pg.wait_for_timeout(200); await pg.click('#es-pct [data-pct="50"]'); assert await pg.input_value('#es-amt')!=''
    print('✓ زر القلب يعكس العملتين، وأزرار النسبة تملأ المبلغ (100% من BNB تترك وقوداً)')
    await pg.fill('#es-amt','5'); await pg.click('#es-quote-btn'); await pg.wait_for_timeout(800)
    q=Q[-1]; assert q['fromChain']=='56' and q['toChain']=='56' and q['toToken']=='0x0000000000000000000000000000000000000000' and q['fromAmount']==str(5*10**18) and q['toAddress']==q['fromAddress'], q
    assert '1 USDT ≈' in await pg.inner_text('#es-rate')
    assert await pg.locator('#es-quote').is_visible() and '5 USDT' in await pg.inner_text('#es-pay') and 'BNB' in await pg.inner_text('#es-fee')
    if len(sys.argv)>2: await pg.screenshot(path=sys.argv[2]+'/swap.png')
    print('✓ تفاصيل الخصم: تدفع، عمولة صُرّة، رسوم المنصة، رسوم الشبكة بـ BNB'); print('✓ سعر التبديل USDT ← BNB داخل نفس الشبكة وإلى محفظتك نفسها')
    n=len(E.sent); await pg.click('#es-go'); await pin('123456')
    for _ in range(40):
      if len(E.sent)-n>=2: break
      await pg.wait_for_timeout(500)
    t=[await pg.evaluate("r=>{const t=ethers.Transaction.from(r);return {to:t.to,data:t.data,cid:Number(t.chainId)}}", x[1]) for x in E.sent[n:]]
    assert len(t)==2 and t[0]['data'].startswith('0x095ea7b3') and t[1]['to']==DIA and t[1]['cid']==56, t; print('✓ التبديل: موافقة ثم معاملة LI.FI موقّعة على BNB Chain')
    # السجل المحلي: التبديل والنقل يظهران بعنوانهما وتفاصيلهما
    for _ in range(300):
      if not await pg.evaluate("() => window.__core.busy()"): break
      await pg.wait_for_timeout(300)
    await pg.click('#s-swap [data-back]'); await pg.wait_for_timeout(400); await pg.click('.tab[data-tab=history]'); await pg.wait_for_timeout(1500)
    txt=await pg.inner_text('#history-full')
    assert 'تبديل USDT ← BNB' in txt and 'نقل إلى' in txt, txt
    await pg.locator('#history-full button.tx', has_text='تبديل').first.click(); await pg.wait_for_timeout(400)
    d=await pg.inner_text('#txd-sheet'); assert 'دفعت' in d and '5 USDT' in d and 'استلمت' in d and 'LI.FI' in d, d
    if len(sys.argv)>2: await pg.screenshot(path=sys.argv[2]+'/txd-swap.png')
    await pg.click('#txd-close'); await pg.wait_for_timeout(300)
    await pg.locator('#history-full button.tx', has_text='نقل').first.click(); await pg.wait_for_timeout(400)
    d=await pg.inner_text('#txd-sheet'); assert 'من شبكة' in d and 'إلى شبكة' in d and 'نقل بين الشبكات' in d, d
    if len(sys.argv)>2: await pg.screenshot(path=sys.argv[2]+'/txd-bridge.png')
    await pg.click('#txd-close'); await pg.wait_for_timeout(300); await pg.click('.tab[data-tab=home]'); await pg.wait_for_timeout(500)
    print('✓ السجل المحلي: التبديل والنقل يظهران بعنوانهما، والتفاصيل تعرض المدفوع والمستلم والشبكات')
    # إشعار الاستلام: رصيد BNB ارتفع بمقدار ناتج تبديلك أنت (ضمن السعر المعروض) ← لا إشعار "استلام تحويلة"
    async def idle(also_tx=True):
      for _ in range(300):
        if await pg.evaluate("() => !window.__core.rx().busy && !window.__core.rx().rebasing && " + ("!window.__core.busy()" if also_tx else "true")): return
        await pg.wait_for_timeout(300)
      raise AssertionError('busy')
    async def kick():
      await idle(); await pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); await pg.wait_for_timeout(300); await idle(False)
    await kick()   # خط أساس
    E.BAL['bsc']['native']+=4900000; E.BAL['bsc']['0x55d398326f99059ff775485246999027b3197955']-=5*10**18
    await kick()
    assert not await pg.locator('#rx-sheet').is_visible(); print('✓ ناتج التبديل (BNB زاد) لا يظهر كإشعار استلام كاذب')
    E.BAL['bsc']['0x55d398326f99059ff775485246999027b3197955']+=7*10**18
    await kick()
    assert await pg.locator('#rx-sheet').is_visible() and '+7' in await pg.inner_text('#rx-amt') and 'USDT' in await pg.inner_text('#rx-coin'); print('✓ تحويلة واردة حقيقية بعد التبديل تظهر كإشعار (7 USDT)')
    await pg.click('#rx-close'); await pg.wait_for_timeout(400)
    # إرسال إلى Binance ثم استلام من Binance قبل الفحص التالي: يجب ألا يُلغي أحدهما الآخر
    U='0x55d398326f99059ff775485246999027b3197955'
    E.BAL['bsc'][U]-=10*10**18   # أثر إرسالك (10 USDT) يظهر على الشبكة
    await pg.evaluate("window.__core.rebase(true)"); await idle(False)
    E.BAL['bsc'][U]+=99*10**17   # Binance أعادت 9.9 USDT
    await kick()
    assert await pg.locator('#rx-sheet').is_visible() and '+9.9' in await pg.inner_text('#rx-amt'), await pg.inner_text('#rx-amt'); print('✓ الاستلام بعد إرسالك مباشرة يُكتشف (لا تلغي العمليتان بعضهما)')
    await pg.click('#rx-close'); await pg.wait_for_timeout(400)
    # استلام 0.001 ETH (BEP20) من Binance (~$3): مبلغ صغير بالوحدات لكنه حقيقي، يجب ألا يُعامَل كغبار
    EW='0x2170ed0880ac9a755fd29b2688956bd959f933f8'
    E.BAL['bsc'][EW]=E.BAL['bsc'].get(EW,0)+10**15
    await kick()
    assert await pg.locator('#rx-sheet').is_visible() and '+0.001' in await pg.inner_text('#rx-amt') and 'ETH' in await pg.inner_text('#rx-coin'), await pg.inner_text('#rx-coin'); print('✓ استلام 0.001 ETH على BNB Chain يظهر كإشعار ويُسجَّل (الغبار يُقاس بالدولار)')
    await pg.click('#rx-close'); await pg.wait_for_timeout(400)
    await pg.click('.actions [data-go=swap]'); await pg.wait_for_timeout(1000)
    await pg.click('#sw-nets [data-net=tron]'); await pg.wait_for_timeout(600)
    assert not await pg.locator('#swap-evm').is_visible(); print('✓ اختيار TRON يعيد التبديل عبر SunSwap')
    bad=await pg.evaluate('''Array.from(document.querySelectorAll('.screen.active *')).filter(e=>!e.closest('.netbar')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>window.innerWidth+1||r.left<-1)}).length''')
    assert bad==0, bad; print('✓ لا تجاوز لعرض الشاشة')
    assert not errs, errs
    await b.close()
asyncio.run(main())

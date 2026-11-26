# التداول الفوري: السوق، الشموع، التحليل، شراء وبيع BTC على BNB Chain عبر LI.FI (خدمات وهمية)، والربح/الخسارة
import asyncio, sys, math
from urllib.parse import urlparse, parse_qs
sys.path.insert(0, __import__('os').path.dirname(__file__))
import run_evm as E
from playwright.async_api import async_playwright
S=sys.argv[1]; SHOTS=sys.argv[2] if len(sys.argv)>2 else None
DIA='0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'; Q=[]; KLCALLS=[]; PRICE={'BTC':60000.0}
def kl(n=200, base=58000.0, t0=1760000000000):
  out=[]; t=t0
  for i in range(n):
    o=base+math.sin(i/9)*900+i*12; c=o+math.sin(i/3)*250; h=max(o,c)+120; l=min(o,c)-120
    out.append([t+i*3600000,str(o),str(h),str(l),str(c),'10',t+i*3600000+3599999,str(5e6+i*1000),100,'5','2e6','0'])
  return out
async def binance(route):
  u=urlparse(route.request.url)
  if u.path.endswith('/klines'):
    KLCALLS.append(route.request.url); return await route.fulfill(json=kl(base=50000.0, t0=1760000000000-200*3600000) if 'endTime' in route.request.url else kl())
  if u.path.endswith('/ticker/24hr'):
    syms=['BTCUSDT','ETHUSDT','BNBUSDT','TRXUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','LINKUSDT','CAKEUSDT','SHIBUSDT','POLUSDT','AAVEUSDT']
    chg={'BTCUSDT':'2.50','ETHUSDT':'-1.20','BNBUSDT':'0.80','DOGEUSDT':'-6.40','SOLUSDT':'7.10'}
    return await route.fulfill(json=[{'symbol':s,'lastPrice':str(PRICE['BTC'] if s=='BTCUSDT' else 3.5),'priceChangePercent':chg.get(s,'0.10'),'highPrice':'61000','lowPrice':'58500','quoteVolume':str(1e9 if s=='BTCUSDT' else 1e6)} for s in syms])
  await route.fulfill(status=404, json={})
BADP=[False]
async def lifi(route):
  u=urlparse(route.request.url); q={k:v[0] for k,v in parse_qs(u.query).items()}
  if u.path.endswith('/quote'):
    Q.append(q); fa=int(q['fromAmount'])
    buy=q['fromToken'].lower()=='0x55d398326f99059ff775485246999027b3197955'
    to=fa*10**18//(60000*10**18) if buy else fa*60000   # USDT→BTC أو BTC→USDT بسعر 60,000 (18 خانة على BSC)
    if BADP[0]: to=to*80//100   # مسار بسعر أسوأ من السوق بـ 20%
    return await route.fulfill(json={'tool':'pancakeswap','toolDetails':{'name':'PancakeSwap'},'estimate':{'toAmount':str(to),'toAmountMin':str(to*99//100),'approvalAddress':DIA,
      'feeCosts':[],'gasCosts':[{'amountUSD':'0.03','amount':'50000000000000'}],'executionDuration':10},
      'action':{'fromAmount':q['fromAmount'],'toAddress':q['toAddress'],'fromChainId':int(q['fromChain']),'toChainId':int(q['toChain']),'fromToken':{'address':q['fromToken']},'toToken':{'address':q['toToken']}},
      'transactionRequest':{'to':DIA,'data':'0xdeadbeef'+'00'*12+q['toAddress'][2:].lower(),'value':'0x0','gasLimit':'0x30d40','chainId':56}})
  if u.path.endswith('/status'): return await route.fulfill(json={'status':'FAILED'} if q.get('txHash','').endswith('dead'*4) else {'status':'DONE','substatus':'COMPLETED'})
  await route.fulfill(status=404, json={})
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':780}); E.PG.append(pg)
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.route('https://api.coingecko.com/**', lambda r: r.fulfill(json={}))
    await pg.route('https://data-api.binance.vision/**', binance)
    await pg.route('https://li.quest/**', lifi)
    for host in ['bsc-dataseed.bnbchain.org','bsc-rpc.publicnode.com','ethereum-rpc.publicnode.com','polygon-bor-rpc.publicnode.com']:
      await pg.route(f'https://{host}/**', E.rpc); await pg.route(f'https://{host}', E.rpc)
    # بث Binance اللحظي (WebSocket) وهمي: نرسل منه رسائل miniTicker وkline كما يرسلها الخادم الحقيقي
    import re as _re, json as _json
    WS={'ok':True,'conns':[]}
    async def on_ws(ws):
      WS['conns'].append(ws)
      if not WS['ok']: await ws.close()
    await pg.route_web_socket(_re.compile(r'wss://data-stream\.binance\.vision/.*'), on_ws)
    def ws_send(obj):
      for w in WS['conns']:
        try: w.send(_json.dumps(obj))
        except Exception: pass
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(2500); await pg.click('#intro-ok'); await pg.wait_for_timeout(2000)
    await pg.click('.tab[data-tab=trade]'); await pg.wait_for_timeout(1500)
    rows=await pg.locator('#tr-list .tr-row').count(); assert rows>=5, rows; print('✓ قائمة السوق:', rows, 'عملة')
    first=await pg.locator('#tr-list .tr-row').first.get_attribute('data-sym'); assert first=='BTC', first; print('✓ الترتيب الافتراضي بحجم التداول (BTC أولاً)')
    t=await pg.inner_text('#tr-list .tr-row[data-sym=BTC]'); assert '60,000.00' in t and '+2.50%' in t, t; print('✓ السعر وتغيّر 24 ساعة')
    await pg.click('#tr-sort [data-sort=gain]'); assert await pg.locator('#tr-list .tr-row').first.get_attribute('data-sym')=='SOL'; print('✓ فرز الأكثر صعوداً')
    await pg.click('#tr-sort [data-sort=loss]'); assert await pg.locator('#tr-list .tr-row').first.get_attribute('data-sym')=='DOGE'; print('✓ فرز الأكثر هبوطاً')
    await pg.click('#tr-sort [data-sort=all]'); await pg.fill('#tr-q','eth'); assert await pg.locator('#tr-list .tr-row').count()==1; await pg.fill('#tr-q',''); print('✓ البحث')
    w=await pg.evaluate('document.documentElement.scrollWidth'); assert w<=360, w; print('✓ لا فيضان أفقي في السوق')
    # التحديث اللحظي: المؤشر «مباشر»، ورسالة miniTicker تحدّث السعر والتغيّر فوراً (بلا انتظار الاستطلاع كل 10 ثوانٍ)
    await pg.wait_for_timeout(1500)
    assert len(WS['conns'])>=1 and 'btcusdt@miniTicker' in WS['conns'][-1].url, [c.url for c in WS['conns']]; assert (await pg.inner_text('#tr-live')).strip()=='مباشر'; print('✓ بث لحظي: اتصال WebSocket واحد لكل العملات، والمؤشر «مباشر»')
    ws_send({'stream':'btcusdt@miniTicker','data':{'e':'24hrMiniTicker','s':'BTCUSDT','c':'61000','o':'59500','h':'61500','l':'58000','q':'1630000000'}})
    await pg.wait_for_timeout(1000)
    t=await pg.inner_text('#tr-list .tr-row[data-sym=BTC]'); assert '61,000.00' in t and '+2.52%' in t, t; print('✓ رسالة البث تحدّث السعر والتغيّر فوراً')
    assert 'من محفظتك مباشرة' in await pg.inner_text('.tr-self'); print('✓ شارة «التبديل يتم من محفظتك مباشرة» في شاشة التداول')
    await pg.click('#tr-list .tr-row[data-sym=ETH] [data-fav]'); await pg.wait_for_timeout(300)
    await pg.click('#tr-sort [data-sort=fav]'); rows=await pg.eval_on_selector_all('#tr-list .tr-row','e=>e.map(x=>x.dataset.sym)'); assert rows==['ETH'], rows
    assert await pg.locator('#tr-list .tr-row[data-sym=ETH] .tr-fav.on').count()==1; print('✓ المفضلة: النجمة تضيف العملة، وتبويب «المفضلة» يعرضها وحدها')
    await pg.click('#tr-list .tr-row[data-sym=ETH] [data-fav]'); await pg.wait_for_timeout(300)
    assert 'لا مفضلة بعد' in await pg.inner_text('#tr-list'); await pg.click('#tr-sort [data-sort=all]'); print('✓ إزالة من المفضلة: التبويب فارغ مع شرح')
    if SHOTS: await pg.screenshot(path=SHOTS+'/trade.png', full_page=True)
    await pg.click('#tr-list .tr-row[data-sym=BTC]'); await pg.wait_for_timeout(1500)
    assert await pg.inner_text('#pr-pair')=='BTC/USDT' and await pg.is_hidden('#pr-load'); print('✓ شاشة الزوج والشموع محمّلة')
    px=await pg.evaluate("(()=>{const c=document.getElementById('pr-cv');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let g=0,r=0;for(let i=0;i<d.length;i+=4){if(d[i+1]>140&&d[i]<60)g++;if(d[i]>200&&d[i+1]<100)r++;}return [g,r]})()")
    assert px[0]>200 and px[1]>200, px; print('✓ رُسمت شموع صاعدة وهابطة', px)
    o=await pg.inner_text('#pr-ohlc'); assert 'O' in o and 'C' in o; print('✓ قراءة OHLC')
    await pg.wait_for_timeout(500)
    assert await pg.is_hidden('#pr-ind') and (await pg.inner_text('#pr-sig')) in ('إيجابي','سلبي','محايد'); print('✓ الإشارة مختصرة: شراء/بيع/محايد، والتفاصيل مخفية')
    await pg.click('#pr-more-btn')
    sig=await pg.inner_text('#pr-sig'); ind=await pg.inner_text('#pr-ind'); bt=await pg.inner_text('#pr-bt'); cf=await pg.inner_text('#pr-conf')
    assert sig!='—' and 'RSI' in ind and 'ADX' in ind and 'مستوى وقف' in ind and 'الإطار الأعلى' in ind and '📊' in bt and 'الثقة' in cf, (sig,ind,bt,cf); print('✓ التحليل:', sig, '·', cf); print('  ', bt)
    # إطار دقيقة واحدة + شمعة لحظية من البث: الشمعة الأخيرة تتحدّث دون إعادة تحميل
    await pg.click('#pr-tf [data-tf="1m"]'); await pg.wait_for_timeout(1500); assert await pg.is_hidden('#pr-load'); assert await pg.locator('#pr-tf button').count()==8
    assert any('btcusdt@kline_1m' in c.url for c in WS['conns']), [c.url for c in WS['conns']]; print('✓ 8 إطارات زمنية (من دقيقة إلى أسبوع)، وإطار الدقيقة يفتح بث شمعته')
    lt=await pg.evaluate("window.__core.tr().TR.kl.slice(-1)[0].t")
    ws_send({'stream':'btcusdt@kline_1m','data':{'e':'kline','s':'BTCUSDT','k':{'t':lt,'i':'1m','o':'60100','h':'61300','l':'60050','c':'61234.5','q':'1000'}}})
    await pg.wait_for_timeout(1000)
    last=await pg.evaluate("window.__core.tr().TR.kl.slice(-1)[0]"); assert last['c']==61234.5 and last['h']==61300, last; print('✓ رسالة kline تحدّث الشمعة الجارية')
    w=await pg.evaluate('document.documentElement.scrollWidth'); assert w<=360, w; print('✓ شريط الإطارات الثمانية لا يخرج عن الشاشة')
    # انقطاع البث (حجب أو شبكة): يعود التطبيق للاستطلاع كل 10 ثوانٍ تلقائياً، والمؤشر يقول ذلك بصدق
    WS['ok']=False
    for c in WS['conns']:
      try: await c.close()
      except Exception: pass
    await pg.wait_for_timeout(1500)
    lv=(await pg.inner_text('#tr-live')).strip(); assert lv in ('كل 10 ث','غير متصل'), lv; print('✓ انقطاع البث: عودة تلقائية للاستطلاع، والمؤشر «'+lv+'» لا «مباشر»')
    await pg.click('#pr-tf [data-tf="4h"]'); await pg.wait_for_timeout(800); assert await pg.is_hidden('#pr-load'); print('✓ تغيير الإطار الزمني')
    box=await pg.locator('#pr-cv').bounding_box(); await pg.mouse.move(box['x']+100, box['y']+150); await pg.mouse.down(); await pg.wait_for_timeout(450)
    o2=await pg.inner_text('#pr-ohlc'); await pg.mouse.up(); assert '/' in o2, o2; print('✓ لمسة مطوّلة تعرض شمعة محددة بتاريخها')
    o3=await pg.inner_text('#pr-ohlc'); KLN=len(KLCALLS)
    await pg.mouse.move(box['x']+60, box['y']+150); await pg.mouse.down()
    for i in range(1,16): await pg.mouse.move(box['x']+60+i*16, box['y']+150); await pg.wait_for_timeout(15)
    await pg.mouse.up(); await pg.wait_for_timeout(300)
    o4=await pg.inner_text('#pr-ohlc'); assert o4!=o3, (o3,o4); print('✓ سحب الشارت يميناً يعرض شموعاً أقدم')
    for i in range(12):
      await pg.mouse.move(box['x']+20, box['y']+150); await pg.mouse.down(); await pg.mouse.move(box['x']+300, box['y']+150, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(120)
    await pg.wait_for_timeout(600)
    assert any('endTime=' in u for u in KLCALLS[KLN:]), KLCALLS[KLN:]; print('✓ عند أول الشارت تُحمَّل شموع أقدم تلقائياً')
    # التكبير بعجلة الفأرة يثبّت الشمعة تحت المؤشر، وحدود 20..200
    await pg.evaluate("(function(){var T=__core.tr().TR;T.off=0;T.view=80})()"); await pg.wait_for_timeout(100)
    await pg.mouse.move(box['x']+box['width']*0.25, box['y']+150)
    for i in range(6): await pg.mouse.wheel(0,-100); await pg.wait_for_timeout(30)
    z=await pg.evaluate("({v:__core.tr().TR.view,o:__core.tr().TR.off})"); assert z['v']<80 and z['o']>0, z; print('✓ تكبير حول المؤشر: الشمعة تحت المؤشر تبقى مكانها (العرض', z['v'], 'والإزاحة', z['o'], ')')
    for i in range(40): await pg.mouse.wheel(0,-100)
    await pg.wait_for_timeout(100); assert await pg.evaluate("__core.tr().TR.view")==20
    for i in range(80): await pg.mouse.wheel(0,100)
    await pg.wait_for_timeout(100); assert await pg.evaluate("__core.tr().TR.view")==200; print('✓ حدود التكبير 20 إلى 200 شمعة')
    # شمعة جديدة عند بدء فترة جديدة بدل تجميد الشارت
    n0=await pg.evaluate("__core.tr().TR.kl.length"); await pg.evaluate("(function(){var X=__core.tr(),T=X.TR,l=T.kl[T.kl.length-1]; l.t=Date.now()-X.tfMs(T.tf)-1000;})()")
    await pg.evaluate("__core.tr().top()"); await pg.wait_for_timeout(100)
    n1=await pg.evaluate("__core.tr().TR.kl.length"); assert n1==n0+1, (n0,n1); print('✓ بدء فترة جديدة يضيف شمعة حيّة بدل تجميد الشارت')
    await pg.dblclick('#pr-cv'); await pg.wait_for_timeout(200)
    w=await pg.evaluate('document.documentElement.scrollWidth'); assert w<=360, w; print('✓ لا فيضان أفقي في شاشة الزوج')
    if SHOTS: await pg.screenshot(path=SHOTS+'/pair.png', full_page=True)
    # شراء بـ 10 USDT
    await pg.click('#pr-buy'); await pg.wait_for_timeout(300)
    assert await pg.get_attribute('#od-nets [data-net=bsc]','class')=='chip on'; print('✓ اختيرت BNB Chain تلقائياً (فيها USDT ورسومها أرخص)')
    await pg.click('#od-nets [data-net=polygon]'); await pg.wait_for_timeout(200)
    h=await pg.inner_text('#od-hint'); assert 'رصيدك من USDT عليها 0' in h and await pg.locator('#od-hint-go').is_visible(), h; print('✓ لا USDT على الشبكة: يظهر السبب وزر نقل USDT إليها')
    await pg.click('#od-nets [data-net=bsc]'); await pg.wait_for_timeout(200); assert await pg.is_hidden('#od-hint')
    await pg.fill('#od-amt','1,000'); assert not await pg.is_disabled('#od-go'); print('✓ «1,000» بالفاصلة لا تُعطّل زر عرض السعر')
    await pg.fill('#od-amt','100'); await pg.click('#od-go'); await pg.wait_for_timeout(300)
    assert 'غير كافٍ' in await pg.inner_text('#od-err'); print('✓ رفض مبلغ أكبر من الرصيد')
    BADP[0]=True; await pg.fill('#od-amt','12'); await pg.click('#od-go'); await pg.wait_for_timeout(800)
    er=await pg.inner_text('#od-err'); assert 'أسوأ من سعر السوق' in er and 'تأكيد' not in await pg.inner_text('#od-go'), er; print('✓ سعر تنفيذ أسوأ من السوق بـ 20% يُرفض وتظهر الرسالة')
    BADP[0]=False
    await pg.fill('#od-amt','12'); await pg.click('#od-go'); await pg.wait_for_timeout(800)
    q=Q[-1]; assert q['fromChain']=='56' and q['toChain']=='56' and q['fromAmount']==str(12*10**18), q; print('✓ طلب السعر: 12 USDT → BTC على BNB Chain')
    out=await pg.inner_text('#od-out'); rate=await pg.inner_text('#od-rate'); assert 'BTC' in out and '60,000' in rate, (out,rate); print('✓ ستستلم', out, '·', rate)
    if SHOTS: await pg.screenshot(path=SHOTS+'/order.png')
    assert 'تأكيد شراء' in await pg.inner_text('#od-go'); await pg.click('#od-go'); await pin('123456'); E.BAL['bsc']['0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c']=int(0.0002*10**18); await pg.wait_for_timeout(5000)  # أثر الشراء يظهر بعد التوقيع لا قبله
    assert len(E.sent)>=1; print('✓ وُقّعت معاملة الشراء وبُثّت')
    for _ in range(30):
      st=await pg.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('sarra.tr.')))||'[]')")
      if st and st[0]['status']=='SUCCESS': break
      await pg.wait_for_timeout(500)
    assert st[0]['side']=='buy' and st[0]['sym']=='BTC' and abs(float(st[0]['usdt'])-12)<1e-9 and st[0]['status']=='SUCCESS', st; print('✓ الصفقة محفوظة: شراء BTC بـ 12 USDT')
    await pg.wait_for_timeout(500)
    assert '60,000' in await pg.inner_text('#pr-pos-avg'); print('✓ متوسط سعر الشراء 60,000')
    # السعر يرتفع 10%: الربح يظهر
    PRICE['BTC']=66000.0; await pg.wait_for_timeout(11500)
    pl=await pg.inner_text('#pr-pos-pl'); assert '+$1.20' in pl, pl; print('✓ الربح غير المحقق:', pl)
    roi=await pg.inner_text('#pp-roi'); assert roi=='+10.00%', roi; print('✓ نسبة العائد في المركز:', roi)
    await pg.click('.pp-tabs [data-pp=hist]'); await pg.click('#pr-trades .th-row'); await pg.wait_for_timeout(300)
    tk=await pg.inner_text('#td-kv'); assert '60,000' in tk and '+$1.20' in tk and '+10.00%' in tk, tk; print('✓ تفاصيل الصفقة: سعر التنفيذ والربح منذ الشراء')
    if SHOTS: await pg.locator('#td-sheet .sheet').screenshot(path=SHOTS+'/trade-detail.png')
    # وضع الإخفاء في التداول: تفاصيل الصفقة وقائمة الصفقات والمركز
    await pg.evaluate("localStorage.setItem('sarra.hide','1')"); await pg.evaluate("document.querySelector('#td-sheet').classList.remove('show')")
    await pg.evaluate("(function(){var b=document.querySelector('#toggle-bal'); if(b && b.getAttribute('aria-pressed')!=='true') b.click();})()"); await pg.wait_for_timeout(200)
    await pg.click('#pr-trades .th-row'); await pg.wait_for_timeout(300)
    hk=await pg.inner_text('#td-qty')+await pg.inner_text('#td-kv')+await pg.inner_text('#pr-trades')
    assert '0.0002' not in hk and '+$1.20' not in hk and '12.00' not in hk, hk; print('✓ وضع الإخفاء: لا كميات ولا مبالغ في الصفقات وتفاصيلها')
    await pg.evaluate("(function(){var b=document.querySelector('#toggle-bal'); if(b && b.getAttribute('aria-pressed')==='true') b.click(); document.querySelector('#td-sheet').classList.remove('show')})()"); await pg.wait_for_timeout(200)
    await pg.click('#pr-trades .th-row'); await pg.wait_for_timeout(300)
    await pg.click('#td-close'); await pg.click('.pp-tabs [data-pp=pos]')
    if SHOTS: await pg.locator('#pr-pos').screenshot(path=SHOTS+'/position.png')
    await pg.click('.pp-sell [data-qs="50"]'); await pg.wait_for_timeout(300)
    assert await pg.locator('#od-sheet').is_visible() and await pg.input_value('#od-amt')=='0.0001' and 'on' in (await pg.get_attribute('#od-side [data-side=sell]','class')), await pg.input_value('#od-amt'); print('✓ بيع سريع 50% من المركز يفتح أمر البيع بالكمية')
    # بيع مركز قيمته أقل من دولار (≈ $0.60): لا حد أدنى للبيع، ويُطلب السعر فعلاً
    n0=len(Q); await pg.fill('#od-amt','0.00001'); await pg.click('#od-go'); await pg.wait_for_timeout(800)
    er=await pg.inner_text('#od-err'); assert len(Q)==n0+1 and 'أقل' not in er and 'تأكيد بيع' in await pg.inner_text('#od-go'), (er, len(Q)-n0); print('✓ بيع مركز أقل من دولار (≈ $0.60): مسموح ويُطلب السعر')
    # بيع أصغر من رسومه (≈ $0.012 مقابل رسوم $0.03): مسموح، والتنبيه يقول صراحة إن الرسوم أكبر من القيمة
    await pg.click('#od-cancel'); await pg.wait_for_timeout(200); await pg.click('.pp-sell [data-qs="50"]'); await pg.wait_for_timeout(300)
    n0=len(Q); await pg.fill('#od-amt','0.0000002'); await pg.click('#od-go'); await pg.wait_for_timeout(800)
    er=await pg.inner_text('#od-err'); assert len(Q)==n0+1 and 'أكبر من قيمة مركزك' in er and 'تأكيد بيع' in await pg.inner_text('#od-go'), er; print('✓ بيع أصغر من رسومه: مسموح مع تنبيه صريح')
    await pg.click('#od-cancel'); await pg.wait_for_timeout(200)
    # الشراء على BNB Chain: الحد 0.10 دولار، وما فوقه يُقبل إن كانت الرسوم أقل من نصفه
    await pg.click('#pr-buy'); await pg.wait_for_timeout(300); n0=len(Q)
    await pg.fill('#od-amt','0.05'); await pg.click('#od-go'); await pg.wait_for_timeout(300)
    er=await pg.inner_text('#od-err'); assert '0.10' in er and len(Q)==n0, er; print('✓ شراء بـ 0.05 دولار على BNB Chain يُرفض قبل طلب السعر (الحد 0.10)')
    await pg.fill('#od-amt','0.2'); await pg.click('#od-go'); await pg.wait_for_timeout(800)
    er=await pg.inner_text('#od-err'); assert len(Q)==n0+1 and 'تأكيد شراء' in await pg.inner_text('#od-go') and 'الرسوم تعادل' not in er, er; print('✓ شراء بـ 0.20 دولار مسموح (رسوم $0.03 = 15%)')
    await pg.click('#od-cancel')
    await pg.click('#s-pair [data-back]'); await pg.wait_for_timeout(800)
    assert await pg.locator('#tr-open .op[data-sym=BTC]').count()==1 and '+10.00%' in await pg.inner_text('#tr-open'); print('✓ «مراكزي المفتوحة» في شاشة السوق')
    if SHOTS: await pg.screenshot(path=SHOTS+'/trade2.png')
    assert '+$1.20' in await pg.inner_text('#tr-pf-un') and await pg.inner_text('#tr-pf-n')=='1'; print('✓ بطاقة المحفظة: ربح مفتوح وعدد الصفقات')
    await pg.click('#tr-pf-hist'); assert 'شراء' in await pg.inner_text('#th-list'); await pg.click('#th-close'); print('✓ سجل الصفقات')
    await pg.click('.tab[data-tab=history]'); await pg.wait_for_timeout(1500)
    h=await pg.inner_text('#s-history'); assert 'شراء BTC' in h and 'تبديل USDT' not in h, h; print('✓ الصفقة في سجل المعاملات')
    if SHOTS:
      await pg.emulate_media(color_scheme='dark'); await pg.evaluate("document.documentElement.removeAttribute('data-theme')")
      await pg.click('.tab[data-tab=trade]'); await pg.wait_for_timeout(600); await pg.screenshot(path=SHOTS+'/trade-dark.png')
      await pg.click('#tr-list .tr-row[data-sym=BTC]'); await pg.wait_for_timeout(1500); await pg.screenshot(path=SHOTS+'/pair-dark.png', full_page=True)
    # صفقة علقت «قيد التنفيذ» (أُغلق التطبيق) ثم فشلت على الشبكة: تُصحَّح عند فتح السوق ولا تبقى في المركز
    await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('sarra.tr.'));const l=JSON.parse(localStorage.getItem(k));l.unshift({id:'0x'+'1'.repeat(48)+'dead'.repeat(4),sym:'ETH',side:'buy',qty:'1',usdt:'3.5',price:3.5,net:'bsc',time:Date.now()-3600000,status:'PENDING'});localStorage.setItem(k,JSON.stringify(l))})()")
    await pg.evaluate("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('sarra.lh.'));const l=JSON.parse(localStorage.getItem(k)||'[]');l.unshift({id:'0x'+'2'.repeat(48)+'dead'.repeat(4),txid:'0x'+'2'.repeat(48)+'dead'.repeat(4),kind:'bridge',net:'bsc',toNet:'polygon',coin:'USDT',amount:'5',status:'PENDING',time:Date.now()-3600000});localStorage.setItem(k,JSON.stringify(l))})()")
    await pg.click('.tab[data-tab=home]'); await pg.wait_for_timeout(300); await pg.click('.tab[data-tab=trade]'); await pg.wait_for_timeout(2500)
    st=await pg.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('sarra.tr.'))))")
    lh=await pg.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('sarra.lh.'))))")
    br=[r for r in lh if r.get('kind')=='bridge'][0]; assert br['status']=='FAILED', br; print('✓ عملية نقل عالقة في السجل تُصحَّح تلقائياً')
    eth=[t for t in st if t['sym']=='ETH'][0]; assert eth['status']=='FAILED', eth; print('✓ صفقة عالقة «قيد التنفيذ» تُحدَّث تلقائياً إلى «فاشلة» ولا تُحسب في المركز')
    assert not errs, errs
    print('✓ لا أخطاء JavaScript')
    await b.close()
asyncio.run(main())

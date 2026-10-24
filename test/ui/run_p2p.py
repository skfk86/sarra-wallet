# سيناريو سوق P2P بخادم وهمي يحاكي قواعد الخادم الحقيقي
import asyncio, sys, json
from playwright.async_api import async_playwright
S=sys.argv[1]
ME='TQ7mZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'; SELLER='TSe'+'A'*31; BUYER2='TBu'+'A'*31
DEP='TDepZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'
st={'profile':None,'offers':[{'id':'of1','seller':SELLER,'price_sdg':2700,'min_usdt':10,'max_usdt':200,'available_usdt':150,'pay_window_min':15,'created_at':'2026-10-24T08:00:00Z','seller_profile':{'nickname':'ود_الخرطوم','trades_completed':12,'disputes_lost':0}}],
    'mine':[],'orders':{},'msgs':{},'signed':0,'deposit_seen':False}
st['orders']['sell1']={'id':'sell1','offer_id':'myof','seller':ME,'buyer':BUYER2,'amount_usdt':30,'price_sdg':2700,'total_sdg':81000,'fee_usdt':0.15,'status':'awaiting_deposit','deposit_address':DEP,'deposit_amount':30.5,'created_at':'2026-10-24T08:05:00Z','buyer_profile':{'nickname':'مشترٍ'},'seller_profile':{'nickname':'أنا'}}
TR={('buyer','mark_paid'):(['funded'],'paid'),('buyer','dispute'):(['paid'],'disputed'),('seller','release'):(['funded','paid'],'released'),('buyer','cancel'):(['awaiting_deposit'],'cancelled'),('seller','cancel'):(['awaiting_deposit'],'cancelled')}
def view(o):
  role='buyer' if o['buyer']==ME else 'seller'
  v=dict(o); v['buyer_receives']=round(o['amount_usdt']-o['fee_usdt'],6)
  if role=='buyer':
    v.pop('deposit_address',None); v.pop('deposit_amount',None)
    if o['status'] in ('funded','paid','disputed','released'): v['bankak_name']='محمد أحمد'; v['bankak_account']='12345678'
  return {'order':v,'role':role,'messages':st['msgs'].get(o['id'],[])}
async def handler(route):
  b=json.loads(route.request.post_data)
  if 'action' in b: a,p=b['action'],{}
  else:
    m=json.loads(b['message']); assert m['address']==ME and b['signature'].startswith('0x'); st['signed']+=1; a,p=m['action'],m['params']
  def ok(d): return route.fulfill(status=200,json=d)
  def err(c): return route.fulfill(status=400,json={'error':c})
  if a=='offers.list': return await ok({'offers':st['offers'],'fee_bps':50,'min_trade':10})
  if a=='me': return await ok({'profile':st['profile'],'is_admin':False,'fee_bps':50,'min_trade':10})
  if a=='profile.set': st['profile']={'address':ME,'nickname':p['nickname']}; return await ok({'ok':True})
  if not st['profile']: return await err('NO_PROFILE')
  if a=='offer.create':
    if float(p['min_usdt'])<10: return await err('MIN_TOO_LOW')
    st['mine'].append({'id':'n1','price_sdg':float(p['price_sdg']),'available_usdt':float(p['amount_usdt']),'min_usdt':float(p['min_usdt']),'max_usdt':float(p['max_usdt']),'active':True}); return await ok({'offer':st['mine'][-1]})
  if a=='offers.mine': return await ok({'offers':st['mine']})
  if a=='order.create':
    amt=float(p['amount']); o={'id':'buy1','offer_id':'of1','seller':SELLER,'buyer':ME,'amount_usdt':amt,'price_sdg':2700,'total_sdg':amt*2700,'fee_usdt':round(amt*0.005,6),'status':'awaiting_deposit','created_at':'2026-10-24T09:00:00Z','buyer_profile':{'nickname':st['profile']['nickname']},'seller_profile':{'nickname':'ود_الخرطوم'},'deposit_address':'Tsecret','deposit_amount':amt}
    st['orders']['buy1']=o; return await ok(view(o))
  if a=='orders.mine': return await ok({'orders':[view(o)['order'] for o in st['orders'].values()]})
  o=st['orders'].get(p.get('id'))
  if not o: return await err('NOT_FOUND')
  if a=='order.refresh' and o['status']=='awaiting_deposit' and st['deposit_seen']: o['status']='funded'; o['pay_deadline']='2099-01-01T00:00:00Z'
  if a=='order.action':
    role='buyer' if o['buyer']==ME else 'seller'; t=TR.get((role,p['action']))
    if not t: return await err('NOT_ALLOWED')
    if o['status'] not in t[0]: return await err('INVALID_STATE')
    o['status']=t[1]
    if t[1]=='disputed': o['dispute_reason']=p.get('reason')
  if a=='message.send': st['msgs'].setdefault(o['id'],[]).append({'id':len(st['msgs'].get(o['id'],[]))+1,'sender':ME,'body':p['body'],'created_at':'x'})
  return await ok(view(o))

async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':390,'height':844})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    dialogs=[]; pg.on('dialog',lambda d: (dialogs.append(d.message), asyncio.ensure_future(d.dismiss())))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.route('https://mock.supabase.co/**', handler)
    await pg.goto('file://'+S+'/index.html')
    vis=lambda i: pg.locator('#'+i).is_visible()
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    step=lambda m: print('✓',m)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1200); await pg.click('#intro-ok')
    # السوق
    await pg.click('.tab[data-tab=p2p]'); await pg.wait_for_timeout(800)
    t=await pg.inner_text('#p2p-list'); assert 'ود_الخرطوم' in t and '2,700' in t, t; step('السوق يعرض الإعلانات والبائع وسمعته')
    await pg.click('#p2p-list button:text-is("شراء")'); assert await vis('s-p2p-buy'); step('فتح شاشة الشراء')
    await pg.fill('#buy-amt','5'); assert await pg.is_disabled('#buy-go'); step('رفض كمية أقل من حد الإعلان')
    await pg.fill('#buy-amt','50')
    assert '135,000' in await pg.inner_text('#buy-total'); assert '0.25' in await pg.inner_text('#buy-fee'); assert '49.75' in await pg.inner_text('#buy-recv'); step('حساب المبلغ بالجنيه والعمولة وما يستلمه المشتري')
    await pg.click('#buy-go'); await pg.wait_for_timeout(500)
    assert await vis('nick-sheet'); await pg.fill('#nick-in','علوش_تجربة'); await pg.click('#nick-go'); await pg.wait_for_timeout(1200)
    step('طلب الاسم المستعار عند أول استخدام')
    assert await vis('s-order'); s=await pg.inner_text('#ord-status'); assert 'بانتظار إيداع' in s, s; step('الطلب: بانتظار إيداع البائع')
    assert not await vis('ord-bank'); step('حساب بنكك مخفي قبل الحجز')
    assert 'Tsecret' not in await pg.inner_text('#s-order'); step('عنوان الضمان لا يظهر للمشتري')
    # البائع يودع (الخادم يغيّر الحالة)
    st['orders']['buy1']['status']='funded'; st['orders']['buy1']['pay_deadline']='2099-01-01T00:00:00Z'
    await pg.wait_for_timeout(7000)
    assert 'محجوز' in await pg.inner_text('#ord-status'); step('التحديث التلقائي: محجوز في الضمان')
    assert await vis('ord-bank') and '12345678' in await pg.inner_text('#ord-bacct'); step('ظهور حساب بنكك بعد الحجز')
    await pg.fill('#ord-msg','حوّلت 135 ألف'); await pg.click('#ord-send'); await pg.wait_for_timeout(800)
    assert 'حوّلت 135 ألف' in await pg.inner_text('#ord-chat'); step('المحادثة')
    await pg.click('#ord-actions button:text-is("حوّلت المبلغ عبر بنكك")'); await pg.wait_for_timeout(300)
    assert await vis('ask-sheet'); await pg.click('#ask-no'); await pg.wait_for_timeout(400)
    assert st['orders']['buy1']['status']=='funded'; step('التراجع في نافذة التأكيد لا يرسل شيئاً')
    await pg.click('#ord-actions button:text-is("حوّلت المبلغ عبر بنكك")'); await pg.click('#ask-yes'); await pg.wait_for_timeout(1000)
    assert st['orders']['buy1']['status']=='paid' and 'أكّد الدفع' in await pg.inner_text('#ord-status'); step('تأكيد الدفع')
    await pg.click('#ord-actions button:text-is("فتح نزاع")'); await pg.click('#ask-yes'); await pg.wait_for_timeout(300)
    assert st['orders']['buy1']['status']=='paid'; step('النزاع يتطلب كتابة السبب')
    await pg.fill('#ask-in','البائع لا يرد'); await pg.click('#ask-yes'); await pg.wait_for_timeout(1000)
    assert st['orders']['buy1']['status']=='disputed' and st['orders']['buy1']['dispute_reason']=='البائع لا يرد'; step('فتح نزاع مع السبب')
    # البائع: إيداع ثم تحرير
    await pg.click('#s-order [data-back]'); await pg.click('#p2p-orders-btn'); await pg.wait_for_timeout(800)
    t=await pg.inner_text('#orders-list'); assert 'بيع 30' in t and 'شراء 50' in t, t; step('طلباتي: الشراء والبيع')
    await pg.click('#orders-list button:has-text("بيع 30")'); await pg.wait_for_timeout(800)
    btn=pg.locator('#ord-actions button.btn-primary:has-text("إيداع")'); assert '30.5' in await btn.inner_text(); step('زر الإيداع بالمبلغ الصحيح للبائع')
    await btn.click(); await pin('123456'); await pg.wait_for_timeout(6000)
    log=await pg.evaluate('window.__log'); assert ['USDT',DEP,'30500000'] in log, log; step('إيداع 30.5 USDT من المحفظة إلى عنوان الضمان بعد الرمز')
    st['deposit_seen']=True; await pg.click('#ord-actions button:text-is("تحقق من الإيداع")'); await pg.wait_for_timeout(1000)
    assert 'محجوز' in await pg.inner_text('#ord-status'); step('تأكيد الحجز')
    assert not await vis('ord-bank'); step('البائع لا يرى بطاقة "حوّل إلى" الخاصة بالمشتري')
    await pg.click('#ord-actions button:has-text("حرّر USDT")'); await pg.click('#ask-yes'); await pin('123456'); await pg.wait_for_timeout(1500)
    assert st['orders']['sell1']['status']=='released' and 'اكتملت' in await pg.inner_text('#ord-status'); step('التحرير بعد التأكيد والرمز ← اكتملت الصفقة')
    # إعلان جديد
    await pg.click('#s-order [data-back]'); await pg.click('#s-p2p-orders [data-back]'); await pg.click('#p2p-new-btn'); await pg.wait_for_timeout(500)
    for k,v in [('new-price','2650'),('new-amount','100'),('new-min','5'),('new-max','100'),('new-bname','علوش'),('new-bacct','99887766')]: await pg.fill('#'+k,v)
    await pg.click('#new-go'); await pg.wait_for_timeout(800)
    assert 'أقل صفقة 10' in await pg.inner_text('#new-err'); step('رسالة خطأ عربية للحد الأدنى')
    await pg.fill('#new-min','10'); await pg.click('[data-win="30"]'); await pg.click('#new-go'); await pg.wait_for_timeout(1200)
    assert await vis('s-p2p') and '2,650' in await pg.inner_text('#p2p-list'); step('نشر الإعلان وظهوره في "إعلاناتي"')
    assert st['signed']>8; step(f'كل الطلبات موقّعة بالمحفظة ({st["signed"]} طلب)')
    assert not dialogs, dialogs; step('لا نوافذ متصفح (alert/confirm)')
    print('\nأخطاء JavaScript:', errs or 'لا يوجد'); await b.close()
asyncio.run(main())

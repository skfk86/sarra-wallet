# سيناريو سوق P2P بخادم وهمي يحاكي قواعد الخادم الحقيقي
import asyncio, sys, json
from playwright.async_api import async_playwright
S=sys.argv[1]
ME='TQ7mZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'; SELLER='TSe'+'A'*31; BUYER2='TBu'+'A'*31
DEP='TDepZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'
st={'profile':None,'rate':{'sdg_per_usdt':2700,'band_pct':3},'banned':[],'offers':[{'id':'of1','seller':SELLER,'price_sdg':2700,'min_usdt':10,'max_usdt':200,'available_usdt':150,'pay_window_min':15,'created_at':'2026-10-24T08:00:00Z','seller_profile':{'nickname':'ود_الخرطوم','trades_completed':12,'disputes_lost':0,'verified':True,'completion':92.3}},{'id':'of2','seller':SELLER,'price_sdg':2710,'min_usdt':300,'max_usdt':900,'available_usdt':900,'pay_window_min':30,'created_at':'2026-10-24T08:00:00Z','seller_profile':{'nickname':'تاجر_كبير','trades_completed':3,'disputes_lost':0,'verified':True,'completion':None}}],
    'buyads':[{'id':'bd1','side':'buy','seller':BUYER2,'price_sdg':2690,'min_usdt':10,'max_usdt':100,'available_usdt':100,'pay_window_min':15,'created_at':'2026-10-24T08:00:00Z','seller_profile':{'nickname':'مشتري_جاد','trades_completed':5,'verified':True,'completion':100}}],'mine':[],'orders':{},'msgs':{},'signed':0,'kyc':None,'bal':{'usdt':'80','trx':'20.00'},'deposit_seen':False}
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
  if 'action' in b: a,p=b['action'],{'side':b.get('side')}
  else:
    m=json.loads(b['message']); assert m['address']==ME and b['signature'].startswith('0x'); st['signed']+=1; a,p=m['action'],m['params']
  def ok(d): return route.fulfill(status=200,json=d)
  def err(c): return route.fulfill(status=400,json={'error':c})
  r=st['rate']; rg={'min':round(r['sdg_per_usdt']*(1-r['band_pct']/100),2),'max':round(r['sdg_per_usdt']*(1+r['band_pct']/100),2)}
  if a=='offers.list': return await ok({'offers':st['buyads'] if p.get('side')=='buy' else st['offers'],'fee_bps':50,'net_fee':'1','min_trade':10,'rate':r,'range':rg})
  if not st['profile']: st['profile']={'address':ME,'nickname':'مستخدم-'+ME[-4:],'verify_status':'none'}
  if a=='me': return await ok({'profile':st['profile'],'is_admin':True,'fee_bps':50,'min_trade':10,'rate':r,'range':rg})
  if a=='profile.set': st['profile']['nickname']=p['nickname']; return await ok({'ok':True})
  if a=='admin.stats': return await ok({'users':7,'active_offers':2,'open_orders':1,'disputes':1,'completed':4})
  if a=='admin.rate.set':
    st['rate']={'sdg_per_usdt':float(p['sdg_per_usdt']),'band_pct':p['band_pct']}; r=st['rate']
    return await ok({'rate':r,'range':{'min':round(r['sdg_per_usdt']*(1-r['band_pct']/100),2),'max':round(r['sdg_per_usdt']*(1+r['band_pct']/100),2)}})
  if a=='admin.ban': st['banned'].append((p['address'],p['banned'])); return await ok({'ok':True})
  if a=='verify.submit':
    import hashlib
    att=b.get('attachment','')
    assert att.startswith('data:image/jpeg;base64,') and hashlib.sha256(att.encode()).hexdigest()==p['image_sha256'] and 'attachment' not in b.get('message','')
    if len(p['full_name'].split())<2: return await err('BAD_FULL_NAME')
    st['kyc']=p; st['profile'].update({'verify_status':'pending','full_name':p['full_name'],'bankak_account':'••••'+p['bankak_account'][-4:]}); return await ok({'ok':True})
  if a=='admin.verify.list': return await ok({'pending':[{'address':ME,'nickname':'x','full_name':st['kyc']['full_name'],'phone':st['kyc']['phone'],'bankak_account':st['kyc']['bankak_account'],'image_url':None}] if st['profile']['verify_status']=='pending' else []})
  if a=='admin.verify.decide': st['profile']['verify_status']='approved' if p['approve'] else 'rejected'; return await ok({'ok':True})
  if a=='balance.check': return await ok(st['bal'])
  if a=='admin.queue': return await ok({'orders':[]})
  if a=='offer.create':
    if st['profile']['verify_status']!='approved': return await err('VERIFY_REQUIRED')
    assert 'bankak_account' not in p
    if float(p['min_usdt'])<10: return await err('MIN_TOO_LOW')
    if not (rg['min']<=float(p['price_sdg'])<=rg['max']): return await err('PRICE_OUT_OF_RANGE')
    if float(p['amount_usdt'])>float(st['bal']['usdt']): return await err('INSUFFICIENT_SELLER_USDT')
    st['mine'].append({'id':'n1','side':p.get('side','sell'),'price_sdg':float(p['price_sdg']),'available_usdt':float(p['amount_usdt']),'min_usdt':float(p['min_usdt']),'max_usdt':float(p['max_usdt']),'active':True}); return await ok({'offer':st['mine'][-1]})
  if a=='offers.mine': return await ok({'offers':st['mine']})
  if a=='order.create' and p['offer_id']=='bd1':
    if st['profile']['verify_status']!='approved': return await err('VERIFY_REQUIRED')
    amt=float(p['amount']); o={'id':'sell2','offer_id':'bd1','side':'buy','seller':ME,'buyer':BUYER2,'amount_usdt':amt,'price_sdg':2690,'total_sdg':amt*2690,'fee_usdt':round(amt*0.005,6),'status':'awaiting_deposit','created_at':'2026-10-24T10:00:00Z','buyer_profile':{'nickname':'مشتري_جاد'},'seller_profile':{'nickname':'أنا'},'deposit_address':DEP,'deposit_amount':amt}
    st['orders']['sell2']=o; return await ok(view(o))
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
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':780})
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
    async def no_overflow(name):
      w=await pg.evaluate("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth")
      bad=await pg.evaluate('''Array.from(document.querySelectorAll('.screen.active *')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>window.innerWidth+1||r.left<-1)}).slice(0,3).map(e=>e.tagName+'#'+e.id+'.'+e.className)''')
      assert w<=0 and not bad, (name,w,bad); step('لا شيء يخرج عن الشاشة (360px): '+name)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1200); await pg.click('#intro-ok')
    # السوق
    await pg.click('.tab[data-tab=p2p]'); await pg.wait_for_timeout(800)
    t=await pg.inner_text('#p2p-list'); assert 'ود_الخرطوم' in t and '2,700' in t and 'موثّق' in t and 'إتمام 92.3%' in t and 'بنكك' in t, t; step('بطاقات بأسلوب Binance: موثّق، نسبة الإتمام، بنكك')
    await pg.fill('#p2p-amt','500'); t=await pg.inner_text('#p2p-list'); assert 'تاجر_كبير' in t and 'ود_الخرطوم' not in t; step('فلترة الإعلانات حسب الكمية')
    await pg.fill('#p2p-amt','')
    await pg.wait_for_timeout(600)
    assert '2,700' in await pg.inner_text('#p2p-rate-val') and '2,619' in await pg.inner_text('#p2p-rate-range'); step('بطاقة سعر الصرف المرجعي والنطاق')
    assert 'مستخدم-' in await pg.inner_text('#p2p-nick-btn'); step('اسم تلقائي بدون سؤال المستخدم')
    await no_overflow('السوق')
    await pg.click('#p2p-list button:text-is("شراء")'); assert await vis('s-p2p-buy'); step('فتح شاشة الشراء')
    await pg.fill('#buy-amt','5'); assert await pg.is_disabled('#buy-go'); step('رفض كمية أقل من حد الإعلان')
    await pg.fill('#buy-amt','50')
    assert '135,000' in await pg.inner_text('#buy-total'); assert '1.25' in await pg.inner_text('#buy-fee') and 'رسوم الشبكة' in await pg.inner_text('#buy-fee'); assert '48.75' in await pg.inner_text('#buy-recv'); step('العمولة 0.5% + 1 USDT رسوم الشبكة وما يستلمه المشتري')
    await no_overflow('الشراء')
    await pg.click('#buy-go'); await pg.wait_for_timeout(1200)
    assert not await vis('nick-sheet'); step('الشراء مباشرة بدون طلب الاسم')
    assert await vis('s-order'); s=await pg.inner_text('#ord-status'); assert 'بانتظار إيداع' in s, s; step('الطلب: بانتظار إيداع البائع')
    await no_overflow('الطلب')
    assert not await vis('ord-bank'); step('حساب بنكك مخفي قبل الحجز')
    assert 'Tsecret' not in await pg.inner_text('#s-order'); step('عنوان الضمان لا يظهر للمشتري')
    # البائع يودع (الخادم يغيّر الحالة)
    st['orders']['buy1']['status']='funded'; st['orders']['buy1']['pay_deadline']='2099-01-01T00:00:00Z'
    await pg.wait_for_timeout(7000)
    assert 'محجوز' in await pg.inner_text('#ord-status'); step('التحديث التلقائي: محجوز في الضمان')
    assert await vis('ord-bank') and '12345678' in await pg.inner_text('#ord-bacct'); step('ظهور حساب بنكك بعد الحجز')
    assert '135000' in await pg.inner_text('#ord-bamt'); step('زر نسخ المبلغ بالجنيه')
    assert await vis('ord-timer') and ':' in await pg.inner_text('#ord-timer-val'); step('عداد مهلة الدفع')
    assert await pg.locator('#ord-steps span.on').count()==2; step('مؤشر الخطوات (الضمان ← الدفع)')
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
    await pg.click('#s-order [data-back]'); await pg.click('#s-p2p-orders [data-back]'); await pg.click('#p2p-new-btn'); await pg.wait_for_timeout(800)
    assert await vis('s-p2p-verify') and not await vis('s-p2p-new'); step('لا إعلان قبل التوثيق: يفتح شاشة التوثيق')
    await no_overflow('التوثيق')
    from base64 import b64encode
    import struct, zlib
    def png(w,h):
      raw=b''.join(b'\x00'+bytes((x*7+y*3)%256 for x in range(w*3)) for y in range(h))
      ch=lambda t,d: struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
      return b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+ch(b'IDAT',zlib.compress(raw))+ch(b'IEND',b'')
    await pg.fill('#ver-name','محمد أحمد علي'); await pg.fill('#ver-phone','0912345678'); await pg.fill('#ver-acct','99887766')
    await pg.set_input_files('#ver-file',files=[{'name':'id.png','mimeType':'image/png','buffer':png(900,600)}]); await pg.wait_for_timeout(800)
    assert await vis('ver-prev'); step('التقاط صورة الهوية وتصغيرها إلى JPEG')
    await pg.click('#ver-go'); await pg.wait_for_timeout(1200)
    assert st['kyc'] and st['kyc']['bankak_account']=='99887766' and 'قيد المراجعة' in await pg.inner_text('#ver-state'); step('إرسال التوثيق (الصورة خارج الرسالة الموقّعة مع بصمتها SHA-256)')
    await pg.click('#s-p2p-verify [data-back]'); await pg.click('#p2p-admin-btn'); await pg.wait_for_timeout(600)
    await pg.click('#adm-verify'); await pg.wait_for_timeout(800)
    assert 'محمد أحمد علي' in await pg.inner_text('#adm-verify-list'); await pg.click('#adm-verify-list button:text-is("قبول")'); await pg.wait_for_timeout(800)
    assert st['profile']['verify_status']=='approved'; step('الأدمن يقبل طلب التوثيق')
    await pg.click('#s-p2p-admin [data-back]'); await pg.click('#p2p-new-btn'); await pg.wait_for_timeout(1000)
    assert await vis('s-p2p-new') and 'محمد أحمد علي' in await pg.inner_text('#new-payee') and '5566' not in await pg.inner_text('#new-payee'); step('بعد التوثيق: حساب بنكك الموثّق يُستخدم تلقائياً ومخفي جزئياً')
    assert '80 USDT' in await pg.inner_text('#new-bal'); step('عرض رصيد البائع على الشبكة')
    await pg.click('#new-change-acct'); await pg.click('#ask-yes'); await pg.wait_for_timeout(400)
    assert await vis('s-p2p-verify') and await vis('ver-form') and 'تغيير حساب' in await pg.inner_text('#ver-state'); step('زر "تغيير الحساب" يفتح طلب توثيق جديد')
    await pg.click('#s-p2p-verify [data-back]'); await pg.wait_for_timeout(300)
    assert await pg.input_value('#new-price')=='2700' and '2,781' in await pg.inner_text('#new-range'); step('السعر المرجعي مكتوب مسبقاً مع النطاق المسموح')
    await no_overflow('إعلان بيع')
    await pg.fill('#new-price','3000')
    for k,v in [('new-amount','100'),('new-min','10'),('new-max','100')]: await pg.fill('#'+k,v)
    await pg.click('#new-go'); await pg.wait_for_timeout(800)
    assert 'خارج النطاق' in await pg.inner_text('#new-err'); step('رفض سعر خارج النطاق')
    await pg.fill('#new-price','2650'); await pg.click('#new-go'); await pg.wait_for_timeout(800)
    assert 'أقل من الكمية' in await pg.inner_text('#new-err'); step('رفض بيع كمية غير موجودة في المحفظة')
    await pg.click('#new-all'); assert await pg.input_value('#new-amount')=='80'; await pg.fill('#new-max','80'); step('زر "الكل" يملأ الرصيد المتاح')
    await pg.fill('#new-min','5')
    await pg.click('#new-go'); await pg.wait_for_timeout(800)
    assert 'أقل صفقة 10' in await pg.inner_text('#new-err'); step('رسالة خطأ عربية للحد الأدنى')
    await pg.fill('#new-min','10'); await pg.click('[data-win="30"]'); await pg.click('#new-go'); await pg.wait_for_timeout(1200)
    assert await vis('s-p2p') and '2,650' in await pg.inner_text('#p2p-list'); step('نشر الإعلان وظهوره في "إعلاناتي"')
    await pg.click('#p2p-nick-btn'); await pg.fill('#nick-in','علوش_تجربة'); await pg.click('#nick-go'); await pg.wait_for_timeout(1000)
    assert 'علوش_تجربة' in await pg.inner_text('#p2p-nick-btn'); step('تعديل الاسم من زر واضح في السوق')
    # تبويب البيع (إعلانات الشراء)
    await pg.click('[data-p2ptab=sell]'); await pg.wait_for_timeout(800)
    t=await pg.inner_text('#p2p-list'); assert 'مشتري_جاد' in t and 'يريد 100' in t, t; step('تبويب "بيع": إعلانات من يريد الشراء')
    await no_overflow('تبويب البيع')
    await pg.click('#p2p-list button:text-is("بيع")'); await pg.wait_for_timeout(600)
    assert await pg.inner_text('#buy-title')=='بيع USDT' and 'ستستلم على حسابك الموثّق' in await pg.inner_text('#buy-sellnote'); step('شاشة البيع تعرض حسابك الموثّق')
    await pg.fill('#buy-amt','40'); assert '107,600' in await pg.inner_text('#buy-total'); step('حساب ما ستستلمه بالجنيه')
    await pg.click('#buy-go'); await pg.wait_for_timeout(1200)
    assert await vis('s-order') and st['orders']['sell2']['seller']==ME; step('فتح طلب بيع لإعلان شراء')
    assert await pg.locator('#ord-actions button.btn-primary:has-text("إيداع")').count()==1; step('البائع يرى زر الإيداع في الضمان')
    await pg.click('#s-order [data-back]'); await pg.wait_for_timeout(300)
    await pg.click('#p2p-new-btn'); await pg.wait_for_timeout(800)
    assert await pg.get_attribute('[data-side=buy]','aria-checked')=='true' and not await vis('new-bal'); step('نشر إعلان من تبويب البيع يبدأ كإعلان شراء بدون فحص رصيد')
    for k,v in [('new-price','2700'),('new-amount','50'),('new-min','10'),('new-max','50')]: await pg.fill('#'+k,v)
    await pg.click('#new-go'); await pg.wait_for_timeout(1000)
    assert st['mine'][-1]['side']=='buy' and 'إعلان شراء' in await pg.inner_text('#p2p-list'); step('نشر إعلان شراء وظهوره في "إعلاناتي"')
    await pg.click('#p2p-admin-btn'); await pg.wait_for_timeout(1000)
    assert '7' in await pg.inner_text('#adm-stats'); step('لوحة الأدمن: الإحصائيات')
    await no_overflow('لوحة الأدمن')
    await pg.fill('#adm-rate','2800'); await pg.click('[data-band="5"]')
    assert '2,660' in await pg.inner_text('#adm-range') and '2,940' in await pg.inner_text('#adm-range'); step('معاينة النطاق قبل الحفظ')
    await pg.click('#adm-rate-go'); await pg.wait_for_timeout(800)
    assert st['rate']=={'sdg_per_usdt':2800.0,'band_pct':5}; step('حفظ سعر الصرف والهامش')
    await pg.fill('#adm-ban-addr','bad'); await pg.click('#adm-ban'); await pg.wait_for_timeout(300); assert not st['banned']; step('رفض عنوان حظر غير صالح')
    await pg.fill('#adm-ban-addr',BUYER2[:3]+'B'*31); await pg.click('#adm-ban'); await pg.click('#ask-yes'); await pg.wait_for_timeout(800)
    assert st['banned'] and st['banned'][0][1]==True; step('حظر محفظة بعد التأكيد')
    await pg.click('#s-p2p-admin [data-back]'); await pg.wait_for_timeout(800)
    assert '2,800' in await pg.inner_text('#p2p-rate-val'); step('السعر الجديد يظهر في السوق')
    assert st['signed']>8; step(f'كل الطلبات موقّعة بالمحفظة ({st["signed"]} طلب)')
    assert not dialogs, dialogs; step('لا نوافذ متصفح (alert/confirm)')
    print('\nأخطاء JavaScript:', errs or 'لا يوجد'); await b.close()
asyncio.run(main())

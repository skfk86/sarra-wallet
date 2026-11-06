import asyncio, sys, time
from playwright.async_api import async_playwright
S=sys.argv[1]
ME='TQ7mZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'; OTHER='TK3aZ4bR8xLkP2vN9cW3jH5sD6fGa12pLw'
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    pg=await b.new_page(viewport={'width':360,'height':740})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    st={'new':False,'ts':0}
    def item(i,val,frm,to,ts): return {'transaction_id':i,'to':to,'from':frm,'value':val,'token_info':{'decimals':6},'block_timestamp':ts}
    async def hist(route):
      u=route.request.url
      if '/trc20' in u:
        data=[item('old1','5000000',OTHER,ME,1760000000000)]
        if st['new']:
          t=st['ts']
          data=[item('new1','1234567891234',OTHER,ME,t),            # استلام حقيقي: 1,234,567.891234 USDT
                item('dust1','1',OTHER,ME,t+1),                     # غبار: 0.000001 يُتجاهل
                item('zero1','0',OTHER,ME,t+2),                     # صفر (تسميم عناوين) يُتجاهل
                item('out1','3000000',ME,OTHER,t+3),                # صادر لم يتم من هذا الجهاز: تنبيه خصم
                item('fee1','2000000',ME,'TFee4bR8xLkP2vN9cW3jH5sD6fGa19xKz',t+4)]+data  # عمولة تبديل لعنوان العمولة: لا تنبيه خصم كاذب
        await route.fulfill(json={'data':data})
      else: await route.fulfill(json={'data':[]})
    await pg.route('**/v1/accounts/**', hist)
    await pg.add_init_script("window.__ln=[];window.Capacitor={Plugins:{LocalNotifications:{checkPermissions:async()=>({display:'granted'}),requestPermissions:async()=>({display:'granted'}),createChannel:async()=>{},schedule:async(o)=>{window.__ln.push(...o.notifications)}}}}")
    await pg.goto('file://'+S+'/index.html')
    async def vis(i): return await pg.locator('#'+i).is_visible()
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    step=lambda m: print('✓',m)
    await pg.evaluate("window.__usdt='200000000000000000'")
    await pg.click('[data-go=import]')
    await pg.fill('#mn-in','river smile cotton eagle harvest lamp orbit velvet sand thunder maple quiet')
    await pg.click('#import-next'); await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1500)
    await pg.click('#intro-ok')
    await pg.wait_for_timeout(5500)   # الفحص الأول يضبط خط الأساس بصمت
    assert not await vis('rx-sheet'); step('لا إشعار للمعاملات القديمة عند الفتح')
    async def kick(): await pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); await pg.wait_for_timeout(2500)
    st['new']=True; st['ts']=int(time.time()*1000)+2000
    await kick()
    assert await vis('rx-sheet'); step('ظهر إشعار الاستلام تلقائياً')
    amt=await pg.inner_text('#rx-amt'); assert amt=='+1,234,567.891234', amt; step('المبلغ بفواصل ودون تقريب: '+amt)
    coin=await pg.inner_text('#rx-coin'); assert coin=='USDT · TRON (TRC20)', coin; step('العملة والشبكة: '+coin)
    kv=await pg.inner_text('#rx-kv'); assert 'TK3a' in kv and 'new1' in kv, kv; step('المرسل ورقم المعاملة والوقت ظاهرة')
    assert not await pg.locator('#rx-more').is_visible(); step('الغبار والصفر والصادر لم تُحسب كتحويلات مستلمة')
    ln=await pg.evaluate("window.__ln.map(n=>n.title+'|'+n.body)")
    assert any('وصلتك تحويلة' in x and '1,234,567.891234 USDT' in x for x in ln), ln; step('إشعار نظام للاستلام')
    assert any('تم خصم' in x and '3 USDT' in x for x in ln), ln; step('إشعار نظام للخصم الذي لم يتم من هذا الجهاز')
    assert len(ln)==2, ln; step('لا إشعارات للغبار والصفر')
    box=await pg.evaluate("(()=>{const e=document.getElementById('rx-amt');return [e.scrollWidth,e.clientWidth,document.documentElement.scrollWidth,innerWidth]})()"); assert box[0]<=box[1]+1 and box[2]<=box[3], box; step('لا فيضان أفقي في إشعار الاستلام على 360px')
    await pg.click('#rx-close'); await pg.wait_for_timeout(600)
    await kick(); await kick()
    assert not await vis('rx-sheet'); step('لا تكرار للإشعار نفسه')
    # شاشة النجاح: مبلغ ضخم
    await pg.click('.actions [data-go=send]')
    await pg.fill('#to',OTHER); await pg.fill('#amt','123456789012.345678'); await pg.click('#review'); await pg.click('#confirm-send'); await pin('123456'); await pg.wait_for_timeout(6000)
    assert await vis('s-success'); step('شاشة النجاح')
    a=await pg.inner_text('#ok-amt'); assert a=='123,456,789,012.345678', a; step('مبلغ كبير بفواصل ودقة كاملة: '+a)
    fs=await pg.evaluate("parseFloat(getComputedStyle(document.getElementById('ok-amt')).fontSize)"); assert fs<40, fs; step('الخط تصغّر مع طول الرقم: %spx'%fs)
    box=await pg.evaluate("(()=>{const e=document.getElementById('s-success');return [e.scrollWidth,e.clientWidth,document.documentElement.scrollWidth,innerWidth]})()"); assert box[0]<=box[1]+1 and box[2]<=box[3], box; step('لا فيضان أفقي في شاشة النجاح')
    txt=await pg.inner_text('#s-success'); assert 'مستكشف TRON' not in txt and 'عرض على' in txt and 'TRON (TRC20)' in txt and 'USDT' in txt, txt; step('نصوص ديناميكية: العملة والشبكة واسم المستكشف')
    ln=await pg.evaluate("window.__ln.length"); await pg.click('#s-success [data-go=home]'); await kick(); await kick()
    ln2=await pg.evaluate("window.__ln.map(n=>n.title)"); assert len(ln2)==ln, ln2; step('الإرسال من هذا الجهاز لا يُشعر كخصم غريب')
    await pg.evaluate("window.__log=[]")
    await pg.wait_for_timeout(500)
    print('\nأخطاء JavaScript:', errs or 'لا يوجد'); assert not errs
    await b.close()
asyncio.run(main())

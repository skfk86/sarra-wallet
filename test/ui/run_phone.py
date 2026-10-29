# الإرسال برقم الهاتف: التفعيل للموثّقين، والبحث، وعرض الاسم مخفياً، والإرسال للعنوان الصحيح
import asyncio, sys, json
from playwright.async_api import async_playwright
S=sys.argv[1]
FRIEND='TFr'+'i'*31
st={'verified':False,'link':False,'lookups':[]}
async def edge(route):
  b=json.loads(route.request.post_data); m=json.loads(b['message']) if 'message' in b else {'action':b['action'],'params':{}}
  a,p=m['action'],m['params']
  def ok(d): return route.fulfill(json=d)
  if a=='me': return await ok({'profile':{'address':'x','nickname':'n','verify_status':'approved' if st['verified'] else 'none','phone_link':st['link'],'phone_masked':'091•••678'},'fee_bps':50,'net_fee':'1','min_trade':10,'rate':{'sdg_per_usdt':9000,'band_pct':3},'range':{'min':8730,'max':9270}})
  if a=='phone.link':
    if not st['verified']: return await route.fulfill(status=400, json={'error':'VERIFY_REQUIRED'})
    st['link']=p['on']; return await ok({'ok':True})
  if a=='phone.lookup':
    st['lookups'].append(p['phone'])
    if p['phone']=='0911111111': return await route.fulfill(status=400, json={'error':'PHONE_NOT_FOUND'})
    return await ok({'address':FRIEND,'name':'أحمد م•••','phone':'092•••333','verified':True})
  return await ok({'offers':[],'rate':{'sdg_per_usdt':9000,'band_pct':3},'range':{'min':8730,'max':9270}})
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':780})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]})); await pg.route('https://mock.supabase.co/**', edge)
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1000); await pg.click('#intro-ok')
    # الأمان: غير موثّق
    await pg.click('.tab[data-tab=security]'); await pg.wait_for_timeout(1500)
    assert await pg.locator('#phone-row').is_visible() and 'توثيق' in await pg.inner_text('#phone-sub'); print('✓ خيار "استقبال التحويلات برقم هاتفك" في الأمان')
    await pg.click('#sw-phone'); await pg.wait_for_timeout(300)
    assert await pg.locator('#ask-sheet.show').count()==1 and 'الموثّقة' in await pg.inner_text('#ask-text'); await pg.click('#ask-no')
    assert st['link']==False; print('✓ غير الموثّق: يُطلب منه التوثيق أولاً')
    # موثّق: تفعيل (قبِل المشرف التوثيق، والنسخة المحفوظة على الجهاز ما زالت تقول غير موثّق)
    st['verified']=True
    await pg.reload(); await pg.wait_for_timeout(1500)
    for c in '123456': await pg.click(f'#keypad button:text-is("{c}")')
    await pg.wait_for_timeout(2500)
    await pg.click('.tab[data-tab=security]'); await pg.wait_for_timeout(1000)
    await pg.click('#sw-phone'); await pg.wait_for_timeout(300)
    assert 'لن يُعرض عنوان محفظتك' in await pg.inner_text('#ask-text'); await pg.click('#ask-yes'); await pg.wait_for_timeout(1000)
    assert st['link']==True and await pg.get_attribute('#sw-phone','aria-checked')=='true' and '091•••678' in await pg.inner_text('#phone-sub'); print('✓ الموثّق يفعّل الخيار بعد تحذير واضح عن الخصوصية')
    # إرسال برقم غير مسجل
    await pg.click('.tab[data-tab=home]'); await pg.click('.actions [data-go=send]'); await pg.wait_for_timeout(500)
    await pg.fill('#to','0911111111'); await pg.fill('#amt','1'); await pg.click('#review'); await pg.wait_for_timeout(800)
    assert 'لا توجد محفظة مرتبطة' in await pg.inner_text('#send-err'); print('✓ رقم غير مسجّل: رسالة واضحة')
    # إرسال برقم مسجل (بأرقام عربية ومسافات)
    await pg.fill('#to','٠٩٢ ٢٢٢ ٣٣٣٣'); await pg.click('#review'); await pg.wait_for_timeout(800)
    assert st['lookups'][-1]=='0922223333'; print('✓ يقبل الأرقام العربية والمسافات')
    t=await pg.inner_text('#c-to')
    assert 'أحمد م•••' in t and '092•••333' in t and FRIEND not in t, t; print('✓ التأكيد يعرض الاسم مخفياً جزئياً، ولا يعرض العنوان')
    await pg.click('#confirm-send'); await pin('123456'); await pg.wait_for_timeout(5000)
    log=await pg.evaluate('window.__log'); assert ['USDT',FRIEND,'1000000'] in log, log; print('✓ الإرسال يذهب إلى محفظة صاحب الرقم مباشرة على الشبكة')
    assert not errs, errs
    await b.close()
asyncio.run(main())

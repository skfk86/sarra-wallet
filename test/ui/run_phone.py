# أُلغي الإرسال برقم الهاتف: يُرفض برسالة توجّه لمعرّف صُرّة، ولا يظهر في الاستلام ولا في حسابي
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
    await pg.click('.actions [data-go=send]'); await pg.wait_for_timeout(600)
    assert 'هاتف' not in (await pg.get_attribute('#to','placeholder'))
    await pg.fill('#to','0922223333'); await pg.fill('#amt','1'); await pg.click('#review'); await pg.wait_for_timeout(600)
    assert 'معرّف صُرّة' in await pg.inner_text('#send-err') and not st['lookups']; print('✓ رقم الهاتف في خانة المستلم يُرفض ويوجّه لمعرّف صُرّة دون أي بحث')
    await pg.click('#s-send [data-back]'); await pg.click('.actions [data-go=receive]'); await pg.wait_for_timeout(1200)
    assert not await pg.locator('#recv-phone').is_visible(); print('✓ لا بطاقة "استقبل برقم هاتفك" في شاشة الاستلام')
    await pg.click('#s-receive [data-back]'); await pg.click('.tab[data-tab=security]'); await pg.wait_for_timeout(500)
    await pg.click('#sec-acc'); await pg.wait_for_timeout(1500)
    assert not await pg.locator('#acc-phone-card').is_visible() and 'وثّق حسابك' in await pg.inner_text('#acc-go'); print('✓ "حسابي" بلا خيار الهاتف، وزر التوثيق موجود')
    await pg.click('#acc-go'); await pg.wait_for_timeout(400)
    assert await pg.locator('#s-p2p-verify').is_visible() and not await pg.locator('#ver-phone-link').is_visible(); print('✓ التوثيق بلا خيار "الإرسال لي برقم هاتفي"')
    assert not errs, errs
    await b.close()
asyncio.run(main())

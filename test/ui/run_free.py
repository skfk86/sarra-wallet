# التوسع بتكلفة صفر: السوق والصندوق من قاعدة البيانات مباشرة، و Edge Function فقط عند الحاجة
import asyncio, sys, json
from playwright.async_api import async_playwright
S=sys.argv[1]
calls={'edge':[], 'offers':0, 'inbox':0, 'ver':0, 'key_ok':True}
VER={'v':1,'m':0,'s':'funded'}
OFF=[{'id':'of1','seller':'TSe'+'A'*31,'side':'sell','price_sdg':9000,'min_usdt':10,'max_usdt':100,'available_usdt':100,'pay_window_min':15,'seller_profile':{'nickname':'بائع_سريع','trades_completed':3,'verified':True,'completion':100}}]
async def rest(route):
  r=route.request
  if r.headers.get('apikey')!='sb_publishable_test': calls['key_ok']=False
  if r.url.endswith('/p2p_offers'):
    calls['offers']+=1
    return await route.fulfill(json={'rate':{'sdg_per_usdt':9000,'band_pct':3},'range':{'min':8730,'max':9270},'offers':OFF})
  if r.url.endswith('/p2p_inbox'):
    calls['inbox']+=1
    assert json.loads(r.post_data)['p_token']=='tok-123'
    return await route.fulfill(json={'action':2,'open':2,'offers':1,'v':1})
  if r.url.endswith('/p2p_order_ver'):
    calls['ver']+=1
    return await route.fulfill(json=VER)
  await route.fulfill(status=404, json={})
ORDER={'id':'o1','offer_id':'of1','seller':'TSe'+'A'*31,'buyer':'x','amount_usdt':50,'price_sdg':9000,'total_sdg':450000,'fee_usdt':1.25,'buyer_receives':48.75,'status':'funded','pay_deadline':'2099-01-01T00:00:00Z','created_at':'2026-10-25T10:00:00Z','bankak_name':'محمد','bankak_account':'1234'}
async def edge(route):
  b=json.loads(route.request.post_data); a=b.get('action') or json.loads(b['message'])['action']
  calls['edge'].append(a)
  if a in ('order.get','order.create'): return await route.fulfill(json={'order':ORDER,'role':'buyer','messages':[]})
  await route.fulfill(json={'profile':{'address':'x','nickname':'n','inbox_token':'tok-123','verify_status':'none'},'fee_bps':50,'net_fee':'1','min_trade':10,'rate':{'sdg_per_usdt':9000,'band_pct':3},'range':{'min':8730,'max':9270}})
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':390,'height':844})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.route('https://mock.supabase.co/rest/v1/rpc/**', rest)
    await pg.route('https://mock.supabase.co/functions/v1/**', edge)
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1000); await pg.click('#intro-ok')
    await pg.click('.tab[data-tab=p2p]'); await pg.wait_for_timeout(1200)
    assert 'بائع_سريع' in await pg.inner_text('#p2p-list'); print('✓ السوق يُحمَّل من قاعدة البيانات مباشرة')
    assert 'offers.list' not in calls['edge'], calls; print('✓ بدون استدعاء Edge Function للسوق')
    await pg.click('#p2p-list button:text-is("شراء")'); await pg.fill('#buy-amt','50')
    assert '1.25' in await pg.inner_text('#buy-fee'); print('✓ العمولة ورسوم الشبكة تأتي من بيانات حسابك')
    await pg.click('#s-p2p-buy [data-back]')
    await pg.wait_for_timeout(9000)
    assert calls['inbox']>=1 and await pg.inner_text('#p2p-badge')=='2'; print('✓ الصندوق الخفيف يُظهر عدد الطلبات المنتظرة')
    assert 'orders.mine' not in calls['edge'], calls; print('✓ الفحص الدوري لا يستهلك Edge Functions')
    assert calls['key_ok']; print('✓ المفتاح العام فقط في الطلبات')
    await pg.click('#p2p-list button:text-is("شراء")'); await pg.fill('#buy-amt','50'); await pg.click('#buy-go'); await pg.wait_for_timeout(1500)
    g0=calls['edge'].count('order.get')
    await pg.wait_for_timeout(20000)
    assert calls['ver']>=2 and calls['edge'].count('order.get')-g0<=1, (calls['ver'], calls['edge']); print('✓ شاشة الطلب تفحص النسخة فقط بدون جلب الطلب كل 6 ثوانٍ (%d فحص)' % calls['ver'])
    VER['s']='paid'; VER['v']=2; ORDER['status']='paid'; g1=calls['edge'].count('order.get')
    await pg.wait_for_timeout(7000)
    assert calls['edge'].count('order.get')>g1 and 'أكّد الدفع' in await pg.inner_text('#ord-status'); print('✓ عند تغيّر الطلب يُجلب كاملاً فوراً')
    await pg.reload(); await pg.wait_for_timeout(1500)
    for c in '123456': await pg.click(f'#keypad button:text-is("{c}")')
    await pg.wait_for_timeout(3000); m0=calls['edge'].count('me')
    await pg.click('.tab[data-tab=p2p]'); await pg.wait_for_timeout(1500)
    assert calls['edge'].count('me')==m0; print('✓ فتح التطبيق مجدداً لا يطلب بيانات الحساب من الخادم (محفوظة 6 ساعات)')
    print('Edge Function calls:', calls['edge'])
    assert not errs, errs
    await b.close()
asyncio.run(main())

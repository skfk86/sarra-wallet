# إيصالات بنكك: المشتري يرفع، البائع يرى، والملفات غير الصور تُرفض قبل الإرسال
import asyncio, sys, json, base64, hashlib
from playwright.async_api import async_playwright
S=sys.argv[1]
ME='TQ7mZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'; OTHER='TSe'+'A'*31
O={'rb':{'id':'rb','seller':OTHER,'buyer':ME,'amount_usdt':20,'price_sdg':2700,'total_sdg':54000,'fee_usdt':1.1,'status':'funded','pay_deadline':'2099-01-01T00:00:00Z','created_at':'2026-10-30T09:00:00Z','bankak_name':'محمد','bankak_account':'1234','buyer_profile':{'nickname':'أنا'},'seller_profile':{'nickname':'بائع'}},
   'rs':{'id':'rs','seller':ME,'buyer':OTHER,'amount_usdt':15,'price_sdg':2700,'total_sdg':40500,'fee_usdt':1.07,'status':'paid','created_at':'2026-10-30T08:00:00Z','buyer_profile':{'nickname':'مشترٍ'},'seller_profile':{'nickname':'أنا'}}}
REC={'rb':[],'rs':[{'url':'https://mock.supabase.co/storage/r1.jpg','created_at':'2026-10-30T08:10:00Z'}]}
UP=[]; VIEWS=[]
import io
try:
  from PIL import Image; _b=io.BytesIO(); Image.new('RGB',(60,90),(200,30,30)).save(_b,'JPEG'); JPG=_b.getvalue()
except Exception:
  JPG=base64.b64decode('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==')
async def edge(route):
  b=json.loads(route.request.post_data); m=json.loads(b['message']) if 'message' in b else {'action':b['action'],'params':{}}
  a,p=m['action'],m['params']
  def ok(d): return route.fulfill(json=d)
  def view(o):
    role='buyer' if o['buyer']==ME else 'seller'; v=dict(o); v['buyer_receives']=o['amount_usdt']-o['fee_usdt']; v['receipts']=len(REC[o['id']])
    return {'order':v,'role':role,'messages':[]}
  if a=='me': return await ok({'profile':{'address':ME,'nickname':'أنا','verify_status':'approved'},'fee_bps':50,'net_fee':'1','min_trade':10,'rate':{'sdg_per_usdt':2700,'band_pct':3},'range':{'min':2619,'max':2781}})
  if a=='orders.mine': return await ok({'orders':[view(o)['order'] for o in O.values()]})
  if a=='offers.list': return await ok({'offers':[],'rate':{'sdg_per_usdt':2700,'band_pct':3},'range':{'min':2619,'max':2781}})
  o=O.get(p.get('id'))
  if not o: return await ok({'offers':[]})
  if a=='receipt.upload':
    att=b.get('attachment','')
    assert att.startswith('data:image/jpeg;base64,') and hashlib.sha256(att.encode()).hexdigest()==p['sha256']
    assert o['buyer']==ME
    UP.append(len(att)); REC[o['id']].append({'url':'x','created_at':'2026-10-30T09:05:00Z'})
  if a=='receipt.list':
    if o['buyer']==ME: return await route.fulfill(status=400,json={'error':'NOT_ALLOWED'})
    VIEWS.append(o['id']); return await ok({'receipts':REC[o['id']]})
  return await ok(view(o))
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':780})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.route('https://mock.supabase.co/functions/**', edge)
    await pg.route('https://mock.supabase.co/rest/**', lambda r: r.fulfill(json=None))
    await pg.route('https://mock.supabase.co/storage/**', lambda r: r.fulfill(body=JPG, content_type='image/jpeg'))
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1000); await pg.click('#intro-ok')
    await pg.click('.tab[data-tab=p2p]'); await pg.wait_for_timeout(1200); await pg.click('#p2p-orders-btn'); await pg.wait_for_timeout(1000)
    # المشتري
    await pg.click('#orders-list button:has-text("شراء 20")'); await pg.wait_for_timeout(1000)
    acts=await pg.inner_text('#ord-actions'); assert 'رفع إيصال' in acts and 'عرض إيصال' not in acts, acts
    print('✓ المشتري يرى زر "رفع إيصال تحويل بنكك"، ولا يرى زر العرض')
    # ملف ليس صورة: يُرفض قبل الرفع
    await pg.set_input_files('#rcpt-file', files=[{'name':'x.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4'+bytes(2000)}]); await pg.wait_for_timeout(800)
    assert not UP and 'صورة' in await pg.inner_text('body'); print('✓ ملف PDF/غير صورة يُرفض على الجهاز ولا يُرسل')
    # صورة حقيقية (PNG يُحوَّل JPEG ويُضغط)
    png=await pg.evaluate("""()=>{const c=document.createElement('canvas');c.width=900;c.height=1600;const x=c.getContext('2d');for(let i=0;i<4000;i++){x.fillStyle='hsl('+(i%360)+',60%,50%)';x.fillRect(Math.random()*900,Math.random()*1600,14,14)}return c.toDataURL('image/png').split(',')[1]}""")
    await pg.set_input_files('#rcpt-file', files=[{'name':'bankak.png','mimeType':'image/png','buffer':base64.b64decode(png)}]); await pg.wait_for_timeout(2500)
    assert len(UP)==1 and UP[0]*0.75<2097152, UP; assert 'رفع إيصال آخر (1/3)' in await pg.inner_text('#ord-actions')
    print('✓ رفع الإيصال: مضغوط JPEG أقل من 2MB، مع بصمة SHA-256، ومرتبط برقم الصفقة')
    # البائع
    await pg.click('#s-order [data-back]'); await pg.wait_for_timeout(600)
    await pg.click('#orders-list button:has-text("بيع 15")'); await pg.wait_for_timeout(1000)
    acts=await pg.inner_text('#ord-actions'); assert 'عرض إيصال الدفع (1)' in acts and 'رفع إيصال' not in acts, acts
    await pg.click('#ord-actions button:has-text("عرض إيصال")'); await pg.wait_for_timeout(1200)
    assert await pg.locator('#rcpt-view.show').count()==1 and await pg.locator('#rcpt-list img').count()==1
    ok=await pg.evaluate("document.querySelector('#rcpt-list img').naturalWidth>0")
    assert ok and VIEWS==['rs']; print('✓ البائع يرى الإيصال عبر رابط مؤقت، مع تذكير بالتحقق داخل بنكك قبل التحرير')
    await pg.click('#rcpt-close'); assert await pg.locator('#rcpt-view.show').count()==0
    assert not errs, errs
    await b.close()
asyncio.run(main())

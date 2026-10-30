# الشبكات المتعددة: أرصدة BNB Chain وEthereum وPolygon، والاستلام، والإرسال (خوادم JSON-RPC وهمية)
import asyncio, sys, json, re
from playwright.async_api import async_playwright
S=sys.argv[1]
TO='0x1111111111111111111111111111111111111111'
BAL={ 'bsc':{'native':10**16,'0x55d398326f99059ff775485246999027b3197955':int(25.5*10**18),'0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d':0},
      'eth':{'native':0,'0xdac17f958d2ee523a2206206994597c13d831ec7':0,'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48':0},
      'polygon':{'native':5*10**17,'0xc2132d05d31c914a87c6611c10748aeb04b58e8f':0,'0x3c499c542cef5e3811e1192ce70d8cc03d5c3359':3*10**6} }
sent=[]
PG=[]
def chain_of(url):
  if 'bsc' in url or 'defibit' in url: return 'bsc'
  if 'polygon' in url: return 'polygon'
  return 'eth'
def H(n): return hex(n)
async def rpc(route):
  url=route.request.url; c=chain_of(url); body=json.loads(route.request.post_data)
  reqs=body if isinstance(body,list) else [body]; out=[]
  for r in reqs:
    m=r['method']; p=r.get('params',[]); res=None
    if m=='eth_chainId': res=H({'bsc':56,'eth':1,'polygon':137}[c])
    elif m=='eth_getBalance': res=H(BAL[c]['native'])
    elif m=='eth_call':
      to=p[0]['to'].lower(); res='0x'+format(0 if str(p[0].get('data',p[0].get('input',''))).startswith('0xdd62ed3e') else BAL[c].get(to,0),'064x')
    elif m=='eth_getTransactionCount': res='0x0'
    elif m=='eth_gasPrice': res=H(3*10**9)
    elif m=='eth_maxPriorityFeePerGas': res=H(10**9)
    elif m=='eth_getBlockByNumber': res={'number':'0x1','hash':'0x'+'ab'*32,'parentHash':'0x'+'00'*32,'timestamp':'0x1','gasLimit':'0x1c9c380','gasUsed':'0x0','miner':'0x'+'00'*20,'extraData':'0x','difficulty':'0x0','nonce':'0x0000000000000000','transactions':[],**({} if c=='bsc' else {'baseFeePerGas':H(2*10**9)})}
    elif m=='eth_estimateGas': res=H(60000)
    elif m=='eth_blockNumber': res='0x10'
    elif m=='eth_sendRawTransaction': sent.append((c,p[0])); res=await PG[0].evaluate('r=>ethers.Transaction.from(r).hash', p[0])
    elif m=='eth_getTransactionReceipt': res={'transactionHash':p[0],'blockNumber':'0x2','blockHash':'0x'+'ef'*32,'status':'0x1','gasUsed':H(50000),'cumulativeGasUsed':H(50000),'logs':[],'from':'0x'+'00'*20,'to':TO,'contractAddress':None,'logsBloom':'0x'+'00'*256,'transactionIndex':'0x0','effectiveGasPrice':H(3*10**9),'type':'0x0'}
    out.append({'jsonrpc':'2.0','id':r['id'],'result':res})
  await route.fulfill(json=out if isinstance(body,list) else out[0])
async def main():
  async with async_playwright() as pw:
    b=await pw.chromium.launch(); pg=await b.new_page(viewport={'width':360,'height':780}); PG.append(pg)
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.route('**/v1/accounts/**', lambda r: r.fulfill(json={'data':[]}))
    await pg.route('https://api.coingecko.com/**', lambda r: r.fulfill(json={'tether':{'usd':1,'usd_24h_change':0.01},'usd-coin':{'usd':1,'usd_24h_change':-0.02},'tron':{'usd':0.25,'usd_24h_change':2.5},'binancecoin':{'usd':600,'usd_24h_change':-1.2},'ethereum':{'usd':3000,'usd_24h_change':0.8},'polygon-ecosystem-token':{'usd':0.5,'usd_24h_change':-3.1}}))
    for host in ['bsc-dataseed.bnbchain.org','bsc-rpc.publicnode.com','ethereum-rpc.publicnode.com','polygon-bor-rpc.publicnode.com']:
      await pg.route(f'https://{host}/**', rpc); await pg.route(f'https://{host}', rpc)
    await pg.goto('file://'+S+'/index.html')
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    await pg.click('[data-go=create]'); await pg.click('#reveal'); await pg.check('#agree'); await pg.click('#backup-next')
    await pin('123456'); await pin('123456'); await pg.wait_for_timeout(2500); await pg.click('#intro-ok'); await pg.wait_for_timeout(1500)
    await pg.wait_for_timeout(1000)
    syms=await pg.locator('#assets .coin-row').evaluate_all('els=>els.map(e=>e.dataset.asset)')
    assert set(syms)=={'USDT','USDC','TRX','BNB','ETH','POL'} and syms[0]=='USDT', syms; print('✓ قائمة العملات: '+' · '.join(syms)+' (مرتبة بالقيمة)')
    logos=await pg.locator('#assets .cl>img').evaluate_all('els=>els.map(e=>e.naturalWidth>0 && e.src.split("/").pop())')
    assert all(logos) and 'usdt.png' in logos, logos; print('✓ الشعارات الحقيقية للعملات محمّلة')
    row=await pg.inner_text('#assets [data-asset=USDT]'); assert '151' in row and '$1.00' in row and '+0.01%' in row, row; print('✓ USDT: مجموع كل الشبكات 151 مع السعر والتغير اليومي')
    assert '-1.20%' in await pg.inner_text('#assets [data-asset=BNB]') and await pg.locator('#assets [data-asset=BNB] .chg.dn').count()==1; print('✓ التغير السالب بالأحمر')
    tot=await pg.inner_text('#bal-usdt'); assert tot=='$172.75', tot; print('✓ إجمالي الأصول بالدولار: '+tot)
    await pg.click('#assets [data-asset=USDT]'); await pg.wait_for_timeout(300)
    t=await pg.inner_text('#cs-nets'); assert 'TRON' in t and 'BNB Chain' in t and 'Ethereum' in t and 'Polygon' in t and '25.5' in t, t; print('✓ تفاصيل العملة: الرصيد على كل شبكة')
    await pg.locator('#cs-nets .li').nth(1).locator('button:text-is("إرسال")').click(); await pg.wait_for_timeout(400)
    assert await pg.locator('#s-send').is_visible() and await pg.get_attribute('#send-nets [data-net=bsc]','aria-selected')=='true' and await pg.get_attribute('#coin-seg [data-coin=USDT]','aria-selected')=='true'; print('✓ زر "إرسال" يفتح الإرسال على الشبكة والعملة نفسها')
    await pg.click('#s-send [data-back]'); await pg.wait_for_timeout(300)
    # استلام
    await pg.click('.actions [data-go=receive]'); await pg.wait_for_timeout(400)
    tron_addr=await pg.inner_text('#addr')
    await pg.click('#recv-nets [data-net=bsc]'); await pg.wait_for_timeout(300)
    a=await pg.inner_text('#addr'); w=await pg.inner_text('#recv-warn')
    assert re.match(r'^0x[0-9a-fA-F]{40}$',a) and a!=tron_addr and 'BNB Chain' in w and 'TRON' in w; print('✓ الاستلام: عنوان 0x لشبكة BNB Chain مع تحذير الشبكة')
    await pg.click('#s-receive [data-back]')
    # إرسال
    await pg.click('.actions [data-go=send]'); await pg.wait_for_timeout(400)
    await pg.click('#send-nets [data-net=bsc]'); await pg.wait_for_timeout(300)
    coins=await pg.locator('#coin-seg button').all_inner_texts(); assert coins==['USDT','USDC','BNB'], coins; print('✓ الإرسال: اختيار الشبكة ثم العملة (USDT / USDC / BNB)')
    await pg.fill('#to', tron_addr); await pg.fill('#amt','10'); await pg.click('#review'); await pg.wait_for_timeout(300)
    assert 'عنوان TRON' in await pg.inner_text('#send-err'); print('✓ رفض عنوان TRON على شبكة BNB Chain')
    await pg.fill('#to', TO); await pg.fill('#amt','30'); await pg.click('#review'); await pg.wait_for_timeout(300)
    assert 'غير كافٍ' in await pg.inner_text('#send-err'); print('✓ رفض مبلغ أكبر من الرصيد على الشبكة')
    await pg.fill('#amt','10'); await pg.click('#review'); await pg.wait_for_timeout(400)
    assert 'BNB Chain' in await pg.inner_text('#c-net'); print('✓ التأكيد يعرض الشبكة بوضوح')
    await pg.click('#confirm-send'); await pin('123456'); await pg.wait_for_timeout(6000)
    assert sent and sent[0][0]=='bsc', sent
    raw=sent[0][1]
    tx=await pg.evaluate("r=>{const t=ethers.Transaction.from(r);return {to:t.to,chainId:Number(t.chainId),data:t.data,from:t.from}}", raw)
    exp_data='0xa9059cbb'+TO[2:].rjust(64,'0')+format(10*10**18,'064x')
    assert tx['to']=='0x55d398326f99059fF775485246999027B3197955' and tx['chainId']==56 and tx['data'].lower()==exp_data.lower(), tx
    print('✓ معاملة موقّعة صحيحة: تحويل 10 USDT (BEP20) إلى المستلم على BNB Chain')
    assert await pg.locator('#s-success').is_visible(); print('✓ شاشة النجاح')
    # Ethereum بدون ETH
    await pg.click('.tab[data-tab=home]') if await pg.locator('.tab[data-tab=home]').is_visible() else None
    await pg.goto('file://'+S+'/index.html'); await pg.wait_for_timeout(1500); await pin('123456'); await pg.wait_for_timeout(2500)
    await pg.click('.actions [data-go=send]'); await pg.wait_for_timeout(1500)
    await pg.click('#send-nets [data-net=polygon]'); await pg.click('#coin-seg [data-coin=USDC]')
    await pg.fill('#to', TO); await pg.fill('#amt','1'); await pg.click('#review'); await pg.wait_for_timeout(400)
    assert 'Polygon' in await pg.inner_text('#c-net'); await pg.click('#cancel-send')
    await pg.click('#send-nets [data-net=eth]'); await pg.wait_for_timeout(300)
    await pg.fill('#to', TO); await pg.fill('#amt','1'); await pg.click('#review'); await pg.wait_for_timeout(300)
    e=await pg.inner_text('#send-err'); assert 'غير كافٍ' in e or 'ETH' in e, e; print('✓ Ethereum بدون رصيد: رسالة واضحة')
    # السجل
    await pg.click('#s-send [data-back]'); await pg.click('.tab[data-tab=history]'); await pg.wait_for_timeout(500)
    assert 'Polygon' in await pg.inner_text('#evm-hist'); print('✓ السجل: روابط مستكشف كل شبكة')
    bad=await pg.evaluate('''Array.from(document.querySelectorAll('.screen.active *')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>window.innerWidth+1||r.left<-1)}).length''')
    assert not errs, errs
    await b.close()
if __name__=="__main__": asyncio.run(main())

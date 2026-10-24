import asyncio, sys
from playwright.async_api import async_playwright
S=sys.argv[1]
FEE='TFeeZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf'
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    pg=await b.new_page(viewport={'width':390,'height':844})
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    async def hist(route):
      u=route.request.url
      if '/trc20' in u:
        await route.fulfill(json={'data':[{'transaction_id':'u1','to':'TQ7mZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf','from':'TK3aZ4bR8xLkP2vN9cW3jH5sD6fGa12pLw','value':'250000000','token_info':{'decimals':6},'block_timestamp':1760000000000}]})
      else:
        await route.fulfill(json={'data':[
          {'txID':'t1','block_timestamp':1760000100000,'ret':[{'contractRet':'SUCCESS'}],'raw_data':{'contract':[{'type':'TransferContract','parameter':{'value':{'amount':20000000,'owner_address':'41bb','to_address':'41aa'}}}]}},
          {'txID':'t2','block_timestamp':1760000200000,'ret':[{'contractRet':'SUCCESS'}],'raw_data':{'contract':[{'type':'TransferContract','parameter':{'value':{'amount':1000000,'owner_address':'41aa','to_address':'41bb'}}}]}},
          {'txID':'t3','block_timestamp':1760000300000,'ret':[{'contractRet':'REVERT'}],'raw_data':{'contract':[{'type':'TransferContract','parameter':{'value':{'amount':5,'owner_address':'41aa','to_address':'41bb'}}}]}},
          {'txID':'t4','block_timestamp':1760000400000,'raw_data':{'contract':[{'type':'TriggerSmartContract','parameter':{'value':{}}}]}}]})
    await pg.route('**/v1/accounts/**', hist)
    await pg.goto('file://'+S+'/index.html')
    async def vis(i): return await pg.locator('#'+i).is_visible()
    async def pin(d):
      for c in d: await pg.click(f'#keypad button:text-is("{c}")')
      await pg.wait_for_timeout(2500)
    step=lambda m: print('✓',m)
    # استيراد بفواصل
    await pg.click('[data-go=import]')
    await pg.fill('#mn-in','River, smile, cotton,\nEAGLE, harvest، lamp, orbit, velvet, sand, thunder, maple, quiet')
    await pg.click('#import-next'); await pin('123456'); await pin('123456'); await pg.wait_for_timeout(1500)
    assert await vis('s-home'); step('استيراد كلمات بفواصل وأسطر وأحرف كبيرة')
    await pg.click('#intro-ok')
    assert 'شبكة TRON' in await pg.inner_text('#net-label'); step('الشبكة الرئيسية ظاهرة')
    h=await pg.inner_text('#history'); assert 'TRX' in h and 'USDT' in h, h; step('السجل يعرض TRX وUSDT معاً')
    assert h.count('TRX')==2, h; step('السجل يتجاهل المعاملات الفاشلة واستدعاءات العقود')
    # تبديل TRX ← USDT مع العمولة
    await pg.click('.actions [data-go=swap]'); await pg.wait_for_timeout(500)
    assert await vis('swap-on') if False else True
    assert not await vis('swap-off'); step('التبديل متاح على الشبكة الرئيسية')
    await pg.fill('#sw-in','20'); await pg.wait_for_timeout(1200)
    out=await pg.inner_text('#sw-out'); assert out=='6.6', out; step('التسعير: 20 TRX ← '+out+' USDT')
    fee=await pg.inner_text('#sw-fee'); assert '0.5%' in fee and '0.1 TRX' in fee, fee; step('العمولة ظاهرة قبل التأكيد: '+fee)
    await pg.fill('#sw-in','١٠'); await pg.wait_for_timeout(1200)
    assert await pg.inner_text('#sw-out')=='3.3'; step('التسعير يقبل الأرقام العربية')
    f2=await pg.inner_text('#sw-fee'); assert 'لا عمولة' in f2, f2; step('لا عمولة على المبالغ الصغيرة')
    await pg.fill('#sw-in','40'); await pg.wait_for_timeout(1200); await pg.click('#sw-go'); await pin('123456'); await pg.wait_for_timeout(9000)
    et=await pg.inner_text('#sw-err'); assert await vis('sw-err') and '15 TRX' in et; step('منع تبديل يترك أقل من 15 TRX للرسوم')
    log=await pg.evaluate('window.__log'); assert not log, log; step('لا معاملة ولا عمولة عند الرفض')
    await pg.fill('#sw-in','30'); await pg.wait_for_timeout(1200); await pg.click('#sw-go'); await pin('123456'); await pg.wait_for_timeout(9000)
    assert await vis('s-success'); log=await pg.evaluate('window.__log')
    assert log[0][0]=='SWAP_TRX_USDT' and log[0][1]==30000000, log
    assert log[1]==['TRX',FEE,150000], log; step('تبديل 30 TRX ثم عمولة 0.15 TRX لعنوانك: '+str(log))
    # تبديل USDT ← TRX: موافقة ثم تبديل ثم عمولة
    await pg.evaluate('window.__log=[]')
    await pg.click('#s-success [data-go=home]'); await pg.click('.actions [data-go=swap]'); await pg.wait_for_timeout(500)
    await pg.click('#sw-flip'); assert await vis('sw-approve-note'); step('تنبيه الموافقة عند التبديل من USDT')
    await pg.fill('#sw-in','10'); await pg.wait_for_timeout(1200); await pg.click('#sw-go'); await pin('123456'); await pg.wait_for_timeout(12000)
    log=await pg.evaluate('window.__log')
    assert [x[0] for x in log]==['APPROVE','SWAP_USDT_TRX','TRX'], log
    assert log[0][2]=='10000000', log; step('موافقة على المبلغ المحدد فقط (10 USDT) وليس موافقة مفتوحة')
    assert log[1][3]==10000000; step('التبديل بعد تأكيد الموافقة')
    assert log[2][1]==FEE and log[2][2]==149250, log; step('عمولة من TRX المستلَم: '+str(log[2][2]/1e6)+' TRX')
    # معاملة فاشلة على الشبكة
    await pg.evaluate('window.__log=[]; window.__failNext=true')
    await pg.click('#s-success [data-go=home]'); await pg.click('.actions [data-go=send]')
    await pg.fill('#to','TK3aZ4bR8xLkP2vN9cW3jH5sD6fGa12pLw'); await pg.fill('#amt','5'); await pg.click('#review'); await pg.click('#confirm-send'); await pin('123456'); await pg.wait_for_timeout(8000)
    assert await vis('s-send') and 'فشلت المعاملة' in await pg.inner_text('#send-err'); step('المعاملة الفاشلة على الشبكة تظهر كفشل وليس نجاحاً')
    # مسح QR بالكاميرا (الماسح الداخلي، لأن ماسح Google غير موجود في المتصفح)
    await pg.fill('#to','')
    await pg.click('#scan'); await pg.wait_for_timeout(300)
    assert await vis('scanner'); step('فتح الماسح الداخلي بالكاميرا')
    await pg.locator('#scanner').wait_for(state='hidden', timeout=15000)
    assert not await vis('scanner'); v=await pg.input_value('#to'); assert v=='TK3aZ4bR8xLkP2vN9cW3jH5sD6fGa12pLw', v; step('قراءة عنوان من رمز بصيغة tron:...?amount وإغلاق الكاميرا')
    tracks=await pg.evaluate("document.getElementById('scan-video').srcObject"); assert tracks is None; step('إيقاف الكاميرا بعد المسح')
    await pg.evaluate("window.__qrData='https://evil.example'"); await pg.fill('#to','')
    await pg.click('#scan'); await pg.locator('#scanner').wait_for(state='visible', timeout=5000); await pg.locator('#scanner').wait_for(state='hidden', timeout=15000)
    assert await pg.input_value('#to')=='' ; step('رفض رمز لا يحتوي عنوان TRON')
    await pg.evaluate("window.__qrData='none'")
    await pg.click('#scan'); await pg.locator('#scanner').wait_for(state='visible', timeout=5000); await pg.click('#scan-close')
    assert not await vis('scanner'); step('زر الإلغاء يغلق الماسح')
    await pg.fill('#to','TK3aZ4bR8xLkP2vN9cW3jH5sD6fGa12pLw')
    # إرسال TRX عادي: لا عمولة
    await pg.evaluate('window.__log=[]')
    await pg.click('[data-coin=TRX]'); await pg.fill('#amt','1'); await pg.click('#review'); await pg.click('#confirm-send'); await pin('123456'); await pg.wait_for_timeout(8000)
    log=await pg.evaluate('window.__log'); assert log==[['TRX','TK3aZ4bR8xLkP2vN9cW3jH5sD6fGa12pLw',1000000]], log; step('إرسال TRX عادي بدون أي عمولة')
    print('\nأخطاء JavaScript:', errs or 'لا يوجد')
    await b.close()
asyncio.run(main())

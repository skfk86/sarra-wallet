// TronWeb وهمي لسيناريو الشبكة الرئيسية: تبديل، عمولة، معاملة فاشلة، سجل TRX
(function(){
  var ADDR='TQ7mZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf', OTHER='TK3aZ4bR8xLkP2vN9cW3jH5sD6fGa12pLw';
  var ROUTER='TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax', WTRX='TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR', USDT='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  window.__log=[]; window.__failNext=false; window.__trx=50000000; window.__usdt=125500000; window.__allow=0;
  var n=0; function id(p){ n++; return p+n; }
  function TW(){
    this.trx={
      getBalance: async()=>window.__trx,
      sendTransaction: async(to,amt)=>{ window.__log.push(['TRX',to,amt]); return {result:true,txid:id('trx')}; },
      getTransactionInfo: async(txid)=>({id:txid, receipt:{result: String(txid).indexOf('fail')===0?'REVERT':'SUCCESS'}}),
      signMessageV2: async(m)=>{ window.__signed=(window.__signed||0)+1; return '0x'+'5'.repeat(130); }
    };
    this.address={fromHex:(h)=>h==='41aa'?ADDR:OTHER};
  }
  TW.prototype.setAddress=function(){};
  TW.prototype.contract=function(abi,addr){
    if(addr===ROUTER) return {
      WETH:()=>({call:async()=>WTRX}),
      getAmountsOut:(amt,path)=>({call:async()=>{ var a=BigInt(amt); var out= path[0]===WTRX ? a*33n/100n : a*3n; return {amounts:[a.toString(), out.toString()]}; }}),
      swapExactETHForTokens:(min,path,to,dl)=>({send:async(o)=>{ window.__log.push(['SWAP_TRX_USDT',o.callValue,min]); return id('swap'); }}),
      swapExactTokensForETH:(amt,min,path,to,dl)=>({send:async()=>{ window.__log.push(['SWAP_USDT_TRX',amt,min,window.__allow]); return id('swap'); }})
    };
    return {
      balanceOf:()=>({call:async()=>String(window.__usdt)}),
      allowance:()=>({call:async()=>String(window.__allow)}),
      approve:(sp,v)=>({send:async()=>{ window.__log.push(['APPROVE',sp,v]); window.__allow=Number(v); return id('appr'); }}),
      transfer:(to,v)=>({send:async()=>{ window.__log.push(['USDT',to,v]); if(window.__failNext){window.__failNext=false; return id('fail');} return id('usdt'); }})
    };
  };
  TW.isAddress=(a)=>/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
  TW.createRandom=()=>({mnemonic:{phrase:'river smile cotton eagle harvest lamp orbit velvet sand thunder maple quiet'}});
  TW.fromMnemonic=(m)=>{ if(m.split(' ').length!==12) throw new Error('bad'); return {address:ADDR,privateKey:'0x'+'ab'.repeat(32)}; };
  window.TronWeb={TronWeb:TW};
})();

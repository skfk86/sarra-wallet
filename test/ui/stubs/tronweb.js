// TronWeb وهمي لاختبار الواجهة
(function(){
  var ADDR='TQ7mZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf';
  window.__sent=[];
  function TW(conf){ this.conf=conf; var self=this;
    this.trx={ getBalance: async()=>50000000, sendTransaction: async(to,amt)=>{window.__sent.push(['TRX',to,amt]);return {result:true,txid:'trx'+window.__sent.length}},
      getTransactionInfo: async(id)=>({id:id,receipt:{result:'SUCCESS'}}) };
    this.address={fromHex:(h)=>h};
  }
  TW.prototype.setAddress=function(){};
  TW.prototype.contract=function(){return{at:async()=>({
    balanceOf:()=>({call:async()=>'125500000'}),
    transfer:(to,v)=>({send:async()=>{window.__sent.push(['USDT',to,v]);return 'usdt'+window.__sent.length}})
  })}};
  TW.isAddress=(a)=>/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
  TW.createRandom=()=>({mnemonic:{phrase:'river smile cotton eagle harvest lamp orbit velvet sand thunder maple quiet'}});
  TW.fromMnemonic=()=>({address:ADDR,privateKey:'0x'+'ab'.repeat(32)});
  window.TronWeb={TronWeb:TW};
})();

// سجل الشبكات والعملات: المصدر الوحيد لتعريف أي شبكة أو عملة في الواجهة والتداول.
// عقود التوكنات (العنوان والخانات) تبقى في wallet-core.js (EVM_CHAINS) لأنها حساسة ومُتحقق منها،
// وهذا السجل يقرأها ليستنتج على أي شبكة توجد كل عملة، فلا تُكتب القائمة يدوياً في مكانين.
//
// إضافة عملة: صف في ASSETS هنا + عقدها في EVM_CHAINS. إضافة شبكة EVM: صف في EVM_CHAINS + شعارها في NET_LOGO.
// منطق صافٍ بلا واجهة: يعمل في المتصفح (window.SarraLogic) وفي Node (require) للاختبار
(function (root) {
  'use strict';
  var TW = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/';

  // الشبكات غير EVM (لكل واحدة نواتها الخاصة في wallet-core.js)
  var BASE_NETWORKS = [
    { key: 'tron', kind: 'tron', name: 'TRON', short: 'TRC20', color: '#EB0029', native: 'TRX', coins: ['USDT', 'TRX'] }
  ];
  // ترتيب ظهور الشبكات بعد TRON
  var EVM_ORDER = ['bsc', 'eth', 'polygon'];
  var NET_LOGO = { tron: 'trx', bsc: 'bnb', eth: 'eth', polygon: 'pol' };
  // اسم المستكشف المعروض على زر «عرض على …» (حسب نطاق الرابط)
  var EXPLORERS = [[/tronscan/, 'TRONSCAN'], [/bscscan/, 'BscScan'], [/polygonscan/, 'PolygonScan'], [/etherscan/, 'Etherscan'], [/basescan/, 'BaseScan'], [/arbiscan/, 'Arbiscan']];
  function explorerName(url) {
    var h = ''; try { h = new URL(url).hostname; } catch (e) {}
    for (var i = 0; i < EXPLORERS.length; i++) if (EXPLORERS[i][0].test(h)) return EXPLORERS[i][1];
    return 'المستكشف';
  }

  // العملات: logo = شعار محلي في assets/coins، أو url لشعار خارجي. cg = معرّف CoinGecko للأسعار،
  // bn = زوج Binance للتداول الفوري (بدونه لا تظهر العملة في التداول). extra = تظهر في الرئيسية فقط إن كان لديك رصيد
  var ASSETS = [
    { sym: 'USDT', name: 'Tether', logo: 'usdt', cg: 'tether', stable: true },
    { sym: 'USDC', name: 'USD Coin', logo: 'usdc', cg: 'usd-coin', stable: true },
    { sym: 'TRX', name: 'TRON', logo: 'trx', cg: 'tron', bn: 'TRXUSDT', home: 'tron' },
    { sym: 'BNB', name: 'BNB', logo: 'bnb', cg: 'binancecoin', bn: 'BNBUSDT' },
    { sym: 'ETH', name: 'Ethereum', logo: 'eth', cg: 'ethereum', bn: 'ETHUSDT' },
    { sym: 'POL', name: 'Polygon', logo: 'pol', cg: 'polygon-ecosystem-token', bn: 'POLUSDT' },
    { sym: 'BTC', name: 'Bitcoin (مغلّف)', url: TW + 'bitcoin/info/logo.png', cg: 'bitcoin', bn: 'BTCUSDT', extra: true },
    { sym: 'FDUSD', name: 'First Digital USD', url: TW + 'smartchain/assets/0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409/logo.png', cg: 'first-digital-usd', stable: true, extra: true },
    { sym: 'DAI', name: 'Dai', url: TW + 'ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png', cg: 'dai', stable: true, extra: true },
    { sym: 'XRP', name: 'XRP', url: TW + 'ripple/info/logo.png', cg: 'ripple', bn: 'XRPUSDT', extra: true },
    { sym: 'SOL', name: 'Solana', url: TW + 'solana/info/logo.png', cg: 'solana', bn: 'SOLUSDT', extra: true },
    { sym: 'DOGE', name: 'Dogecoin', url: TW + 'doge/info/logo.png', cg: 'dogecoin', bn: 'DOGEUSDT', extra: true },
    { sym: 'ADA', name: 'Cardano', url: TW + 'cardano/info/logo.png', cg: 'cardano', bn: 'ADAUSDT', extra: true },
    { sym: 'LINK', name: 'Chainlink', url: TW + 'ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png', cg: 'chainlink', bn: 'LINKUSDT', extra: true },
    { sym: 'UNI', name: 'Uniswap', url: TW + 'ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png', cg: 'uniswap', bn: 'UNIUSDT', extra: true },
    { sym: 'AAVE', name: 'Aave', url: TW + 'ethereum/assets/0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9/logo.png', cg: 'aave', bn: 'AAVEUSDT', extra: true },
    { sym: 'CAKE', name: 'PancakeSwap', url: TW + 'smartchain/assets/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82/logo.png', cg: 'pancakeswap-token', bn: 'CAKEUSDT', extra: true },
    { sym: 'SHIB', name: 'Shiba Inu', url: TW + 'ethereum/assets/0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE/logo.png', cg: 'shiba-inu', bn: 'SHIBUSDT', extra: true },
    { sym: 'PEPE', name: 'Pepe', url: TW + 'ethereum/assets/0x6982508145454Ce325dDbE47a25d4ec3d2311933/logo.png', cg: 'pepe', bn: 'PEPEUSDT', extra: true }
  ];

  // يبني السجل من شبكات EVM المفعّلة في النواة (core.evmChains()، أو {} عند تعطيلها)
  function buildRegistry(evmChains) {
    evmChains = evmChains || {};
    var evmKeys = EVM_ORDER.filter(function (k) { return evmChains[k]; })
      .concat(Object.keys(evmChains).filter(function (k) { return EVM_ORDER.indexOf(k) < 0; })); // شبكة جديدة تظهر في آخر القائمة
    var networks = BASE_NETWORKS.map(function (n) { return Object.assign({ evm: false }, n, { coins: n.coins.slice() }); }).concat(evmKeys.map(function (k) {
      var c = evmChains[k], syms = c.tokens.map(function (t) { return t.sym; });
      // الترتيب المعروض: أول عملتين مستقرتين، ثم العملة الأصلية، ثم بقية التوكنات
      return { key: k, kind: 'evm', evm: true, name: c.name, short: c.short, color: c.color, native: c.native, coins: syms.slice(0, 2).concat([c.native], syms.slice(2)) };
    }));
    var byKey = {}; networks.forEach(function (n) { byKey[n.key] = n; });
    var assets = ASSETS.map(function (a) {
      var on = networks.filter(function (n) { return n.coins.indexOf(a.sym) >= 0; }).map(function (n) { return n.key; });
      // الشبكة الأصلية للعملة أولاً (ETH على Ethereum، TRX على TRON) ثم البقية بترتيب الشبكات
      var home = a.home || (networks.filter(function (n) { return n.native === a.sym; })[0] || {}).key;
      if (home && on.indexOf(home) > 0) on = [home].concat(on.filter(function (k) { return k !== home; }));
      return Object.assign({}, a, { nets: on });
    }).filter(function (a) { return a.nets.length; });
    var bySym = {}; assets.forEach(function (a) { bySym[a.sym] = a; });
    var binance = {}; assets.forEach(function (a) { if (a.bn) binance[a.sym] = a.bn; });
    return {
      networks: networks, assets: assets, binance: binance,
      network: function (k) { return byKey[k] || null; },
      asset: function (s) { return bySym[s] || null; },
      netLogo: function (k) { return 'assets/coins/' + (NET_LOGO[k] || 'trx') + '.png'; },
      supports: function (k, s) { var n = byKey[k]; return !!n && n.coins.indexOf(s) >= 0; }
    };
  }

  // آخر فحص قبل التوقيع: الشبكة معروفة، والعملة موجودة عليها، والعنوان من نوع الشبكة.
  // validators: { tron: fn(addr), evm: fn(addr) } من النواة (تتحقق من checksum أيضاً). يعيد رمز خطأ أو null
  function checkTransfer(reg, netKey, sym, addr, validators) {
    var n = reg.network(netKey); if (!n) return 'UNKNOWN_NETWORK';
    if (!reg.supports(netKey, sym)) return 'ASSET_NOT_ON_NETWORK';
    var ok = validators && validators[n.kind]; if (!ok) return 'UNKNOWN_NETWORK';
    if (ok(addr)) return null;
    var other = Object.keys(validators).some(function (k) { return k !== n.kind && validators[k](addr); });
    return other ? 'WRONG_NETWORK_ADDRESS' : 'INVALID_ADDRESS';
  }

  var api = { buildRegistry: buildRegistry, checkTransfer: checkTransfer, explorerName: explorerName, ASSETS: ASSETS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SarraLogic = Object.assign(root.SarraLogic || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);

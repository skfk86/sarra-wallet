/*
 * صُرّة — نواة المحفظة (غير احتجازية)
 * - المفتاح الخاص لا يغادر الجهاز أبداً
 * - كلمات الاسترجاع تُشفَّر برمز PIN (PBKDF2 + AES-GCM) قبل التخزين
 * - التخزين المشفّر في Preferences الخاصة بالتطبيق (النسخ الاحتياطي التلقائي معطّل)
 */
(function (root) {
  'use strict';

  // ===== إعدادات الشبكة =====
  var NETWORKS = {
    mainnet: {
      fullHost: 'https://api.trongrid.io',
      usdt: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      explorer: 'https://tronscan.org/#/transaction/',
      // SunSwap V2 — يُتحقق منه وقت التشغيل: router.WETH() يجب أن يساوي wtrx
      // تم التحقق على الشبكة الرئيسية (2026-10-23): WETH() يعيد wtrx، وgetAmountsOut يعمل
      swap: { router: 'TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax', wtrx: 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR' }
    },
    // شبكة اختبار مجانية — استخدمها أثناء التطوير
    nile: {
      fullHost: 'https://nile.trongrid.io',
      usdt: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
      explorer: 'https://nile.tronscan.org/#/transaction/'
    }
  };

  // ===== الشبكات المتوافقة مع EVM (من نفس الكلمات الـ12) =====
  // خوادم عامة مجانية؛ كل هاتف يتصل مباشرة بحده الخاص، ونجرّب التالي إن فشل الأول
  var EVM_CHAINS = {
    bsc: {
      id: 56, name: 'BNB Chain', short: 'BEP20', native: 'BNB', color: '#F0B90B', explorer: 'https://bscscan.com',
      rpcs: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com', 'https://bsc-dataseed1.defibit.io'],
      tokens: [{ sym: 'USDT', addr: '0x55d398326f99059fF775485246999027B3197955', dec: 18 },
               { sym: 'USDC', addr: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', dec: 18 }]
    },
    eth: {
      id: 1, name: 'Ethereum', short: 'ERC20', native: 'ETH', color: '#627EEA', explorer: 'https://etherscan.io',
      rpcs: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com', 'https://cloudflare-eth.com'],
      tokens: [{ sym: 'USDT', addr: '0xdAC17F958D2ee523a2206206994597C13D831ec7', dec: 6 },
               { sym: 'USDC', addr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', dec: 6 }]
    },
    polygon: {
      id: 137, name: 'Polygon', short: 'Polygon', native: 'POL', color: '#8247E5', explorer: 'https://polygonscan.com',
      rpcs: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon-rpc.com'],
      tokens: [{ sym: 'USDT', addr: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', dec: 6 },
               { sym: 'USDC', addr: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', dec: 6 }]
    }
  };
  var EVM_PATH = "m/44'/60'/0'/0/0";
  var ERC20_IFACE_ABI = ['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'];
  function E() { return root.ethers || null; }
  function evmFromMnemonic(mnemonic) {
    var ethers = E(); if (!ethers) return null;
    var w = ethers.HDNodeWallet.fromPhrase(normalizeMnemonic(mnemonic), undefined, EVM_PATH);
    return { address: w.address, privateKey: w.privateKey };
  }

  var USDT_DECIMALS = 6;
  var TRX_DECIMALS = 6;
  var PBKDF2_ITERATIONS = 600000;
  var VAULT_KEY = 'sarra.vault.v1';
  var GUARD_KEY = 'sarra.pinguard.v1'; // عدد المحاولات الخاطئة ووقت انتهاء الحظر (يبقى بعد إعادة التشغيل)
  var DERIVATION_PATH = "m/44'/195'/0'/0/0";
  var FEE_LIMIT_SUN = 100000000; // أقصى 100 TRX رسوم للمعاملة الواحدة

  // وصف الدوال (ABI) مضمّن في التطبيق: عقد SunSwap لا ينشر وصفه على الشبكة،
  // والتضمين يوفّر طلباً إضافياً للشبكة في كل عملية
  var TRC20_ABI = [
    { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'who', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
    { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
    { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
    { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }
  ];
  // إعادة المحاولة عند رفض TronGrid المؤقت (429 / حد الطلبات / انقطاع لحظي) مع انتظار متزايد
  function isTransient(e) {
    var s = String((e && (e.message || e.code || e.status)) || e || '') + ' ' + String(e && e.response && e.response.status || '');
    return /429|rate|limit|timeout|network|fetch|ECONN|socket|503|502|Failed to fetch/i.test(s);
  }
  async function withRetry(fn, tries) {
    tries = tries || 3;
    for (var i = 0; ; i++) {
      try { return await fn(); }
      catch (e) {
        if (i >= tries - 1 || !isTransient(e)) throw e;
        await new Promise(function (r) { setTimeout(r, 700 * Math.pow(2, i) + Math.random() * 300); });
      }
    }
  }

  // TronWeb يعيد العنوان بصيغ مختلفة حسب الإصدار: base58، أو hex بـ 41، أو 0x، أو 40 خانة
  function normalizeAddress(tw, v) {
    if (Array.isArray(v)) v = v[0];
    var s = String(v || '');
    if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s)) return s;
    s = s.replace(/^0x/i, '');
    if (/^[0-9a-fA-F]{40}$/.test(s)) s = '41' + s;
    if (/^41[0-9a-fA-F]{40}$/.test(s)) return tw.address.fromHex(s);
    return '';
  }

  var ROUTER_ABI = [
    { type: 'function', name: 'WETH', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
    { type: 'function', name: 'getAmountsOut', stateMutability: 'view', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'path', type: 'address[]' }], outputs: [{ name: 'amounts', type: 'uint256[]' }] },
    { type: 'function', name: 'swapExactETHForTokens', stateMutability: 'payable', inputs: [{ name: 'amountOutMin', type: 'uint256' }, { name: 'path', type: 'address[]' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }], outputs: [{ name: 'amounts', type: 'uint256[]' }] },
    { type: 'function', name: 'swapExactTokensForETH', stateMutability: 'nonpayable', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'amountOutMin', type: 'uint256' }, { name: 'path', type: 'address[]' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }], outputs: [{ name: 'amounts', type: 'uint256[]' }] }
  ];

  var subtle = root.crypto && root.crypto.subtle;
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  // ===== أدوات =====
  function b64(bytes) {
    var s = '';
    var arr = new Uint8Array(bytes);
    for (var i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
    return root.btoa ? root.btoa(s) : Buffer.from(s, 'binary').toString('base64');
  }
  function unb64(str) {
    var s = root.atob ? root.atob(str) : Buffer.from(str, 'base64').toString('binary');
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function randomBytes(n) {
    var a = new Uint8Array(n);
    root.crypto.getRandomValues(a);
    return a;
  }

  // تحويل "12.5" إلى وحدات صحيحة بدون أخطاء الأرقام العشرية
  function toUnits(amountStr, decimals) {
    var s = String(amountStr).trim().replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); }).replace(/٫/g, '.').replace(/[,،\s]/g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('INVALID_AMOUNT');
    var parts = s.split('.');
    var frac = (parts[1] || '');
    if (frac.length > decimals) throw new Error('TOO_MANY_DECIMALS');
    frac = (frac + '000000000000000000').slice(0, decimals);
    var units = BigInt(parts[0]) * (10n ** BigInt(decimals)) + BigInt(frac || '0');
    if (units <= 0n) throw new Error('INVALID_AMOUNT');
    return units;
  }
  function fromUnits(units, decimals) {
    var u = BigInt(units);
    var base = 10n ** BigInt(decimals);
    var whole = u / base;
    var frac = (u % base).toString().padStart(decimals, '0').replace(/0+$/, '');
    return frac ? whole.toString() + '.' + frac : whole.toString();
  }
  function formatAmount(units, decimals, maxFrac) {
    var n = Number(fromUnits(units, decimals));
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: maxFrac == null ? 2 : maxFrac });
  }

  // ===== التشفير برمز PIN =====
  async function deriveKey(pin, salt) {
    var base = await subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  // v2: كلمة المرور = PIN + سرّ عشوائي 256-bit محفوظ في Android Keystore (لا يمكن استخراجه من الجهاز).
  // من ينسخ ملفات التطبيق لا يستطيع تجربة المليون احتمال لرمز PIN خارج الهاتف، لأن السرّ ليس معه.
  function secretPass(pin, dk) { return dk ? pin + '\u0000' + dk : pin; }
  async function encryptSecret(secret, pin, dk) {
    var salt = randomBytes(16);
    var iv = randomBytes(12);
    var key = await deriveKey(secretPass(pin, dk), salt);
    var ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(secret));
    var box = { v: dk ? 2 : 1, kdf: 'PBKDF2-SHA256', it: PBKDF2_ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
    if (dk) box.dk = 1;
    return box;
  }
  async function decryptSecret(box, pin, dk) {
    if (box.dk && !dk) throw new Error('DEVICE_KEY_LOST');
    try {
      var salt = unb64(box.salt);
      var key = await subtle.importKey('raw', enc.encode(secretPass(pin, box.dk ? dk : null)), 'PBKDF2', false, ['deriveKey']).then(function (base) {
        return subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: box.it || PBKDF2_ITERATIONS, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
        );
      });
      var pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
      return dec.decode(pt);
    } catch (e) {
      throw new Error('WRONG_PIN');
    }
  }

  // ===== التخزين =====
  // البيانات مشفّرة برمز PIN قبل التخزين، فتُحفظ في Preferences (ملف خاص بالتطبيق)
  // ثم localStorage في المتصفح، ثم ذاكرة مؤقتة للاختبار
  var memoryStore = {};
  function storage() {
    var P = root.Capacitor && root.Capacitor.Plugins;
    if (P && P.Preferences && typeof P.Preferences.get === 'function') {
      return {
        get: function (k) { return P.Preferences.get({ key: k }).then(function (r) { return r.value; }); },
        set: function (k, v) { return P.Preferences.set({ key: k, value: v }); },
        remove: function (k) { return P.Preferences.remove({ key: k }); }
      };
    }
    try {
      if (root.localStorage) {
        return {
          get: async function (k) { return root.localStorage.getItem(k); },
          set: async function (k, v) { root.localStorage.setItem(k, v); },
          remove: async function (k) { root.localStorage.removeItem(k); }
        };
      }
    } catch (e) {}
    return {
      get: async function (k) { return memoryStore[k] == null ? null : memoryStore[k]; },
      set: async function (k, v) { memoryStore[k] = v; },
      remove: async function (k) { delete memoryStore[k]; }
    };
  }

  // ===== TronWeb =====
  function TronWebClass() {
    var g = root.TronWeb;
    if (!g) throw new Error('TRONWEB_NOT_LOADED');
    return g.TronWeb || g;
  }

  function normalizeMnemonic(m) {
    // يقبل الكلمات مفصولة بمسافات أو فواصل (, ، ;) أو أسطر جديدة، ويتجاهل الترقيم
    return String(m).toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  }

  function accountFromMnemonic(mnemonic) {
    var TW = TronWebClass();
    var acc = TW.fromMnemonic(normalizeMnemonic(mnemonic), DERIVATION_PATH);
    var pk = String(acc.privateKey).replace(/^0x/, '');
    var evm = null; try { evm = evmFromMnemonic(mnemonic); } catch (e) {}
    return { address: acc.address, privateKey: pk, evm: evm };
  }

  // ===== كائن المحفظة =====
  function createCore(opts) {
    opts = opts || {};
    var net = NETWORKS[opts.network || 'nile'];
    var apiKey = opts.apiKey || '';
    // عمولة التبديل: تُدفع بـ TRX (تحويل شبه مجاني) إلى عنوان المطوّر، وبعد نجاح التبديل فقط
    var feeAddress = opts.feeAddress || '';
    var feeBps = BigInt(opts.feeBps == null ? 50 : opts.feeBps); // 50 = 0.5%
    var MIN_FEE_SUN = 100000n; // لا عمولة أقل من 0.1 TRX
    var swapChecked = null;
    var session = null; // { address, privateKey } — في الذاكرة فقط بعد فتح القفل
    // سرّ الجهاز من Android Keystore (null في المتصفح والاختبارات: نعود لتشفير PIN وحده)
    async function deviceKey() {
      if (typeof opts.deviceKey !== 'function') return null;
      try { var k = await opts.deviceKey(); return typeof k === 'string' && k.length >= 40 ? k : null; } catch (e) { return null; }
    }
    function keepPublic(box, old) { box.address = old.address; if (old.evmAddress) box.evmAddress = old.evmAddress; return box; }

    // ===== حماية رمز القفل من التخمين =====
    // كل محاولة خاطئة (فتح، تحقق، عرض الكلمات، تغيير الرمز) تُحسب وتُحفظ
    // بعد 5 أخطاء: حظر متصاعد يبدأ بدقيقة ويصل إلى ساعة
    async function readGuard() {
      try { var g = JSON.parse((await storage().get(GUARD_KEY)) || 'null'); if (g) return g; } catch (e) {}
      return { fails: 0, until: 0 };
    }
    async function openVault(pin) {
      var g = await readGuard();
      if (Date.now() < g.until) throw new Error('LOCKED_OUT');
      var raw = await storage().get(VAULT_KEY);
      if (!raw) throw new Error('NO_WALLET');
      var box = JSON.parse(raw);
      var dk = await deviceKey();
      // سرّ الجهاز مفقود: ليس خطأ PIN، فلا يُحسب محاولة. الحل: الاستعادة بكلمات الاسترجاع
      if (box.dk && !dk) throw new Error('DEVICE_KEY_LOST');
      try {
        var mnemonic = await decryptSecret(box, pin, dk);
        if (g.fails) await storage().set(GUARD_KEY, JSON.stringify({ fails: 0, until: 0 }));
        // ترقية تلقائية: محفظة قديمة (PIN فقط) تُعاد بتشفير الجهاز بعد أول فتح ناجح
        if (dk && !box.dk) {
          try { var nb = keepPublic(await encryptSecret(mnemonic, pin, dk), box); await storage().set(VAULT_KEY, JSON.stringify(nb)); box = nb; } catch (e) {}
        }
        return { box: box, mnemonic: mnemonic };
      } catch (e) {
        g.fails++;
        if (g.fails >= 5) g.until = Date.now() + Math.min(60000 * Math.pow(2, g.fails - 5), 3600000);
        await storage().set(GUARD_KEY, JSON.stringify(g));
        throw new Error(g.until ? 'LOCKED_OUT' : 'WRONG_PIN');
      }
    }

    // ===== انتظار تأكيد المعاملة على الشبكة =====
    // يعيد 'SUCCESS' أو 'PENDING' (لم تُؤكَّد خلال المهلة) أو يرمي TX_FAILED
    async function waitForTx(txid, isContract, timeoutMs) {
      var tw = client();
      var end = Date.now() + (timeoutMs || 90000);
      while (Date.now() < end) {
        await new Promise(function (r) { setTimeout(r, 3000); });
        try {
          var info = await tw.trx.getTransactionInfo(txid);
          if (info && info.id) {
            if (isContract) {
              var res = info.receipt && info.receipt.result;
              if (res === 'SUCCESS') return 'SUCCESS';
              throw new Error('TX_FAILED');
            }
            if (info.result === 'FAILED') throw new Error('TX_FAILED');
            return 'SUCCESS';
          }
        } catch (e) { if (e.message === 'TX_FAILED') throw e; }
      }
      return 'PENDING';
    }

    // مزوّد EVM لكل خادم عام، ونجرّب الخادم التالي عند الفشل
    var evmProviders = {};
    function evmProvider(c, url) {
      var ethers = E(), key = c.id + url;
      if (!evmProviders[key]) evmProviders[key] = new ethers.JsonRpcProvider(url, c.id, { staticNetwork: true, batchMaxCount: 1 });
      return evmProviders[key];
    }
    async function evmCall(c, fn) {
      var last;
      for (var i = 0; i < c.rpcs.length; i++) {
        try { return await fn(evmProvider(c, c.rpcs[i])); }
        catch (e) {
          last = e;
          var code = e && e.message;
          // أخطاء منطقية (رصيد غير كافٍ...) لا تُعاد مع خادم آخر
          if (/^(INSUFFICIENT_|LOW_GAS|TX_FAILED|BAD_|INVALID_|SELF_SEND)/.test(code || '')) throw e;
        }
      }
      throw last && /^[A-Z_]+$/.test(last.message || '') ? last : new Error('EVM_NETWORK');
    }

    var TRX_LIFI = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', EVM_NATIVE = '0x0000000000000000000000000000000000000000';
    function bridgeChain(k) { return k === 'tron' ? 'TRN' : String(EVM_CHAINS[k] && EVM_CHAINS[k].id); }
    function bridgeAsset(k, sym) {
      if (k === 'tron') return sym === 'USDT' ? { chain: 'TRN', addr: net.usdt, dec: 6 } : sym === 'TRX' ? { chain: 'TRN', addr: TRX_LIFI, dec: 6 } : null;
      var c = EVM_CHAINS[k]; if (!c) return null;
      if (sym === c.native) return { chain: String(c.id), addr: EVM_NATIVE, dec: 18 };
      var t = c.tokens.filter(function (x) { return x.sym === sym; })[0];
      return t ? { chain: String(c.id), addr: t.addr, dec: t.dec } : null;
    }
    async function lifi(path) {
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var to = ctl && setTimeout(function () { ctl.abort(); }, 25000);
      try {
        var res = await fetch('https://li.quest/v1' + path, { signal: ctl && ctl.signal });
        var j = await res.json().catch(function () { return {}; });
        if (res.status === 429) throw new Error('BRIDGE_BUSY');
        if (!res.ok) throw new Error(res.status === 404 || /no.*(route|quote)/i.test(j.message || '') ? 'NO_ROUTE' : 'BRIDGE_NETWORK');
        return j;
      } catch (e) { throw /^[A-Z_]+$/.test(e.message || '') ? e : new Error('BRIDGE_NETWORK'); }
      finally { if (to) clearTimeout(to); }
    }
    // ===== حماية النقل: لا نوقّع ما لم يطابق ما رآه المستخدم =====
    // عقد LI.FI الرسمي (LiFiDiamond) على BNB Chain وEthereum وPolygon
    var LIFI_DIAMOND = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
    function same(a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); }
    function verifyBridgeQuote(q) {
      var act = q.action || {};
      if (act.fromAmount && BigInt(act.fromAmount) !== q.units) throw new Error('ROUTE_MISMATCH');
      if (act.fromToken && act.fromToken.address && !same(act.fromToken.address, q.token.addr)) throw new Error('ROUTE_MISMATCH');
      if (act.toAddress && !same(act.toAddress, q.toAddr)) throw new Error('ROUTE_MISMATCH');
      if (act.toToken && act.toToken.address && q.toTok && !same(act.toToken.address, q.toTok.addr)) throw new Error('ROUTE_MISMATCH');
      if (q.fromNet !== 'tron') {
        var c = EVM_CHAINS[q.fromNet];
        if (!same(q.tx.to, LIFI_DIAMOND)) throw new Error('ROUTE_MISMATCH');
        if (q.tx.chainId != null && Number(q.tx.chainId) !== c.id) throw new Error('ROUTE_MISMATCH');
        if (q.approval && !same(q.approval, LIFI_DIAMOND)) throw new Error('ROUTE_MISMATCH');
        var val = BigInt(q.tx.value || 0), native = q.token.addr === EVM_NATIVE;
        // التوكن: قيمة أصلية صغيرة فقط (رسوم بعض الجسور). الأصلية: لا تزيد عن المبلغ + 2%
        if (!native && val > 10n ** 16n) throw new Error('ROUTE_MISMATCH');
        if (native && val > q.units + q.units / 50n) throw new Error('ROUTE_MISMATCH');
      }
    }
    function verifyTronBridgeTx(tw, raw, q) {
      var ct = raw.raw_data.contract && raw.raw_data.contract[0], v = ct && ct.parameter && ct.parameter.value;
      if (!v || ct.type !== 'TriggerSmartContract') throw new Error('ROUTE_MISMATCH');
      var b58 = function (x) { x = String(x || ''); return x.charAt(0) === 'T' ? x : tw.address.fromHex(x); };
      if (b58(v.owner_address) !== session.address) throw new Error('ROUTE_MISMATCH');
      var target = b58(v.contract_address);
      // الموافقة تُعطى فقط للعقد نفسه الذي ستستدعيه المعاملة
      if (q.approval && b58(q.approval) !== target) throw new Error('ROUTE_MISMATCH');
      var cv = BigInt(v.call_value || 0);
      if (q.token.addr !== TRX_LIFI && cv > 50000000n) throw new Error('ROUTE_MISMATCH');
      if (q.token.addr === TRX_LIFI && cv > q.units + q.units / 50n + 50000000n) throw new Error('ROUTE_MISMATCH');
    }
    // توقيع وبث معاملة EVM عامة (موافقة أو جسر) وانتظار تأكيدها
    async function evmExec(c, tx, waitHard) {
      var ethers = E(), from = session.evm.address;
      var signed = await evmCall(c, async function (p) {
        var nonce = await p.getTransactionCount(from, 'pending'), fee = await p.getFeeData();
        var gas = tx.gasLimit || BigInt(await p.estimateGas({ from: from, to: tx.to, value: tx.value, data: tx.data })) * 12n / 10n;
        var t = { chainId: c.id, nonce: nonce, to: tx.to, value: tx.value, data: tx.data, gasLimit: gas }, price;
        if (fee.maxFeePerGas) { t.type = 2; t.maxFeePerGas = fee.maxFeePerGas; t.maxPriorityFeePerGas = fee.maxPriorityFeePerGas || 0n; price = fee.maxFeePerGas; }
        else { t.type = 0; t.gasPrice = fee.gasPrice; price = fee.gasPrice; }
        if (BigInt(await p.getBalance(from)) < gas * BigInt(price) + tx.value) throw new Error('LOW_GAS');
        return new ethers.Wallet(session.evm.privateKey).signTransaction(t);
      });
      var hash = ethers.Transaction.from(signed).hash;
      await evmCall(c, function (p) { return p.broadcastTransaction(signed).catch(function (e) {
        if (/already known|nonce too low|ALREADY_EXISTS/i.test(String(e && (e.message || e.shortMessage)))) return null; throw e; }); });
      for (var i = 0; i < (waitHard ? 30 : 13); i++) {
        await new Promise(function (r) { setTimeout(r, 3000); });
        try { var rc = await evmCall(c, function (p) { return p.getTransactionReceipt(hash); });
          if (rc) { if (rc.status === 0) throw new Error('TX_FAILED'); return hash; } }
        catch (e) { if (e.message === 'TX_FAILED') throw e; }
      }
      if (waitHard) throw new Error('APPROVE_PENDING');
      return hash;
    }

    // القراءة (الرصيد والسجل) بدون مفتاح أولاً: حد TronGrid بدون مفتاح يُحسب لكل جهاز على حدة،
    // فلا يشترك كل المستخدمين في حد مفتاح واحد. عند الرفض (429) نستخدم المفتاح لدقيقة ثم نعود.
    // الإرسال والتبديل يستخدمان المفتاح دائماً لأنهما الأهم.
    var keyUntil = 0;
    function readKeyed() { return !!apiKey && Date.now() < keyUntil; }
    function noteRateLimited() { if (apiKey) keyUntil = Date.now() + 60000; }
    async function readRetry(fn) {
      for (var i = 0; ; i++) {
        try { return await fn(readKeyed()); }
        catch (e) {
          if (i >= 3 || !isTransient(e)) throw e;
          noteRateLimited();
          await new Promise(function (r) { setTimeout(r, (i === 0 ? 150 : 700 * Math.pow(2, i - 1)) + Math.random() * 300); });
        }
      }
    }
    function client(privateKey, keyed) {
      var TW = TronWebClass();
      var conf = { fullHost: net.fullHost };
      if (apiKey && keyed !== false) conf.headers = { 'TRON-PRO-API-KEY': apiKey };
      if (privateKey) conf.privateKey = privateKey;
      return new TW(conf);
    }

    return {
      network: net,

      isValidAddress: function (addr) {
        var TW = TronWebClass();
        return typeof addr === 'string' && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr) && TW.isAddress(addr);
      },

      generateMnemonic: function () {
        var TW = TronWebClass();
        var acc = TW.createRandom(undefined, DERIVATION_PATH);
        return acc.mnemonic.phrase;
      },

      validateMnemonic: function (m) {
        var words = normalizeMnemonic(m).split(' ');
        if (words.length !== 12 && words.length !== 24) return false;
        try { accountFromMnemonic(m); return true; } catch (e) { return false; }
      },

      hasWallet: async function () {
        return !!(await storage().get(VAULT_KEY));
      },

      // حفظ المحفظة مشفّرة برمز PIN
      saveWallet: async function (mnemonic, pin) {
        if (!/^\d{6}$/.test(pin)) throw new Error('PIN_FORMAT');
        var acc = accountFromMnemonic(mnemonic);
        var box = await encryptSecret(normalizeMnemonic(mnemonic), pin, await deviceKey());
        box.address = acc.address; // العنوان عام، لا بأس بحفظه لعرض الرصيد قبل فتح القفل
        if (acc.evm) box.evmAddress = acc.evm.address;
        await storage().set(VAULT_KEY, JSON.stringify(box));
        await storage().remove(GUARD_KEY);
        session = acc;
        return acc.address;
      },

      getAddress: async function () {
        if (session) return session.address;
        var raw = await storage().get(VAULT_KEY);
        return raw ? JSON.parse(raw).address : null;
      },

      unlock: async function (pin) {
        var v = await openVault(pin);
        session = accountFromMnemonic(v.mnemonic);
        return session.address;
      },

      lock: function () { session = null; },
      isUnlocked: function () { return !!session; },

      revealMnemonic: async function (pin) {
        return (await openVault(pin)).mnemonic;
      },

      // تغيير رمز القفل: فك التشفير بالقديم ثم إعادة التشفير بالجديد
      changePin: async function (oldPin, newPin) {
        if (!/^\d{6}$/.test(newPin)) throw new Error('PIN_FORMAT');
        var v = await openVault(oldPin);
        var box = keepPublic(await encryptSecret(v.mnemonic, newPin, await deviceKey()), v.box);
        await storage().set(VAULT_KEY, JSON.stringify(box));
        return true;
      },

      verifyPin: async function (pin) {
        await openVault(pin);
        return true;
      },

      lockoutRemaining: async function () {
        var g = await readGuard();
        return Math.max(0, g.until - Date.now());
      },

      // مستوى حماية المحفظة الحالية: 'device' (Keystore + PIN) أو 'pin'
      protectionLevel: async function () { var raw = await storage().get(VAULT_KEY); return raw && JSON.parse(raw).dk ? 'device' : 'pin'; },
      wipe: async function () { session = null; await storage().remove(VAULT_KEY); await storage().remove(GUARD_KEY); },

      getBalances: async function (address) {
        var addr = address || (await this.getAddress());
        var trxSun = await readRetry(function (k) { var tw = client(null, k); return tw.trx.getBalance(addr); });
        var usdtRaw = await readRetry(function (k) {
          var tw = client(null, k); tw.setAddress(addr);
          return tw.contract(TRC20_ABI, net.usdt).balanceOf(addr).call();
        });
        var usdtUnits = BigInt(usdtRaw.toString());
        return {
          trxUnits: BigInt(trxSun),
          usdtUnits: usdtUnits,
          trx: formatAmount(trxSun, TRX_DECIMALS),
          usdt: formatAmount(usdtUnits, USDT_DECIMALS)
        };
      },

      sendUSDT: async function (to, amountStr) {
        if (!session) throw new Error('LOCKED');
        if (!this.isValidAddress(to)) throw new Error('INVALID_ADDRESS');
        if (to === session.address) throw new Error('SELF_SEND');
        var units = toUnits(amountStr, USDT_DECIMALS);
        var bal = await this.getBalances(session.address);
        if (units > bal.usdtUnits) throw new Error('INSUFFICIENT_USDT');
        if (bal.trxUnits < 5000000n) throw new Error('LOW_TRX_FOR_FEES');
        var tw = client(session.privateKey);
        var contract = tw.contract(TRC20_ABI, net.usdt);
        var txid = await contract.transfer(to, units.toString()).send({ feeLimit: FEE_LIMIT_SUN });
        var status = await waitForTx(txid, true);
        return { txid: txid, url: net.explorer + txid, status: status };
      },

      sendTRX: async function (to, amountStr) {
        if (!session) throw new Error('LOCKED');
        if (!this.isValidAddress(to)) throw new Error('INVALID_ADDRESS');
        if (to === session.address) throw new Error('SELF_SEND');
        var units = toUnits(amountStr, TRX_DECIMALS);
        var bal = await this.getBalances(session.address);
        if (units > bal.trxUnits) throw new Error('INSUFFICIENT_TRX');
        var tw = client(session.privateKey);
        var res = await tw.trx.sendTransaction(to, Number(units));
        var txid = res && (res.txid || (res.transaction && res.transaction.txID));
        if (!res || !res.result || !txid) throw new Error('TX_FAILED');
        var status = await waitForTx(txid, false);
        return { txid: txid, url: net.explorer + txid, status: status };
      },

      // توقيع طلب لخادم P2P: يثبت ملكية المحفظة بدون إرسال المفتاح الخاص
      signRequest: async function (action, params) {
        if (!session) throw new Error('LOCKED');
        var nonce = Array.prototype.map.call(randomBytes(16), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        var message = JSON.stringify({ action: action, params: params || {}, address: session.address, ts: Date.now(), nonce: nonce });
        var tw = client(session.privateKey);
        var signature = await tw.trx.signMessageV2(message, session.privateKey);
        return { message: message, signature: signature };
      },

      // ===== التبديل عبر SunSwap V2 =====
      // direction: 'TRX_USDT' أو 'USDT_TRX'
      swapSupported: async function () {
        if (!net.swap) return false;
        if (swapChecked !== null) return swapChecked;
        try {
          var tw = client();
          tw.setAddress(net.swap.router);
          var router = tw.contract(ROUTER_ABI, net.swap.router);
          var weth = await router.WETH().call();
          var ok = normalizeAddress(tw, weth) === net.swap.wtrx;
          // نتذكّر النجاح فقط؛ الفشل (شبكة ضعيفة مثلاً) يُعاد فحصه في المرة القادمة
          if (ok) swapChecked = true;
          return ok;
        } catch (e) { return false; }
      },

      // العمولة بالـ TRX لعملية تبديل: من مبلغ TRX الداخل، أو من الحد الأدنى لـ TRX المستلَم
      feeEnabled: function () {
        var TW = TronWebClass();
        return !!feeAddress && feeBps > 0n && TW.isAddress(feeAddress);
      },
      feeRateText: function () { return (Number(feeBps) / 100) + '%'; },
      swapFeeUnits: function (direction, inUnits, minOutUnits) {
        if (!this.feeEnabled()) return 0n;
        var base = direction === 'TRX_USDT' ? inUnits : minOutUnits;
        var fee = base * feeBps / 10000n;
        return fee >= MIN_FEE_SUN ? fee : 0n;
      },

      quoteSwap: async function (direction, amountStr) {
        if (!(await this.swapSupported())) throw new Error('SWAP_UNAVAILABLE');
        var units = toUnits(amountStr, 6);
        var path = direction === 'TRX_USDT' ? [net.swap.wtrx, net.usdt] : [net.usdt, net.swap.wtrx];
        var tw = client();
        tw.setAddress(net.swap.router);
        var router = tw.contract(ROUTER_ABI, net.swap.router);
        var res = await router.getAmountsOut(units.toString(), path).call();
        var amounts = res.amounts || res[0] || res;
        var out = BigInt(amounts[amounts.length - 1].toString());
        if (out <= 0n) throw new Error('NO_LIQUIDITY');
        return { inUnits: units, outUnits: out, out: fromUnits(out, 6), path: path };
      },

      // quotedOut: المبلغ الذي رآه المستخدم؛ الحد الأدنى يُحسب منه حتى لا يقبل سعراً أسوأ مما وافق عليه
      swap: async function (direction, amountStr, slippageBps, quotedOut) {
        if (!session) throw new Error('LOCKED');
        var q = await this.quoteSwap(direction, amountStr);
        var bps = BigInt(slippageBps == null ? 50 : slippageBps);
        var ref = q.outUnits;
        if (quotedOut) { var shown = toUnits(quotedOut, 6); if (shown < ref) ref = shown; }
        var minOut = ref * (10000n - bps) / 10000n;
        if (q.outUnits < minOut) throw new Error('PRICE_MOVED');
        var deadline = Math.floor(Date.now() / 1000) + 600;
        var bal = await this.getBalances(session.address);
        var tw = client(session.privateKey);
        var router = tw.contract(ROUTER_ABI, net.swap.router);
        var txid;
        if (direction === 'TRX_USDT') {
          // نترك 15 TRX على الأقل للرسوم
          var feeIn = this.swapFeeUnits(direction, q.inUnits, minOut);
          if (q.inUnits + feeIn + 15000000n > bal.trxUnits) throw new Error('INSUFFICIENT_TRX_SWAP');
          txid = await router.swapExactETHForTokens(minOut.toString(), q.path, session.address, deadline)
            .send({ callValue: Number(q.inUnits), feeLimit: FEE_LIMIT_SUN });
        } else {
          if (q.inUnits > bal.usdtUnits) throw new Error('INSUFFICIENT_USDT');
          if (bal.trxUnits < 15000000n) throw new Error('LOW_TRX_FOR_FEES');
          var usdt = tw.contract(TRC20_ABI, net.usdt);
          var allowance = BigInt((await usdt.allowance(session.address, net.swap.router).call()).toString());
          if (allowance < q.inUnits) {
            // موافقة لمرة واحدة بالمبلغ المطلوب فقط (وليس موافقة غير محدودة)
            var approveTx = await usdt.approve(net.swap.router, q.inUnits.toString()).send({ feeLimit: FEE_LIMIT_SUN });
            // لا نبدّل قبل تأكيد الموافقة على الشبكة
            if ((await waitForTx(approveTx, true, 60000)) !== 'SUCCESS') throw new Error('APPROVE_PENDING');
          }
          txid = await router.swapExactTokensForETH(q.inUnits.toString(), minOut.toString(), q.path, session.address, deadline)
            .send({ feeLimit: FEE_LIMIT_SUN });
        }
        var status = await waitForTx(txid, true);
        // العمولة بعد نجاح التبديل فقط؛ فشلها لا يُفشل التبديل
        var feeUnits = status === 'SUCCESS' ? this.swapFeeUnits(direction, q.inUnits, minOut) : 0n;
        var feePaid = '0';
        if (feeUnits > 0n && feeAddress !== session.address) {
          try {
            var fres = await tw.trx.sendTransaction(feeAddress, Number(feeUnits));
            if (fres && fres.result) feePaid = fromUnits(feeUnits, 6);
          } catch (e) { /* نتجاهل: المستخدم حصل على التبديل كاملاً */ }
        }
        return { txid: txid, url: net.explorer + txid, out: q.out, minOut: fromUnits(minOut, 6), status: status, fee: feePaid };
      },

      // آخر المعاملات: USDT (TRC20) وTRX معاً، مرتّبة من الأحدث
      // ===== الشبكات المتوافقة مع EVM =====
      evmEnabled: function () { return !!E() && net === NETWORKS.mainnet && opts.evm === true; },
      evmChains: function () { return EVM_CHAINS; },
      evmAddress: async function () {
        if (session && session.evm) return session.evm.address;
        var raw = await storage().get(VAULT_KEY);
        return raw ? (JSON.parse(raw).evmAddress || null) : null;
      },
      isEvmAddress: function (a) { var ethers = E(); return !!ethers && /^0x[0-9a-fA-F]{40}$/.test(String(a || '')) && ethers.isAddress(a); },
      // أرصدة كل الشبكات: { bsc: { native: units, USDT: units, USDC: units } | null, ... }
      evmBalances: async function () {
        var addr = await this.evmAddress(); if (!addr) return null;
        var out = {};
        await Promise.all(Object.keys(EVM_CHAINS).map(async function (k) {
          var c = EVM_CHAINS[k];
          try {
            out[k] = await evmCall(c, async function (p) {
              var ethers = E(), iface = new ethers.Interface(ERC20_IFACE_ABI), r = {};
              var calls = [p.getBalance(addr)].concat(c.tokens.map(function (t) {
                return p.call({ to: t.addr, data: iface.encodeFunctionData('balanceOf', [addr]) });
              }));
              var res = await Promise.all(calls);
              r.native = BigInt(res[0]);
              c.tokens.forEach(function (t, i) { r[t.sym] = BigInt(iface.decodeFunctionResult('balanceOf', res[i + 1])[0]); });
              return r;
            });
          } catch (e) { out[k] = null; }
        }));
        return out;
      },
      // إرسال عملة أصلية أو USDT/USDC على شبكة EVM. نوقّع المعاملة مرة واحدة ثم نبثّها
      // (إعادة بث نفس المعاملة الموقّعة لخادم آخر آمنة: لها نفس الرقم ولا تُنفَّذ مرتين)
      evmSend: async function (chainKey, sym, to, amountStr) {
        if (!session || !session.evm) throw new Error('LOCKED');
        var ethers = E(), c = EVM_CHAINS[chainKey];
        if (!c) throw new Error('BAD_NETWORK');
        if (!this.isEvmAddress(to)) throw new Error('INVALID_EVM_ADDRESS');
        to = ethers.getAddress(to);
        if (to.toLowerCase() === session.evm.address.toLowerCase()) throw new Error('SELF_SEND');
        var isNative = sym === c.native, tok = isNative ? null : c.tokens.filter(function (t) { return t.sym === sym; })[0];
        if (!isNative && !tok) throw new Error('BAD_TOKEN');
        var units = toUnits(amountStr, isNative ? 18 : tok.dec);
        if (units <= 0n) throw new Error('INVALID_AMOUNT');
        var from = session.evm.address, iface = new ethers.Interface(ERC20_IFACE_ABI);
        var tx = isNative ? { to: to, value: units, data: '0x' } : { to: tok.addr, value: 0n, data: iface.encodeFunctionData('transfer', [to, units]) };
        var signed = await evmCall(c, async function (p) {
          var bal = BigInt(await p.getBalance(from));
          if (!isNative) {
            var tb = BigInt(iface.decodeFunctionResult('balanceOf', await p.call({ to: tok.addr, data: iface.encodeFunctionData('balanceOf', [from]) }))[0]);
            if (tb < units) throw new Error('INSUFFICIENT_TOKEN');
          }
          var nonce = await p.getTransactionCount(from, 'pending');
          var fee = await p.getFeeData();
          var gas = BigInt(await p.estimateGas({ from: from, to: tx.to, value: tx.value, data: tx.data }));
          gas = gas * 12n / 10n;
          var t = { chainId: c.id, nonce: nonce, to: tx.to, value: tx.value, data: tx.data, gasLimit: gas };
          var price;
          if (fee.maxFeePerGas) { t.type = 2; t.maxFeePerGas = fee.maxFeePerGas; t.maxPriorityFeePerGas = fee.maxPriorityFeePerGas || 0n; price = fee.maxFeePerGas; }
          else { t.type = 0; t.gasPrice = fee.gasPrice; price = fee.gasPrice; }
          var cost = gas * BigInt(price) + (isNative ? units : 0n);
          if (bal < cost) throw new Error(isNative ? 'INSUFFICIENT_NATIVE' : 'LOW_GAS');
          return new ethers.Wallet(session.evm.privateKey).signTransaction(t);
        });
        var hash = ethers.Transaction.from(signed).hash;
        await evmCall(c, function (p) { return p.broadcastTransaction(signed).catch(function (e) {
          // إن كانت المعاملة بُثّت من قبل فهذا نجاح
          if (/already known|nonce too low|ALREADY_EXISTS/i.test(String(e && (e.message || e.shortMessage)))) return null;
          throw e;
        }); });
        // انتظار التأكيد حتى ~40 ثانية
        var status = 'PENDING';
        for (var i = 0; i < 13; i++) {
          await new Promise(function (r) { setTimeout(r, 3000); });
          try {
            var rc = await evmCall(c, function (p) { return p.getTransactionReceipt(hash); });
            if (rc) { if (rc.status === 0) throw new Error('TX_FAILED'); status = 'SUCCESS'; break; }
          } catch (e) { if (e.message === 'TX_FAILED') throw e; }
        }
        return { txid: hash, url: c.explorer + '/tx/' + hash, status: status };
      },
      // ===== نقل بين الشبكات عبر LI.FI (بدون مفتاح؛ الحد لكل جهاز) =====
      bridgeEnabled: function () { return this.evmEnabled() && opts.bridge !== false; },
      // toSym اختياري: عند تساويه مع الشبكة نفسها يصبح تبديلاً داخل الشبكة (مثل USDT ↔ BNB على BNB Chain)
      bridgeQuote: async function (fromNet, toNet, sym, amountStr, toSym) {
        if (!session) throw new Error('LOCKED');
        toSym = toSym || sym;
        if (fromNet === toNet && (fromNet === 'tron' || toSym === sym)) throw new Error('SAME_NETWORK');
        var a = bridgeAsset(fromNet, sym), b = bridgeAsset(toNet, toSym);
        if (!a || !b) throw new Error('BAD_TOKEN');
        var units = toUnits(amountStr, a.dec);
        if (units <= 0n) throw new Error('INVALID_AMOUNT');
        var maxU = Number(opts.bridgeMax || 2000);
        if (/^(USDT|USDC)$/.test(sym) && Number(amountStr) > maxU) throw new Error('BRIDGE_MAX');
        var fromAddr = fromNet === 'tron' ? session.address : session.evm && session.evm.address;
        var toAddr = toNet === 'tron' ? session.address : session.evm && session.evm.address;
        if (!fromAddr || !toAddr) throw new Error('LOCKED');
        var p = { fromChain: a.chain, toChain: b.chain, fromToken: a.addr, toToken: b.addr, fromAmount: units.toString(),
          fromAddress: fromAddr, toAddress: toAddr, slippage: '0.005', order: 'CHEAPEST', integrator: opts.lifiIntegrator || 'sarra-wallet' };
        if (opts.lifiFee && Number(opts.lifiFee) > 0) p.fee = String(Math.min(Number(opts.lifiFee), 0.01));
        var r;
        try { r = await lifi('/quote?' + new URLSearchParams(p).toString()); }
        catch (e) {
          // إن رفضت الخدمة العمولة على مسار ما (مثل بعض مسارات TRON) نعرض النقل بدون عمولة بدل أن يفشل
          if (!p.fee || e.message === 'BRIDGE_BUSY') throw e;
          delete p.fee; r = await lifi('/quote?' + new URLSearchParams(p).toString());
        }
        var est = r.estimate || {}, sum = function (xs) { return (xs || []).reduce(function (s, x) { return s + Number(x.amountUSD || 0); }, 0); };
        return { fromNet: fromNet, toNet: toNet, sym: sym, toSym: toSym, amount: amountStr, units: units, tool: (r.toolDetails && r.toolDetails.name) || r.tool || '',
          toAmount: fromUnits(BigInt(est.toAmount || 0), b.dec), toAmountMin: fromUnits(BigInt(est.toAmountMin || 0), b.dec),
          feesUsd: sum((est.feeCosts || []).filter(function (x) { return !/integrator/i.test(x.name || ''); })), gasUsd: sum(est.gasCosts),
          gasNative: fromUnits((est.gasCosts || []).reduce(function (s2, x) { return s2 + BigInt(x.amount || 0); }, 0n), 18), seconds: Number(est.executionDuration || 0),
          appFee: p.fee ? Number(p.fee) : 0, approval: est.skipApproval ? '' : (est.approvalAddress || ''), token: a, tx: r.transactionRequest || null, at: Date.now(),
          action: r.action || {}, toAddr: toAddr, toTok: b };
      },
      bridgeExecute: async function (q) {
        if (!session) throw new Error('LOCKED');
        if (!q || !q.tx) throw new Error('NO_ROUTE');
        if (Date.now() - q.at > 9 * 60000) throw new Error('QUOTE_EXPIRED');
        verifyBridgeQuote(q);
        var txHash;
        if (q.fromNet === 'tron') {
          var tw = client(session.privateKey);
          var bal = await this.getBalances(session.address);
          if (bal.trxUnits < 20000000n) throw new Error('LOW_TRX_FOR_FEES');
          if (q.token.addr !== TRX_LIFI) {
            if (bal.usdtUnits < q.units) throw new Error('INSUFFICIENT_USDT');
            if (q.approval) {
              var tok = tw.contract(TRC20_ABI, q.token.addr);
              var al = BigInt((await tok.allowance(session.address, q.approval).call()).toString());
              if (al < q.units) {
                var ap = await tok.approve(q.approval, q.units.toString()).send({ feeLimit: FEE_LIMIT_SUN });
                if ((await waitForTx(ap, true, 60000)) !== 'SUCCESS') throw new Error('APPROVE_PENDING');
              }
            }
          }
          var raw = q.tx.customData && q.tx.customData.tronTransaction;
          if (!raw || !raw.raw_data) throw new Error('NO_ROUTE');
          verifyTronBridgeTx(tw, raw, q);
          var signedT = await tw.trx.sign(raw, session.privateKey);
          var res = await tw.trx.sendRawTransaction(signedT);
          if (!res || res.result !== true) throw new Error('TX_FAILED');
          txHash = res.txid || (res.transaction && res.transaction.txID) || raw.txID;
          if ((await waitForTx(txHash, true)) === 'FAILED') throw new Error('TX_FAILED');
        } else {
          var c = EVM_CHAINS[q.fromNet], ethers = E();
          if (q.approval && q.token.addr !== EVM_NATIVE) {
            var iface = new ethers.Interface(ERC20_IFACE_ABI), me = session.evm.address;
            var cur = await evmCall(c, async function (p) { return BigInt(iface.decodeFunctionResult('allowance', await p.call({ to: q.token.addr, data: iface.encodeFunctionData('allowance', [me, q.approval]) }))[0]); });
            if (cur < q.units) await evmExec(c, { to: q.token.addr, value: 0n, data: iface.encodeFunctionData('approve', [q.approval, q.units]) }, true);
          }
          txHash = await evmExec(c, { to: q.tx.to, value: BigInt(q.tx.value || 0), data: q.tx.data || '0x', gasLimit: q.tx.gasLimit ? BigInt(q.tx.gasLimit) : null }, false);
        }
        return { txid: txHash, fromNet: q.fromNet, toNet: q.toNet };
      },
      // DONE | FAILED | PENDING (+ رابط التتبع)
      bridgeStatus: async function (txid, fromNet, toNet) {
        try {
          var r = await lifi('/status?' + new URLSearchParams({ txHash: txid, fromChain: bridgeChain(fromNet), toChain: bridgeChain(toNet) }).toString());
          var s = r.status === 'DONE' ? (r.substatus === 'REFUNDED' ? 'REFUNDED' : 'DONE') : r.status === 'FAILED' ? 'FAILED' : 'PENDING';
          return { status: s, link: r.lifiExplorerLink || '', received: r.receiving && r.receiving.amount ? r.receiving.amount : '' };
        } catch (e) { return { status: 'PENDING', link: '' }; }
      },
      evmExplorer: async function (chainKey) { var a = await this.evmAddress(); var c = EVM_CHAINS[chainKey]; return c && a ? c.explorer + '/address/' + a : ''; },

      getHistory: async function (address, limit) {
        var addr = address || (await this.getAddress());
        var n = limit || 20;
        var hdr = function (k) { return k && apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {}; };
        var hexTw = client(null, false);
        var usdtReq = readRetry(function (k) {
          return fetch(net.fullHost + '/v1/accounts/' + addr + '/transactions/trc20?limit=' + n + '&contract_address=' + net.usdt, { headers: hdr(k) })
            .then(function (r) { if (!r.ok) throw new Error(r.status === 429 ? 'RATE_429' : 'HISTORY_FAILED'); return r.json(); });
        });
        var trxReq = readRetry(function (k) {
          return fetch(net.fullHost + '/v1/accounts/' + addr + '/transactions?limit=' + n + '&only_confirmed=true', { headers: hdr(k) })
            .then(function (r) { if (r.status === 429) throw new Error('RATE_429'); return r.ok ? r.json() : { data: [] }; });
        })
          .catch(function () { return { data: [] }; });
        var results = await Promise.all([usdtReq, trxReq]);
        var list = (results[0].data || []).map(function (t) {
          var incoming = t.to === addr;
          return {
            coin: 'USDT', txid: t.transaction_id, incoming: incoming,
            counterparty: incoming ? t.from : t.to,
            amount: formatAmount(t.value, Number(t.token_info && t.token_info.decimals) || USDT_DECIMALS),
            time: t.block_timestamp
          };
        });
        (results[1].data || []).forEach(function (t) {
          var c = t.raw_data && t.raw_data.contract && t.raw_data.contract[0];
          if (!c || c.type !== 'TransferContract') return;
          if (t.ret && t.ret[0] && t.ret[0].contractRet && t.ret[0].contractRet !== 'SUCCESS') return;
          var v = c.parameter && c.parameter.value;
          if (!v) return;
          var from = hexTw.address.fromHex(v.owner_address), to = hexTw.address.fromHex(v.to_address);
          var incoming = to === addr;
          list.push({
            coin: 'TRX', txid: t.txID, incoming: incoming,
            counterparty: incoming ? from : to,
            amount: formatAmount(v.amount, TRX_DECIMALS),
            time: t.block_timestamp
          });
        });
        list.sort(function (a, b) { return b.time - a.time; });
        return list.slice(0, n);
      }
    };
  }

  var ERRORS_AR = {
    INVALID_EVM_ADDRESS: 'العنوان غير صحيح لهذه الشبكة. عناوين BNB Chain وEthereum وPolygon تبدأ بـ 0x',
    INSUFFICIENT_TOKEN: 'الرصيد غير كافٍ على هذه الشبكة',
    SAME_NETWORK: 'اختر شبكتين مختلفتين',
    BRIDGE_MAX: 'الحد الأقصى للنقل الواحد 2000 دولار. قسّم المبلغ على أكثر من عملية',
    NO_ROUTE: 'لا يوجد مسار نقل لهذا المبلغ حالياً. جرّب مبلغاً أكبر أو شبكة أخرى',
    BRIDGE_BUSY: 'خدمة النقل مشغولة الآن. انتظر دقيقة وحاول مجدداً',
    BRIDGE_NETWORK: 'تعذّر الوصول لخدمة النقل. تحقق من الإنترنت وحاول مجدداً',
    QUOTE_EXPIRED: 'انتهت صلاحية السعر. اطلب سعراً جديداً',
    ROUTE_MISMATCH: 'رفضنا هذا المسار لأن بيانات المعاملة لا تطابق ما طلبته. لم يُرسل أي مبلغ. اطلب سعراً جديداً',
    INSUFFICIENT_NATIVE: 'الرصيد غير كافٍ للمبلغ مع رسوم الشبكة',
    LOW_GAS: 'تحتاج عملة الشبكة (BNB أو ETH أو POL) في محفظتك لدفع رسوم الإرسال على هذه الشبكة',
    EVM_NETWORK: 'تعذّر الاتصال بالشبكة. تحقق من الإنترنت وحاول مجدداً',
    BAD_NETWORK: 'شبكة غير مدعومة', BAD_TOKEN: 'عملة غير مدعومة على هذه الشبكة',
    INVALID_AMOUNT: 'المبلغ غير صحيح',
    TOO_MANY_DECIMALS: 'أقصى عدد للخانات العشرية 6',
    DEVICE_KEY_LOST: 'تعذّر الوصول لمفتاح الحماية المحفوظ في هاتفك (يحدث بعد إعادة ضبط الهاتف أو نقل البيانات). احذف المحفظة من الأمان واستعدها بكلماتك الـ 12، فأموالك آمنة على الشبكة',
    WRONG_PIN: 'رمز القفل غير صحيح',
    LOCKED_OUT: 'محاولات كثيرة خاطئة. انتظر قليلاً ثم حاول مجدداً',
    PIN_FORMAT: 'رمز القفل يجب أن يكون 6 أرقام',
    NO_WALLET: 'لا توجد محفظة على هذا الجهاز',
    LOCKED: 'افتح القفل أولاً',
    INVALID_ADDRESS: 'عنوان غير صالح على شبكة TRON',
    SELF_SEND: 'لا يمكنك الإرسال لنفس محفظتك',
    INSUFFICIENT_USDT: 'رصيد USDT غير كافٍ',
    LOW_TRX_FOR_FEES: 'رصيد الرسوم غير كافٍ. رسوم الشبكة تُدفع بعملة TRX، أرسل إلى محفظتك 15 TRX على الأقل عبر شبكة TRON (TRC20)',
    TX_FAILED: 'فشلت المعاملة على الشبكة. غالباً بسبب عدم كفاية رصيد TRX للرسوم. لم يُرسَل المبلغ، لكن قد تُخصم رسوم الشبكة',
    HISTORY_FAILED: 'تعذّر تحميل السجل',
    SWAP_UNAVAILABLE: 'التبديل غير متاح حالياً على هذه الشبكة',
    NO_LIQUIDITY: 'لا توجد سيولة كافية لهذا التبديل',
    INSUFFICIENT_TRX: 'رصيد TRX غير كافٍ',
    PRICE_MOVED: 'تغيّر السعر أكثر من الحد المسموح. راجع المبلغ الجديد وحاول مجدداً',
    APPROVE_PENDING: 'لم تُؤكَّد الموافقة بعد على الشبكة. انتظر دقيقة ثم أعد التبديل',
    INSUFFICIENT_TRX_SWAP: 'رصيد TRX غير كافٍ. يجب أن يبقى 15 TRX على الأقل للرسوم',
    TRONWEB_NOT_LOADED: 'تعذّر تحميل مكتبة الشبكة'
  };
  function errorText(e) {
    var code = e && e.message;
    return ERRORS_AR[code] || 'حدث خطأ في الاتصال بالشبكة. تحقق من الإنترنت وحاول مجدداً';
  }

  var api = {
    normalizeAddress: normalizeAddress,
    EVM_CHAINS: EVM_CHAINS,
    evmFromMnemonic: evmFromMnemonic,
    createCore: createCore,
    errorText: errorText,
    toUnits: toUnits,
    fromUnits: fromUnits,
    formatAmount: formatAmount,
    encryptSecret: encryptSecret,
    decryptSecret: decryptSecret,
    NETWORKS: NETWORKS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WalletCore = api;
})(typeof window !== 'undefined' ? window : globalThis);

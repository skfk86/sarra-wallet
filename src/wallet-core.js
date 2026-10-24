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
  async function encryptSecret(secret, pin) {
    var salt = randomBytes(16);
    var iv = randomBytes(12);
    var key = await deriveKey(pin, salt);
    var ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(secret));
    return { v: 1, kdf: 'PBKDF2-SHA256', it: PBKDF2_ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  async function decryptSecret(box, pin) {
    try {
      var salt = unb64(box.salt);
      var key = await subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']).then(function (base) {
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
    return { address: acc.address, privateKey: pk };
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
      try {
        var mnemonic = await decryptSecret(box, pin);
        if (g.fails) await storage().set(GUARD_KEY, JSON.stringify({ fails: 0, until: 0 }));
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

    function client(privateKey) {
      var TW = TronWebClass();
      var conf = { fullHost: net.fullHost };
      if (apiKey) conf.headers = { 'TRON-PRO-API-KEY': apiKey };
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
        var box = await encryptSecret(normalizeMnemonic(mnemonic), pin);
        box.address = acc.address; // العنوان عام، لا بأس بحفظه لعرض الرصيد قبل فتح القفل
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
        var box = await encryptSecret(v.mnemonic, newPin);
        box.address = v.box.address;
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

      wipe: async function () { session = null; await storage().remove(VAULT_KEY); await storage().remove(GUARD_KEY); },

      getBalances: async function (address) {
        var addr = address || (await this.getAddress());
        var tw = client();
        tw.setAddress(addr);
        var trxSun = await tw.trx.getBalance(addr);
        var contract = tw.contract(TRC20_ABI, net.usdt);
        var usdtRaw = await contract.balanceOf(addr).call();
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
          var wethB58 = typeof weth === 'string' && weth.indexOf('41') === 0 ? tw.address.fromHex(weth) : String(weth);
          swapChecked = wethB58 === net.swap.wtrx;
        } catch (e) { swapChecked = false; }
        return swapChecked;
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

      // آخر معاملات USDT (TRC20) من TronGrid
      getHistory: async function (address, limit) {
        var addr = address || (await this.getAddress());
        var url = net.fullHost + '/v1/accounts/' + addr + '/transactions/trc20?limit=' + (limit || 20) + '&contract_address=' + net.usdt;
        var res = await fetch(url, { headers: apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {} });
        if (!res.ok) throw new Error('HISTORY_FAILED');
        var json = await res.json();
        return (json.data || []).map(function (t) {
          var incoming = t.to === addr;
          return {
            txid: t.transaction_id,
            incoming: incoming,
            counterparty: incoming ? t.from : t.to,
            amount: formatAmount(t.value, Number(t.token_info && t.token_info.decimals) || USDT_DECIMALS),
            time: t.block_timestamp
          };
        });
      }
    };
  }

  var ERRORS_AR = {
    INVALID_AMOUNT: 'المبلغ غير صحيح',
    TOO_MANY_DECIMALS: 'أقصى عدد للخانات العشرية 6',
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

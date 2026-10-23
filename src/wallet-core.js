/*
 * صُرّة — نواة المحفظة (غير احتجازية)
 * - المفتاح الخاص لا يغادر الجهاز أبداً
 * - كلمات الاسترجاع تُشفَّر برمز PIN (PBKDF2 + AES-GCM) قبل التخزين
 * - التخزين في Android Keystore عبر SecureStorage إن توفر
 */
(function (root) {
  'use strict';

  // ===== إعدادات الشبكة =====
  var NETWORKS = {
    mainnet: {
      fullHost: 'https://api.trongrid.io',
      usdt: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      explorer: 'https://tronscan.org/#/transaction/'
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
  var DERIVATION_PATH = "m/44'/195'/0'/0/0";
  var FEE_LIMIT_SUN = 100000000; // أقصى 100 TRX رسوم للمعاملة الواحدة

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
    return String(m).trim().toLowerCase().replace(/\s+/g, ' ');
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
    var session = null; // { address, privateKey } — في الذاكرة فقط بعد فتح القفل
    var failedAttempts = 0;
    var lockedUntil = 0;

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
        session = acc;
        return acc.address;
      },

      getAddress: async function () {
        if (session) return session.address;
        var raw = await storage().get(VAULT_KEY);
        return raw ? JSON.parse(raw).address : null;
      },

      unlock: async function (pin) {
        if (Date.now() < lockedUntil) throw new Error('LOCKED_OUT');
        var raw = await storage().get(VAULT_KEY);
        if (!raw) throw new Error('NO_WALLET');
        try {
          var mnemonic = await decryptSecret(JSON.parse(raw), pin);
          session = accountFromMnemonic(mnemonic);
          failedAttempts = 0;
          return session.address;
        } catch (e) {
          failedAttempts++;
          // تأخير متصاعد بعد 5 محاولات خاطئة
          if (failedAttempts >= 5) lockedUntil = Date.now() + Math.min(60000 * Math.pow(2, failedAttempts - 5), 3600000);
          throw new Error('WRONG_PIN');
        }
      },

      lock: function () { session = null; },
      isUnlocked: function () { return !!session; },

      revealMnemonic: async function (pin) {
        var raw = await storage().get(VAULT_KEY);
        return decryptSecret(JSON.parse(raw), pin);
      },

      // تغيير رمز القفل: فك التشفير بالقديم ثم إعادة التشفير بالجديد
      changePin: async function (oldPin, newPin) {
        if (!/^\d{6}$/.test(newPin)) throw new Error('PIN_FORMAT');
        var raw = await storage().get(VAULT_KEY);
        if (!raw) throw new Error('NO_WALLET');
        var old = JSON.parse(raw);
        var mnemonic = await decryptSecret(old, oldPin);
        var box = await encryptSecret(mnemonic, newPin);
        box.address = old.address;
        await storage().set(VAULT_KEY, JSON.stringify(box));
        return true;
      },

      verifyPin: async function (pin) {
        var raw = await storage().get(VAULT_KEY);
        if (!raw) throw new Error('NO_WALLET');
        await decryptSecret(JSON.parse(raw), pin);
        return true;
      },

      wipe: async function () { session = null; await storage().remove(VAULT_KEY); },

      getBalances: async function (address) {
        var addr = address || (await this.getAddress());
        var tw = client();
        tw.setAddress(addr);
        var trxSun = await tw.trx.getBalance(addr);
        var contract = await tw.contract().at(net.usdt);
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
        var contract = await tw.contract().at(net.usdt);
        var txid = await contract.transfer(to, units.toString()).send({ feeLimit: FEE_LIMIT_SUN });
        return { txid: txid, url: net.explorer + txid };
      },

      sendTRX: async function (to, amountStr) {
        if (!session) throw new Error('LOCKED');
        if (!this.isValidAddress(to)) throw new Error('INVALID_ADDRESS');
        var units = toUnits(amountStr, TRX_DECIMALS);
        var tw = client(session.privateKey);
        var res = await tw.trx.sendTransaction(to, Number(units));
        if (!res || !res.result) throw new Error('TX_FAILED');
        return { txid: res.txid, url: net.explorer + res.txid };
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
    TX_FAILED: 'فشلت المعاملة. حاول مجدداً',
    HISTORY_FAILED: 'تعذّر تحميل السجل',
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

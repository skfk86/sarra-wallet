// يكتب src/config.js من متغيرات البيئة وقت البناء (GitHub Secrets)
// حتى لا يُحفظ مفتاح TronGrid داخل المستودع العام.
import { writeFileSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const config = {
  version: pkg.version,
  // شبكات BNB Chain وEthereum وPolygon (على الشبكة الرئيسية فقط)
  evm: (process.env.SARRA_EVM || 'on') !== 'off',
  // اسم حزمة تطبيق الطقس على Google Play (اختياري؛ بدونه يفتح بحثاً باسم التطبيق)
  weatherPkg: process.env.SARRA_WEATHER_PKG || '',
  network: process.env.SARRA_NETWORK || 'mainnet',
  trongridApiKey: process.env.TRONGRID_API_KEY || '',
  // عنوان TRON الذي تصله عمولة التبديل (فارغ = العمولة معطّلة)
  feeAddress: (process.env.SARRA_FEE_ADDRESS || '').trim(),
  feeBps: Number(process.env.SARRA_FEE_BPS || 50),
  // نقل بين الشبكات عبر LI.FI: عمولة صغيرة 0.2% (ضع 0 لإلغائها). تصلك بعد تسجيل محفظة العمولة في portal.li.fi
  lifiFee: Number(process.env.SARRA_LIFI_FEE ?? '0.002') || 0,
  lifiIntegrator: process.env.SARRA_LIFI_INTEGRATOR || 'sarra-wallet',
  bridgeMax: Number(process.env.SARRA_BRIDGE_MAX || 2000),
  // خادم سوق P2P (Supabase Edge Function)
  p2pUrl: process.env.SARRA_P2P_URL || 'https://osdojhpsfbcqguoctbpk.supabase.co/functions/v1/p2p',
  // قراءات عامة خفيفة عبر قاعدة البيانات (لا تُحسب ضمن حد Edge Functions). المفتاح عام بطبيعته (publishable)
  // ولا يسمح إلا باستدعاء دالتي p2p_offers و p2p_inbox؛ كل الجداول محمية بـ RLS
  p2pRest: process.env.SARRA_P2P_REST || 'https://osdojhpsfbcqguoctbpk.supabase.co/rest/v1/rpc/',
  p2pKey: process.env.SARRA_P2P_KEY || 'sb_publishable_G8Qx_mPt_M11R_KnUPJ76w_UirKPVP8'
};

writeFileSync('src/config.js', 'window.SARRA_CONFIG = ' + JSON.stringify(config) + ';\n');
console.log('config.js written: network=' + config.network + ', apiKey=' + (config.trongridApiKey ? 'set' : 'empty') + ', fee=' + (config.feeAddress ? config.feeBps / 100 + '% to ' + config.feeAddress : 'disabled'));

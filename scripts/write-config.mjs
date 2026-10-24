// يكتب src/config.js من متغيرات البيئة وقت البناء (GitHub Secrets)
// حتى لا يُحفظ مفتاح TronGrid داخل المستودع العام.
import { writeFileSync } from 'node:fs';

const config = {
  network: process.env.SARRA_NETWORK || 'mainnet',
  trongridApiKey: process.env.TRONGRID_API_KEY || '',
  // عنوان TRON الذي تصله عمولة التبديل (فارغ = العمولة معطّلة)
  feeAddress: (process.env.SARRA_FEE_ADDRESS || '').trim(),
  feeBps: Number(process.env.SARRA_FEE_BPS || 50),
  // خادم سوق P2P (Supabase Edge Function)
  p2pUrl: process.env.SARRA_P2P_URL || 'https://osdojhpsfbcqguoctbpk.supabase.co/functions/v1/p2p'
};

writeFileSync('src/config.js', 'window.SARRA_CONFIG = ' + JSON.stringify(config) + ';\n');
console.log('config.js written: network=' + config.network + ', apiKey=' + (config.trongridApiKey ? 'set' : 'empty') + ', fee=' + (config.feeAddress ? config.feeBps / 100 + '% to ' + config.feeAddress : 'disabled'));

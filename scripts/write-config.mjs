// يكتب src/config.js من متغيرات البيئة وقت البناء (GitHub Secrets)
// حتى لا يُحفظ مفتاح TronGrid داخل المستودع العام.
import { writeFileSync } from 'node:fs';

const config = {
  network: process.env.SARRA_NETWORK || 'mainnet',
  trongridApiKey: process.env.TRONGRID_API_KEY || ''
};

writeFileSync('src/config.js', 'window.SARRA_CONFIG = ' + JSON.stringify(config) + ';\n');
console.log('config.js written: network=' + config.network + ', apiKey=' + (config.trongridApiKey ? 'set' : 'empty'));

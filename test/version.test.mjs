import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const v = JSON.parse(readFileSync(new URL('../docs/version.json', import.meta.url)));
assert.equal(v.latest, p.version, 'docs/version.json قديم: شغّل npm run version-file');
assert.equal(v.min, p.minVersion || '', 'docs/version.json قديم: شغّل npm run version-file');
assert.ok(!v.min || /^\d+\.\d+\.\d+$/.test(v.min));
console.log('✓ docs/version.json يطابق package.json');

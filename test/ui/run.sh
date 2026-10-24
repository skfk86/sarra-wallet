#!/usr/bin/env bash
# يشغّل سيناريوهين: شبكة الاختبار (التدفق الكامل) والشبكة الرئيسية (تبديل وعمولة وفشل)
set -e
run() {
  DIR=$(mktemp -d); mkdir -p "$DIR/vendor"
  cp src/index.html src/wallet-core.js "$DIR/"
  cp "test/ui/stubs/$2" "$DIR/vendor/tronweb.js"; cp test/ui/stubs/qrcode.js test/ui/stubs/jsqr.js "$DIR/vendor/"
  echo "window.SARRA_CONFIG = $3;" > "$DIR/config.js"
  echo "== $1 =="; python3 "test/ui/$4" "$DIR"
}
run "Nile: التدفق الكامل" tronweb.js '{"network":"nile","trongridApiKey":""}' run.py
run "Mainnet: التبديل والعمولة" tronweb-mainnet.js '{"network":"mainnet","feeAddress":"TFeeZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf","feeBps":50}' run_mainnet.py

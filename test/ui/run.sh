#!/usr/bin/env bash
# يشغّل سيناريوهين: شبكة الاختبار (التدفق الكامل) والشبكة الرئيسية (تبديل وعمولة وفشل)
set -e
run() {
  DIR=$(mktemp -d); mkdir -p "$DIR/vendor"
  cp -r src/index.html src/wallet-core.js src/assets "$DIR/"
  cp "test/ui/stubs/$2" "$DIR/vendor/tronweb.js"; cp test/ui/stubs/qrcode.js test/ui/stubs/jsqr.js "$DIR/vendor/"
  echo "window.SARRA_CONFIG = $3;" > "$DIR/config.js"
  echo "== $1 =="; python3 "test/ui/$4" "$DIR"
}
run "Nile: التدفق الكامل" tronweb.js '{"network":"nile","trongridApiKey":""}' run.py
run "Mainnet: التبديل والعمولة" tronweb-mainnet.js '{"network":"mainnet","feeAddress":"TFeeZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf","feeBps":50}' run_mainnet.py
run "P2P: السوق والطلبات" tronweb-mainnet.js '{"network":"mainnet","p2pUrl":"https://mock.supabase.co/functions/v1/p2p"}' run_p2p.py
run "التنقل بين الأقسام وحد الطلبات" tronweb-mainnet.js '{"network":"mainnet","p2pUrl":"https://mock.supabase.co/functions/v1/p2p"}' run_tabs.py
run "التوسع بتكلفة صفر" tronweb-mainnet.js '{"network":"mainnet","p2pUrl":"https://mock.supabase.co/functions/v1/p2p","p2pRest":"https://mock.supabase.co/rest/v1/rpc/","p2pKey":"sb_publishable_test"}' run_free.py
run "حذف المحفظة ثم إنشاء جديدة" tronweb-mainnet.js '{"network":"mainnet","p2pUrl":"https://mock.supabase.co/functions/v1/p2p"}' run_wipe.py
run "القائمة الجانبية" tronweb-mainnet.js '{"network":"mainnet","version":"0.1.0","feeAddress":"TFeeZ4bR8xLkP2vN9cW3jH5sD6fGa19xKf","feeBps":50}' run_menu.py
run "الإرسال برقم الهاتف" tronweb-mainnet.js '{"network":"mainnet","p2pUrl":"https://mock.supabase.co/functions/v1/p2p"}' run_phone.py

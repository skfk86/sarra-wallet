#!/usr/bin/env bash
set -e
DIR=$(mktemp -d)
mkdir -p "$DIR/vendor"
cp src/index.html src/wallet-core.js "$DIR/"
cp test/ui/stubs/tronweb.js test/ui/stubs/qrcode.js "$DIR/vendor/"
echo 'window.SARRA_CONFIG = {"network":"nile","trongridApiKey":""};' > "$DIR/config.js"
python3 test/ui/run.py "$DIR"

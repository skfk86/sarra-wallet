// يُشغَّل بعد `npx cap add android`
// يمنع لقطات الشاشة وتسجيلها في التطبيق كله (FLAG_SECURE)،
// ويخفي محتوى التطبيق في قائمة التطبيقات الأخيرة.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));
const pkg = cfg.appId;
const file = `android/app/src/main/java/${pkg.replace(/\./g, '/')}/MainActivity.java`;

if (!existsSync(file)) {
  console.error('MainActivity.java not found at ' + file);
  process.exit(1);
}

writeFileSync(file, `package ${pkg};

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // محفظة أموال: منع لقطات الشاشة وتسجيلها
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
    }
}
`);
console.log('FLAG_SECURE applied to ' + file);

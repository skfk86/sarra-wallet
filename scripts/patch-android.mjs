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

// ماسح QR من Google: تنزيل الوحدة تلقائياً عند التثبيت + إذن البصمة
const manifest = 'android/app/src/main/AndroidManifest.xml';
let xml = readFileSync(manifest, 'utf8');
if (!xml.includes('com.google.mlkit.vision.DEPENDENCIES')) {
  xml = xml.replace(/(<application\b[^>]*>)/, '$1\n        <meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="barcode_ui" />');
}
if (!xml.includes('android.permission.USE_BIOMETRIC')) {
  xml = xml.replace(/(<manifest\b[^>]*>)/, '$1\n    <uses-permission android:name="android.permission.USE_BIOMETRIC" />');
}
// منع النسخ الاحتياطي التلقائي إلى Google Drive: لا تخرج بيانات المحفظة المشفّرة من الجهاز
xml = xml.replace(/android:allowBackup="true"/, 'android:allowBackup="false"');
if (!xml.includes('android:allowBackup')) xml = xml.replace(/<application\b/, '<application android:allowBackup="false"');
if (!xml.includes('android:fullBackupContent')) xml = xml.replace(/<application\b/, '<application android:fullBackupContent="false"');
writeFileSync(manifest, xml);
console.log('AndroidManifest patched (ML Kit barcode_ui, USE_BIOMETRIC, allowBackup=false)');

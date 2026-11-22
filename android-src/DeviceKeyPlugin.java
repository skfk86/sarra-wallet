package com.sarra.wallet;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * سرّ الجهاز لصُرّة: 32 بايت عشوائية، مشفّرة بمفتاح AES-256 داخل Android Keystore.
 * مفتاح Keystore لا يمكن استخراجه من الهاتف (وغالباً داخل عتاد آمن)، فنسخ ملفات التطبيق
 * لا يكفي لتخمين رمز PIN خارج الجهاز. لا يُنشأ سرّ جديد أبداً فوق سرّ موجود.
 */
@CapacitorPlugin(name = "DeviceKey")
public class DeviceKeyPlugin extends Plugin {
    private static final String ALIAS = "sarra_device_key_v1";
    private static final String PREFS = "sarra_device_key";
    private static final String BLOB = "blob";

    private SecretKey keystoreKey(boolean create) throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias(ALIAS)) {
            if (!create) return null;
            KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            kg.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
            return kg.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
    }

    @PluginMethod
    public void get(PluginCall call) {
        try {
            SharedPreferences sp = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String blob = sp.getString(BLOB, null);
            byte[] secret;
            if (blob == null) {
                SecretKey key = keystoreKey(true);
                secret = new byte[32];
                new SecureRandom().nextBytes(secret);
                Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
                c.init(Cipher.ENCRYPT_MODE, key);
                byte[] ct = c.doFinal(secret);
                String enc = Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
                if (!sp.edit().putString(BLOB, enc).commit()) throw new Exception("SAVE_FAILED");
            } else {
                // سرّ موجود: نفكّه فقط. إن فُقد مفتاح Keystore نرفض ولا ننشئ بديلاً
                SecretKey key = keystoreKey(false);
                if (key == null) { call.reject("DEVICE_KEY_LOST"); return; }
                String[] p = blob.split(":");
                Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
                c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(p[0], Base64.NO_WRAP)));
                secret = c.doFinal(Base64.decode(p[1], Base64.NO_WRAP));
            }
            JSObject r = new JSObject();
            r.put("key", Base64.encodeToString(secret, Base64.NO_WRAP));
            java.util.Arrays.fill(secret, (byte) 0);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("DEVICE_KEY_ERROR");
        }
    }

    /** منع تصوير الشاشة وظهورها في قائمة التطبيقات الأخيرة أثناء عرض كلمات الاسترجاع */
    @PluginMethod
    public void secure(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }

    /** هل التطبيق مستثنى من تحسين البطارية؟ (Doze يؤخر الإشعارات والمهام الخلفية للتطبيقات غير المستثناة) */
    @PluginMethod
    public void batteryStatus(PluginCall call) {
        JSObject r = new JSObject();
        boolean ex = true;
        if (Build.VERSION.SDK_INT >= 23) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            ex = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        }
        r.put("exempt", ex);
        call.resolve(r);
    }

    /** يفتح نافذة النظام لطلب الاستثناء من تحسين البطارية (يقرر المستخدم)؛ إن تعذّرت يفتح صفحة إعدادات البطارية العامة */
    @PluginMethod
    public void batteryExempt(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception e2) { call.reject("UNAVAILABLE"); return; }
        }
        call.resolve();
    }
}

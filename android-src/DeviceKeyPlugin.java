package com.sarra.wallet;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

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
}

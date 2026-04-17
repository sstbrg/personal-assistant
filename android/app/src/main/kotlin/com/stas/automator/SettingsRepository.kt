package com.stas.automator

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SettingsRepository(context: Context) {

    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    var webappUrl: String
        get() = prefs.getString(KEY_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_URL, value.trim()).apply()

    var hmacSecret: String
        get() = prefs.getString(KEY_SECRET, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SECRET, value.trim()).apply()

    var allowlistRaw: String
        get() = prefs.getString(KEY_ALLOWLIST, "") ?: ""
        set(value) = prefs.edit().putString(KEY_ALLOWLIST, value).apply()

    // Persistent on/off switch controlled by the Start/Stop buttons. Stays
    // false until the user explicitly starts the service, and flips back to
    // false on Stop so the listener doesn't re-launch the service on the next
    // incoming WhatsApp notification.
    var serviceEnabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_ENABLED, value).apply()

    fun allowlist(): Set<String> =
        allowlistRaw.split(",")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .toSet()

    fun isConfigured(): Boolean =
        webappUrl.startsWith("https://") &&
            webappUrl.endsWith("/exec") &&
            hmacSecret.length >= 32

    companion object {
        private const val FILE = "automator_secure"
        private const val KEY_URL = "webapp_url"
        private const val KEY_SECRET = "hmac_secret"
        private const val KEY_ALLOWLIST = "allowlist"
        private const val KEY_ENABLED = "service_enabled"
    }
}

package com.stas.automator

import android.app.Notification
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.ZoneId

class WhatsAppListenerService : NotificationListenerService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName
        if (pkg != PKG_WA && pkg != PKG_WA_BUSINESS) return

        val extras = sbn.notification.extras ?: return
        val title = extras.getString(Notification.EXTRA_TITLE).orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString().orEmpty()

        if (title.isBlank() || text.isBlank()) return
        if (isSystemNoise(title, text)) return

        val repo = SettingsRepository(this)
        val allowed = repo.allowlist()
        if (!ChatAllowlist.isAllowed(title, allowed)) return

        val isGroup = subText.isNotBlank()
        val sender = if (isGroup) subText else title
        val chat = title
        val receivedAtIso = OffsetDateTime.now(ZoneId.systemDefault()).toString()
        val nonce = deriveNonce(sbn)

        val entity = MessageEntity(
            source = "whatsapp",
            chat = chat,
            sender = sender,
            isGroup = isGroup,
            body = text,
            receivedAtIso = receivedAtIso,
            nonce = nonce
        )

        scope.launch {
            try {
                AppDb.get(applicationContext).messages().insert(entity)
                startService(Intent(applicationContext, ForwardingService::class.java))
            } catch (e: Throwable) {
                Log.w(TAG, "enqueue failed", e)
            }
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) { /* no-op */ }

    private fun isSystemNoise(title: String, text: String): Boolean {
        val t = text.lowercase()
        if (title.equals("WhatsApp", ignoreCase = true)) return true
        if (t.matches(Regex("^\\d+\\s+new messages?$"))) return true
        if (t.contains("checking for new messages", ignoreCase = true)) return true
        if (t.contains("backup", ignoreCase = true) && t.contains("progress", ignoreCase = true)) return true
        if (t.contains("missed voice call", ignoreCase = true)) return true
        if (t.contains("incoming voice call", ignoreCase = true)) return true
        if (t.contains("incoming video call", ignoreCase = true)) return true
        return false
    }

    private fun deriveNonce(sbn: StatusBarNotification): String {
        val base = sbn.key + ":" + sbn.postTime
        return sha256Hex(base).take(16)
    }

    private fun sha256Hex(s: String): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        val bytes = md.digest(s.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val TAG = "WA-Listener"
        private const val PKG_WA = "com.whatsapp"
        private const val PKG_WA_BUSINESS = "com.whatsapp.w4b"
    }
}

package com.stas.automator

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.lifecycle.lifecycleScope
import java.time.OffsetDateTime
import java.time.ZoneId
import android.widget.TextView

class MainActivity : AppCompatActivity() {

    private lateinit var settings: SettingsRepository

    private val requestPostNotifications = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        // On API 33+, starting a foreground service while POST_NOTIFICATIONS is
        // denied risks ForegroundServiceDidNotStartInTimeException (the system
        // suppresses the persistent notification and eventually kills the
        // service). Only start once we know the answer.
        if (granted) {
            startForegroundService(Intent(this, ForwardingService::class.java))
        } else {
            toast("Notifications permission denied — service not started.")
        }
        findViewById<TextView>(R.id.statusText)?.let { refreshStatus(it) }
    }

    private fun hasPostNotificationsPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        settings = SettingsRepository(this)

        val url = findViewById<TextInputEditText>(R.id.webappUrl)
        val secret = findViewById<TextInputEditText>(R.id.hmacSecret)
        val allowlist = findViewById<TextInputEditText>(R.id.allowlist)
        val status = findViewById<TextView>(R.id.statusText)

        url.setText(settings.webappUrl)
        secret.setText(settings.hmacSecret)
        allowlist.setText(settings.allowlistRaw)

        findViewById<MaterialButton>(R.id.saveBtn).setOnClickListener {
            settings.webappUrl = url.text?.toString().orEmpty()
            settings.hmacSecret = secret.text?.toString().orEmpty()
            settings.allowlistRaw = allowlist.text?.toString().orEmpty()
            toast("Saved.")
            refreshStatus(status)
        }

        findViewById<MaterialButton>(R.id.grantBtn).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        findViewById<MaterialButton>(R.id.startBtn).setOnClickListener {
            if (hasPostNotificationsPermission()) {
                startForegroundService(Intent(this, ForwardingService::class.java))
            } else {
                // Service will start inside the permission-result callback
                // once the user responds to the system dialog.
                requestPostNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            refreshStatus(status)
        }

        findViewById<MaterialButton>(R.id.stopBtn).setOnClickListener {
            stopService(Intent(this, ForwardingService::class.java))
            refreshStatus(status)
        }

        findViewById<MaterialButton>(R.id.testBtn).setOnClickListener {
            if (!settings.isConfigured()) { toast("Set URL and HMAC secret first."); return@setOnClickListener }
            lifecycleScope.launch {
                val client = ApiClient(settings)
                val payload = ForwardPayload(
                    chat = "Test",
                    sender = "Test",
                    isGroup = false,
                    body = "remind me to buy milk tomorrow at 10",
                    receivedAtIso = OffsetDateTime.now(ZoneId.systemDefault()).toString(),
                    nonce = "test-" + System.currentTimeMillis()
                )
                val res = withContext(Dispatchers.IO) { client.forward(payload) }
                toast("Test: code=${res.code} ok=${res.ok}\n${res.body.take(120)}")
            }
        }

        refreshStatus(status)
    }

    override fun onResume() {
        super.onResume()
        refreshStatus(findViewById(R.id.statusText))
    }

    private fun refreshStatus(status: TextView) {
        val access = isNotificationAccessGranted(this)
        val configured = settings.isConfigured()
        val parts = buildList {
            add(if (access) getString(R.string.status_ok) else getString(R.string.warn_no_access))
            add(if (configured) "Configured." else "URL / HMAC not set.")
            add(if (settings.allowlist().isEmpty()) "Allowlist is empty (deny all)." else "Allowlist: ${settings.allowlist().joinToString()}")
        }
        status.text = parts.joinToString("\n")
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    private fun isNotificationAccessGranted(ctx: Context): Boolean {
        val flat = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners")
            .orEmpty()
        val cn = "$packageName/${WhatsAppListenerService::class.java.name}"
        return flat.split(":").any { it.equals(cn, ignoreCase = true) }
    }
}

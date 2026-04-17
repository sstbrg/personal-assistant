package com.stas.automator

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {
            val repo = SettingsRepository(context)
            if (repo.isConfigured()) {
                context.startForegroundService(Intent(context, ForwardingService::class.java))
            }
        }
    }
}

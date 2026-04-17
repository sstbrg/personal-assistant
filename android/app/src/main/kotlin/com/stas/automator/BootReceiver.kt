package com.stas.automator

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val repo = SettingsRepository(context)
        if (repo.isConfigured() && repo.serviceEnabled) {
            context.startForegroundService(Intent(context, ForwardingService::class.java))
        }
    }
}

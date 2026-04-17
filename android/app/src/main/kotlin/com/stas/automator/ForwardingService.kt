package com.stas.automator

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class ForwardingService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var drainJob: Job? = null
    private var lastSentAt = 0L
    private var sentInWindow = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startInForeground()
        drainJob = scope.launch { drainLoop() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onDestroy() {
        drainJob?.cancel()
        scope.coroutineContext[Job]?.cancel()
        super.onDestroy()
    }

    private suspend fun drainLoop() {
        val db = AppDb.get(applicationContext).messages()
        val settings = SettingsRepository(applicationContext)
        val client = ApiClient(settings)

        while (scope.isActive) {
            try {
                if (!settings.isConfigured()) {
                    delay(15_000L); continue
                }

                val cutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000L
                db.purgeOlderThan(cutoff)

                val batch = db.peek(5)
                if (batch.isEmpty()) { delay(5_000L); continue }

                for (m in batch) {
                    rateLimit()
                    val result = client.forward(
                        ForwardPayload(
                            chat = m.chat, sender = m.sender, isGroup = m.isGroup,
                            body = m.body, receivedAtIso = m.receivedAtIso, nonce = m.nonce
                        )
                    )
                    if (result.ok) {
                        db.delete(m.id)
                    } else {
                        Log.w(TAG, "forward failed code=${result.code} body=${result.body}")
                        db.bumpAttempts(m.id)
                        scheduleRetryWorker()
                        delay(10_000L)
                        break
                    }
                }
            } catch (t: Throwable) {
                Log.w(TAG, "drain error", t)
                delay(5_000L)
            }
        }
    }

    private suspend fun rateLimit() {
        val now = System.currentTimeMillis()
        if (now - lastSentAt > 60_000L) {
            lastSentAt = now
            sentInWindow = 0
        }
        if (sentInWindow >= 10) {
            val waitMs = 60_000L - (now - lastSentAt)
            if (waitMs > 0) delay(waitMs)
            lastSentAt = System.currentTimeMillis()
            sentInWindow = 0
        }
        sentInWindow++
    }

    private fun scheduleRetryWorker() {
        val req = OneTimeWorkRequestBuilder<RetryWorker>()
            .setConstraints(
                Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .setInitialDelay(30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(applicationContext).enqueue(req)
    }

    private fun startInForeground() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CH_ID, getString(R.string.notif_channel_fg), NotificationManager.IMPORTANCE_MIN)
            nm.createNotificationChannel(ch)
        }
        val notif: Notification = NotificationCompat.Builder(this, CH_ID)
            .setContentTitle(getString(R.string.notif_fg_title))
            .setContentText(getString(R.string.notif_fg_text))
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(FG_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(FG_ID, notif)
        }
    }

    companion object {
        private const val TAG = "FwdSvc"
        private const val CH_ID = "fg_forwarder"
        private const val FG_ID = 101
    }
}

package com.stas.automator

import android.content.Context
import android.content.Intent
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class RetryWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val count = AppDb.get(applicationContext).messages().count()
        if (count == 0) return Result.success()

        // Kick the foreground drainer; it handles the actual send.
        applicationContext.startService(Intent(applicationContext, ForwardingService::class.java))
        return Result.success()
    }
}

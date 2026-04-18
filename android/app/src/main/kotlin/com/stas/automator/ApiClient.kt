package com.stas.automator

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class ForwardPayload(
    val chat: String,
    val sender: String,
    val isGroup: Boolean,
    val body: String,
    val receivedAtIso: String,
    val nonce: String
)

class ApiClient(private val settings: SettingsRepository) {

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    fun forward(p: ForwardPayload): Result {
        val url = settings.webappUrl
        val secret = settings.hmacSecret
        if (url.isBlank() || secret.isBlank()) return Result(false, -1, "unconfigured")

        val ts = System.currentTimeMillis() / 1000L

        val data = JSONObject().apply {
            put("body", p.body)
            put("chat", p.chat)
            put("is_group", p.isGroup)
            put("received_at", p.receivedAtIso)
            put("sender", p.sender)
        }
        val dataCanonical = stableStringify(data)
        val signingBase = listOf(1, ts, p.nonce, "whatsapp", dataCanonical).joinToString("|")
        val sig = SigningUtil.hmacSha256Hex(signingBase, secret)

        val envelope = JSONObject().apply {
            put("v", 1)
            put("ts", ts)
            put("nonce", p.nonce)
            put("source", "whatsapp")
            put("sig", sig)
            put("data", data)
        }

        val req = Request.Builder()
            .url(url)
            .post(envelope.toString().toRequestBody(JSON_MEDIA))
            .build()

        return try {
            http.newCall(req).execute().use { resp ->
                interpretResponse(resp.code, resp.body?.string().orEmpty())
            }
        } catch (e: Throwable) {
            Result(false, -1, e.javaClass.simpleName + ": " + (e.message ?: ""))
        }
    }

    data class Result(val ok: Boolean, val code: Int, val body: String)

    companion object {
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

        // Apps Script ContentService cannot set HTTP status codes, so every response
        // is wire-level 200. The server signals failure via `{ "ok": false, ... }`.
        // A successful forward requires BOTH 2xx AND `ok:true`; otherwise the caller
        // deletes the queued message and the failure is lost.
        // Regex avoids pulling org.json into unit tests; server output is our own code,
        // not arbitrary JSON, so a top-level `"ok":true` match is reliable.
        private val OK_TRUE_REGEX = Regex("\"ok\"\\s*:\\s*true\\b")

        fun interpretResponse(code: Int, body: String): Result {
            val httpOk = code in 200..299
            val serverOk = OK_TRUE_REGEX.containsMatchIn(body)
            return Result(httpOk && serverOk, code, body.take(500))
        }

        // Canonical JSON: sorted keys, no whitespace. Matches Apps Script `_stableStringify`.
        fun stableStringify(value: Any?): String = when (value) {
            null, JSONObject.NULL -> "null"
            is JSONObject -> {
                val keys = value.keys().asSequence().toList().sorted()
                keys.joinToString(prefix = "{", postfix = "}", separator = ",") { k ->
                    JSONObject.quote(k) + ":" + stableStringify(value.opt(k))
                }
            }
            is org.json.JSONArray -> (0 until value.length())
                .joinToString(prefix = "[", postfix = "]", separator = ",") { i ->
                    stableStringify(value.opt(i))
                }
            is String -> JSONObject.quote(value)
            is Boolean -> value.toString()
            is Number -> {
                if (value is Double || value is Float) {
                    val d = value.toDouble()
                    if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()
                } else value.toString()
            }
            else -> JSONObject.quote(value.toString())
        }
    }
}

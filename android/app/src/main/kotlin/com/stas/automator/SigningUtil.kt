package com.stas.automator

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object SigningUtil {
    fun hmacSha256Hex(message: String, key: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val bytes = mac.doFinal(message.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}

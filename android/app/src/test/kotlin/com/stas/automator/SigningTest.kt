package com.stas.automator

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The canonical signing base and HMAC hex here MUST match tests/signing-parity.test.mjs.
 * If you change either side, regenerate the reference with:
 *   node tests/signing-parity.test.mjs --print-fixture
 */
class SigningTest {

    private val canonicalData =
        """{"body":"hello","chat":"Test","is_group":false,"received_at":"2026-04-17T14:00:00+03:00","sender":"Alice"}"""

    private val signingBase =
        "1|1713367200|test-nonce-1|whatsapp|$canonicalData"

    private val referenceHex =
        "a4d46cb36ea3cc707b9ea41382133905d55c52ca519bc44ff913911352a04fdf"

    @Test
    fun hmacSha256HexMatchesReference() {
        val hex = SigningUtil.hmacSha256Hex(signingBase, "testsecret")
        assertEquals(referenceHex, hex)
    }

    @Test
    fun hmacIsDeterministic() {
        val a = SigningUtil.hmacSha256Hex("hello", "k")
        val b = SigningUtil.hmacSha256Hex("hello", "k")
        assertEquals(a, b)
    }

    @Test
    fun hmacDiffersOnSecretChange() {
        val a = SigningUtil.hmacSha256Hex("hello", "k1")
        val b = SigningUtil.hmacSha256Hex("hello", "k2")
        assert(a != b)
    }
}

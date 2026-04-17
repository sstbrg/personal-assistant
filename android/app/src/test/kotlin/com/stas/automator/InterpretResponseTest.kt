package com.stas.automator

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Apps Script ContentService always returns HTTP 200. The client MUST also check
 * that the response body has `ok:true` — otherwise auth failures, stale
 * timestamps, and server exceptions would be treated as successful deliveries
 * and the queued message deleted.
 */
class InterpretResponseTest {

    @Test
    fun success_requires_both_http_2xx_and_server_ok_true() {
        val r = ApiClient.interpretResponse(200, """{"ok":true,"count":1}""")
        assertTrue(r.ok)
        assertEquals(200, r.code)
    }

    @Test
    fun http_200_with_server_false_is_failure() {
        val r = ApiClient.interpretResponse(200, """{"ok":false,"error":"bad_sig"}""")
        assertFalse(r.ok)
        assertEquals(200, r.code)
    }

    @Test
    fun http_200_with_stale_ts_error_is_failure() {
        val r = ApiClient.interpretResponse(200, """{"ok":false,"error":"stale_ts"}""")
        assertFalse(r.ok)
    }

    @Test
    fun http_5xx_is_failure_regardless_of_body() {
        val r = ApiClient.interpretResponse(500, """{"ok":true}""")
        assertFalse(r.ok)
    }

    @Test
    fun non_json_body_is_failure() {
        val r = ApiClient.interpretResponse(200, "<html>not json</html>")
        assertFalse(r.ok)
    }

    @Test
    fun empty_body_is_failure() {
        val r = ApiClient.interpretResponse(200, "")
        assertFalse(r.ok)
    }

    @Test
    fun whitespace_variations_still_match() {
        assertTrue(ApiClient.interpretResponse(200, """{"ok" : true}""").ok)
        assertTrue(ApiClient.interpretResponse(200, """{"ok":  true ,"x":1}""").ok)
    }

    @Test
    fun dedup_success_is_treated_as_success() {
        val r = ApiClient.interpretResponse(200, """{"ok":true,"dedup":true}""")
        assertTrue(r.ok)
    }

    @Test
    fun body_is_truncated_to_500_chars() {
        val long = "a".repeat(2000)
        val r = ApiClient.interpretResponse(200, long)
        assertEquals(500, r.body.length)
    }
}

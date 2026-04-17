package com.stas.automator

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatAllowlistTest {

    @Test
    fun emptyAllowlistDeniesAll() {
        assertFalse(ChatAllowlist.isAllowed("anyone", emptySet()))
    }

    @Test
    fun nullOrBlankChatDenied() {
        assertFalse(ChatAllowlist.isAllowed(null, setOf("a")))
        assertFalse(ChatAllowlist.isAllowed("", setOf("a")))
        assertFalse(ChatAllowlist.isAllowed("   ", setOf("a")))
    }

    @Test
    fun substringMatchCaseInsensitive() {
        assertTrue(ChatAllowlist.isAllowed("Noam — Guardian7", setOf("Guardian7")))
        assertTrue(ChatAllowlist.isAllowed("Noam — Guardian7", setOf("guardian7")))
        assertTrue(ChatAllowlist.isAllowed("noam — guardian7", setOf("GUARDIAN7")))
    }

    @Test
    fun noMatchIsDenied() {
        assertFalse(ChatAllowlist.isAllowed("Work Team", setOf("Family")))
    }

    @Test
    fun anyEntryMatchAllows() {
        assertTrue(ChatAllowlist.isAllowed("Work Team", setOf("Family", "Work")))
    }
}

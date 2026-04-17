package com.stas.automator

object ChatAllowlist {
    fun isAllowed(chat: String?, allowed: Set<String>): Boolean {
        if (chat.isNullOrBlank()) return false
        if (allowed.isEmpty()) return false
        return allowed.any { chat.contains(it, ignoreCase = true) }
    }
}

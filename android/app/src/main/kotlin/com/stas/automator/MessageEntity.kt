package com.stas.automator

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "messages")
data class MessageEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val source: String,
    val chat: String,
    val sender: String,
    val isGroup: Boolean,
    val body: String,
    val receivedAtIso: String,
    val nonce: String,
    val createdAt: Long = System.currentTimeMillis(),
    val attempts: Int = 0
)

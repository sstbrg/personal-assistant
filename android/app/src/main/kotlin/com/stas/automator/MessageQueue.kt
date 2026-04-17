package com.stas.automator

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

@Dao
interface MessageDao {
    @Insert
    suspend fun insert(msg: MessageEntity): Long

    @Query("SELECT * FROM messages ORDER BY createdAt ASC LIMIT :limit")
    suspend fun peek(limit: Int): List<MessageEntity>

    @Query("DELETE FROM messages WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("UPDATE messages SET attempts = attempts + 1 WHERE id = :id")
    suspend fun bumpAttempts(id: Long)

    @Query("DELETE FROM messages WHERE createdAt < :cutoffMillis")
    suspend fun purgeOlderThan(cutoffMillis: Long)

    @Query("SELECT COUNT(*) FROM messages")
    suspend fun count(): Int
}

@Database(entities = [MessageEntity::class], version = 1, exportSchema = false)
abstract class AppDb : RoomDatabase() {
    abstract fun messages(): MessageDao

    companion object {
        @Volatile private var instance: AppDb? = null

        fun get(ctx: Context): AppDb =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    ctx.applicationContext,
                    AppDb::class.java,
                    "automator.db"
                ).build().also { instance = it }
            }
    }
}

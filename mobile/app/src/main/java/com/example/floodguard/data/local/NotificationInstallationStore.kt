package com.example.floodguard.data.local

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class NotificationInstallationIdentity internal constructor(
    val installationId: String,
    internal val installationSecret: String
) {
    override fun toString(): String =
        "NotificationInstallationIdentity(redacted)"
}

class NotificationInstallationStore(context: Context) {

    private val directory = context.applicationContext.noBackupFilesDir

    companion object {
        private const val KEY_ALIAS =
            "floodguard.notification.installation.v2"

        private const val FILE_NAME =
            "notification-installation-v2.bin"

        private const val FILE_VERSION = 1
        private const val IV_SIZE = 12
        private const val TAG_BITS = 128

        private val storageLock = Any()

        private val associatedData =
            "FloodGuard.NotificationInstallation.v1"
                .toByteArray(Charsets.UTF_8)
    }

    suspend fun getOrCreate(): NotificationInstallationIdentity =
        withContext(Dispatchers.IO) {
            synchronized(storageLock) {
                check(directory.exists() || directory.mkdirs()) {
                    "Không mở được kho installation."
                }

                val baseFile = File(directory, FILE_NAME)
                val atomicFile = AtomicFile(baseFile)
                val backupFile = File(directory, "$FILE_NAME.bak")

                if (baseFile.exists() || backupFile.exists()) {
                    readIdentity(atomicFile)
                } else {
                    createIdentity(atomicFile)
                }
            }
        }

    private fun createIdentity(
        file: AtomicFile
    ): NotificationInstallationIdentity {
        val secretBytes = ByteArray(48)
        SecureRandom().nextBytes(secretBytes)

        val identity = NotificationInstallationIdentity(
            installationId = UUID.randomUUID().toString(),
            installationSecret = encodeSecret(secretBytes)
        )

        val json = JSONObject()
            .put("version", FILE_VERSION)
            .put("installationId", identity.installationId)
            .put("installationSecret", identity.installationSecret)
            .toString()
            .toByteArray(Charsets.UTF_8)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.ENCRYPT_MODE,
            getKey(createIfMissing = true)
        )
        cipher.updateAAD(associatedData)

        val iv = cipher.iv
        check(iv.size == IV_SIZE)

        val encrypted = cipher.doFinal(json)
        val payload = byteArrayOf(FILE_VERSION.toByte()) +
                iv + encrypted

        val output = file.startWrite()
        try {
            output.write(payload)
            file.finishWrite(output)
        } catch (error: Exception) {
            file.failWrite(output)
            throw error
        }

        return identity
    }

    private fun readIdentity(
        file: AtomicFile
    ): NotificationInstallationIdentity {
        val payload = file.openRead().use { input ->
            // File này chỉ chứa một UUID và một secret.
            val bytes = input.readBytes()
            require(bytes.size in (1 + IV_SIZE + 16)..4096) {
                "Kho installation không hợp lệ."
            }
            bytes
        }

        require(payload[0].toInt() == FILE_VERSION) {
            "Phiên bản kho installation không được hỗ trợ."
        }

        val iv = payload.copyOfRange(1, 1 + IV_SIZE)
        val encrypted = payload.copyOfRange(
            1 + IV_SIZE,
            payload.size
        )

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            getKey(createIfMissing = false),
            GCMParameterSpec(TAG_BITS, iv)
        )
        cipher.updateAAD(associatedData)

        val decrypted = cipher.doFinal(encrypted)
        val json = JSONObject(
            String(decrypted, Charsets.UTF_8)
        )

        require(json.getInt("version") == FILE_VERSION)

        val installationId = json.getString("installationId")
        val uuid = UUID.fromString(installationId)

        require(
            uuid.version() == 4 &&
                    uuid.variant() == 2 &&
                    uuid.toString() == installationId
        ) {
            "installationId trong kho không hợp lệ."
        }

        val secret = json.getString("installationSecret")
        require(secret.matches(Regex("[A-Za-z0-9_-]{43,86}")))

        val secretBytes = Base64.decode(
            secret,
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
        )
        require(secretBytes.size in 32..64)
        require(encodeSecret(secretBytes) == secret)

        return NotificationInstallationIdentity(
            installationId = installationId,
            installationSecret = secret
        )
    }

    private fun getKey(createIfMissing: Boolean): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)

        val existing = keyStore.getEntry(KEY_ALIAS, null)
        if (existing != null) {
            check(existing is KeyStore.SecretKeyEntry) {
                "Khóa installation không hợp lệ."
            }
            return existing.secretKey
        }

        check(createIfMissing) {
            "Không còn khóa giải mã installation. " +
                    "Cần xử lý phục hồi trước khi đăng ký thiết bị."
        }

        val generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        )

        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or
                        KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(
                    KeyProperties.ENCRYPTION_PADDING_NONE
                )
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build()
        )

        return generator.generateKey()
    }

    private fun encodeSecret(bytes: ByteArray): String =
        Base64.encodeToString(
            bytes,
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
        )
}
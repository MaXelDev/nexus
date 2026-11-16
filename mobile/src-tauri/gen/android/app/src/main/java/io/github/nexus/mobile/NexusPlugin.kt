package io.github.nexus.mobile

// Native side of NEXUS (ADR 0006): keeps the relay credentials encrypted with an Android Keystore key,
// opens other apps, and toggles FLAG_SECURE. Called from Rust only (src-tauri/src/lib.rs): no capability
// grants these commands to the webview, so the page can never read the stored token.
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.view.WindowManager
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class SaveArgs { lateinit var value: String }

@InvokeArg
class OpenArgs { lateinit var target: String }

@InvokeArg
class SecureArgs { var on: Boolean = false }

@TauriPlugin
class NexusPlugin(private val activity: Activity) : Plugin(activity) {
    private val prefs = activity.getSharedPreferences("nexus", Context.MODE_PRIVATE)

    /** AES-256 key that never leaves the Keystore: StrongBox when the phone has one, else the TEE. */
    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        fun generate(strongBox: Boolean): SecretKey {
            val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
            if (strongBox && Build.VERSION.SDK_INT >= 28) spec.setIsStrongBoxBacked(true)
            return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                .apply { init(spec.build()) }.generateKey()
        }
        return try { generate(true) } catch (e: Exception) { generate(false) } // StrongBoxUnavailableException
    }

    @Command
    fun save(invoke: Invoke) {
        val args = invoke.parseArgs(SaveArgs::class.java)
        try {
            val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) } // fresh random IV
            val blob = cipher.iv + cipher.doFinal(args.value.toByteArray(Charsets.UTF_8))
            prefs.edit().putString(PREF, Base64.encodeToString(blob, Base64.NO_WRAP)).commit()
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("keystore: ${e.javaClass.simpleName}") // never the value
        }
    }

    @Command
    fun load(invoke: Invoke) {
        val out = JSObject()
        val stored = prefs.getString(PREF, null)
        if (stored != null) {
            try {
                val blob = Base64.decode(stored, Base64.NO_WRAP)
                val cipher = Cipher.getInstance(TRANSFORMATION)
                cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, blob, 0, IV_LEN))
                out.put("value", String(cipher.doFinal(blob, IV_LEN, blob.size - IV_LEN), Charsets.UTF_8))
            } catch (e: Exception) {
                // Key gone (data reset, lock screen change on some phones) or blob tampered: pair again.
                prefs.edit().remove(PREF).commit()
            }
        }
        invoke.resolve(out)
    }

    @Command
    fun clear(invoke: Invoke) {
        prefs.edit().remove(PREF).commit()
        try { KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(ALIAS) } catch (_: Exception) {}
        invoke.resolve()
    }

    /** `camera`, an https URL, or an app package name (Rust has already checked which). */
    @Command
    fun open(invoke: Invoke) {
        val t = invoke.parseArgs(OpenArgs::class.java).target
        // User-installed apps are only reachable thanks to <queries> in AndroidManifest.xml.
        val intent = when {
            t == "camera" -> Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)
            t.startsWith("https://") -> Intent(Intent.ACTION_VIEW, Uri.parse(t))
            // Explicit intent, as a launcher does: an implicit MAIN/LAUNCHER intent misses apps whose
            // main activity has no DEFAULT category (Notion). Null = not installed → store page below.
            else -> activity.packageManager.getLaunchIntentForPackage(t)
        }
        try {
            activity.startActivity(intent ?: throw ActivityNotFoundException())
        } catch (e: ActivityNotFoundException) {
            if (t == "camera" || t.startsWith("https://")) return invoke.reject("no app")
            // App not installed: its store page.
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$t")))
            } catch (_: ActivityNotFoundException) {
                return invoke.reject("no app")
            }
        }
        invoke.resolve()
    }

    /** FLAG_SECURE while the settings screen is shown: no screenshot, hidden in the recent apps. */
    @Command
    fun secure(invoke: Invoke) {
        val on = invoke.parseArgs(SecureArgs::class.java).on
        activity.runOnUiThread {
            if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            invoke.resolve()
        }
    }

    companion object {
        const val ALIAS = "nexus-relay-token"
        const val PREF = "relay"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_LEN = 12
    }
}

package expo.modules.deviceattestation

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.CodedException
import kotlinx.coroutines.tasks.await
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.spec.ECGenParameterSpec

/**
 * Native module exposing:
 *   - attestAndroid({ nonceHex }) — Play Integrity Standard token + Keystore key attestation chain
 *
 * The Keystore key is generated once with `setAttestationChallenge(<server nonce>)`,
 * which causes the OS to emit an X.509 cert chain rooted at Google's hardware
 * attestation CA. The chain travels server-side where it's verified.
 *
 * Cloud project number is configured via either:
 *   - AndroidManifest <meta-data android:name="expo.modules.deviceattestation.CLOUD_PROJECT_NUMBER" .../>
 *   - or the EXPO_DEVICE_ATTESTATION_CLOUD_PROJECT_NUMBER BuildConfig field
 */
class DeviceAttestationModule : Module() {

  companion object {
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS = "aura50_attest_key_v1"
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoDeviceAttestation")

    AsyncFunction("isAvailable") {
      true
    }

    /**
     * Returns:
     *   {
     *     integrityToken: String,
     *     keyAttestationChain: [Base64DER, ...],
     *     publicKeyHash: hex
     *   }
     */
    AsyncFunction("attestAndroid") { opts: Map<String, Any?> ->
      val nonceHex = (opts["nonceHex"] as? String)
        ?: throw CodedException("BAD_INPUT", "nonceHex required", null)
      val nonceBytes = hexToBytes(nonceHex)

      val context = appContext.reactContext
        ?: throw CodedException("NO_CONTEXT", "React context not available", null)

      // 1. Ensure attested key exists with this challenge. We rotate the key every call so
      //    the cert chain's attestationChallenge always matches the current nonce.
      generateAttestedKey(nonceBytes)
      val (chainBase64, pubKeyHashHex) = readKeystoreChain()

      // 2. Request a Play Integrity Standard token bound to the same nonce.
      val token = requestIntegrityTokenStandard(context, nonceHex)

      mapOf(
        "integrityToken" to token,
        "keyAttestationChain" to chainBase64,
        "publicKeyHash" to pubKeyHashHex,
      )
    }
  }

  private fun generateAttestedKey(challenge: ByteArray) {
    val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
    // Always rotate — the attestationChallenge must reflect the current nonce.
    if (keyStore.containsAlias(KEY_ALIAS)) {
      keyStore.deleteEntry(KEY_ALIAS)
    }
    val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE_PROVIDER)
    val specBuilder = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
      .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
      .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA384, KeyProperties.DIGEST_SHA512)
      .setAttestationChallenge(challenge)
    if (android.os.Build.VERSION.SDK_INT >= 28) {
      try {
        // StrongBox-backed when available (Pixel 3+ and others). Fail-soft to TEE.
        specBuilder.setIsStrongBoxBacked(true)
      } catch (_: Throwable) { /* best-effort */ }
    }
    try {
      kpg.initialize(specBuilder.build())
      kpg.generateKeyPair()
    } catch (_: java.security.ProviderException) {
      // StrongBox unavailable on this device — retry without it.
      val fallback = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256)
        .setAttestationChallenge(challenge)
        .build()
      kpg.initialize(fallback)
      kpg.generateKeyPair()
    }
  }

  private fun readKeystoreChain(): Pair<List<String>, String> {
    val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
    val chain = keyStore.getCertificateChain(KEY_ALIAS)
      ?: throw CodedException("NO_CHAIN", "Keystore returned no cert chain (device may not support attestation)", null)
    val chainB64 = chain.map { Base64.encodeToString(it.encoded, Base64.NO_WRAP) }
    val leafPubDer = chain[0].publicKey.encoded
    val pubHash = MessageDigest.getInstance("SHA-256").digest(leafPubDer)
    val pubHashHex = pubHash.joinToString("") { "%02x".format(it) }
    return chainB64 to pubHashHex
  }

  private suspend fun requestIntegrityTokenStandard(context: Context, nonceHex: String): String {
    val cloudProjectNumber = readCloudProjectNumber(context)
      ?: throw CodedException(
        "NO_CLOUD_PROJECT",
        "Add <meta-data android:name=\"expo.modules.deviceattestation.CLOUD_PROJECT_NUMBER\" android:value=\"YOUR_NUMBER\"/> to AndroidManifest.xml",
        null,
      )

    val standardManager = IntegrityManagerFactory.createStandard(context)
    val prepareReq = StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
      .setCloudProjectNumber(cloudProjectNumber)
      .build()
    val provider = standardManager.prepareIntegrityToken(prepareReq).await()
    val tokenReq = StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
      .setRequestHash(nonceHex)
      .build()
    val tokenResponse = provider.request(tokenReq).await()
    return tokenResponse.token()
  }

  private fun readCloudProjectNumber(context: Context): Long? {
    return try {
      val ai = context.packageManager.getApplicationInfo(
        context.packageName,
        android.content.pm.PackageManager.GET_META_DATA,
      )
      val md = ai.metaData ?: return null
      val raw: Any? = md.get("expo.modules.deviceattestation.CLOUD_PROJECT_NUMBER")
      when (raw) {
        is Long -> raw
        is Int -> raw.toLong()
        is String -> raw.toLongOrNull()
        else -> null
      }
    } catch (_: Throwable) { null }
  }

  private fun hexToBytes(hex: String): ByteArray {
    val clean = if (hex.length % 2 == 0) hex else "0$hex"
    val out = ByteArray(clean.length / 2)
    for (i in out.indices) {
      out[i] = ((Character.digit(clean[i * 2], 16) shl 4) or Character.digit(clean[i * 2 + 1], 16)).toByte()
    }
    return out
  }
}

package expo.modules.reclaimintegrity

import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ReclaimIntegrityModule : Module() {
  private var provider: StandardIntegrityManager.StandardIntegrityTokenProvider? = null
  private var providerProject: Long? = null

  override fun definition() = ModuleDefinition {
    Name("ReclaimIntegrity")

    AsyncFunction("token") { cloudProjectNumber: String, requestHash: String, promise: Promise ->
      val projectNumber = cloudProjectNumber.toLongOrNull()
      if (projectNumber == null || projectNumber <= 0 || !Regex("^[a-f0-9]{64}$").matches(requestHash)) {
        promise.reject("INVALID_REQUEST", "The AI verification request is invalid.", null)
        return@AsyncFunction
      }
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val manager = IntegrityManagerFactory.createStandard(context)

      fun requestToken(activeProvider: StandardIntegrityManager.StandardIntegrityTokenProvider) {
        activeProvider.request(
          StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
            .setRequestHash(requestHash)
            .build()
        ).addOnSuccessListener { result -> promise.resolve(result.token()) }
          .addOnFailureListener { error ->
            provider = null
            providerProject = null
            promise.reject("INTEGRITY_UNAVAILABLE", "Google Play could not verify this app install.", error)
          }
      }

      val cached = provider
      if (cached != null && providerProject == projectNumber) {
        requestToken(cached)
      } else {
        manager.prepareIntegrityToken(
          StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
            .setCloudProjectNumber(projectNumber)
            .build()
        ).addOnSuccessListener { prepared ->
          provider = prepared
          providerProject = projectNumber
          requestToken(prepared)
        }.addOnFailureListener { error ->
          promise.reject("INTEGRITY_UNAVAILABLE", "Google Play could not prepare AI verification.", error)
        }
      }
    }
  }
}

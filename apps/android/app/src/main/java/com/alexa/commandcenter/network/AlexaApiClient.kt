package com.alexa.commandcenter.network

import com.alexa.commandcenter.config.AlexaEnvironmentConfig
import com.alexa.commandcenter.model.*
import com.alexa.commandcenter.security.SessionStore
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import java.io.IOException
import java.net.SocketTimeoutException
import java.util.UUID
import java.util.concurrent.TimeUnit

interface AlexaApiService {
  @POST("api/auth/login") suspend fun login(@Body request: LoginRequest): Response<AuthResponse>
  @GET("api/auth/session") suspend fun session(): Response<SessionResponse>
  @GET("api/security/csrf") suspend fun csrf(): Response<CsrfResponse>
  @POST("api/devices/pairing-intents") suspend fun createPairingIntent(@Header("X-CSRF-Token") csrf: String): Response<PairingIntent>
  @POST("api/devices/pairing-requests") suspend fun requestPairing(@Body request: PairingRequest): Response<PairingResponse>
  @POST("api/devices/pairing-status") suspend fun pairingStatus(@Body request: PairingStatusRequest): Response<PairingStatusResponse>
  @POST("api/v1/device/system-summary") suspend fun deviceSummary(@Body envelope: SignedEnvelope): Response<AlexaSummary>
  @GET("api/v1/health") suspend fun health(): Response<ApiHealth>
}

class AlexaApiClient private constructor(
  private val service: AlexaApiService,
  private val gson: Gson,
) {
  suspend fun login(email: String, password: String) = call { service.login(LoginRequest(email, password)) }
  suspend fun session() = call { service.session() }
  suspend fun csrf() = call { service.csrf() }
  suspend fun createPairingIntent(csrf: String) = call { service.createPairingIntent(csrf) }
  suspend fun requestPairing(request: PairingRequest) = call { service.requestPairing(request) }
  suspend fun pairingStatus(deviceId: String, token: String) = call { service.pairingStatus(PairingStatusRequest(deviceId, token)) }
  suspend fun deviceSummary(envelope: SignedEnvelope) = call { service.deviceSummary(envelope) }
  suspend fun health() = call { service.health() }

  private suspend fun <T> call(block: suspend () -> Response<T>): Result<T> = withContext(Dispatchers.IO) {
    try {
      val response = block()
      if (response.isSuccessful) response.body()?.let(Result<T>::success)
        ?: Result.failure(AlexaApiException(AlexaFailure.InvalidResponse))
      else Result.failure(AlexaApiException(response.toFailure(gson)))
    } catch (_: SocketTimeoutException) {
      Result.failure(AlexaApiException(AlexaFailure.Timeout))
    } catch (_: IOException) {
      Result.failure(AlexaApiException(AlexaFailure.NetworkUnavailable))
    } catch (error: AlexaApiException) {
      Result.failure(error)
    } catch (_: Exception) {
      Result.failure(AlexaApiException(AlexaFailure.Unknown("The service returned an unexpected response.")))
    }
  }

  companion object {
    fun create(config: AlexaEnvironmentConfig, sessionStore: SessionStore): AlexaApiClient {
      val gson = Gson()
      val client = OkHttpClient.Builder()
        .cookieJar(SecureCookieJar(sessionStore))
        .addInterceptor(RequestIdentityInterceptor(config.trustedWebOrigin))
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .callTimeout(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .build()
      return AlexaApiClient(
        Retrofit.Builder()
          .baseUrl(config.apiBaseUrl)
          .client(client)
          .addConverterFactory(GsonConverterFactory.create(gson))
          .build()
          .create(AlexaApiService::class.java),
        gson,
      )
    }
  }
}

class AlexaApiException(val failure: AlexaFailure) : RuntimeException()

private class RequestIdentityInterceptor(private val origin: String) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): okhttp3.Response {
    val request = chain.request().newBuilder()
      .header("Accept", "application/json")
      .header("X-Request-Id", UUID.randomUUID().toString())
      .header("Origin", origin)
      .build()
    return chain.proceed(request)
  }
}

private class SecureCookieJar(private val sessionStore: SessionStore) : CookieJar {
  override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
    cookies.firstOrNull { it.name.startsWith("__Host-") || it.name == "alexa_session" }
      ?.let { sessionStore.saveCookie(it.toString()) }
  }

  override fun loadForRequest(url: HttpUrl): List<Cookie> = sessionStore.cookie()
    ?.let { Cookie.parse(url, it) }
    ?.takeIf { it.matches(url) }
    ?.let(::listOf)
    ?: emptyList()
}

private fun Response<*>.toFailure(gson: Gson): AlexaFailure {
  if (code() == 401) return AlexaFailure.Unauthorized
  if (code() == 429) return AlexaFailure.RateLimited
  if (code() >= 500) return AlexaFailure.ServerUnavailable
  val code = errorBody().safeCode(gson)
  return when (code) {
    "TRUSTED_DEVICE_REQUIRED", "DEVICE_REVOKED" -> AlexaFailure.DeviceRevoked
    "INVALID_SIGNATURE", "SIGNED_REQUEST_EXPIRED", "DUPLICATE_NONCE" -> AlexaFailure.Unauthorized
    else -> AlexaFailure.InvalidResponse
  }
}

private fun ResponseBody?.safeCode(gson: Gson): String? = try {
  this?.string()?.let { gson.fromJson(it, JsonObject::class.java) }
    ?.getAsJsonObject("error")?.get("code")?.asString
} catch (_: Exception) { null }

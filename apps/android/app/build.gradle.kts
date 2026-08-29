plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.android)
  alias(libs.plugins.kotlin.compose)
}

val debugApiBaseUrl = providers.gradleProperty("DEBUG_API_BASE_URL")
  .orElse("https://example.invalid/")
  .get()
val debugWebOrigin = providers.gradleProperty("DEBUG_WEB_ORIGIN")
  .orElse("https://example.invalid")
  .get()
val prodApiBaseUrl = providers.gradleProperty("PROD_API_BASE_URL")
  .orElse("https://example.invalid/")
  .get()
val prodWebOrigin = providers.gradleProperty("PROD_WEB_ORIGIN")
  .orElse("https://example.invalid")
  .get()
val fcmProjectId = providers.gradleProperty("FCM_PROJECT_ID").orElse("").get()
val fcmApplicationId = providers.gradleProperty("FCM_APPLICATION_ID").orElse("").get()
val fcmApiKey = providers.gradleProperty("FCM_API_KEY").orElse("").get()
val fcmSenderId = providers.gradleProperty("FCM_SENDER_ID").orElse("").get()

android {
  namespace = "com.alexa.commandcenter"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.alexa.commandcenter"
    minSdk = 31
    targetSdk = 35
    versionCode = 1
    versionName = "0.1.0"
    buildConfigField("String", "FCM_PROJECT_ID", "\"$fcmProjectId\"")
    buildConfigField("String", "FCM_APPLICATION_ID", "\"$fcmApplicationId\"")
    buildConfigField("String", "FCM_API_KEY", "\"$fcmApiKey\"")
    buildConfigField("String", "FCM_SENDER_ID", "\"$fcmSenderId\"")
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  buildTypes {
    debug {
      applicationIdSuffix = ".debug"
      versionNameSuffix = "-debug"
      buildConfigField("String", "API_BASE_URL", "\"$debugApiBaseUrl\"")
      buildConfigField("String", "WEB_ORIGIN", "\"$debugWebOrigin\"")
      buildConfigField("String", "ENVIRONMENT", "\"DEBUG\"")
      manifestPlaceholders["usesCleartextTraffic"] = "true"
    }
    create("dev") {
      initWith(getByName("debug"))
      applicationIdSuffix = ".dev"
      versionNameSuffix = "-dev"
      buildConfigField("String", "API_BASE_URL", "\"$debugApiBaseUrl\"")
      buildConfigField("String", "WEB_ORIGIN", "\"$debugWebOrigin\"")
      buildConfigField("String", "ENVIRONMENT", "\"DEV\"")
      manifestPlaceholders["usesCleartextTraffic"] = "true"
    }
    release {
      isMinifyEnabled = false
      buildConfigField("String", "API_BASE_URL", "\"$prodApiBaseUrl\"")
      buildConfigField("String", "WEB_ORIGIN", "\"$prodWebOrigin\"")
      buildConfigField("String", "ENVIRONMENT", "\"PRODUCTION\"")
      manifestPlaceholders["usesCleartextTraffic"] = "false"
    }
  }

  buildFeatures {
    buildConfig = true
    compose = true
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions { jvmTarget = "17" }
}

dependencies {
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.lifecycle.viewmodel.ktx)
  implementation(libs.androidx.lifecycle.viewmodel.compose)
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.navigation.compose)
  implementation(libs.androidx.security.crypto)
  implementation(libs.androidx.biometric)
  implementation(libs.androidx.fragment.ktx)
  implementation(platform(libs.compose.bom))
  implementation(libs.compose.ui)
  implementation(libs.compose.ui.tooling.preview)
  implementation(libs.compose.material3)
  implementation(libs.compose.material.icons)
  implementation(libs.okhttp)
  implementation(libs.retrofit)
  implementation(libs.retrofit.gson)
  implementation(libs.gson)
  implementation(libs.kotlinx.coroutines.android)
  implementation(libs.firebase.messaging)

  testImplementation(libs.junit)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.espresso)
  androidTestImplementation(platform(libs.compose.bom))
  androidTestImplementation(libs.compose.ui.test.junit4)
  debugImplementation(libs.compose.ui.tooling)
  debugImplementation(libs.compose.ui.test.manifest)
}

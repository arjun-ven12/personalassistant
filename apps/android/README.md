# Alexa Android

Open this directory directly in Android Studio. It is a thin, trusted Kotlin/
Compose client for the canonical Alexa API; it contains no backend credentials or
business runtime.

For an emulator connecting to a local API:

```text
./gradlew assembleDebug -PDEBUG_API_BASE_URL=http://10.0.2.2:3001/ -PDEBUG_WEB_ORIGIN=http://localhost:5173
```

For a physical device, set `DEBUG_API_BASE_URL` and `DEBUG_WEB_ORIGIN` through
Gradle properties to an HTTPS tunnel or an explicitly configured LAN endpoint.
Release builds require HTTPS `PROD_API_BASE_URL` and `PROD_WEB_ORIGIN` values.

# Athena Android

Open this directory directly in Android Studio. It is a thin, trusted Kotlin/
Compose client for the canonical Athena API; it contains no backend credentials or
business runtime.

For an emulator connecting to a local API:

```text
./gradlew assembleDebug -PDEBUG_API_BASE_URL=http://10.0.2.2:3001/ -PDEBUG_WEB_ORIGIN=http://localhost:5173
```

For a physical device, set `DEBUG_API_BASE_URL` and `DEBUG_WEB_ORIGIN` through
Gradle properties to an HTTPS tunnel or an explicitly configured LAN endpoint.
Release builds require HTTPS `PROD_API_BASE_URL` and `PROD_WEB_ORIGIN` values.

FCM is optional at build time. Configure `FCM_PROJECT_ID`,
`FCM_APPLICATION_ID`, `FCM_API_KEY`, and `FCM_SENDER_ID` as Gradle properties
to enable token acquisition. These are Firebase client identifiers, not server
credentials. The backend uses Application Default Credentials and its own
`FCM_PROJECT_ID`; privileged Firebase credentials must never be packaged in the
APK. Without FCM configuration the app remains fully usable and the approval
inbox refreshes normally in the foreground.

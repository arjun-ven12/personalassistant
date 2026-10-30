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

## Document scans and searchable PDF preview

In Athena → Documents, capture/import up to five JPEG/PNG pages. Review pages,
reorder, rotate, remove, replace/rescan, or adjust rectangular crop bounds.
Originals are retained; restore full page to undo cropping. Enter title and tags,
then choose **OCR and save PDF offline**. The bundled Latin ML Kit engine runs
on-device and the PDF embeds cleaned page images plus invisible Unicode OCR text.
Every page needs text/layout; blank or unsupported pages fail rather than produce
an image-only PDF labelled searchable. Search the saved draft, open the PDF in an
installed viewer, share a read-only content URI, or export using the system picker.
One company-scoped offline draft is supported at a time and survives app restart.

**Upload to Athena** is a separate explicit network action. It uses the existing
canonical document vault and reviewed providers, which reprocess originals with
recorded page edits and local English Tesseract on the API host. The updated API
must be deployed for page edits and stored PDF references/downloads. Existing scans
without word layout need reprocessing before backend PDF export. This change adds
JSON record fields and assets, not a second database or a new SQL migration.
The existing asset volume must remain private and persistent. Offline export does
not wait for server deployment. No automatic upload, cloud OCR, or model prompt
is added. Temporary shared PDFs are quota-limited and removed lazily after 24 hours.

The APK is a debug-signed preview (Android 12+) for owner testing; it is not a
production signing identity. See the scanning report for actual validation and
real-phone/external-viewer acceptance status.

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

In Athena → Documents, choose **Scan a document**, then take a photo or import
JPEG/PNG images. The focused review screen shows one page at a time with a
numbered thumbnail strip. Rotate, visually crop, move earlier/later, or use the
page menu to retake, replace or remove a page. Crop corners are draggable, with
labelled sliders available for precise and accessible adjustment. Originals stay
untouched. Continue to **Name & save**, enter a name/tags, and explicitly choose
**On this phone** (offline PDF) or **In Athena** (private upload and indexing).

The result screen offers Open PDF, Share PDF and Save to files. A phone-only PDF
can be uploaded to Athena later. Saving/uploading shows actual page progress and
server stages, with pause/resume and distinct recoverable errors. Pausing on the
phone does not cancel processing already accepted by Athena. Uploaded draft pages
remain locked for safe retry. Successful server saving is only reported after
Athena confirms a stored PDF. Failed generation keeps the original pages.

Library search runs after typing, with collection filters and clear empty/offline
states. Saved documents have separate Pages / Text / Details views, within-document
search, direct links from text matches to their page, and original comparison.
Memory, retention, provider review and cloud-processing settings are kept outside
the capture flow. Enabling a provider still requires its explicit review dialog.

Bundled Latin ML Kit OCR runs on-device for phone PDFs. Every page needs usable
text/layout; blank or unsupported pages do not become an image-only PDF labelled
searchable. Sharing uses read-only content URIs; export uses the system picker.
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

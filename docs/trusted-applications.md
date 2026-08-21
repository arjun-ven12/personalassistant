# Trusted Applications

Trusted applications are owner-approved semantic adapter targets. Registration
does not mean unrestricted control; it means the application can expose bounded
semantic metadata and capability records to governed systems.

Stored records include application name, bundle identifier, stable identifier,
application version, code-signature summary, granted adapter permissions,
capabilities, status, trust level, security profile, last seen time, and audit
metadata.

The adapter registry deliberately stores `executablePath: null` and
`executablePathUserSupplied: false`. Callers cannot provide executable paths,
because application identity must remain based on registered IDs and reviewed
provider metadata.

Applications can be revoked individually. Revocation clears granted adapter
permissions, records revoked health, and causes adapter operations to fail
closed with `APPLICATION_NOT_TRUSTED`.

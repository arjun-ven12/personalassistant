# Reviewed engineering sandbox image

Phase 27.1 uses one minimum local image for this TypeScript repository:
`alexa-engineering-node:1`. The runtime never pulls it and always starts it with
network disabled, dropped Linux capabilities, `no-new-privileges`, PID, CPU, and
memory limits.

The Dockerfile's default base points at a deliberately unusable host. An
operator must review and supply an immutable Node 24 Debian image digest;
mutable tags are not accepted by the documented build procedure.

```sh
docker build \
  --pull \
  --build-arg BASE_IMAGE='node@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df' \
  --build-arg PNPM_VERSION=11.17.0 \
  --tag alexa-engineering-node:1 \
  deploy/engineering-sandbox/node
```

After building, record and review the resulting image ID, then run the smoke
check without network access:

```sh
docker image inspect alexa-engineering-node:1 --format '{{.Id}}'
docker run --rm --pull never --network none --cap-drop ALL \
  --security-opt no-new-privileges alexa-engineering-node:1 \
  /usr/local/bin/pnpm --version
```

Do not place registry credentials, package tokens, `.npmrc`, source credentials,
or production environment variables in the image. Python and Gradle images may
be added later from separately reviewed immutable bases; unsupported profiles
continue to fail closed until their named local images exist.

The digest above was resolved from the locally inspected `node:24-bookworm-slim`
image on 2026-09-16. Re-review and deliberately update it when upgrading Node.
Production must leave `ALEXA_ENGINEERING_RUNTIME_ENABLED=false` until the image
exists locally and the smoke check passes.

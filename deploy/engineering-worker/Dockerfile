# Supply an operator-reviewed node:24-bookworm-slim digest. Mutable tags fail closed.
ARG NODE_BASE=invalid.invalid/athena-worker-base:review-required
FROM ${NODE_BASE} AS build
ARG NODE_BASE
RUN printf '%s' "$NODE_BASE" | grep -Eq '^node@sha256:[a-f0-9]{64}$'
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @alexa-control/api...
COPY apps/api/src apps/api/src
COPY apps/api/tsup.worker.config.ts apps/api/tsup.worker.config.ts
COPY apps/mac-agent/electron apps/mac-agent/electron
COPY packages/shared packages/shared
COPY packages/config packages/config
RUN pnpm --filter @alexa-control/api exec tsup --config tsup.worker.config.ts

FROM ${NODE_BASE} AS runtime
# Build-time installation only. No installation from owner credentials at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends git python3 python3-pip python3-venv build-essential docker.io ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/athena /run/athena /workspace /var/empty
COPY --from=build /build/apps/api/dist-worker/provisioned-engineering-worker.js /opt/athena/worker.js
COPY deploy/engineering-worker/start-engineering-worker /opt/athena/start-engineering-worker
RUN chmod 0555 /opt/athena/start-engineering-worker /opt/athena/worker.js
# This image supplies the artifact for a dedicated Railway VM checkpoint.
# It does not mount a Mac Docker socket or start a privileged Docker-in-Docker container.
ENTRYPOINT ["/opt/athena/start-engineering-worker"]

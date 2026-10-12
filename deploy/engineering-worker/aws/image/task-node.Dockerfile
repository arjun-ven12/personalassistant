ARG REVIEWED_NODE_IMAGE=invalid.invalid/review-required
FROM ${REVIEWED_NODE_IMAGE}
ARG REVIEWED_NODE_IMAGE
RUN printf '%s' "$REVIEWED_NODE_IMAGE" | grep -Eq '^node@sha256:[a-f0-9]{64}$'
COPY image/pnpm.tgz /tmp/athena-pnpm.tgz
RUN npm install --global /tmp/athena-pnpm.tgz --ignore-scripts --offline \
    && test "$(pnpm --version)" = 11.17.0 \
    && npm cache clean --force \
    && rm /tmp/athena-pnpm.tgz
USER 65532:65532
ENV HOME=/tmp/alexa-engineering-home

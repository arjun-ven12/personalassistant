ARG REVIEWED_NODE_IMAGE=invalid.invalid/review-required
FROM ${REVIEWED_NODE_IMAGE}
ARG REVIEWED_NODE_IMAGE
RUN printf '%s' "$REVIEWED_NODE_IMAGE" | grep -Eq '^node@sha256:[a-f0-9]{64}$'
COPY registry-proxy.js /opt/athena/registry-proxy.js
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/node", "/opt/athena/registry-proxy.js"]

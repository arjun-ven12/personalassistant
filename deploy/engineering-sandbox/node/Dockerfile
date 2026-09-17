ARG BASE_IMAGE=invalid.invalid/alexa-engineering-base:review-required
FROM ${BASE_IMAGE}

ARG PNPM_VERSION=11.17.0

ENV COREPACK_DEFAULT_TO_LATEST=0 \
    COREPACK_HOME=/opt/alexa-corepack

RUN mkdir -p "${COREPACK_HOME}" \
    && corepack enable \
    && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
    && mkdir -p /tmp/alexa-engineering-home \
    && chmod -R a+rX "${COREPACK_HOME}" \
    && chmod 1777 /tmp/alexa-engineering-home

ENV CI=true \
    HOME=/tmp/alexa-engineering-home \
    NODE_ENV=test \
    PATH=/usr/local/bin:/usr/bin:/bin

WORKDIR /workspace

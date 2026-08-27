FROM node:24-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @alexa-control/web...

COPY apps/web apps/web
COPY packages/config packages/config
COPY packages/shared packages/shared
RUN pnpm --filter @alexa-control/web build

FROM caddy:2.8-alpine

COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /workspace/apps/web/dist /srv

EXPOSE 4173
CMD ["sh", "-c", "printf 'window.__ALEXA_RUNTIME_CONFIG__={apiBaseUrl:window.location.origin};\\n' > /srv/runtime-config.js && exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]

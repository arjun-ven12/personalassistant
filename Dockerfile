FROM node:24-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @alexa-control/api...

COPY apps/api apps/api
COPY packages/config packages/config
COPY packages/shared packages/shared
RUN pnpm --filter @alexa-control/api build
RUN pnpm --filter @alexa-control/api deploy --legacy --prod /runtime

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/api
COPY --from=builder /runtime ./
RUN mkdir -p /app/api/.local && chown node:node /app/api/.local

USER node
# Railway mounts persistent storage through its service Volume configuration.
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.API_PORT||3001)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]

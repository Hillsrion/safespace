# syntax=docker/dockerfile:1
FROM node:22.22.3-trixie-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl ffmpeg fonts-dejavu-core tini \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive

FROM dependencies AS build
COPY . .
ENV DEPLOY_TARGET=node
# Code generation/build never requires a real database or deployment secret.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build yarn prisma:generate \
    && yarn build

# Separate one-off job: only this target receives the owner migration URL.
# It is never started by the web image or on every web replica's startup.
FROM build AS migrations
ENV NODE_ENV=production
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM base AS production-dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive --production=true \
    && yarn cache clean

# Independent job: no HTTP server, client assets, web credentials or healthcheck.
# Keep the web runtime last so the default Docker target remains the website.
FROM base AS media-deletion-worker
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/build/runtime ./build/runtime
COPY --from=build /app/app/generated/prisma ./app/generated/prisma
USER node
HEALTHCHECK NONE
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "build/runtime/media-deletion-worker.js", "--loop"]

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/build ./build
COPY --from=build /app/app/generated/prisma ./app/generated/prisma
COPY --from=build /app/server/index.mjs /app/server/http.mjs /app/server/healthcheck.mjs ./server/
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "server/healthcheck.mjs"]
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.mjs"]

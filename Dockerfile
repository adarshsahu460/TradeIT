# syntax=docker/dockerfile:1.6

ARG NODE_IMAGE=node:20-bullseye

FROM ${NODE_IMAGE} AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY scripts ./scripts
COPY packages/shared ./packages/shared
COPY packages/server/prisma ./packages/server/prisma
COPY packages/server/scripts ./packages/server/scripts
RUN npm ci

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./
COPY --from=base /app/package-lock.json ./
COPY --from=base /app/tsconfig.base.json ./
COPY --from=base /app/packages ./packages
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
RUN npm run build --workspace @tradeit/shared \
 && npm run build --workspace @tradeit/server

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY scripts ./scripts
COPY packages/shared ./packages/shared
COPY packages/server/prisma ./packages/server/prisma
COPY packages/server/scripts ./packages/server/scripts
RUN npm ci --omit=dev

FROM ${NODE_IMAGE}-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--experimental-specifier-resolution=node
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./
COPY --from=prod-deps /app/package-lock.json ./
COPY --from=prod-deps /app/packages ./packages
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/prisma ./packages/server/prisma

EXPOSE 4000
EXPOSE 4001

CMD ["node", "packages/server/dist/index.js"]

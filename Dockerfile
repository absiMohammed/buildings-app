# syntax=docker/dockerfile:1
# Builds the building-app Node/TS server (ESM monorepo: server bundles the
# `shared` workspace into server/dist). Build context is the repo root.

FROM node:20-alpine AS build
WORKDIR /app
# Install deps against the lockfile. All workspace manifests must be present
# for `npm ci` to resolve the workspace tree.
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci
# Build the server (compiles src + ../shared into server/dist), then drop dev deps.
COPY shared ./shared
COPY server ./server
RUN npm run build --workspace server \
 && npm prune --omit=dev

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app/server
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/package.json ./package.json
# Local document uploads (ephemeral without a Fly volume — see fly.toml note).
RUN mkdir -p ./uploads
EXPOSE 4000
CMD ["node", "dist/server/src/index.js"]

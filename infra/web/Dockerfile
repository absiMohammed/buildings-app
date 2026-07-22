# syntax=docker/dockerfile:1
# Builds the building-app web client (Vite/React) and serves it via nginx.
# Build context is the repo root.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci
COPY shared ./shared
COPY client ./client
# Absolute API URL baked into the bundle (the deployed API on Fly).
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
# Use vite directly (skip tsc project-refs typecheck) to produce the bundle.
RUN cd client && node ../node_modules/vite/bin/vite.js build

FROM nginx:alpine AS runner
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY infra/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080

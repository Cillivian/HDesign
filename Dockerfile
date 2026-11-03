# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/catalog/package.json packages/catalog/package.json
COPY packages/symbols/package.json packages/symbols/package.json
COPY packages/autolayout/package.json packages/autolayout/package.json
COPY packages/drawing/package.json packages/drawing/package.json
COPY packages/plan-recognition/package.json packages/plan-recognition/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8791
RUN corepack enable
COPY --from=build /app ./
EXPOSE 8791
CMD ["pnpm", "start"]

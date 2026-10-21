# syntax=docker/dockerfile:1
# One Dockerfile, two images: `docker build --target api .` and `docker build --target web .`
# Node runs the TypeScript sources directly; workspace packages stay real directories (not copies
# under node_modules) because Node does not strip types inside node_modules.

FROM node:24-slim AS base
ENV CI=true
RUN npm install --global pnpm@12.14.0
WORKDIR /app
COPY . .

FROM base AS api-deps
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@vinyl/api..."

FROM base AS web-build
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@vinyl/web..."
# Built into the browser bundle; public by design (see README).
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
RUN pnpm --filter @vinyl/web build

FROM base AS web-deps
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@vinyl/web..."

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
USER node

FROM runtime AS api
COPY --from=api-deps /app/package.json /app/
COPY --from=api-deps /app/node_modules /app/node_modules
COPY --from=api-deps /app/packages/shared /app/packages/shared
COPY --from=api-deps /app/apps/api /app/apps/api
ENV API_PORT=8080
EXPOSE 8080
WORKDIR /app/apps/api
CMD ["node", "src/server.ts"]

FROM runtime AS web
COPY --from=web-deps /app/package.json /app/
COPY --from=web-deps /app/node_modules /app/node_modules
COPY --from=web-deps /app/packages/shared /app/packages/shared
COPY --from=web-deps /app/apps/web /app/apps/web
COPY --from=web-build /app/apps/web/dist /app/apps/web/dist
ENV WEB_PORT=8080
EXPOSE 8080
WORKDIR /app/apps/web
CMD ["node", "server.ts"]

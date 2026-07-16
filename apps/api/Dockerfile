FROM docker.io/library/node:24.18.0-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
RUN npm install --global npm@12.0.1 && npm ci --include=optional
COPY packages/contracts/src ./packages/contracts/src
COPY apps/api/src ./apps/api/src
RUN npm run build --workspace @spbu/contracts && npm run build --workspace @spbu/api

FROM docker.io/library/node:24.18.0-alpine3.24 AS production-deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
RUN npm install --global npm@12.0.1 && npm ci --omit=dev --include=optional --workspace @spbu/api --workspace @spbu/contracts --include-workspace-root=false

FROM docker.io/library/node:24.18.0-alpine3.24 AS runtime
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=8787
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=production-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=app:app /app/packages/contracts/dist ./packages/contracts/dist
COPY --chown=app:app apps/api/package.json ./apps/api/package.json
COPY --chown=app:app packages/contracts/package.json ./packages/contracts/package.json
COPY --chown=app:app database ./database
USER app
EXPOSE 8787
CMD ["node", "apps/api/dist/server.js"]

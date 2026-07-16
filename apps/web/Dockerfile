FROM docker.io/library/node:24.18.0-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc tsconfig.base.json ./
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
RUN npm install --global npm@12.0.1 && npm ci --include=optional
COPY packages/contracts/src ./packages/contracts/src
COPY apps/web/index.html ./apps/web/index.html
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_USE_MOCKS=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_USE_MOCKS=$VITE_USE_MOCKS
RUN npm run build --workspace @spbu/contracts && npm run build --workspace @spbu/web

FROM docker.io/library/node:24.18.0-alpine3.24 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/apps/web/dist ./dist
COPY --chown=app:app apps/web/serve.mjs ./serve.mjs
USER app
EXPOSE 4173
CMD ["node", "serve.mjs"]

# Node 24, o mesmo usado no desenvolvimento local.
# O secret opcional 'extra_ca' injeta uma CA extra (redes com inspeção de TLS, ex.: Norton).
ARG NODE_VERSION=24

# ---- 1) build: instala tudo, gera o Prisma Client e compila TypeScript ----
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN --mount=type=secret,id=extra_ca \
  if grep -q BEGIN /run/secrets/extra_ca 2>/dev/null; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
  npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
# O seed fica fora de src/, então é compilado à parte (o entrypoint o executa com node).
RUN --mount=type=secret,id=extra_ca \
  if grep -q BEGIN /run/secrets/extra_ca 2>/dev/null; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
  npx prisma generate \
  && npm run build \
  && npx tsc prisma/seed.ts --outDir dist-seed --module commonjs --target ES2022 \
     --esModuleInterop --skipLibCheck

# ---- 2) deps de produção (inclui o CLI do prisma, usado no migrate deploy) ----
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=secret,id=extra_ca \
  if grep -q BEGIN /run/secrets/extra_ca 2>/dev/null; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
  npm ci --omit=dev && npx prisma generate && npm cache clean --force

# ---- 3) imagem final ----
FROM node:${NODE_VERSION}-bookworm-slim AS final
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-seed ./dist-seed
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]

# O secret opcional 'extra_ca' injeta uma CA extra (redes com inspeção de TLS, ex.: Norton).
ARG NODE_VERSION=24

# ---- 1) build: ng build --configuration production (apiUrl = /api) ----
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=extra_ca \
  if grep -q BEGIN /run/secrets/extra_ca 2>/dev/null; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
  npm ci
COPY . .
RUN npx ng build --configuration production

# ---- 2) Nginx serve os estáticos e faz proxy de /api para o backend ----
FROM nginx:alpine AS final
# A imagem oficial processa /etc/nginx/templates/*.template com envsubst ao iniciar.
ENV PORT=80 BACKEND_URL=http://backend:3000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY seguranca.conf /etc/nginx/seguranca.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80

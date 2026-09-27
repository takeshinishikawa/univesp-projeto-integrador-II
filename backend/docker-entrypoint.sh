#!/bin/sh
# Garante schema e categorias atualizados antes de aceitar requisições.
set -e

echo "Aplicando migrations (prisma migrate deploy)..."
npx prisma migrate deploy

echo "Garantindo categorias fixas (seed idempotente)..."
node dist-seed/seed.js

echo "Iniciando a API..."
exec node dist/index.js

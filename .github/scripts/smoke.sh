#!/usr/bin/env bash
# Teste de fumaça: registro, login, transação e resumo, pela porta do frontend (Nginx -> API).
# Usa só curl e node (sem jq), para rodar igual no GitHub Actions e na máquina de quem desenvolve.
set -euo pipefail

BASE="${1:-http://localhost:4200}"
EMAIL="ci-$(date +%s)@example.com"
SENHA="senha-de-teste-123"

# js '<expressão sobre j>' lê um JSON da entrada padrão e imprime o resultado da expressão.
js() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log(eval(process.argv[1]))})' "$1"
}

falhar() {
  echo "FALHOU: $1" >&2
  exit 1
}

echo "Página inicial do Angular"
curl -fsS "$BASE/" | grep -q "<app-root" || falhar "a página inicial não tem <app-root>"

echo "Registro e login"
curl -fsS -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"nome\":\"CI\",\"email\":\"$EMAIL\",\"senha\":\"$SENHA\"}" > /dev/null
TOKEN=$(curl -fsS -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"senha\":\"$SENHA\"}" | js 'j.token')
[ -n "$TOKEN" ] && [ "$TOKEN" != undefined ] || falhar "login sem token"
AUTH="Authorization: Bearer $TOKEN"

echo "Criar uma receita e uma despesa"
CATEGORIAS=$(curl -fsS "$BASE/api/categorias" -H "$AUTH")
CATEGORIA_RECEITA=$(echo "$CATEGORIAS" | js 'j.find(c=>c.tipo==="RECEITA").id')
CATEGORIA_DESPESA=$(echo "$CATEGORIAS" | js 'j.find(c=>c.tipo==="DESPESA").id')
HOJE=$(date +%F)
curl -fsS -X POST "$BASE/api/transacoes" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"categoriaId\":$CATEGORIA_RECEITA,\"descricao\":\"Salário\",\"valor\":1000,\"tipo\":\"RECEITA\",\"dataTransacao\":\"$HOJE\"}" > /dev/null
curl -fsS -X POST "$BASE/api/transacoes" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"categoriaId\":$CATEGORIA_DESPESA,\"descricao\":\"Mercado\",\"valor\":250.5,\"tipo\":\"DESPESA\",\"dataTransacao\":\"$HOJE\"}" > /dev/null

echo "Conferir o resumo"
RESUMO=$(curl -fsS "$BASE/api/dashboard/resumo" -H "$AUTH")
echo "$RESUMO"
[ "$(echo "$RESUMO" | js 'j.totalReceitas')" = "1000" ] || falhar "totalReceitas"
[ "$(echo "$RESUMO" | js 'j.totalDespesas')" = "250.5" ] || falhar "totalDespesas"
[ "$(echo "$RESUMO" | js 'j.saldoAtual')" = "749.5" ] || falhar "saldoAtual"

echo "OK"

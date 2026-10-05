# Testes de ponta a ponta (Playwright)

Testes de navegador real contra a stack completa (frontend + backend + MySQL), complementando:
- os testes de unidade/componente do backend (Jest) e do frontend (Vitest);
- os testes de acessibilidade de componente em `jsdom` (`frontend/src/app/testing/a11y.ts`), que não enxergam layout real, contraste computado nem viewport — este pacote cobre essa lacuna com `@axe-core/playwright`.

## Pré-requisitos

A stack precisa estar no ar antes de rodar os testes:

```bash
docker compose --env-file .env.local up --build -d --wait
```

(ver `.projects/04-ambiente-local-docker.md` para detalhes do ambiente local.)

## Rodando

```bash
cd e2e
npm install
npx playwright install --with-deps chromium   # só na 1ª vez
npm run test:e2e            # roda tudo, headless
npm run test:e2e:ui         # modo interativo, útil para depurar
npm run report               # abre o último relatório HTML
```

Por padrão os testes apontam para `http://localhost:4200`; para outro endereço, defina `BASE_URL`.

## O que está coberto

- `fluxo-principal.spec.ts` — cadastro, login, lançar uma transação e ver refletida no Resumo; login com credenciais erradas; rota autenticada bloqueada para visitante.
- `importacao.spec.ts` — importar um extrato OFX real (um dos arquivos de `backend/tests/fixtures/`) até confirmar; rejeição de arquivo com extensão errada.
- `metas-e-objetivos.spec.ts` — definir uma meta por categoria; criar um objetivo e registrar um aporte.
- `acessibilidade.spec.ts` — `AxeBuilder` nas páginas autenticadas principais (Resumo, Transações, Importação, Metas, Objetivos, Contas, Categorias, Recorrentes) e no Login; falha só em violações de impacto `serious`/`critical`.

Cada teste cria seu próprio usuário (`tests/suporte/usuario.ts`), com e-mail único por execução — não há necessidade de banco "limpo" entre rodadas nem de fixtures compartilhadas.

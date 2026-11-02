# Testes: estratégia, casos e resultados

Resumo de todos os tipos de teste do projeto, onde cada um roda e o resultado da última medição. Os números de carga,
volume e stress foram medidos em 17/10/2026 no Docker Compose, numa máquina de 4 núcleos com o k6 rodando ao lado
(ver `testes-carga/README.md`).

## Tipos de teste

| Tipo | Ferramenta | Onde está | Onde roda | Resultado |
|---|---|---|---|---|
| Unitário (backend) | Jest | `backend/src/**/*.spec.ts` | CI, a cada push | 371 testes no backend (unitários e de integração juntos) |
| Unitário e de componente (frontend) | Vitest + Angular | `frontend/src/**/*.spec.ts` | CI, a cada push | 292 testes |
| Cobertura | Jest e Vitest (`--coverage`) | `backend/jest.config.js`, `frontend/angular.json` | CI, artefatos `cobertura-*` | backend 98,2% das linhas; frontend 93,0% das linhas |
| Integração (API + MySQL real) | Jest + Supertest | `backend/tests/*.integration.spec.ts` | CI, com MySQL efêmero | as 48 rotas da API exercitadas |
| Integridade dos dados | Jest + Supertest + Prisma | `backend/tests/integridade.integration.spec.ts` | CI | 4 cenários de concorrência e consistência; achou um erro 500 (corrigido) |
| Sanidade (smoke) | curl + Playwright `@sanidade` | `.github/scripts/smoke.sh`, workflow `sanidade.yml` | CI a cada push; à mão contra a aplicação publicada | fluxo principal pela API e pela tela |
| Ponta a ponta (E2E) | Playwright | `e2e/tests/` | CI, contra o Docker Compose | 22 testes |
| Acessibilidade | axe-core (jsdom e Playwright) e Lighthouse | specs do frontend, `e2e/tests/acessibilidade.spec.ts`, `e2e/lighthouse/` | CI | nenhuma violação séria ou crítica; Lighthouse 100 em acessibilidade nas 4 telas medidas |
| Regressão | todos os testes automatizados acima | CI | a cada push e em cada PR | um PR só entra com tudo verde |
| Regressão visual | Playwright `toHaveScreenshot` | `e2e/visual/` | CI, na imagem oficial do Playwright | 4 telas e o formulário de nova transação comparados com as imagens de referência |
| Segurança | CodeQL, Dependabot, `npm audit`, OWASP ZAP baseline | `.github/` | CI | ver "Segurança" abaixo |
| Performance (front) | Lighthouse | `e2e/lighthouse/medir.mjs` | CI | ver "Performance" abaixo |
| Carga | k6 | `testes-carga/carga.js` | à mão | ver "Carga" abaixo |
| Volume | k6 | `testes-carga/volume.js` | à mão | ver "Volume" abaixo |
| Stress | k6 | `testes-carga/stress.js` | à mão | ver "Stress" abaixo |
| Usabilidade | roteiro de tarefas + SUS | fora do repositório (teste com a comunidade) | sessões com participantes | no relatório final |

## Casos de teste funcionais

Cada linha resume um caso que a suíte automatizada verifica a cada push. "Obtido" vale para a execução do CI no commit que
atualizou este arquivo.

| ID | Funcionalidade | Entrada | Resultado esperado | Teste | Obtido |
|---|---|---|---|---|---|
| CT-01 | Cadastro | nome, e-mail e senha válidos; depois o mesmo e-mail | 201 na primeira vez, 409 na segunda | integração (API) | ok |
| CT-02 | Cadastro simultâneo | 5 cadastros ao mesmo tempo com o mesmo e-mail | 1 cadastro aceito, 4 recusados com 409 | integridade | ok |
| CT-03 | Login | senha errada; e-mail inexistente | 401 com "credenciais inválidas", sem sair da tela | integração e E2E | ok |
| CT-04 | Rotas protegidas | requisição sem token, com token expirado ou assinado com outro segredo | 401; na tela, volta para o login | unitário, integração e E2E | ok |
| CT-05 | Isolamento entre usuários | usuário B tenta ler, editar ou excluir dados do usuário A | 404, sem vazar nem alterar nada | integração | ok |
| CT-06 | Lançar transação | despesa ou receita com categoria, valor e data | aparece na lista e soma no Resumo | integração e E2E | ok |
| CT-07 | Validação de transação | categoria inexistente, valor zero ou negativo | 400 com a mensagem do campo | integração | ok |
| CT-08 | Corrigir categoria e valor | editar uma despesa já lançada | lista e Resumo mostram os valores novos | E2E | ok |
| CT-09 | Edição em massa | recategorizar ou excluir várias transações, uma delas inválida | tudo ou nada | integração e E2E | ok |
| CT-10 | Excluir transação | excluir e confirmar | some da lista, as outras continuam | integração e E2E | ok |
| CT-11 | Filtros | descrição, categoria, tipo, faixa de valor e período combinados | só as transações que atendem a todos | integração | ok |
| CT-12 | Importar OFX | 9 extratos e 9 faturas fictícios | 481 transações gravadas; o preview não grava nada | integração e E2E | ok |
| CT-13 | Reimportar OFX | os mesmos arquivos de novo | nenhuma transação duplicada | integração | ok |
| CT-14 | Importação simultânea | a mesma confirmação enviada 3 vezes ao mesmo tempo | cada lançamento gravado uma vez, sem erro 500 | integridade | ok |
| CT-15 | Validação do arquivo | sem arquivo, extensão errada, conteúdo inválido, acima de 2 MB | 400, 422 ou 413, sem gravar | integração e E2E | ok |
| CT-16 | Resumo do mês | lançamentos do mês | totais e saldo iguais à soma no banco | integração e integridade | ok |
| CT-17 | Saldo das contas | lançamentos e transferências | saldo inicial + receitas − despesas, igual à soma no banco | integração e integridade | ok |
| CT-18 | Metas | definir meta total e por categoria; copiar para outros meses | situação calculada (dentro, atenção, estourada) e cópia correta | integração e E2E | ok |
| CT-19 | Regras de categorização | criar regra e aplicar ao histórico | importações e transações antigas recebem a categoria | integração | ok |
| CT-20 | Recorrentes | assinatura mensal nos lançamentos | detectada; ignorar e desfazer funcionam | integração | ok |
| CT-21 | Objetivos | criar, registrar aporte, concluir | progresso calculado; aportes apagados junto com o objetivo | integração e E2E | ok |
| CT-22 | Contas e transferências | transferência entre contas próprias; excluir conta com lançamentos | relatórios ignoram a transferência; exclusão bloqueada | integração | ok |
| CT-23 | Excluir a própria conta (LGPD) | senha certa e senha errada | com a errada, 401; com a certa, nenhuma linha em nenhuma das 10 tabelas e login impossível | integração, integridade e E2E | ok |
| CT-24 | Limite de tentativas | logins errados seguidos do mesmo IP, além do limite | 429; logins certos não contam para o limite | unitário | ok |
| CT-25 | Cabeçalhos de segurança | qualquer resposta da API e das páginas | helmet na API; CSP, Cross-Origin-Opener-Policy, nosniff, X-Frame-Options e Referrer-Policy nas páginas | integração e sanidade | ok |
| CT-26 | Teclado | primeira tecla Tab na página | foco no link "Pular para o conteúdo" | E2E | ok |
| CT-27 | Acessibilidade | todas as telas | nenhuma violação séria ou crítica do axe-core | unitário e E2E | ok |

## Segurança

- **CodeQL** (análise estática do código) e **Dependabot** (atualização semanal das dependências).
- **`npm audit`** no CI: o frontend não tem alertas. O backend tem 3 alertas "high" no `deepmerge-ts`, usado só pelo Prisma
  ao ler a própria configuração (não recebe dados de quem usa a aplicação); a correção exige migrar para o Prisma 7, que fica
  como trabalho futuro. Por isso o backend bloqueia o CI só em alertas "critical".
- **OWASP ZAP baseline** no CI: varredura passiva contra a aplicação no Docker Compose. O relatório fica no artefato
  `seguranca-zap` e no resumo de cada execução. A primeira execução (17/10/2026) não achou nenhum alerta alto, mas apontou 1
  médio (páginas sem `Content-Security-Policy`) e 4 baixos (sem os cabeçalhos `Cross-Origin-Embedder-Policy`,
  `Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy`, e a versão do Nginx exposta no cabeçalho `Server`). Os
  cinco foram corrigidos no Nginx (`frontend/seguranca.conf` e `server_tokens off`). A CSP é a proteção que mais conta: o
  navegador só executa scripts da própria origem, o que bloqueia um script injetado por XSS. Ela aceita estilos inline,
  porque o Angular e o Chart.js dependem deles. Os cabeçalhos Cross-Origin e a versão escondida são um reforço leve.
- Testes automatizados de autenticação (token ausente, malformado, expirado, de outro segredo), de isolamento entre usuários,
  de limite de tentativas e de cabeçalhos de segurança (casos CT-04, CT-05, CT-24 e CT-25).

## Performance

Lighthouse no perfil desktop (notas de 0 a 100):

| Tela | Performance | Acessibilidade | Boas práticas | SEO | LCP (ms) |
|---|---|---|---|---|---|
| Login | 100 | 100 | 100 | 91 | 504 |
| Resumo | 100 | 100 | 100 | 91 | 394 |
| Transações | 100 | 100 | 100 | 91 | 365 |
| Metas | 79 | 100 | 100 | 91 | 268 |

Metas tem a pior nota de performance por causa do deslocamento de layout (CLS de 0,5) quando os dados chegam. É uma melhoria
a fazer.

## Carga

De 10 a 50 usuários simultâneos por cerca de 5 min, mais 2 logins por segundo. Critério: menos de 1% de erro e p95 abaixo de 500 ms (1,5 s no login).

Requisições: 19471 (64.5/s), com 0.00% de erro.

| Rota | Mediana (ms) | p95 (ms) | Máximo (ms) |
|---|---|---|---|
| resumo | 6 | 11 | 27 |
| transacoes | 4 | 8 | 37 |
| contas | 5 | 11 | 24 |
| criar transacao | 9 | 15 | 42 |
| excluir transacao | 7 | 14 | 55 |
| login | 76 | 83 | 149 |

## Volume

5 usuários simultâneos por 1 min numa conta com 20 mil lançamentos em 5 anos. Critério: menos de 1% de erro e p95 abaixo de 1 s, exceto a listagem completa, que só é registrada.

Requisições: 1191 (19.3/s), com 0.00% de erro.

| Rota | Mediana (ms) | p95 (ms) | Máximo (ms) | Resposta (KB) |
|---|---|---|---|---|
| resumo | 222 | 711 | 894 | 0.2 |
| transacoes do mes | 18 | 39 | 704 | 64.5 |
| evolucao do ano | 161 | 241 | 583 | 1.1 |
| categorias do mes | 45 | 107 | 990 | 0.6 |
| busca por descricao | 173 | 524 | 749 | 623.0 |
| contas | 135 | 518 | 592 | 0.2 |
| todas as transacoes | 763 | 1261 | 1746 | 4378.6 |

A listagem de transações sem filtro devolve tudo de uma vez (não há paginação): com 20 mil lançamentos, a resposta tem cerca
de 4,3 MB e leva perto de 1,3 s. Na tela, a listagem padrão é a do mês, que continua rápida. A paginação fica como melhoria
para contas com muitos anos de dados.

## Stress

Degraus de 1 min, cada acesso abrindo Resumo, transações do mês e contas (3 requisições), e 1 min de volta a 10 acessos/s.

Ponto de ruptura: 400 acessos/s (cada acesso = 3 requisições).

| Acessos/s pedidos | Requisições/s atendidas | p95 (ms) | Erros (%) | Acessos não iniciados | Dentro do limite |
|---|---|---|---|---|---|
| 25 | 75 | 8 | 0.00 | 0 | sim |
| 50 | 150 | 5 | 0.00 | 0 | sim |
| 100 | 300 | 6 | 0.00 | 0 | sim |
| 200 | 600 | 32 | 0.00 | 0 | sim |
| 400 | 846 | 720 | 0.00 | 7084 | não |
| recuperação | 30 | 13 | 0.00 | 1 | sim |

No degrau de 400 acessos/s a aplicação continuou sem erros, mas só conseguiu atender cerca de 280 acessos/s (846
requisições/s) e o p95 subiu para 720 ms: o limite desta máquina fica entre 200 e 400 acessos/s. Na volta a 10/s, os tempos
voltaram ao normal.

Antes da correção do Nginx, o mesmo teste rompia em 200 acessos/s com 23% de erros 502: o Nginx abria uma conexão nova com o
backend a cada requisição e esgotava as portas locais. Com o `keepalive` no `upstream`, os erros sumiram.

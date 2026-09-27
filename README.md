# Finanças Pessoais — Projeto Integrador II (Univesp)

Aplicação web de gestão de finanças pessoais: **Angular 22** (frontend) + **Express/Prisma** (backend) + **MySQL 8**.

```
backend/    API REST (Express, TypeScript, Prisma)
frontend/   SPA Angular (standalone, signals)
docker-compose.yml   MySQL + backend + frontend (Nginx)
```

Pré-requisitos: Docker Desktop e, para o modo hot-reload, Node 24.

## Configuração inicial (uma vez)

```powershell
Copy-Item .env.example .env.local   # ajuste as senhas/JWT_SECRET se quiser
```

Se o build falhar com `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (antivírus/proxy que inspeciona TLS, como o Norton),
descomente `EXTRA_CA_FILE` no `.env.local` apontando para o `.pem` da CA.

## Modo integração — tudo em containers

Use para testar o sistema como um todo (é o mais próximo da produção).

```powershell
docker compose --env-file .env.local up --build -d
```

| O quê | Onde |
|---|---|
| Aplicação | http://localhost:4200 |
| API (direto) | http://localhost:3000/api |
| Swagger | http://localhost:4200/api-docs/ (ou :3000/api-docs) |
| MySQL | `localhost:3306` (usuário/senha do `.env.local`) |

O backend só sobe depois do MySQL ficar saudável e, ao iniciar, roda `prisma migrate deploy` e o seed das categorias.
O Nginx do frontend encaminha `/api` para o backend (mesma origem, sem CORS).

```powershell
docker compose --env-file .env.local logs -f backend   # logs
docker compose --env-file .env.local down               # para (mantém os dados)
docker compose --env-file .env.local down -v            # para e apaga os dados do MySQL
```

## Modo hot-reload — dia a dia de desenvolvimento

Só o MySQL em Docker; backend e frontend rodam na máquina e recarregam ao salvar.

```powershell
docker compose --env-file .env.local up mysql -d

# terminal 2
cd backend
npm install
npm run db:deploy      # aplica migrations
npm run db:seed        # categorias fixas (idempotente)
npm run dev            # http://localhost:3000

# terminal 3
cd frontend
npm install
npm start              # http://localhost:4200 (usa http://localhost:3000/api)
```

`backend/.env` deve ter `DATABASE_URL` apontando para `localhost:3306` com o usuário/senha do `.env.local`
(veja `backend/.env.example`). Não rode os dois modos ao mesmo tempo: as portas 3000 e 4200 são as mesmas.

## Importar extrato e fatura (OFX)

Em **Importar** (menu superior), envie o arquivo OFX do extrato da conta ou da fatura do cartão. O app mostra
cada lançamento com a categoria sugerida; revise, troque o que estiver errado e clique em **Importar**.

1. No aplicativo ou site do banco, exporte o **extrato** ou a **fatura** em formato **OFX** (no Nubank, nas telas
   de extrato e de fatura; o caminho exato pode mudar conforme a versão do aplicativo). Um arquivo por vez, até 2 MB.
2. Envie o arquivo na tela **Importar**. Nada é gravado nessa etapa e o arquivo não fica armazenado.
3. Vêm **desmarcados**: o pagamento da fatura (já aparece como compras na fatura) e as transferências entre
   as suas próprias contas (nome do titular igual ao do cadastro). Marque só se quiser importá-los.
4. Reenviar o mesmo arquivo, ou outro com período sobreposto, **não duplica** lançamentos (o `FITID` do OFX é único por usuário).

Dados de teste sem informação pessoal: `cd backend; npm run fixtures:ofx` gera em `backend/tests/fixtures/` uma série
fictícia de jan–set/2026 (ver o README de lá). Para o import reconhecer as transferências entre contas, o nome do
usuário de teste deve ser "Usuario Teste".

## Transações: filtros e edição em massa

Em **Transações** dá para filtrar por descrição, categoria, tipo e faixa de valor (botão **Filtrar**), no mês escolhido ou em
**Todo o histórico**. Marque as transações que quiser (ou todas as listadas) e use a barra que aparece para **mover todas para
outra categoria** ou **excluí-las**. É o caminho para arrumar o que veio da importação, por exemplo trocar tudo o que está em
"Outros" e contém "Netflix" para "Assinaturas". Receitas e despesas não se misturam ao trocar de categoria.

## Regras de categorização

Ao mover transações para outra categoria, o app pergunta se deve **usar sempre** essa categoria para descrições parecidas (o termo é
sugerido e pode ser editado; dá para aplicar também às transações que já existem). Nas próximas importações, essas regras valem antes
das regras do app, e a linha aparece marcada como "regra sua". Em **Categorias** você vê, edita, apaga e aplica ao histórico cada regra.

## Metas

Em **Metas** (menu superior) você escolhe o **mês e o ano** e preenche a **meta de cada categoria** naquele mês; cada mês tem as
suas, porque os gastos variam. A **meta do mês é a soma das metas das categorias** (não há um valor total para digitar), e ela aparece
no topo da tela ao lado do gasto do mês. No **Resumo**, o aviso de orçamento estourado mostra quanto foi gasto no mês e a meta dele; ao
ver o ano inteiro, lista os meses que passaram da própria meta. Mês sem meta não gera aviso, e o Resumo oferece o link para definir uma.

O Resumo avisa em três níveis, com texto e ícone: dentro da meta, **atenção a partir de 80%** e estourada. Em **Copiar para os
próximos meses** você repete as metas por categoria de um mês nos seguintes, preservando ou substituindo as que já existem.

Quem já tinha uma meta total definida antes das metas por categoria continua com ela nos meses em que não há meta por categoria (marcada
como "antiga", com o botão "Remover esta meta"). Assim que uma categoria recebe meta, a soma passa a valer.

## Insights no Resumo

O card **"O que chamou atenção"** traz até 5 frases sobre o mês (categoria que subiu ou caiu contra a média dos 3 meses anteriores, maiores despesas, total contra o mês passado, projeção do fim do mês, muito gasto em Outros, reajuste de assinatura). Tudo por regras fixas, sem IA. Cada frase tem um link que abre as Transações já filtradas.

## Recorrentes

A tela **Recorrentes** encontra sozinha o que se repete todo mês (assinaturas, mensalidades) e mostra o custo fixo por mês e por ano, a próxima cobrança prevista, reajustes e o que ainda será cobrado no mês. Se a detecção errar, use "Não é recorrente" (dá para desfazer).

## Objetivos

Em **Objetivos** você cria uma meta de reserva (valor e prazo), registra quanto já guardou e vê quanto precisa guardar por mês para chegar lá, além de estar no ritmo, atrasado ou concluído. Os aportes são manuais. O Resumo mostra o progresso de cada objetivo.

## Contas e transferências

Em **Contas** você cadastra conta corrente, cartão e dinheiro. Cada transação pertence a uma conta; o cartão mostra o valor **a pagar**. Na importação, o app reconhece a conta pelo banco/conta que vem no OFX (ou oferece criar uma). Pagamento de fatura e movimentos entre contas são **transferências**: mudam os saldos, mas não contam como receita nem despesa em resumo, gráficos, metas e insights. As telas Transações e Resumo ganham o filtro por conta quando há mais de uma.

## Categorias

Além das categorias padrão (Alimentação, Moradia, Salário etc.), em **Categorias** você cria as suas (por exemplo, Pets ou
Assinaturas) para não jogar tudo em "Outros". Elas aparecem só para você: no cadastro de transações, na importação de extratos e
nos gráficos. Dá para renomear e excluir as suas; a exclusão é bloqueada enquanto houver transações na categoria.

## Testes

```powershell
# Backend (a integração contra MySQL real só roda com DATABASE_URL_TEST)
cd backend
$env:DATABASE_URL_TEST = "mysql://app:<MYSQL_PASSWORD>@localhost:3306/financas"
npm test
npm run lint

# Frontend
cd frontend
npm test -- --watch=false
npm run lint
```

Os testes de integração criam e removem os próprios usuários (e-mails `*@teste.com`), então podem rodar no banco de desenvolvimento.

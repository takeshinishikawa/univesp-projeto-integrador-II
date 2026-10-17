# Testes de carga, volume e stress (k6)

Rodam na máquina de quem testa, contra a aplicação no Docker Compose (`http://localhost:4200`, passando pelo Nginx). Não
entram no CI, porque o tempo de resposta varia muito na máquina do GitHub. O k6 roda pela imagem oficial, sem instalar nada.

## Preparar os dados

```powershell
cd backend
$env:DATABASE_URL = "mysql://app:<MYSQL_PASSWORD>@localhost:3306/financas"
$env:DEMO_SENHA = "<senha das contas demo>"
npm run demo:criar -- --quantidade 10   # demo1 ... demo10, usadas na carga e no stress
npm run carga:volume                    # volume@financas.demo, com 20 mil lançamentos em 5 anos
```

No fim, `npm run demo:limpar -- --confirmar` apaga todas essas contas.

## Rodar

```powershell
docker run --rm --network host -v "${PWD}/testes-carga:/testes" -e DEMO_SENHA=<senha> grafana/k6:1.3.0 run /testes/carga.js
docker run --rm --network host -v "${PWD}/testes-carga:/testes" -e DEMO_SENHA=<senha> grafana/k6:1.3.0 run /testes/volume.js
docker run --rm --network host -v "${PWD}/testes-carga:/testes" -e DEMO_SENHA=<senha> grafana/k6:1.3.0 run /testes/stress.js
```

Para outro endereço, acrescente `-e BASE_URL=https://<endereço>`. Cada script imprime uma tabela em Markdown por rota
(mediana, p95 e máximo) e grava a mesma tabela em `carga.md`, `volume.md` ou `stress.md` na pasta indicada por `-e SAIDA=` (padrão: a
pasta atual do container).

| Script | O que simula | Critério de aprovação |
|---|---|---|
| `carga.js` | De 10 a 50 pessoas ao mesmo tempo abrindo o Resumo, as transações do mês e as contas, lançando e excluindo uma despesa, mais 2 logins por segundo (cerca de 5 min) | menos de 1% de erro, p95 abaixo de 500 ms (1,5 s no login) |
| `volume.js` | 5 pessoas usando a conta de 20 mil lançamentos (1 min), incluindo a listagem sem filtro | menos de 1% de erro, p95 abaixo de 1 s; a listagem completa só é registrada |
| `stress.js` | Degraus de 1 min com 25, 50, 100, 200 e 400 acessos por segundo (cada um abre Resumo, transações e contas), e 1 min de volta a 10/s | não aprova nem reprova: aponta o primeiro degrau com mais de 1% de erro, p95 acima de 2 s ou mais de 1% dos acessos sem começar, e se a aplicação se recupera |

O limite de tentativas da API não atrapalha: o login só conta as tentativas com erro, e as contas são criadas direto no
banco, sem passar pelo cadastro.

Os degraus do stress mudam com `-e DEGRAUS=50,100,200,400,800`. Quando o k6 e a aplicação rodam na mesma máquina, eles
disputam a CPU: o resultado serve para comparar versões, não como a capacidade do servidor publicado.

**Cuidado ao apontar para o Railway:** o teste gera dezenas de milhares de requisições, que contam na cota do plano.

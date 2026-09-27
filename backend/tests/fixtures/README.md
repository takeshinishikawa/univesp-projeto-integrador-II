# Fixtures OFX fictícios (Nubank)

Arquivos **100% fictícios** gerados por [`scripts/gerar-ofx-ficticios.ts`](../../scripts/gerar-ofx-ficticios.ts) (`npm run fixtures:ofx`). São determinísticos: rodar de novo gera os mesmos arquivos. Não edite à mão; ajuste o script.

Simulam uma pessoa comum, titular **USUARIO TESTE**, de **janeiro a setembro de 2026**, no formato real exportado pelo Nubank (mesmos cabeçalhos, envelopes e charsets dos exemplos analisados).

## Conteúdo

| Pasta / arquivo                                 | O que é                                                                                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extratos/NU_123456789_01<MÊS>2026_<fim>.ofx`   | 9 extratos mensais da conta (jan–set; setembro vai até o dia 25). UTF-8                                                                                                            |
| `extratos/NU_123456789_01JAN2026_25SET2026.ofx` | Extrato de **toda a série** (165 lançamentos = soma dos mensais). Serve para testar upload único e sobreposição/duplicidade                                                        |
| `faturas/Nubank_2026-MM-05.ofx`                 | 9 faturas do cartão. O nome traz o **vencimento** (dia 5); cada fatura fecha no dia 28 do mês anterior. Ex.: `Nubank_2026-02-05.ofx` = fechamento em 28/01. ASCII / `CHARSET:1252` |
| `gabarito.json`                                 | Por `FITID`: categoria ideal, se deve vir desmarcada (`ignorada`) e a descrição original                                                                                           |
| `resumo.json`                                   | Por arquivo: nº de transações, total de receitas, total de despesas e nº de linhas que devem vir desmarcadas                                                                       |

## Cenário simulado

**Extrato (conta):** salário de R$ 10.000 no dia 5; aluguel R$ 2.800 (Pix); condomínio (~R$ 650), água, energia (sazonal, mais alta no verão), internet (R$ 119,90), gás (meses pares) e plano de saúde (R$ 489,90) por boleto; compras no débito, Pix enviados e recebidos de pessoas; freelances em mar (R$ 1.800), jun (R$ 2.500) e ago (R$ 1.200); aporte mensal de R$ 1.500 para outra conta do próprio titular (jul também tem um resgate de R$ 3.000); pagamento da fatura no dia 8.

**Fatura (cartão):** assinaturas (Netflix, Spotify, Claude, academia, celular), mercados, restaurantes/iFood, lanches, corridas de app, postos, estacionamentos, farmácias, compras online, cinema, curso, dentista e reforma em alguns meses; parcelados com `Parcela k/n` (Amazon, Kabum, Dargham); passagem aérea de R$ 1.850 em julho; um estorno em junho.

## Casos de borda embutidos (para os testes)

- **Pagamento de fatura** aparece no extrato (`Pagamento de fatura`) e na fatura seguinte (`Pagamento recebido`) com o **mesmo `FITID`** e valor igual ao total da fatura paga. Importar os dois arquivos deve tratar o segundo como duplicado; nos dois casos a linha vem desmarcada. O de janeiro paga uma fatura de dezembro que não faz parte da série.
- **Transferências entre contas próprias** (`USUARIO TESTE`, Banco XP): aporte mensal (saída) e resgate de julho (entrada). Devem vir desmarcadas. `gabarito.json` marca `ignorada: true`.
- **Dados pessoais na descrição** do Pix (CPF mascarado, banco, agência, conta) para exercitar a higienização; dois estilos de texto para o Pix enviado.
- **Descrições sem palavra-chave óbvia** (`ENEL`, `SABESP`, `Kabum`, `Mercadolivre`, `Anthropic`) para medir a cobertura das regras. O gabarito traz a categoria que uma pessoa escolheria; as regras da fase 1 não precisam acertar 100%.
- **Estorno** (`Estorno - Mercadolivre*Mercadol`, valor positivo na fatura) e **parcelas** em séries.
- **Sobreposição:** o extrato jan–set contém os mesmos `FITID` dos extratos mensais. Importar mensais + completo (ou o contrário) não pode duplicar nada.

## Sequência sugerida para testar

1. Importar os 9 extratos mensais e as 9 faturas em ordem. Há 500 `FITID`s distintos; 19 são desmarcados (9 pagamentos de fatura, 9 aportes e 1 resgate entre contas próprias), então devem ser gravadas **481** transações.
2. Reimportar o extrato jan–set: 0 novas transações.
3. Conferir no dashboard que saldo e despesas por mês batem com `resumo.json` (descontando as linhas `ignorada`).

## Arquivos reais

Os `.ofx` soltos em `backend/tests/` (fora desta pasta) são exportações reais do Nubank e ficam fora do versionamento (`.gitignore` da raiz). Não os copie para cá.

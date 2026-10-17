// Teste de stress: aumenta a taxa de acessos em degraus até a API começar a errar ou ficar lenta,
// e depois volta a uma taxa baixa para ver se ela se recupera.
//
// Cada iteração é uma pessoa abrindo o Resumo, as transações do mês e as contas (3 requisições),
// sem pausa. Os degraus rodam um depois do outro, por 1 min cada; o resumo mostra, para cada
// degrau, a taxa atingida, o p95 e a porcentagem de erros. O ponto de ruptura é o primeiro degrau
// com mais de 1% de erro, p95 acima de 2 s ou mais de 1% dos acessos sem conseguir começar (a
// aplicação não dá conta da taxa pedida). Usa as mesmas contas demo do teste de carga.
//
//   docker run --rm --network host -v "$PWD/testes-carga:/testes" -e DEMO_SENHA=... \
//     grafana/k6:1.3.0 run /testes/stress.js
//
// O k6 disputa a CPU com a aplicação quando os dois rodam na mesma máquina; o número serve para
// comparar versões, não como capacidade do servidor publicado.
import { entrar, mesAtual, obter } from './comum.js';

const CONTAS_DEMO = Number(__ENV.CONTAS_DEMO || 10);
const DEGRAUS = (__ENV.DEGRAUS || '25,50,100,200,400').split(',').map(Number);
const DURACAO_S = 60;
const LIMITE_P95_MS = 2000;

const cenarios = {};
DEGRAUS.forEach((taxa, i) => {
  cenarios[`degrau_${String(i + 1).padStart(2, '0')}_${taxa}`] = degrau(taxa, i * DURACAO_S);
});
cenarios.recuperacao = degrau(10, DEGRAUS.length * DURACAO_S);

function degrau(taxa, inicioS) {
  return {
    executor: 'constant-arrival-rate',
    rate: taxa,
    timeUnit: '1s',
    duration: `${DURACAO_S}s`,
    startTime: `${inicioS}s`,
    preAllocatedVUs: Math.min(taxa, 200),
    maxVUs: 1000,
    gracefulStop: '5s',
  };
}

export const options = {
  scenarios: cenarios,
  // Um limite por degrau, só para as métricas de cada um aparecerem no resumo; nenhum aborta.
  thresholds: Object.fromEntries(
    Object.keys(cenarios).flatMap((nome) => [
      [`http_req_duration{scenario:${nome}}`, ['p(95)>=0']],
      [`http_req_failed{scenario:${nome}}`, ['rate>=0']],
      [`http_reqs{scenario:${nome}}`, ['count>=0']],
      [`dropped_iterations{scenario:${nome}}`, ['count>=0']],
    ]),
  ),
  summaryTrendStats: ['med', 'p(95)', 'max'],
};

export function setup() {
  const emails = Array.from({ length: CONTAS_DEMO }, (_, i) => `demo${i + 1}@financas.demo`);
  return { auths: entrar(emails) };
}

export default function ({ auths }) {
  const auth = auths[(__VU - 1) % auths.length];
  const { ano, mes } = mesAtual();
  obter(auth, `/api/dashboard/resumo?mes=${mes}&ano=${ano}`, 'resumo');
  obter(auth, `/api/transacoes?mes=${mes}&ano=${ano}`, 'transacoes');
  obter(auth, '/api/contas', 'contas');
}

export function handleSummary(data) {
  const valor = (metrica, nome, campo) =>
    data.metrics[`${metrica}{scenario:${nome}}`]?.values[campo];
  let ruptura = null;
  const linhas = Object.keys(cenarios).map((nome) => {
    const alvo = nome === 'recuperacao' ? 10 : Number(nome.split('_').pop());
    const requisicoes = valor('http_reqs', nome, 'count') ?? 0;
    const p95 = valor('http_req_duration', nome, 'p(95)') ?? 0;
    const erros = (valor('http_req_failed', nome, 'rate') ?? 0) * 100;
    const descartadas = valor('dropped_iterations', nome, 'count') ?? 0;
    const rompeu = erros > 1 || p95 > LIMITE_P95_MS || descartadas > alvo * DURACAO_S * 0.01;
    if (rompeu && ruptura === null && nome !== 'recuperacao') ruptura = alvo;
    return (
      `| ${nome === 'recuperacao' ? 'recuperação' : alvo} | ${(requisicoes / DURACAO_S).toFixed(0)} | ` +
      `${Math.round(p95)} | ${erros.toFixed(2)} | ${descartadas} | ${rompeu ? 'não' : 'sim'} |`
    );
  });
  const tabela = [
    '## Stress: degraus de 1 min até a ruptura',
    '',
    ruptura === null
      ? `Nenhum degrau passou de 1% de erro, p95 de ${LIMITE_P95_MS} ms ou 1% de acessos sem começar.`
      : `Ponto de ruptura: ${ruptura} acessos/s (cada acesso = 3 requisições).`,
    '',
    '| Acessos/s pedidos | Requisições/s atendidas | p95 (ms) | Erros (%) | Acessos não iniciados | Dentro do limite |',
    '|---|---|---|---|---|---|',
    ...linhas,
    '',
  ].join('\n');
  return { stdout: tabela, [`${__ENV.SAIDA || '.'}/stress.md`]: tabela };
}

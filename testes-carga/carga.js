// Teste de carga: até 50 pessoas usando a aplicação ao mesmo tempo.
//
// Cada usuário virtual entra numa das contas demo (npm run demo:criar -- --quantidade 10) e repete
// o uso típico: abre o Resumo, lista as transações do mês, vê as contas, lança uma despesa e a
// exclui (para não mudar os dados entre rodadas). Um segundo cenário faz logins contínuos, porque
// o bcrypt do login é a operação mais cara da API.
//
//   docker run --rm --network host -v "$PWD/testes-carga:/testes" -e DEMO_SENHA=... \
//     grafana/k6:1.3.0 run /testes/carga.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, entrar, limitesPorRota, mesAtual, obter, tabelaPorRota } from './comum.js';

const CONTAS_DEMO = Number(__ENV.CONTAS_DEMO || 10);

// p95 aceitável por rota, em ms.
const ROTAS = {
  resumo: 500,
  transacoes: 500,
  contas: 500,
  'criar transacao': 500,
  'excluir transacao': 500,
  login: 1500,
};

export const options = {
  scenarios: {
    uso: {
      executor: 'ramping-vus',
      exec: 'uso',
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '30s', target: 25 },
        { duration: '1m', target: 25 },
        { duration: '30s', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
    },
    logins: {
      executor: 'constant-arrival-rate',
      exec: 'login',
      rate: 2,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 5,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    ...limitesPorRota(ROTAS),
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const emails = Array.from({ length: CONTAS_DEMO }, (_, i) => `demo${i + 1}@financas.demo`);
  return { auths: entrar(emails), emails };
}

export function uso({ auths }) {
  const auth = auths[(__VU - 1) % auths.length];
  const { ano, mes } = mesAtual();

  obter(auth, `/api/dashboard/resumo?mes=${mes}&ano=${ano}`, 'resumo');
  const lista = obter(auth, `/api/transacoes?mes=${mes}&ano=${ano}`, 'transacoes');
  obter(auth, '/api/contas', 'contas');
  sleep(1);

  const categoria = lista.json('0.categoriaId');
  const contaId = lista.json('0.contaId');
  if (categoria && contaId) {
    const nova = http.post(
      `${BASE_URL}/api/transacoes`,
      JSON.stringify({
        descricao: `Carga k6 ${__VU}-${__ITER}`,
        valor: 12.34,
        tipo: lista.json('0.tipo'),
        categoriaId: categoria,
        contaId,
        dataTransacao: `${ano}-${String(mes).padStart(2, '0')}-01`,
      }),
      { headers: auth, tags: { nome: 'criar transacao' } },
    );
    check(nova, { 'criar transacao: 201': (r) => r.status === 201 });
    if (nova.status === 201) {
      const exclusao = http.del(`${BASE_URL}/api/transacoes/${nova.json('id')}`, null, {
        headers: auth,
        tags: { nome: 'excluir transacao' },
      });
      check(exclusao, { 'excluir transacao: 204': (r) => r.status === 204 });
    }
  }
  sleep(1);
}

export function login({ emails }) {
  entrar([emails[__ITER % emails.length]]);
}

export function handleSummary(data) {
  const tabela = tabelaPorRota(data, Object.keys(ROTAS), 'Carga: até 50 usuários simultâneos');
  return { stdout: tabela, [`${__ENV.SAIDA || '.'}/carga.md`]: tabela };
}

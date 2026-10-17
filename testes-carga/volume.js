// Teste de volume: as mesmas telas com uma conta de 20 mil lançamentos em 5 anos.
//
// Antes, crie a conta: DEMO_SENHA=... npm run carga:volume (em backend/). Mede cada rota com
// poucos usuários simultâneos, para que o tempo reflita o tamanho dos dados e não a disputa.
// A listagem sem filtro devolve todos os lançamentos de uma vez (não há paginação): o tamanho da
// resposta aparece no relatório.
//
//   docker run --rm --network host -v "$PWD/testes-carga:/testes" -e DEMO_SENHA=... \
//     grafana/k6:1.3.0 run /testes/volume.js
import { Trend } from 'k6/metrics';
import { entrar, limitesPorRota, mesAtual, obter, tabelaPorRota } from './comum.js';

const tamanhoResposta = new Trend('tamanho_resposta_kb');

// p95 aceitável por rota, em ms; null só registra (a listagem completa é o que se quer medir).
const ROTAS = {
  resumo: 1000,
  'transacoes do mes': 1000,
  'evolucao do ano': 1000,
  'categorias do mes': 1000,
  'busca por descricao': 1000,
  contas: 1000,
  'todas as transacoes': null,
};

export const options = {
  scenarios: {
    volume: { executor: 'constant-vus', vus: 5, duration: '1m' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    ...limitesPorRota(ROTAS),
    // Só para o tamanho aparecer no resumo.
    ...Object.fromEntries(
      Object.keys(ROTAS).map((nome) => [`tamanho_resposta_kb{nome:${nome}}`, ['avg>=0']]),
    ),
  },
};

export function setup() {
  return { auth: entrar([__ENV.EMAIL_VOLUME || 'volume@financas.demo'])[0] };
}

export default function ({ auth }) {
  const { ano, mes } = mesAtual();
  const medir = (caminho, nome) => {
    const resposta = obter(auth, caminho, nome);
    tamanhoResposta.add(resposta.body.length / 1024, { nome });
  };

  medir(`/api/dashboard/resumo?mes=${mes}&ano=${ano}`, 'resumo');
  medir(`/api/transacoes?mes=${mes}&ano=${ano}`, 'transacoes do mes');
  medir(`/api/dashboard/evolucao?ano=${ano}`, 'evolucao do ano');
  medir(`/api/dashboard/categorias?mes=${mes}&ano=${ano}`, 'categorias do mes');
  medir('/api/transacoes?busca=Mercado', 'busca por descricao');
  medir('/api/contas', 'contas');
  medir('/api/transacoes', 'todas as transacoes');
}

export function handleSummary(data) {
  const tabela = tabelaPorRota(data, Object.keys(ROTAS), 'Volume: conta com 20 mil lançamentos');
  return {
    stdout: tabela,
    [`${__ENV.SAIDA || '.'}/volume.md`]: tabela,
  };
}

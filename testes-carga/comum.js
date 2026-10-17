// Funções compartilhadas pelos cenários do k6.
import http from 'k6/http';
import { check, fail } from 'k6';

export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:4200').replace(/\/$/, '');
const SENHA = __ENV.DEMO_SENHA;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Entra com cada conta da lista e devolve os cabeçalhos de autorização. */
export function entrar(emails) {
  if (!SENHA) fail('Defina DEMO_SENHA com a senha das contas demo');
  return emails.map((email) => {
    const resposta = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email, senha: SENHA }),
      {
        headers: JSON_HEADERS,
        tags: { nome: 'login' },
      },
    );
    if (resposta.status !== 200) fail(`Login de ${email} falhou: ${resposta.status}`);
    return { Authorization: `Bearer ${resposta.json('token')}`, ...JSON_HEADERS };
  });
}

/** GET autenticado, com a rota agrupada pelo nome (para o relatório não separar por parâmetro). */
export function obter(auth, caminho, nome) {
  const resposta = http.get(`${BASE_URL}${caminho}`, { headers: auth, tags: { nome } });
  check(resposta, { [`${nome}: 200`]: (r) => r.status === 200 });
  return resposta;
}

export function mesAtual() {
  const hoje = new Date();
  return { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
}

/** Limites de p95 por rota (null = só registrar), no formato de `thresholds` do k6. */
export function limitesPorRota(limites) {
  return Object.fromEntries(
    Object.entries(limites).map(([nome, ms]) => [
      `http_req_duration{nome:${nome}}`,
      [ms === null ? 'p(95)>=0' : `p(95)<${ms}`],
    ]),
  );
}

/** Tabela em Markdown com as rotas medidas, para colar no relatório. */
export function tabelaPorRota(data, nomes, titulo) {
  const ms = (valor) => (valor === undefined ? '-' : `${Math.round(valor)}`);
  const linhas = nomes.map((nome) => {
    const tempo = data.metrics[`http_req_duration{nome:${nome}}`]?.values ?? {};
    const tamanho = data.metrics[`tamanho_resposta_kb{nome:${nome}}`]?.values;
    const kb = tamanho ? ` | ${tamanho.avg.toFixed(1)}` : '';
    return `| ${nome} | ${ms(tempo.med)} | ${ms(tempo['p(95)'])} | ${ms(tempo.max)}${kb} |`;
  });
  const comTamanho = nomes.some((nome) => data.metrics[`tamanho_resposta_kb{nome:${nome}}`]);
  const falhas = ((data.metrics.http_req_failed?.values.rate ?? 0) * 100).toFixed(2);
  const requisicoes = data.metrics.http_reqs?.values;
  return [
    `## ${titulo}`,
    '',
    `Requisições: ${requisicoes?.count ?? 0} (${(requisicoes?.rate ?? 0).toFixed(1)}/s), com ${falhas}% de erro.`,
    '',
    `| Rota | Mediana (ms) | p95 (ms) | Máximo (ms)${comTamanho ? ' | Resposta (KB)' : ''} |`,
    `|---|---|---|---${comTamanho ? '|---' : ''}|`,
    ...linhas,
    '',
  ].join('\n');
}

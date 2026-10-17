// Mede performance, acessibilidade, boas práticas e SEO das telas principais com o Lighthouse.
// Usa o Chromium do Playwright e entra com um usuário novo, porque o token fica na sessionStorage
// da aba: o login acontece na mesma aba que o Lighthouse mede.
//
//   node lighthouse/medir.mjs            (BASE_URL padrão: http://localhost:4200)
//
// Falha se alguma tela ficar abaixo de NOTA_MINIMA_ACESSIBILIDADE; as outras notas só são
// registradas, porque variam com a máquina.
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import puppeteer from 'puppeteer-core';
import { startFlow } from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:4200').replace(/\/$/, '');
const NOTA_MINIMA_ACESSIBILIDADE = 90;
const SAIDA = new URL('../lighthouse-report/', import.meta.url);

const telas = [
  { nome: 'Login', caminho: '/login', autenticada: false },
  { nome: 'Resumo', caminho: '/dashboard', autenticada: true },
  { nome: 'Transações', caminho: '/transacoes', autenticada: true },
  { nome: 'Metas', caminho: '/metas', autenticada: true },
];

const usuario = {
  nome: 'Lighthouse',
  email: `lighthouse-${Date.now()}@example.com`,
  senha: 'senha-de-teste-123',
};

const cadastro = await fetch(`${BASE_URL}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(usuario),
});
if (!cadastro.ok) throw new Error(`Cadastro falhou: ${cadastro.status}`);

const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? chromium.executablePath(),
  args: ['--no-sandbox'],
});
const pagina = await navegador.newPage();
const flow = await startFlow(pagina, {
  config: desktopConfig,
  // Sem isso o Lighthouse limpa a sessionStorage antes de medir e a tela volta para o login.
  flags: { disableStorageReset: true },
});

for (const tela of telas.filter((t) => !t.autenticada)) {
  await flow.navigate(`${BASE_URL}${tela.caminho}`, { name: tela.nome });
}

await pagina.goto(`${BASE_URL}/login`);
await pagina.type('#login-email', usuario.email);
await pagina.type('#login-senha', usuario.senha);
await Promise.all([pagina.waitForNavigation(), pagina.click('button[type="submit"]')]);

for (const tela of telas.filter((t) => t.autenticada)) {
  await flow.navigate(`${BASE_URL}${tela.caminho}`, { name: tela.nome });
}

const resultado = await flow.createFlowResult();
await mkdir(SAIDA, { recursive: true });
await writeFile(new URL('relatorio.html', SAIDA), await flow.generateReport());
await writeFile(new URL('relatorio.json', SAIDA), JSON.stringify(resultado, null, 2));
await navegador.close();

const nota = (lhr, categoria) => Math.round((lhr.categories[categoria]?.score ?? 0) * 100);
const linhas = resultado.steps.map(({ name, lhr }) => ({
  tela: name,
  performance: nota(lhr, 'performance'),
  acessibilidade: nota(lhr, 'accessibility'),
  boasPraticas: nota(lhr, 'best-practices'),
  seo: nota(lhr, 'seo'),
  lcp: Math.round(lhr.audits['largest-contentful-paint'].numericValue),
}));

const tabela = [
  '| Tela | Performance | Acessibilidade | Boas práticas | SEO | LCP (ms) |',
  '|---|---|---|---|---|---|',
  ...linhas.map(
    (l) =>
      `| ${l.tela} | ${l.performance} | ${l.acessibilidade} | ${l.boasPraticas} | ${l.seo} | ${l.lcp} |`,
  ),
].join('\n');
const markdown = `## Lighthouse (desktop)\n\n${tabela}\n`;
await writeFile(new URL('resultado.md', SAIDA), markdown);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);

const abaixo = linhas.filter((l) => l.acessibilidade < NOTA_MINIMA_ACESSIBILIDADE);
if (abaixo.length > 0) {
  console.error(
    `Acessibilidade abaixo de ${NOTA_MINIMA_ACESSIBILIDADE}: ${abaixo.map((l) => l.tela).join(', ')}`,
  );
  process.exit(1);
}

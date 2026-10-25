import { expect, test } from '@playwright/test';
import { usuarioNovo } from '../tests/suporte/usuario';

// Data fixa: o mês exibido e os lançamentos não mudam de uma execução para outra.
const HOJE = new Date('2026-09-15T12:00:00-03:00');

const LANCAMENTOS = [
  { descricao: 'Salário', valor: 5000, tipo: 'RECEITA', categoria: 'Salário', dia: '05' },
  { descricao: 'Aluguel', valor: 1500, tipo: 'DESPESA', categoria: 'Moradia', dia: '10' },
  { descricao: 'Mercado', valor: 420.9, tipo: 'DESPESA', categoria: 'Alimentação', dia: '12' },
  { descricao: 'Ônibus', valor: 88, tipo: 'DESPESA', categoria: 'Transporte', dia: '14' },
];

// Uma meta em cada situação, para o print do Resumo mostrar as três (cor, ícone e texto).
const METAS = [
  { categoria: 'Moradia', valor: 1450 }, // 103% — estourada
  { categoria: 'Alimentação', valor: 450 }, // 94% — perto do limite
  { categoria: 'Transporte', valor: 300 }, // 29% — dentro da meta
];

test.describe('Regressão visual', () => {
  test('Login', async ({ page }) => {
    await page.clock.setFixedTime(HOJE);
    await page.goto('/login');
    await expect(page).toHaveScreenshot('login.png', { fullPage: true });
  });

  test('telas autenticadas com dados fixos', async ({ page, request }) => {
    const usuario = usuarioNovo('visual');
    await request.post('/api/auth/register', { data: usuario });
    const login = await request.post('/api/auth/login', {
      data: { email: usuario.email, senha: usuario.senha },
    });
    const auth = { Authorization: `Bearer ${(await login.json()).token}` };
    const categorias: { id: number; nome: string; tipo: string }[] = await (
      await request.get('/api/categorias', { headers: auth })
    ).json();
    for (const l of LANCAMENTOS) {
      const categoria = categorias.find((c) => c.nome === l.categoria && c.tipo === l.tipo);
      const resposta = await request.post('/api/transacoes', {
        headers: auth,
        data: {
          descricao: l.descricao,
          valor: l.valor,
          tipo: l.tipo,
          categoriaId: categoria?.id,
          dataTransacao: `2026-09-${l.dia}`,
        },
      });
      expect(resposta.status()).toBe(201);
    }
    for (const m of METAS) {
      const categoria = categorias.find((c) => c.nome === m.categoria && c.tipo === 'DESPESA');
      const resposta = await request.put('/api/metas/categorias', {
        headers: auth,
        data: { ano: 2026, mes: 9, categoriaId: categoria?.id, valor: m.valor },
      });
      expect(resposta.ok()).toBe(true);
    }

    await page.clock.setFixedTime(HOJE);
    await page.goto('/login');
    await page.fill('#login-email', usuario.email);
    await page.fill('#login-senha', usuario.senha);
    await page.getByRole('button', { name: /^entrar$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    for (const [caminho, arquivo] of [
      ['/dashboard', 'resumo.png'],
      ['/transacoes', 'transacoes.png'],
      ['/metas', 'metas.png'],
    ]) {
      await page.goto(caminho);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot(arquivo, { fullPage: true });
    }

    // Formulário de nova transação: tipo em botões, valor no início e data em dd/mm/aaaa.
    await page.goto('/transacoes');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /nova transação/i }).first().click();
    await expect(page.locator('dialog[open]')).toHaveScreenshot('nova-transacao.png');
  });
});

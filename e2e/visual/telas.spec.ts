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
  });
});

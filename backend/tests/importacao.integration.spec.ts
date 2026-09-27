import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const descrever = DATABASE_URL_TEST ? describe : describe.skip;

const FIXTURES = path.resolve(__dirname, 'fixtures');
const EXTRATOS = path.join(FIXTURES, 'extratos');
const FATURAS = path.join(FIXTURES, 'faturas');
const EXTRATO_COMPLETO = 'NU_123456789_01JAN2026_25SET2026.ofx';

interface LinhaPreview {
  idExterno: string;
  categoriaId: number;
  tipo: 'RECEITA' | 'DESPESA';
  duplicada: boolean;
  ignoradaSugerida: boolean;
}

descrever('Importação de OFX (integração, MySQL real)', () => {
  let app: Express;
  let desconectar: () => Promise<void>;
  let limpar: () => Promise<void>;

  const sufixo = `${Date.now()}`;
  const emailAna = `imp.ana.${sufixo}@teste.com`;
  const emailBia = `imp.bia.${sufixo}@teste.com`;
  let tokenAna: string;
  let tokenBia: string;

  const mensais = readdirSync(EXTRATOS)
    .filter((nome) => nome !== EXTRATO_COMPLETO)
    .sort()
    .map((nome) => path.join(EXTRATOS, nome));
  const faturas = readdirSync(FATURAS)
    .sort()
    .map((nome) => path.join(FATURAS, nome));

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL_TEST;
    process.env.JWT_SECRET = 'segredo-de-integracao-com-mais-de-16-chars';
    process.env.NODE_ENV = 'test';

    const { prisma } = await import('../src/config/database');
    const { criarApp } = await import('../src/app');
    app = criarApp();

    // Garante as categorias padrão, como o seed faz.
    const padrao = [
      ['Alimentação', 'DESPESA'],
      ['Moradia', 'DESPESA'],
      ['Transporte', 'DESPESA'],
      ['Lazer', 'DESPESA'],
      ['Saúde', 'DESPESA'],
      ['Educação', 'DESPESA'],
      ['Outros', 'DESPESA'],
      ['Salário', 'RECEITA'],
      ['Freelance', 'RECEITA'],
      ['Investimentos', 'RECEITA'],
      ['Outros', 'RECEITA'],
    ] as const;
    for (const [nome, tipo] of padrao) {
      if (!(await prisma.categoria.findFirst({ where: { nome, tipo, usuarioId: null } }))) {
        await prisma.categoria.create({ data: { nome, tipo } });
      }
    }

    limpar = async () => {
      const usuarios = await prisma.usuario.findMany({
        where: { email: { in: [emailAna, emailBia] } },
        select: { id: true },
      });
      const ids = usuarios.map((u) => u.id);
      await prisma.transacao.deleteMany({ where: { usuarioId: { in: ids } } });
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    };
    desconectar = () => prisma.$disconnect();

    tokenAna = await registrarELogar(emailAna);
    tokenBia = await registrarELogar(emailBia);
  });

  afterAll(async () => {
    await limpar();
    await desconectar();
  });

  async function registrarELogar(email: string): Promise<string> {
    // O nome bate com o titular dos fixtures, para exercitar a transferência entre contas próprias.
    await request(app)
      .post('/api/auth/register')
      .send({ nome: 'Usuario Teste', email, senha: 'senha-segura-123' })
      .expect(201);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, senha: 'senha-segura-123' })
      .expect(200);
    return login.body.token;
  }

  const preview = (token: string, arquivo: string | Buffer, nome = 'extrato.ofx') =>
    request(app)
      .post('/api/importacoes/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('arquivo', typeof arquivo === 'string' ? readFileSync(arquivo) : arquivo, nome);

  const confirmar = (token: string, transacoes: unknown[]) =>
    request(app)
      .post('/api/importacoes/confirmar')
      .set('Authorization', `Bearer ${token}`)
      .send({ transacoes });

  // O que a tela faz: só as linhas novas e não desmarcadas vão para o `confirmar`.
  async function importarArquivo(token: string, arquivo: string) {
    const resposta = await preview(token, arquivo, path.basename(arquivo)).expect(200);
    const selecionadas = (resposta.body.linhas as LinhaPreview[]).filter(
      (l) => !l.duplicada && !l.ignoradaSugerida,
    );
    if (selecionadas.length === 0) return { importadas: 0 };

    const gravacao = await confirmar(token, selecionadas).expect(200);
    return { importadas: gravacao.body.importadas as number };
  }

  async function contarTransacoes(token: string): Promise<number> {
    const resposta = await request(app)
      .get('/api/transacoes')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return resposta.body.length;
  }

  it('exige autenticação (401)', async () => {
    await request(app).post('/api/importacoes/preview').expect(401);
    await request(app).post('/api/importacoes/confirmar').send({ transacoes: [] }).expect(401);
  });

  it('valida o envio do arquivo (400 sem arquivo, extensão errada ou conteúdo que não é OFX)', async () => {
    await request(app)
      .post('/api/importacoes/preview')
      .set('Authorization', `Bearer ${tokenAna}`)
      .expect(400);
    await preview(tokenAna, Buffer.from('<OFX></OFX>'), 'extrato.csv').expect(400);
    await preview(tokenAna, Buffer.from('a;b;c'), 'extrato.ofx').expect(400);
    await preview(tokenAna, Buffer.from('OFXHEADER:100\n<OFX>\n</OFX>'), 'vazio.ofx').expect(422);
  });

  it('rejeita arquivo acima de 2 MB (413)', async () => {
    await preview(tokenAna, Buffer.alloc(2 * 1024 * 1024 + 1, 'a'), 'grande.ofx').expect(413);
  });

  it('o preview não grava nada', async () => {
    const resposta = await preview(tokenAna, path.join(EXTRATOS, EXTRATO_COMPLETO)).expect(200);

    expect(resposta.body.origem).toBe('CONTA');
    expect(resposta.body.linhas).toHaveLength(165);
    expect(await contarTransacoes(tokenAna)).toBe(0);
  });

  it('confirmar rejeita categoria de tipo diferente e não grava (400)', async () => {
    const resposta = await preview(tokenAna, mensais[0]).expect(200);
    const despesa = resposta.body.linhas.find((l: LinhaPreview) => l.tipo === 'DESPESA');
    const receita = resposta.body.linhas.find((l: LinhaPreview) => l.tipo === 'RECEITA');

    await confirmar(tokenAna, [{ ...despesa, categoriaId: receita.categoriaId }]).expect(400);
    await confirmar(tokenAna, [{ ...despesa, categoriaId: 999_999 }]).expect(400);
    await confirmar(tokenAna, []).expect(400);
    expect(await contarTransacoes(tokenAna)).toBe(0);
  });

  it('importa os 9 extratos e as 9 faturas: gravam-se 481 das 500 transações distintas', async () => {
    let total = 0;
    for (const arquivo of [...mensais, ...faturas]) {
      total += (await importarArquivo(tokenAna, arquivo)).importadas;
    }

    expect(total).toBe(481);
    expect(await contarTransacoes(tokenAna)).toBe(481);
  });

  it('reenviar qualquer arquivo, ou o extrato completo, não duplica nada', async () => {
    for (const arquivo of [...mensais, ...faturas, path.join(EXTRATOS, EXTRATO_COMPLETO)]) {
      expect((await importarArquivo(tokenAna, arquivo)).importadas).toBe(0);
    }
    expect(await contarTransacoes(tokenAna)).toBe(481);
  });

  it('o pagamento de fatura vem desmarcado e, se enviado à força, cai como duplicado', async () => {
    const janeiro = await preview(tokenAna, mensais[0]).expect(200);
    const pagamento = janeiro.body.linhas.find((l: LinhaPreview & { descricao: string }) =>
      l.descricao.startsWith('Pagamento de fatura'),
    );
    expect(pagamento.ignoradaSugerida).toBe(true);

    // Marcado à mão na revisão: entra uma vez; o "Pagamento recebido" da fatura tem o mesmo FITID.
    const primeiro = await confirmar(tokenAna, [pagamento]).expect(200);
    const segundo = await confirmar(tokenAna, [pagamento]).expect(200);
    expect(primeiro.body).toEqual({ importadas: 1, ignoradasPorDuplicidade: 0 });
    expect(segundo.body).toEqual({ importadas: 0, ignoradasPorDuplicidade: 1 });
  });

  it('usuários diferentes não enxergam nem bloqueiam as importações um do outro', async () => {
    expect(await contarTransacoes(tokenBia)).toBe(0);

    const resposta = await preview(tokenBia, mensais[0]).expect(200);
    expect(resposta.body.linhas.every((l: LinhaPreview) => !l.duplicada)).toBe(true);

    const { importadas } = await importarArquivo(tokenBia, mensais[0]);
    expect(importadas).toBeGreaterThan(0);
    expect(await contarTransacoes(tokenBia)).toBe(importadas);
  });

  it('o dashboard soma o que foi importado', async () => {
    const resumo = await request(app)
      .get('/api/dashboard/resumo?mes=1&ano=2026')
      .set('Authorization', `Bearer ${tokenAna}`)
      .expect(200);

    expect(resumo.body.totalReceitas).toBeGreaterThan(0);
    expect(resumo.body.totalDespesas).toBeGreaterThan(0);
    expect(resumo.body.saldoAtual).toBeCloseTo(
      resumo.body.totalReceitas - resumo.body.totalDespesas,
      2,
    );
  });

  describe('gráficos do dashboard sobre a série importada', () => {
    const get = (token: string, url: string) =>
      request(app).get(url).set('Authorization', `Bearer ${token}`);

    it('exige autenticação e valida os parâmetros (401 e 400)', async () => {
      await request(app).get('/api/dashboard/evolucao').expect(401);
      await request(app).get('/api/dashboard/categorias').expect(401);
      await get(tokenAna, '/api/dashboard/evolucao?ano=abc').expect(400);
      await get(tokenAna, '/api/dashboard/categorias?mes=13&ano=2026').expect(400);
      await get(tokenAna, '/api/dashboard/categorias?mes=3').expect(400);
      await get(tokenAna, '/api/dashboard/categorias?tipo=OUTRO').expect(400);
    });

    it('evolução: 12 meses, jan–set com movimento e out–dez zerados', async () => {
      const resposta = await get(tokenAna, '/api/dashboard/evolucao?ano=2026').expect(200);

      expect(resposta.body.ano).toBe(2026);
      expect(resposta.body.meses).toHaveLength(12);
      const meses = resposta.body.meses as {
        mes: number;
        totalReceitas: number;
        totalDespesas: number;
        saldo: number;
      }[];
      for (const m of meses.slice(0, 9)) {
        expect(m.totalReceitas).toBeGreaterThan(0);
        expect(m.totalDespesas).toBeGreaterThan(0);
      }
      for (const m of meses.slice(9)) {
        expect(m).toMatchObject({ totalReceitas: 0, totalDespesas: 0, saldo: 0 });
      }
    });

    it('evolução: cada mês bate com o resumo do mesmo mês', async () => {
      const evolucao = await get(tokenAna, '/api/dashboard/evolucao?ano=2026').expect(200);

      for (const m of evolucao.body.meses as {
        mes: number;
        totalReceitas: number;
        totalDespesas: number;
      }[]) {
        const resumo = await get(tokenAna, `/api/dashboard/resumo?mes=${m.mes}&ano=2026`).expect(
          200,
        );
        expect(m.totalReceitas).toBe(resumo.body.totalReceitas);
        expect(m.totalDespesas).toBe(resumo.body.totalDespesas);
      }
    });

    it('evolução: outro ano vem zerado e outro usuário não vê os dados da Ana', async () => {
      const outroAno = await get(tokenAna, '/api/dashboard/evolucao?ano=2025').expect(200);
      expect(
        outroAno.body.meses.every((m: { totalDespesas: number }) => m.totalDespesas === 0),
      ).toBe(true);

      const bia = await get(tokenBia, '/api/dashboard/evolucao?ano=2026').expect(200);
      // A Bia importou só um mês; os outros onze ficam zerados.
      const comMovimento = bia.body.meses.filter(
        (m: { totalDespesas: number }) => m.totalDespesas > 0,
      );
      expect(comMovimento).toHaveLength(1);
    });

    it('categorias: despesas do mês ordenadas, com percentuais somando 100', async () => {
      const resposta = await get(tokenAna, '/api/dashboard/categorias?mes=3&ano=2026').expect(200);
      const { tipo, total, categorias } = resposta.body as {
        tipo: string;
        total: number;
        categorias: { categoria: string; total: number; percentual: number }[];
      };

      expect(tipo).toBe('DESPESA');
      expect(categorias.length).toBeGreaterThan(1);
      const totais = categorias.map((c) => c.total);
      expect(totais).toEqual([...totais].sort((a, b) => b - a));
      expect(Math.round(categorias.reduce((soma, c) => soma + c.percentual, 0) * 10)).toBe(1000);
      expect(Math.round(totais.reduce((soma, valor) => soma + valor, 0) * 100) / 100).toBeCloseTo(
        total,
        2,
      );

      const resumo = await get(tokenAna, '/api/dashboard/resumo?mes=3&ano=2026').expect(200);
      expect(total).toBe(resumo.body.totalDespesas);
    });

    it('categorias: tipo RECEITA e mês sem lançamentos', async () => {
      const receitas = await get(
        tokenAna,
        '/api/dashboard/categorias?mes=1&ano=2026&tipo=RECEITA',
      ).expect(200);
      const resumoJaneiro = await get(tokenAna, '/api/dashboard/resumo?mes=1&ano=2026').expect(200);
      expect(receitas.body.tipo).toBe('RECEITA');
      expect(receitas.body.total).toBe(resumoJaneiro.body.totalReceitas);
      expect(receitas.body.categorias.length).toBeGreaterThan(0);

      const vazio = await get(tokenAna, '/api/dashboard/categorias?mes=11&ano=2026').expect(200);
      expect(vazio.body).toEqual({ tipo: 'DESPESA', total: 0, categorias: [] });
    });
  });
});

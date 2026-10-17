import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const descrever = DATABASE_URL_TEST ? describe : describe.skip;

const EXTRATO = path.resolve(
  __dirname,
  'fixtures',
  'extratos',
  'NU_123456789_01MAR2026_31MAR2026.ofx',
);

/**
 * Integridade dos dados sob acesso simultâneo e depois de exclusões: o que os testes de API,
 * que fazem uma requisição por vez, não enxergam.
 */
descrever('Integridade dos dados (integração, MySQL real)', () => {
  let app: Express;
  let prisma: typeof import('../src/config/database').prisma;

  const sufixo = `${Date.now()}`;
  const emailCorrida = `int.corrida.${sufixo}@teste.com`;
  const emailImporta = `int.importa.${sufixo}@teste.com`;
  const emailExclui = `int.exclui.${sufixo}@teste.com`;
  const senha = 'senha-segura-123';

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL_TEST;
    process.env.JWT_SECRET = 'segredo-de-integracao-com-mais-de-16-chars';
    process.env.NODE_ENV = 'test';

    ({ prisma } = await import('../src/config/database'));
    const { criarApp } = await import('../src/app');
    app = criarApp();

    for (const [nome, tipo] of [
      ['Outros', 'DESPESA'],
      ['Outros', 'RECEITA'],
    ] as const) {
      if (!(await prisma.categoria.findFirst({ where: { nome, tipo, usuarioId: null } }))) {
        await prisma.categoria.create({ data: { nome, tipo } });
      }
    }
  });

  afterAll(async () => {
    const usuarios = await prisma.usuario.findMany({
      where: { email: { in: [emailCorrida, emailImporta, emailExclui] } },
      select: { id: true },
    });
    const ids = usuarios.map((u) => u.id);
    await prisma.transacao.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  async function registrarELogar(email: string): Promise<Record<string, string>> {
    await request(app)
      .post('/api/auth/register')
      .send({ nome: 'Usuario Teste', email, senha })
      .expect(201);
    const login = await request(app).post('/api/auth/login').send({ email, senha }).expect(200);
    return { Authorization: `Bearer ${login.body.token}` };
  }

  it('cadastros simultâneos com o mesmo e-mail: só um entra, os outros recebem 409', async () => {
    const respostas = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/auth/register')
          .send({ nome: 'Corrida', email: emailCorrida, senha }),
      ),
    );

    const status = respostas.map((r) => r.status).sort();
    expect(status).toEqual([201, 409, 409, 409, 409]);
    expect(await prisma.usuario.count({ where: { email: emailCorrida } })).toBe(1);
  });

  describe('importação confirmada várias vezes ao mesmo tempo', () => {
    let auth: Record<string, string>;
    let linhas: { idExterno: string; ignoradaSugerida: boolean }[];

    beforeAll(async () => {
      auth = await registrarELogar(emailImporta);
      const preview = await request(app)
        .post('/api/importacoes/preview')
        .set(auth)
        .attach('arquivo', readFileSync(EXTRATO), path.basename(EXTRATO))
        .expect(200);
      linhas = preview.body.linhas.filter(
        (l: { ignoradaSugerida: boolean }) => !l.ignoradaSugerida,
      );
    });

    it('grava cada lançamento uma única vez', async () => {
      const respostas = await Promise.all(
        Array.from({ length: 3 }, () =>
          request(app).post('/api/importacoes/confirmar').set(auth).send({ transacoes: linhas }),
        ),
      );

      expect(respostas.map((r) => r.status)).toEqual([200, 200, 200]);
      const importadas = respostas.reduce((soma, r) => soma + r.body.importadas, 0);
      expect(importadas).toBe(linhas.length);

      const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email: emailImporta } });
      const repetidos = await prisma.transacao.groupBy({
        by: ['contaId', 'idExterno'],
        where: { usuarioId: usuario.id, idExterno: { not: null } },
        _count: { _all: true },
        having: { idExterno: { _count: { gt: 1 } } },
      });
      expect(repetidos).toEqual([]);
      expect(await prisma.transacao.count({ where: { usuarioId: usuario.id } })).toBe(
        linhas.length,
      );
      expect(await prisma.conta.count({ where: { usuarioId: usuario.id } })).toBe(1);
    });

    it('o saldo da conta e o Resumo batem com a soma das transações no banco', async () => {
      const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email: emailImporta } });
      const soma = async (tipo: 'RECEITA' | 'DESPESA', soReais: boolean) =>
        Number(
          (
            await prisma.transacao.aggregate({
              where: {
                usuarioId: usuario.id,
                tipo,
                dataTransacao: { gte: new Date('2026-03-01'), lt: new Date('2026-04-01') },
                ...(soReais && { transferenciaId: null }),
              },
              _sum: { valor: true },
            })
          )._sum.valor ?? 0,
        );
      const centavos = (valor: number) => Math.round(valor * 100);

      const contas = await request(app).get('/api/contas').set(auth).expect(200);
      const [conta] = contas.body;
      expect(centavos(conta.saldo)).toBe(
        centavos(
          conta.saldoInicial + (await soma('RECEITA', false)) - (await soma('DESPESA', false)),
        ),
      );

      const resumo = await request(app)
        .get('/api/dashboard/resumo?mes=3&ano=2026')
        .set(auth)
        .expect(200);
      expect(centavos(resumo.body.totalReceitas)).toBe(centavos(await soma('RECEITA', true)));
      expect(centavos(resumo.body.totalDespesas)).toBe(centavos(await soma('DESPESA', true)));
    });
  });

  it('excluir a conta não deixa nenhuma linha órfã em nenhuma tabela', async () => {
    const auth = await registrarELogar(emailExclui);
    const conta = await request(app)
      .post('/api/contas')
      .set(auth)
      .send({ nome: 'Carteira', tipo: 'DINHEIRO', saldoInicial: 10 })
      .expect(201);
    const categoria = await request(app)
      .post('/api/categorias')
      .set(auth)
      .send({ nome: 'Pets', tipo: 'DESPESA' })
      .expect(201);
    await request(app)
      .post('/api/transacoes')
      .set(auth)
      .send({
        descricao: 'Ração',
        valor: 90,
        tipo: 'DESPESA',
        dataTransacao: '2026-09-10',
        categoriaId: categoria.body.id,
        contaId: conta.body.id,
      })
      .expect(201);
    await request(app)
      .put('/api/metas')
      .set(auth)
      .send({ ano: 2026, mes: 9, orcamentoLimite: 500 })
      .expect(200);
    await request(app)
      .put('/api/metas/categorias')
      .set(auth)
      .send({ ano: 2026, mes: 9, categoriaId: categoria.body.id, valor: 100 })
      .expect(200);
    await request(app)
      .post('/api/regras')
      .set(auth)
      .send({ termo: 'petshop', categoriaId: categoria.body.id })
      .expect(201);
    await request(app)
      .post('/api/recorrentes/ignorar')
      .set(auth)
      .send({ chave: 'streaming zeta' })
      .expect(200);
    const objetivo = await request(app)
      .post('/api/objetivos')
      .set(auth)
      .send({ nome: 'Reserva', valorAlvo: 1000, prazoAno: 2027, prazoMes: 6 })
      .expect(201);
    await request(app)
      .post(`/api/objetivos/${objetivo.body.id}/aportes`)
      .set(auth)
      .send({ valor: 50, data: '2026-09-01' })
      .expect(201);

    const { id: usuarioId } = await prisma.usuario.findUniqueOrThrow({
      where: { email: emailExclui },
    });
    const contarTudo = async () => {
      const contagens = await Promise.all([
        prisma.usuario.count({ where: { id: usuarioId } }),
        prisma.conta.count({ where: { usuarioId } }),
        prisma.categoria.count({ where: { usuarioId } }),
        prisma.transacao.count({ where: { usuarioId } }),
        prisma.metaMensal.count({ where: { usuarioId } }),
        prisma.metaCategoria.count({ where: { usuarioId } }),
        prisma.regraCategoria.count({ where: { usuarioId } }),
        prisma.recorrenciaIgnorada.count({ where: { usuarioId } }),
        prisma.objetivo.count({ where: { usuarioId } }),
        prisma.aporte.count({ where: { objetivoId: objetivo.body.id } }),
      ]);
      return contagens;
    };
    // Uma linha em cada uma das 10 tabelas antes da exclusão.
    expect(await contarTudo()).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);

    await request(app).delete('/api/auth/conta').set(auth).send({ senha }).expect(204);

    expect(await contarTudo()).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

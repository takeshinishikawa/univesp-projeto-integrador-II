import type { Express } from 'express';
import request from 'supertest';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const descrever = DATABASE_URL_TEST ? describe : describe.skip;

descrever('API (integração, MySQL real)', () => {
  let app: Express;
  let desconectar: () => Promise<void>;
  let limpar: () => Promise<void>;
  let categoriaDespesaId: number;
  let categoriaReceitaId: number;

  const sufixo = `${Date.now()}`;
  const emailAna = `ana.${sufixo}@teste.com`;
  const emailBia = `bia.${sufixo}@teste.com`;
  let tokenAna: string;
  let tokenBia: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL_TEST;
    process.env.JWT_SECRET = 'segredo-de-integracao-com-mais-de-16-chars';
    process.env.NODE_ENV = 'test';

    const { prisma } = await import('../src/config/database');
    const { criarApp } = await import('../src/app');
    app = criarApp();

    const despesa =
      (await prisma.categoria.findFirst({ where: { tipo: 'DESPESA', usuarioId: null } })) ??
      (await prisma.categoria.create({ data: { nome: 'Teste Despesa', tipo: 'DESPESA' } }));
    const receita =
      (await prisma.categoria.findFirst({ where: { tipo: 'RECEITA', usuarioId: null } })) ??
      (await prisma.categoria.create({ data: { nome: 'Teste Receita', tipo: 'RECEITA' } }));
    categoriaDespesaId = despesa.id;
    categoriaReceitaId = receita.id;

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
  });

  afterAll(async () => {
    await limpar();
    await desconectar();
  });

  async function registrarELogar(email: string): Promise<string> {
    const cadastro = await request(app)
      .post('/api/auth/register')
      .send({ nome: 'Usuário Teste', email, senha: 'senha-segura-123' });
    expect(cadastro.status).toBe(201);
    expect(cadastro.body).not.toHaveProperty('senhaHash');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, senha: 'senha-segura-123' });
    expect(login.status).toBe(200);
    return login.body.token;
  }

  it('cadastra, rejeita e-mail duplicado (409) e autentica', async () => {
    tokenAna = await registrarELogar(emailAna);
    tokenBia = await registrarELogar(emailBia);

    const duplicado = await request(app)
      .post('/api/auth/register')
      .send({ nome: 'Outra', email: emailAna, senha: 'senha-segura-123' });
    expect(duplicado.status).toBe(409);
  });

  it('valida payload de registro (400) e credenciais (401)', async () => {
    const invalido = await request(app)
      .post('/api/auth/register')
      .send({ nome: '', email: 'nao-e-email', senha: '123' });
    expect(invalido.status).toBe(400);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: emailAna, senha: 'errada' });
    expect(login.status).toBe(401);
  });

  it('exige autenticação nas rotas protegidas', async () => {
    expect((await request(app).get('/api/transacoes')).status).toBe(401);
    expect((await request(app).get('/api/dashboard/resumo')).status).toBe(401);
    expect(
      (await request(app).get('/api/transacoes').set('Authorization', 'Bearer lixo')).status,
    ).toBe(401);
  });

  it('health: público e confirma a conexão com o banco', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('lista categorias (só autenticado) e marca as padrão', async () => {
    expect((await request(app).get('/api/categorias')).status).toBe(401);

    const res = await request(app)
      .get('/api/categorias')
      .set({ Authorization: `Bearer ${tokenAna}` });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toEqual(
      expect.objectContaining({ id: expect.any(Number), padrao: expect.any(Boolean) }),
    );
    expect(res.body.every((c: { padrao: boolean }) => c.padrao)).toBe(true); // ninguém criou nada ainda
  });

  it('CRUD de transações com filtro por mês/ano e ownership', async () => {
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const criada = await request(app).post('/api/transacoes').set(auth(tokenAna)).send({
      categoriaId: categoriaDespesaId,
      descricao: 'Mercado',
      valor: 150.75,
      tipo: 'DESPESA',
      dataTransacao: '2026-03-15',
    });
    expect(criada.status).toBe(201);
    expect(criada.body.valor).toBe(150.75);
    expect(criada.body.dataTransacao).toBe('2026-03-15');
    const id = criada.body.id;

    await request(app)
      .post('/api/transacoes')
      .set(auth(tokenAna))
      .send({
        categoriaId: categoriaDespesaId,
        descricao: 'Cinema',
        valor: 40,
        tipo: 'DESPESA',
        dataTransacao: '2026-04-02',
      })
      .expect(201);

    const marco = await request(app).get('/api/transacoes?mes=3&ano=2026').set(auth(tokenAna));
    expect(marco.status).toBe(200);
    expect(marco.body).toHaveLength(1);
    expect(marco.body[0].descricao).toBe('Mercado');

    const todas = await request(app).get('/api/transacoes').set(auth(tokenAna));
    expect(todas.body).toHaveLength(2);

    expect((await request(app).get('/api/transacoes?mes=3').set(auth(tokenAna))).status).toBe(400);

    const atualizada = await request(app).put(`/api/transacoes/${id}`).set(auth(tokenAna)).send({
      categoriaId: categoriaDespesaId,
      descricao: 'Mercado do mês',
      valor: 200,
      tipo: 'DESPESA',
      dataTransacao: '2026-03-15',
    });
    expect(atualizada.status).toBe(200);
    expect(atualizada.body.descricao).toBe('Mercado do mês');

    // Bia não enxerga nem altera nem apaga a transação da Ana (404, não 403)
    expect((await request(app).get('/api/transacoes').set(auth(tokenBia))).body).toHaveLength(0);
    await request(app)
      .put(`/api/transacoes/${id}`)
      .set(auth(tokenBia))
      .send({
        categoriaId: categoriaDespesaId,
        descricao: 'Invasão',
        valor: 1,
        tipo: 'DESPESA',
        dataTransacao: '2026-03-15',
      })
      .expect(404);
    await request(app).delete(`/api/transacoes/${id}`).set(auth(tokenBia)).expect(404);

    await request(app).delete(`/api/transacoes/${id}`).set(auth(tokenAna)).expect(204);
    await request(app).delete(`/api/transacoes/${id}`).set(auth(tokenAna)).expect(404);
  });

  it('rejeita categoria inexistente e valor inválido (400)', async () => {
    const base = {
      descricao: 'X',
      valor: 10,
      tipo: 'DESPESA',
      dataTransacao: '2026-03-15',
    };
    const auth = { Authorization: `Bearer ${tokenAna}` };

    expect(
      (
        await request(app)
          .post('/api/transacoes')
          .set(auth)
          .send({ ...base, categoriaId: 99999999 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/transacoes')
          .set(auth)
          .send({ ...base, categoriaId: categoriaDespesaId, valor: -5 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/transacoes')
          .set(auth)
          .send({ ...base, categoriaId: categoriaDespesaId, dataTransacao: '2026-02-31' })
      ).status,
    ).toBe(400);
  });

  it('dashboard: totais, saldo e alerta de orçamento por mês', async () => {
    const auth = { Authorization: `Bearer ${tokenAna}` };
    // Estado atual da Ana: 1 despesa (Cinema, 40) em 2026-04, sem nenhuma meta.
    await request(app)
      .post('/api/transacoes')
      .set(auth)
      .send({
        categoriaId: categoriaReceitaId,
        descricao: 'Salário',
        valor: 3000,
        tipo: 'RECEITA',
        dataTransacao: '2026-04-05',
      })
      .expect(201);

    const semAlerta = await request(app).get('/api/dashboard/resumo').set(auth);
    expect(semAlerta.status).toBe(200);
    expect(semAlerta.body).toEqual({
      totalReceitas: 3000,
      totalDespesas: 40,
      saldoAtual: 2960,
      orcamentoLimite: null,
      mesesAcimaDaMeta: [],
      mesesComMeta: 0,
      mesesComCategoriaEstourada: [],
      situacaoOrcamento: 'SEM_META',
      alertaOrcamentoEstourado: false,
    });

    await request(app)
      .put('/api/metas')
      .set(auth)
      .send({ ano: 2026, mes: 4, orcamentoLimite: 500 })
      .expect(200);
    await request(app)
      .post('/api/transacoes')
      .set(auth)
      .send({
        categoriaId: categoriaDespesaId,
        descricao: 'Viagem',
        valor: 500,
        tipo: 'DESPESA',
        dataTransacao: '2026-04-20',
      })
      .expect(201);

    const abril = await request(app).get('/api/dashboard/resumo?mes=4&ano=2026').set(auth);
    expect(abril.body.totalDespesas).toBe(540);
    expect(abril.body.orcamentoLimite).toBe(500);
    expect(abril.body.alertaOrcamentoEstourado).toBe(true);

    // Outro mês não tem meta: não estoura, mesmo que o gasto fosse alto
    const maio = await request(app).get('/api/dashboard/resumo?mes=5&ano=2026').set(auth);
    expect(maio.body.orcamentoLimite).toBeNull();
    expect(maio.body.alertaOrcamentoEstourado).toBe(false);

    // Ano inteiro: conta os meses que passaram da meta do próprio mês
    const ano = await request(app).get('/api/dashboard/resumo?ano=2026').set(auth);
    expect(ano.body).toMatchObject({
      orcamentoLimite: null,
      mesesAcimaDaMeta: [4],
      mesesComMeta: 1,
      alertaOrcamentoEstourado: true,
    });

    // A evolução traz a meta de cada mês para a linha do gráfico
    const evolucao = await request(app).get('/api/dashboard/evolucao?ano=2026').set(auth);
    expect(evolucao.body.meses[3]).toMatchObject({ mes: 4, orcamentoLimite: 500 });
    expect(evolucao.body.meses[0].orcamentoLimite).toBeNull();

    // Bia não definiu metas: nunca dispara alerta (e não enxerga as da Ana)
    const bia = await request(app)
      .get('/api/dashboard/resumo?mes=4&ano=2026')
      .set({ Authorization: `Bearer ${tokenBia}` });
    expect(bia.body.orcamentoLimite).toBeNull();
    expect(bia.body.alertaOrcamentoEstourado).toBe(false);
  });

  it('metas: lê o ano, define, altera e remove a meta de um mês', async () => {
    const auth = { Authorization: `Bearer ${tokenBia}` };

    expect((await request(app).get('/api/metas?ano=2026')).status).toBe(401);
    const vazio = await request(app).get('/api/metas?ano=2026').set(auth);
    expect(vazio.body.ano).toBe(2026);
    expect(vazio.body.meses).toHaveLength(12);
    expect(
      vazio.body.meses.every((m: { orcamentoLimite: null }) => m.orcamentoLimite === null),
    ).toBe(true);

    const definida = await request(app)
      .put('/api/metas')
      .set(auth)
      .send({ ano: 2026, mes: 3, orcamentoLimite: 1500.5 });
    expect(definida.status).toBe(200);
    expect(definida.body).toEqual({ ano: 2026, mes: 3, orcamentoLimite: 1500.5 });

    await request(app)
      .put('/api/metas')
      .set(auth)
      .send({ ano: 2026, mes: 3, orcamentoLimite: 1800 })
      .expect(200); // alterar (upsert)
    const lidas = await request(app).get('/api/metas?ano=2026').set(auth);
    expect(lidas.body.meses[2]).toEqual({ mes: 3, orcamentoLimite: 1800, origem: 'ANTIGA' });
    const outroAno = await request(app).get('/api/metas?ano=2027').set(auth);
    expect(outroAno.body.meses[2].orcamentoLimite).toBeNull();

    const resumo = await request(app).get('/api/dashboard/resumo?mes=3&ano=2026').set(auth);
    expect(resumo.body.orcamentoLimite).toBe(1800);

    const entradasInvalidas = [
      { ano: 2026, mes: 3, orcamentoLimite: 0 },
      { ano: 2026, mes: 3, orcamentoLimite: -10 },
      { ano: 2026, mes: 3, orcamentoLimite: 'abc' },
      { ano: 2026, mes: 3 },
      { ano: 2026, mes: 13, orcamentoLimite: 100 },
      { ano: 2026, mes: 0, orcamentoLimite: 100 },
      { mes: 3, orcamentoLimite: 100 },
      { ano: 2026, mes: 3, orcamentoLimite: 100_000_000 },
    ];
    for (const corpo of entradasInvalidas) {
      expect((await request(app).put('/api/metas').set(auth).send(corpo)).status).toBe(400);
    }
    expect((await request(app).get('/api/metas').set(auth)).status).toBe(400); // sem ano

    await request(app)
      .put('/api/metas')
      .set(auth)
      .send({ ano: 2026, mes: 3, orcamentoLimite: null })
      .expect(200);
    const removida = await request(app).get('/api/metas?ano=2026').set(auth);
    expect(removida.body.meses[2].orcamentoLimite).toBeNull();
  });

  it('categorias do usuário: criar, isolar, usar, renomear e excluir', async () => {
    const ana = { Authorization: `Bearer ${tokenAna}` };
    const bia = { Authorization: `Bearer ${tokenBia}` };
    const nomes = async (auth: { Authorization: string }) =>
      (await request(app).get('/api/categorias').set(auth)).body.map(
        (c: { nome: string }) => c.nome,
      );

    const criada = await request(app)
      .post('/api/categorias')
      .set(ana)
      .send({ nome: '  Pets  ', tipo: 'DESPESA' });
    expect(criada.status).toBe(201);
    expect(criada.body).toEqual({
      id: expect.any(Number),
      nome: 'Pets',
      tipo: 'DESPESA',
      padrao: false,
    });
    const id = criada.body.id as number;

    // Só a Ana enxerga; a Bia não vê e não consegue usar
    expect(await nomes(ana)).toContain('Pets');
    expect(await nomes(bia)).not.toContain('Pets');
    const daBia = await request(app).post('/api/transacoes').set(bia).send({
      categoriaId: id,
      descricao: 'Ração',
      valor: 10,
      tipo: 'DESPESA',
      dataTransacao: '2026-05-01',
    });
    expect(daBia.status).toBe(400);
    expect(
      (await request(app).put(`/api/categorias/${id}`).set(bia).send({ nome: 'X' })).status,
    ).toBe(404);
    expect((await request(app).delete(`/api/categorias/${id}`).set(bia)).status).toBe(404);

    // Nome repetido (sem acento/caixa) e entradas inválidas
    for (const nome of ['pets', 'ALIMENTAÇÃO', 'alimentacao']) {
      expect(
        (await request(app).post('/api/categorias').set(ana).send({ nome, tipo: 'DESPESA' }))
          .status,
      ).toBe(409);
    }
    for (const corpo of [
      { nome: '', tipo: 'DESPESA' },
      { nome: 'x'.repeat(51), tipo: 'DESPESA' },
      { nome: 'Ok', tipo: 'OUTRO' },
      { tipo: 'DESPESA' },
    ]) {
      expect((await request(app).post('/api/categorias').set(ana).send(corpo)).status).toBe(400);
    }

    // A Ana usa a categoria numa transação
    const transacao = await request(app).post('/api/transacoes').set(ana).send({
      categoriaId: id,
      descricao: 'Ração',
      valor: 80,
      tipo: 'DESPESA',
      dataTransacao: '2026-05-01',
    });
    expect(transacao.status).toBe(201);

    // Renomear funciona; categoria padrão não pode ser alterada
    const renomeada = await request(app)
      .put(`/api/categorias/${id}`)
      .set(ana)
      .send({ nome: 'Animais' });
    expect(renomeada.status).toBe(200);
    expect(renomeada.body.nome).toBe('Animais');
    const padrao = (await request(app).get('/api/categorias').set(ana)).body.find(
      (c: { padrao: boolean }) => c.padrao,
    );
    expect(
      (await request(app).put(`/api/categorias/${padrao.id}`).set(ana).send({ nome: 'X' })).status,
    ).toBe(403);
    expect((await request(app).delete(`/api/categorias/${padrao.id}`).set(ana)).status).toBe(403);

    // Em uso: não exclui. Sem uso: exclui
    const emUso = await request(app).delete(`/api/categorias/${id}`).set(ana);
    expect(emUso.status).toBe(409);
    expect(emUso.body.erro).toContain('1 transação');
    await request(app).delete(`/api/transacoes/${transacao.body.id}`).set(ana).expect(204);
    await request(app).delete(`/api/categorias/${id}`).set(ana).expect(204);
    expect(await nomes(ana)).not.toContain('Animais');
    expect((await request(app).delete(`/api/categorias/${id}`).set(ana)).status).toBe(404);
  });

  it('filtra transações por descrição, categoria, tipo, valor e período (combinados)', async () => {
    const ana = { Authorization: `Bearer ${tokenAna}` };
    const pets = (
      await request(app)
        .post('/api/categorias')
        .set(ana)
        .send({ nome: 'Pets filtro', tipo: 'DESPESA' })
    ).body.id;
    const criar = (
      descricao: string,
      valor: number,
      dataTransacao: string,
      categoriaId: number,
      tipo = 'DESPESA',
    ) =>
      request(app)
        .post('/api/transacoes')
        .set(ana)
        .send({ categoriaId, descricao, valor, tipo, dataTransacao });
    await criar('Netflix Entretenimento', 44.9, '2026-05-10', categoriaDespesaId).expect(201);
    await criar('Ração para o gato', 80, '2026-05-12', pets).expect(201);
    await criar('Desconto 50% cupom', 12.5, '2026-06-01', categoriaDespesaId).expect(201);
    await criar('Salário maio', 5000, '2026-05-05', categoriaReceitaId, 'RECEITA').expect(201);

    // outros testes também gravam transações da Ana: só olhamos as criadas aqui
    const minhas = new Set([
      'Netflix Entretenimento',
      'Ração para o gato',
      'Desconto 50% cupom',
      'Salário maio',
    ]);
    const buscar = async (consulta: string) =>
      (await request(app).get(`/api/transacoes?${consulta}`).set(ana).expect(200)).body
        .map((t: { descricao: string }) => t.descricao)
        .filter((descricao: string) => minhas.has(descricao));

    // busca sem diferenciar maiúsculas nem acento; o "%" é tratado como texto, não como coringa
    expect(await buscar('busca=NETFLIX')).toEqual(['Netflix Entretenimento']);
    expect(await buscar('busca=racao')).toEqual(['Ração para o gato']);
    expect(await buscar('busca=50%25')).toEqual(['Desconto 50% cupom']);
    expect(await buscar('busca=%25')).toEqual(['Desconto 50% cupom']);
    expect(await buscar('busca=')).toHaveLength(4); // vazio = sem filtro
    expect(await buscar('busca=a_o')).toEqual([]); // "_" também é texto, não coringa

    expect(await buscar(`categoriaId=${pets}`)).toEqual(['Ração para o gato']);
    expect(await buscar('tipo=RECEITA')).toEqual(['Salário maio']);
    expect(await buscar('valorMin=44.9&valorMax=80')).toEqual([
      'Ração para o gato',
      'Netflix Entretenimento',
    ]);
    expect(await buscar('valorMin=100')).toEqual(['Salário maio']);
    expect(await buscar('mes=6&ano=2026')).toEqual(['Desconto 50% cupom']);
    // combinados com "E"
    expect(await buscar(`mes=5&ano=2026&tipo=DESPESA&valorMax=50`)).toEqual([
      'Netflix Entretenimento',
    ]);
    expect(await buscar(`categoriaId=${pets}&tipo=RECEITA`)).toEqual([]);

    // filtros inválidos
    for (const invalido of [
      'valorMin=abc',
      'valorMin=10&valorMax=5',
      'tipo=OUTRO',
      'categoriaId=0',
    ]) {
      expect((await request(app).get(`/api/transacoes?${invalido}`).set(ana)).status).toBe(400);
    }
    // nada vaza entre usuários
    const bia = { Authorization: `Bearer ${tokenBia}` };
    expect((await request(app).get('/api/transacoes?busca=netflix').set(bia)).body).toEqual([]);
  });

  it('edição em massa: recategoriza e exclui várias transações, tudo ou nada', async () => {
    const ana = { Authorization: `Bearer ${tokenAna}` };
    const bia = { Authorization: `Bearer ${tokenBia}` };
    const outra = (
      await request(app)
        .post('/api/categorias')
        .set(ana)
        .send({ nome: 'Streaming massa', tipo: 'DESPESA' })
    ).body.id;
    const criar = async (
      auth: Record<string, string>,
      descricao: string,
      tipo: string,
      categoriaId: number,
    ) =>
      (
        await request(app)
          .post('/api/transacoes')
          .set(auth)
          .send({ categoriaId, descricao, valor: 10, tipo, dataTransacao: '2026-07-01' })
          .expect(201)
      ).body.id as number;
    const a = await criar(ana, 'Massa A', 'DESPESA', categoriaDespesaId);
    const b = await criar(ana, 'Massa B', 'DESPESA', categoriaDespesaId);
    const receita = await criar(ana, 'Massa receita', 'RECEITA', categoriaReceitaId);
    const daBia = await criar(bia, 'Massa da Bia', 'DESPESA', categoriaDespesaId);
    const categoriaDe = async (busca: string) =>
      (await request(app).get(`/api/transacoes?busca=${busca}`).set(ana)).body.map(
        (t: { categoriaId: number }) => t.categoriaId,
      );
    const patch = (auth: Record<string, string>, corpo: object) =>
      request(app).patch('/api/transacoes/categoria').set(auth).send(corpo);

    // sem login e entradas inválidas
    expect((await request(app).patch('/api/transacoes/categoria').send({})).status).toBe(401);
    expect((await patch(ana, { ids: [], categoriaId: outra })).status).toBe(400);
    expect((await patch(ana, { ids: [a], categoriaId: 'x' })).status).toBe(400);
    expect((await patch(ana, { ids: [a, 'z'], categoriaId: outra })).status).toBe(400);

    // tudo ou nada: um id da Bia impede a alteração das da Ana
    expect((await patch(ana, { ids: [a, b, daBia], categoriaId: outra })).status).toBe(404);
    expect(await categoriaDe('Massa A')).toEqual([categoriaDespesaId]);
    // categoria de outro usuário e tipo incompatível
    const categoriaDaBia = (
      await request(app)
        .post('/api/categorias')
        .set(bia)
        .send({ nome: 'Só da Bia', tipo: 'DESPESA' })
    ).body.id;
    expect((await patch(ana, { ids: [a], categoriaId: categoriaDaBia })).status).toBe(400);
    const incompativel = await patch(ana, { ids: [a, receita], categoriaId: outra });
    expect(incompativel.status).toBe(400);
    expect(incompativel.body.erro).toContain('outro tipo');
    expect(await categoriaDe('Massa A')).toEqual([categoriaDespesaId]);

    // sucesso (ids repetidos contam uma vez)
    const ok = await patch(ana, { ids: [a, b, a], categoriaId: outra });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ afetadas: 2 });
    expect(await categoriaDe('Massa A')).toEqual([outra]);
    expect(await categoriaDe('Massa B')).toEqual([outra]);
    expect(await categoriaDe('Massa da Bia')).toEqual([]);
    expect(
      (await request(app).get('/api/transacoes?busca=Massa da Bia').set(bia)).body[0].categoriaId,
    ).toBe(categoriaDespesaId);

    // exclusão em massa: tudo ou nada e isolamento
    const excluir = (auth: Record<string, string>, ids: unknown) =>
      request(app).post('/api/transacoes/excluir').set(auth).send({ ids });
    expect(
      (
        await request(app)
          .post('/api/transacoes/excluir')
          .send({ ids: [a] })
      ).status,
    ).toBe(401);
    expect((await excluir(ana, [])).status).toBe(400);
    expect((await excluir(ana, [a, daBia])).status).toBe(404);
    expect(await categoriaDe('Massa A')).toEqual([outra]);
    const excluidas = await excluir(ana, [a, b, receita]);
    expect(excluidas.status).toBe(200);
    expect(excluidas.body).toEqual({ afetadas: 3 });
    expect(await categoriaDe('Massa')).toEqual([]);
    expect(
      (await request(app).get('/api/transacoes?busca=Massa da Bia').set(bia)).body,
    ).toHaveLength(1);

    await request(app).delete(`/api/transacoes/${daBia}`).set(bia).expect(204);
  });

  it('regras de categorização: CRUD, isolamento, uso na importação, aplicar ao histórico e cascata', async () => {
    const ana = { Authorization: `Bearer ${tokenAna}` };
    const bia = { Authorization: `Bearer ${tokenBia}` };
    const categoria = async (auth: Record<string, string>, nome: string, tipo = 'DESPESA') =>
      (await request(app).post('/api/categorias').set(auth).send({ nome, tipo }).expect(201)).body
        .id as number;
    const assinaturas = await categoria(ana, 'Assinaturas regra');
    const daBia = await categoria(bia, 'Só da Bia regra');
    const regra = (auth: Record<string, string>, corpo: object) =>
      request(app).post('/api/regras').set(auth).send(corpo);

    // sem login e entradas inválidas
    expect((await request(app).get('/api/regras')).status).toBe(401);
    expect((await regra(ana, { termo: 'ab', categoriaId: assinaturas })).status).toBe(400);
    expect((await regra(ana, { termo: '***--', categoriaId: assinaturas })).status).toBe(400);
    expect((await regra(ana, { termo: 'streamx', categoriaId: 'x' })).status).toBe(400);
    expect((await regra(ana, { termo: 'streamx', categoriaId: daBia })).status).toBe(400);

    // cria (termo normalizado) e não deixa duplicar, nem com outra grafia
    const criada = await regra(ana, { termo: '  STREAMX.com ', categoriaId: assinaturas });
    expect(criada.status).toBe(201);
    expect(criada.body).toEqual({
      id: expect.any(Number),
      termo: 'streamx com',
      categoriaId: assinaturas,
    });
    expect((await regra(ana, { termo: 'Streamx com', categoriaId: assinaturas })).status).toBe(409);
    // a mesma regra em outro usuário é independente
    const daBiaRegra = await regra(bia, { termo: 'streamx com', categoriaId: daBia });
    expect(daBiaRegra.status).toBe(201);

    // lista só as do usuário
    const lista = await request(app).get('/api/regras').set(ana).expect(200);
    expect(lista.body).toEqual([criada.body]);

    // edição: termo e/ou categoria; corpo vazio é inválido; regra alheia é 404
    const id = criada.body.id;
    expect((await request(app).put(`/api/regras/${id}`).set(ana).send({})).status).toBe(400);
    const editada = await request(app).put(`/api/regras/${id}`).set(ana).send({ termo: 'streamx' });
    expect(editada.status).toBe(200);
    expect(editada.body.termo).toBe('streamx');
    expect(
      (await request(app).put(`/api/regras/${id}`).set(bia).send({ termo: 'outra' })).status,
    ).toBe(404);
    expect((await request(app).delete(`/api/regras/${id}`).set(bia)).status).toBe(404);

    // importação: a regra do usuário vale antes das regras fixas e a da Bia não vaza
    const ofx = Buffer.from(
      'OFXHEADER:100\nCHARSET:NONE\n<OFX>\n<BANKMSGSRSV1><STMTRS><BANKTRANLIST>\n' +
        '<STMTTRN><TRNTYPE>OTHER</TRNTYPE><DTPOSTED>20260710</DTPOSTED><TRNAMT>-39.90</TRNAMT><FITID>regra-1</FITID><MEMO>Streamx.com</MEMO></STMTTRN>\n' +
        '</BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>',
    );
    const preview = (auth: Record<string, string>) =>
      request(app).post('/api/importacoes/preview').set(auth).attach('arquivo', ofx, 'x.ofx');
    const daAna = await preview(ana);
    expect(daAna.status).toBe(200);
    expect(daAna.body.linhas[0]).toMatchObject({
      categoriaId: assinaturas,
      origemSugestao: 'REGRA_USUARIO',
      termoSugestao: 'streamx',
    });
    const outra = await preview(bia);
    expect(outra.body.linhas[0]).toMatchObject({
      categoriaId: daBia,
      origemSugestao: 'REGRA_USUARIO',
    });

    // aplicar ao histórico: só as do mesmo tipo e que ainda não estão na categoria
    const criarTransacao = async (descricao: string, tipo: string, categoriaId: number) =>
      (
        await request(app)
          .post('/api/transacoes')
          .set(ana)
          .send({ categoriaId, descricao, valor: 10, tipo, dataTransacao: '2026-07-02' })
          .expect(201)
      ).body.id as number;
    await criarTransacao('STREAMX regra A', 'DESPESA', categoriaDespesaId);
    await criarTransacao('Streamx regra B', 'DESPESA', categoriaDespesaId);
    await criarTransacao('Streamx regra C', 'DESPESA', assinaturas); // já na categoria
    await criarTransacao('Streamx regra receita', 'RECEITA', categoriaReceitaId); // outro tipo
    await criarTransacao('Spotify regra', 'DESPESA', categoriaDespesaId); // não casa
    const aplicar = (auth: Record<string, string>, regraId: number) =>
      request(app).post('/api/regras/aplicar').set(auth).send({ regraId });
    expect((await aplicar(bia, id)).status).toBe(404);
    const aplicada = await aplicar(ana, id);
    expect(aplicada.status).toBe(200);
    expect(aplicada.body).toEqual({ afetadas: 2 });
    const categoriaDe = async (busca: string) =>
      (await request(app).get(`/api/transacoes?busca=${busca}`).set(ana)).body.map(
        (t: { categoriaId: number }) => t.categoriaId,
      );
    expect(await categoriaDe('regra A')).toEqual([assinaturas]);
    expect(await categoriaDe('regra receita')).toEqual([categoriaReceitaId]);
    expect(await categoriaDe('Spotify regra')).toEqual([categoriaDespesaId]);
    expect((await aplicar(ana, id)).body).toEqual({ afetadas: 0 });

    // excluir a regra não mexe nas transações; excluir a categoria apaga as regras dela
    await request(app).delete(`/api/regras/${id}`).set(ana).expect(204);
    expect((await request(app).get('/api/regras').set(ana)).body).toEqual([]);
    expect(await categoriaDe('regra A')).toEqual([assinaturas]);

    const segunda = await regra(ana, { termo: 'spotify', categoriaId: assinaturas });
    expect(segunda.status).toBe(201);
    await request(app)
      .post('/api/transacoes/excluir')
      .set(ana)
      .send({
        ids: (await request(app).get('/api/transacoes?busca=regra').set(ana)).body.map(
          (t: { id: number }) => t.id,
        ),
      })
      .expect(200);
    await request(app).delete(`/api/categorias/${assinaturas}`).set(ana).expect(204);
    expect((await request(app).get('/api/regras').set(ana)).body).toEqual([]);
    await request(app).delete(`/api/regras/${daBiaRegra.body.id}`).set(bia).expect(204);
    await request(app).delete(`/api/categorias/${daBia}`).set(bia).expect(204);
  });

  it('metas por categoria: define, calcula a situação, copia e apaga junto com a categoria', async () => {
    const ana = { Authorization: `Bearer ${tokenAna}` };
    const bia = { Authorization: `Bearer ${tokenBia}` };
    const mercado = (
      await request(app)
        .post('/api/categorias')
        .set(ana)
        .send({ nome: 'Mercado meta', tipo: 'DESPESA' })
    ).body.id as number;
    const delaBia = (
      await request(app)
        .post('/api/categorias')
        .set(bia)
        .send({ nome: 'Da Bia meta', tipo: 'DESPESA' })
    ).body.id as number;
    const definir = (auth: Record<string, string>, corpo: object) =>
      request(app).put('/api/metas/categorias').set(auth).send(corpo);
    const doMes = (auth: Record<string, string>, ano: number, mes: number) =>
      request(app).get(`/api/metas/categorias?ano=${ano}&mes=${mes}`).set(auth);

    // sem login e entradas inválidas
    expect((await request(app).get('/api/metas/categorias?ano=2027&mes=3')).status).toBe(401);
    expect((await doMes(ana, 2027, 13)).status).toBe(400);
    expect((await request(app).get('/api/metas/categorias?ano=2027').set(ana)).status).toBe(400);
    expect((await definir(ana, { ano: 2027, mes: 3, categoriaId: mercado, valor: 0 })).status).toBe(
      400,
    );
    expect(
      (await definir(ana, { ano: 2027, mes: 3, categoriaId: mercado, valor: 'x' })).status,
    ).toBe(400);
    expect(
      (await definir(ana, { ano: 2027, mes: 3, categoriaId: categoriaReceitaId, valor: 10 }))
        .status,
    ).toBe(400);
    expect(
      (await definir(ana, { ano: 2027, mes: 3, categoriaId: delaBia, valor: 10 })).status,
    ).toBe(400);

    // define e lê a meta, com o gasto do mês
    expect(
      (await definir(ana, { ano: 2027, mes: 3, categoriaId: mercado, valor: 100 })).body,
    ).toEqual({
      ano: 2027,
      mes: 3,
      categoriaId: mercado,
      valor: 100,
    });
    await request(app)
      .post('/api/transacoes')
      .set(ana)
      .send({
        categoriaId: mercado,
        descricao: 'Compra meta',
        valor: 84.5,
        tipo: 'DESPESA',
        dataTransacao: '2027-03-10',
      })
      .expect(201);
    const marco = (await doMes(ana, 2027, 3)).body;
    expect(marco.comMeta).toEqual([
      {
        categoriaId: mercado,
        categoria: 'Mercado meta',
        meta: 100,
        gasto: 84.5,
        percentual: 84.5,
        situacao: 'ATENCAO',
      },
    ]);
    expect(marco.semMeta.some((c: { categoriaId: number }) => c.categoriaId === mercado)).toBe(
      false,
    );
    expect(marco.totalMetas).toBe(100);

    // meta é por mês e por usuário
    expect((await doMes(ana, 2027, 4)).body.comMeta).toEqual([]);
    expect((await doMes(bia, 2027, 3)).body.comMeta).toEqual([]);

    // a meta do mês é a soma das categorias: uma meta total antiga não vale onde há meta por categoria
    await request(app)
      .put('/api/metas')
      .set(ana)
      .send({ ano: 2027, mes: 3, orcamentoLimite: 5000 })
      .expect(200);
    const mesesDe2027 = (await request(app).get('/api/metas?ano=2027').set(ana)).body.meses;
    expect(mesesDe2027[2]).toEqual({ mes: 3, orcamentoLimite: 100, origem: 'CATEGORIAS' });
    const resumo = (await request(app).get('/api/dashboard/resumo?mes=3&ano=2027').set(ana)).body;
    expect(resumo.situacaoOrcamento).toBe('ATENCAO');
    await definir(ana, { ano: 2027, mes: 3, categoriaId: mercado, valor: 50 }).expect(200);
    const anual = (await request(app).get('/api/dashboard/resumo?ano=2027').set(ana)).body;
    expect(anual.mesesComCategoriaEstourada).toEqual([3]);

    // copiar: cria nos destinos e, sem sobrescrever, preserva o que já existe
    const copiar = (auth: Record<string, string>, corpo: object) =>
      request(app).post('/api/metas/copiar').set(auth).send(corpo);
    const base = { origem: { ano: 2027, mes: 3 }, incluir: 'AMBAS' };
    expect((await copiar(ana, { ...base, destino: [] })).status).toBe(400);
    expect((await copiar(ana, { ...base, destino: [{ ano: 2027, mes: 3 }] })).status).toBe(400);
    expect((await copiar(bia, { ...base, destino: [{ ano: 2027, mes: 4 }] })).status).toBe(400); // Bia não tem metas em março
    await definir(ana, { ano: 2027, mes: 5, categoriaId: mercado, valor: 999 }).expect(200);
    const primeira = await copiar(ana, {
      ...base,
      destino: [
        { ano: 2027, mes: 4 },
        { ano: 2027, mes: 5 },
        { ano: 2028, mes: 1 },
      ],
    });
    expect(primeira.status).toBe(200);
    expect(primeira.body).toEqual({
      copiadas: 5,
      puladas: 1,
      mesesPulados: [{ ano: 2027, mes: 5 }],
    });
    expect((await doMes(ana, 2027, 5)).body.comMeta[0].meta).toBe(999); // preservada
    expect((await doMes(ana, 2027, 4)).body.comMeta[0].meta).toBe(50);
    expect((await doMes(ana, 2028, 1)).body.comMeta[0].meta).toBe(50);
    const metasDe2028 = (await request(app).get('/api/metas?ano=2028').set(ana)).body;
    expect(metasDe2028.meses[0]).toEqual({ mes: 1, orcamentoLimite: 50, origem: 'CATEGORIAS' });
    const segunda = await copiar(ana, {
      ...base,
      incluir: 'CATEGORIAS',
      sobrescrever: true,
      destino: [{ ano: 2027, mes: 5 }],
    });
    expect(segunda.body).toEqual({ copiadas: 1, puladas: 0, mesesPulados: [] });
    expect((await doMes(ana, 2027, 5)).body.comMeta[0].meta).toBe(50);

    // remover com null; excluir a categoria (sem transações) apaga as metas dela
    expect(
      (await definir(ana, { ano: 2027, mes: 4, categoriaId: mercado, valor: null })).body.valor,
    ).toBeNull();
    expect((await doMes(ana, 2027, 4)).body.comMeta).toEqual([]);
    const transacoesMercado = (await request(app).get('/api/transacoes?busca=Compra meta').set(ana))
      .body;
    await request(app)
      .post('/api/transacoes/excluir')
      .set(ana)
      .send({ ids: transacoesMercado.map((t: { id: number }) => t.id) })
      .expect(200);
    await request(app).delete(`/api/categorias/${mercado}`).set(ana).expect(204);
    expect((await doMes(ana, 2027, 5)).body.comMeta).toEqual([]);
    await request(app).delete(`/api/categorias/${delaBia}`).set(bia).expect(204);
  });

  it('contas e transferências: saldos, filtro, exclusão bloqueada e relatórios sem transferências', async () => {
    const ana = { Authorization: `Bearer ${tokenAna}` };
    const bia = { Authorization: `Bearer ${tokenBia}` };
    const listar = async (auth: Record<string, string>) =>
      (await request(app).get('/api/contas').set(auth)).body as {
        id: number;
        nome: string;
        saldo: number;
        totalTransacoes: number;
      }[];
    const resumo = async () =>
      (await request(app).get('/api/dashboard/resumo?mes=5&ano=2033').set(ana)).body;

    expect((await request(app).get('/api/contas')).status).toBe(401);
    const antes = await listar(ana);
    const principal = antes.find((c) => c.nome === 'Conta principal');
    expect(principal).toBeDefined();
    const saldoAntes = principal?.saldo ?? 0;

    // criar: validações, nome repetido e isolamento
    expect(
      (await request(app).post('/api/contas').set(ana).send({ nome: '', tipo: 'OUTRA' })).status,
    ).toBe(400);
    expect(
      (await request(app).post('/api/contas').set(ana).send({ nome: 'X', tipo: 'POUPANCA' }))
        .status,
    ).toBe(400);
    const cartao = await request(app)
      .post('/api/contas')
      .set(ana)
      .send({
        nome: 'Cartão teste',
        tipo: 'CARTAO_CREDITO',
        identificadorExterno: `cartao:${sufixo}`,
      });
    expect(cartao.status).toBe(201);
    const cartaoId = cartao.body.id as number;
    expect(
      (
        await request(app)
          .post('/api/contas')
          .set(ana)
          .send({ nome: 'Cartão teste', tipo: 'OUTRA' })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post('/api/contas')
          .set(ana)
          .send({ nome: 'Outra', tipo: 'OUTRA', identificadorExterno: `cartao:${sufixo}` })
      ).status,
    ).toBe(409);
    expect((await listar(bia)).map((c) => c.nome)).not.toContain('Cartão teste');

    // transação em uma conta escolhida (e conta de outro usuário é rejeitada)
    const compra = await request(app).post('/api/transacoes').set(ana).send({
      categoriaId: categoriaDespesaId,
      descricao: 'Compra no cartão',
      valor: 300,
      tipo: 'DESPESA',
      dataTransacao: '2033-05-10',
      contaId: cartaoId,
    });
    expect(compra.status).toBe(201);
    expect(compra.body.contaId).toBe(cartaoId);
    const contaDaBia = (await listar(bia))[0].id;
    expect(
      (
        await request(app).post('/api/transacoes').set(ana).send({
          categoriaId: categoriaDespesaId,
          descricao: 'x',
          valor: 1,
          tipo: 'DESPESA',
          dataTransacao: '2033-05-10',
          contaId: contaDaBia,
        })
      ).status,
    ).toBe(400);
    expect((await listar(ana)).find((c) => c.id === cartaoId)?.saldo).toBe(-300); // a pagar

    // filtros por conta em Transações e no Resumo
    const doCartao = await request(app).get(`/api/transacoes?contaId=${cartaoId}`).set(ana);
    expect(doCartao.body.map((t: { descricao: string }) => t.descricao)).toEqual([
      'Compra no cartão',
    ]);
    const resumoDoCartao = await request(app)
      .get(`/api/dashboard/resumo?mes=5&ano=2033&contaId=${cartaoId}`)
      .set(ana);
    expect(resumoDoCartao.body.totalDespesas).toBe(300);
    expect((await resumo()).totalDespesas).toBe(300);

    // transferência: não muda receitas/despesas, muda os saldos e some junto
    const transferencia = await request(app).post('/api/transferencias').set(ana).send({
      contaOrigemId: principal?.id,
      contaDestinoId: cartaoId,
      valor: 300,
      data: '2033-05-12',
      descricao: 'Pagamento da fatura',
    });
    expect(transferencia.status).toBe(201);
    const transferenciaId = transferencia.body.transferenciaId as string;
    expect(await resumo()).toMatchObject({ totalDespesas: 300, totalReceitas: 0 });
    const depois = await listar(ana);
    expect(depois.find((c) => c.id === cartaoId)?.saldo).toBe(0);
    expect(depois.find((c) => c.id === principal?.id)?.saldo).toBe(
      Math.round((saldoAntes - 300) * 100) / 100,
    );
    const naLista = await request(app).get('/api/transacoes?mes=5&ano=2033').set(ana);
    expect(
      naLista.body.filter(
        (t: { transferenciaId: string | null }) => t.transferenciaId === transferenciaId,
      ),
    ).toHaveLength(2);
    expect(
      (
        await request(app)
          .post('/api/transferencias')
          .set(ana)
          .send({ contaOrigemId: cartaoId, contaDestinoId: cartaoId, valor: 1, data: '2033-05-12' })
      ).status,
    ).toBe(400);
    expect(
      (await request(app).delete(`/api/transferencias/${transferenciaId}`).set(bia)).status,
    ).toBe(404);

    // excluir a ponta de uma transferência exclui as duas; transferência não se edita
    const editar = naLista.body.find(
      (t: { transferenciaId: string | null }) => t.transferenciaId === transferenciaId,
    );
    expect(
      (
        await request(app).put(`/api/transacoes/${editar.id}`).set(ana).send({
          categoriaId: categoriaDespesaId,
          descricao: 'x',
          valor: 1,
          tipo: 'DESPESA',
          dataTransacao: '2033-05-12',
        })
      ).status,
    ).toBe(409);
    await request(app).delete(`/api/transferencias/${transferenciaId}`).set(ana).expect(204);
    expect((await listar(ana)).find((c) => c.id === cartaoId)?.saldo).toBe(-300);

    // marcar uma transação existente como transferência a tira dos relatórios
    const fatura = await request(app).post('/api/transacoes').set(ana).send({
      categoriaId: categoriaDespesaId,
      descricao: 'Pagamento de fatura',
      valor: 300,
      tipo: 'DESPESA',
      dataTransacao: '2033-05-15',
      contaId: principal?.id,
    });
    expect((await resumo()).totalDespesas).toBe(600);
    const marcada = await request(app)
      .post(`/api/transacoes/${fatura.body.id}/transferencia`)
      .set(ana)
      .send({ contaDestinoId: cartaoId });
    expect(marcada.status).toBe(200);
    expect((await resumo()).totalDespesas).toBe(300);
    expect(
      (
        await request(app)
          .post(`/api/transacoes/${fatura.body.id}/transferencia`)
          .set(ana)
          .send({ contaDestinoId: cartaoId })
      ).status,
    ).toBe(409);
    expect((await listar(ana)).find((c) => c.id === cartaoId)?.saldo).toBe(0);
    await request(app).delete(`/api/transacoes/${fatura.body.id}`).set(ana).expect(204); // leva a outra ponta junto
    expect((await listar(ana)).find((c) => c.id === cartaoId)?.saldo).toBe(-300);

    // mover em massa para outra conta
    const mover = await request(app)
      .patch('/api/transacoes/conta')
      .set(ana)
      .send({ ids: [compra.body.id], contaId: principal?.id });
    expect(mover.body).toEqual({ afetadas: 1 });
    expect(
      (
        await request(app)
          .patch('/api/transacoes/conta')
          .set(ana)
          .send({ ids: [compra.body.id], contaId: contaDaBia })
      ).status,
    ).toBe(400);

    // exclusão bloqueada com transações; arquivar; a última conta ativa fica
    await request(app)
      .patch('/api/transacoes/conta')
      .set(ana)
      .send({ ids: [compra.body.id], contaId: cartaoId })
      .expect(200);
    const bloqueada = await request(app).delete(`/api/contas/${cartaoId}`).set(ana);
    expect(bloqueada.status).toBe(409);
    expect(bloqueada.body.erro).toContain('1 transação');
    expect(
      (
        await request(app)
          .put(`/api/contas/${cartaoId}`)
          .set(ana)
          .send({ arquivada: true, nome: 'Cartão arquivado' })
      ).body,
    ).toMatchObject({ arquivada: true, nome: 'Cartão arquivado' });
    expect(
      (await request(app).put(`/api/contas/${cartaoId}`).set(bia).send({ nome: 'Roubada' })).status,
    ).toBe(404);
    expect((await request(app).delete(`/api/contas/${contaDaBia}`).set(bia)).status).toBe(409); // única ativa

    await request(app).delete(`/api/transacoes/${compra.body.id}`).set(ana).expect(204);
    await request(app).delete(`/api/contas/${cartaoId}`).set(ana).expect(204);
  });

  it('recorrentes: detecta a assinatura mensal, ignora e desfaz; insights do mês', async () => {
    const ana = { Authorization: `Bearer ${tokenAna}` };
    const bia = { Authorization: `Bearer ${tokenBia}` };
    for (const [data, valor] of [
      ['2032-01-05', 40],
      ['2032-02-05', 40],
      ['2032-03-05', 40],
      ['2032-04-05', 45],
    ] as const) {
      await request(app)
        .post('/api/transacoes')
        .set(ana)
        .send({
          categoriaId: categoriaDespesaId,
          descricao: `Streaming Zeta ${data.slice(5, 7)}/12`,
          valor,
          tipo: 'DESPESA',
          dataTransacao: data,
        })
        .expect(201);
    }
    for (const data of ['2032-02-02', '2032-02-03', '2032-03-20']) {
      await request(app)
        .post('/api/transacoes')
        .set(ana)
        .send({
          categoriaId: categoriaDespesaId,
          descricao: 'Padaria avulsa zeta',
          valor: 12,
          tipo: 'DESPESA',
          dataTransacao: data,
        })
        .expect(201);
    }

    expect((await request(app).get('/api/recorrentes')).status).toBe(401);
    const lista = (await request(app).get('/api/recorrentes').set(ana)).body;
    const zeta = lista.recorrencias.find((r: { chave: string }) => r.chave === 'streaming zeta');
    expect(zeta).toMatchObject({
      valorTipico: 40,
      valorAtual: 45,
      valorAnterior: 40,
      ultimaData: '2032-04-05',
      proximaData: '2032-05-05',
      ocorrencias: 4,
      valorVariavel: false,
    });
    expect(
      lista.recorrencias.some((r: { chave: string }) => r.chave === 'padaria avulsa zeta'),
    ).toBe(false);
    expect(lista.custoMensal).toBeGreaterThanOrEqual(40);

    // insights do mês da última cobrança: o reajuste aparece
    const insights = (await request(app).get('/api/dashboard/insights?ano=2032&mes=4').set(ana))
      .body;
    expect(Array.isArray(insights)).toBe(true);
    expect(
      insights.find((i: { tipo: string }) => i.tipo === 'REAJUSTE_RECORRENTE')?.texto,
    ).toContain('passou de R$ 40,00 para R$ 45,00');
    expect((await request(app).get('/api/dashboard/insights?ano=2032').set(ana)).status).toBe(400);
    expect((await request(app).get('/api/dashboard/insights?ano=2032&mes=4')).status).toBe(401);

    // ignorar / desfazer, sem afetar outro usuário
    await request(app)
      .post('/api/recorrentes/ignorar')
      .set(ana)
      .send({ chave: 'streaming zeta' })
      .expect(200);
    expect(
      (await request(app).get('/api/recorrentes').set(ana)).body.recorrencias.some(
        (r: { chave: string }) => r.chave === 'streaming zeta',
      ),
    ).toBe(false);
    const comIgnoradas = (await request(app).get('/api/recorrentes?ignoradas=true').set(ana)).body;
    expect(
      comIgnoradas.recorrencias.find((r: { chave: string }) => r.chave === 'streaming zeta')
        ?.ignorada,
    ).toBe(true);
    expect(
      (await request(app).get('/api/recorrentes?ignoradas=true').set(bia)).body.recorrencias,
    ).toEqual([]);
    expect((await request(app).post('/api/recorrentes/ignorar').set(ana).send({})).status).toBe(
      400,
    );
    await request(app).delete('/api/recorrentes/ignorar/streaming%20zeta').set(ana).expect(204);
    expect(
      (await request(app).get('/api/recorrentes').set(ana)).body.recorrencias.some(
        (r: { chave: string }) => r.chave === 'streaming zeta',
      ),
    ).toBe(true);
  });

  it('objetivos: cria, guarda, conclui, valida, isola entre usuários e apaga junto com os aportes', async () => {
    const ana = { Authorization: `Bearer ${tokenAna}` };
    const bia = { Authorization: `Bearer ${tokenBia}` };
    const ano = new Date().getFullYear() + 1;

    expect((await request(app).get('/api/objetivos')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/objetivos')
          .set(ana)
          .send({ nome: '', valorAlvo: 100, prazoAno: ano, prazoMes: 12 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/objetivos')
          .set(ana)
          .send({ nome: 'Velho', valorAlvo: 100, prazoAno: 2020, prazoMes: 1 })
      ).status,
    ).toBe(400);

    const criado = await request(app)
      .post('/api/objetivos')
      .set(ana)
      .send({ nome: 'Viagem', valorAlvo: 1000, prazoAno: ano, prazoMes: 12, valorInicial: 250 });
    expect(criado.status).toBe(201);
    expect(criado.body).toMatchObject({
      acumulado: 250,
      percentual: 25,
      situacao: 'NO_RITMO',
      concluidoEm: null,
    });
    expect(criado.body.valorMensalNecessario).toBeGreaterThan(0);
    const id = criado.body.id as number;

    // outro usuário não vê nem mexe
    expect((await request(app).get('/api/objetivos').set(bia)).body).toEqual([]);
    expect(
      (
        await request(app)
          .post(`/api/objetivos/${id}/aportes`)
          .set(bia)
          .send({ valor: 10, data: '2026-09-01' })
      ).status,
    ).toBe(404);
    expect((await request(app).delete(`/api/objetivos/${id}`).set(bia)).status).toBe(404);

    // aporte, validações e conclusão
    expect(
      (
        await request(app)
          .post(`/api/objetivos/${id}/aportes`)
          .set(ana)
          .send({ valor: 0, data: '2026-09-01' })
      ).status,
    ).toBe(400);
    const aporte = await request(app)
      .post(`/api/objetivos/${id}/aportes`)
      .set(ana)
      .send({ valor: 800, data: '2026-09-01', observacao: 'Bônus' });
    expect(aporte.status).toBe(201);
    expect(aporte.body).toMatchObject({ acumulado: 1050, situacao: 'CONCLUIDO', percentual: 105 });
    expect(aporte.body.concluidoEm).not.toBeNull();
    const resumo = (await request(app).get('/api/dashboard/objetivos-resumo').set(ana)).body;
    expect(resumo.some((o: { id: number }) => o.id === id)).toBe(false); // concluído sai do card

    // desfazer reabre
    const aporteId = aporte.body.aportes.find(
      (a: { observacao: string | null }) => a.observacao === 'Bônus',
    ).id;
    const desfeito = await request(app).delete(`/api/objetivos/${id}/aportes/${aporteId}`).set(ana);
    expect(desfeito.body).toMatchObject({ acumulado: 250, concluidoEm: null });
    expect(
      (await request(app).delete(`/api/objetivos/${id}/aportes/${aporteId}`).set(ana)).status,
    ).toBe(404);

    // editar e excluir (cascata)
    const editado = await request(app)
      .put(`/api/objetivos/${id}`)
      .set(ana)
      .send({ nome: 'Viagem ao Sul', valorAlvo: 2000, prazoAno: ano, prazoMes: 12 });
    expect(editado.body).toMatchObject({
      nome: 'Viagem ao Sul',
      valorAlvo: 2000,
      percentual: 12.5,
    });
    await request(app).delete(`/api/objetivos/${id}`).set(ana).expect(204);
    expect((await request(app).get('/api/objetivos').set(ana)).body).toEqual([]);
  });

  it('rota inexistente retorna 404 e JSON malformado 400', async () => {
    expect((await request(app).get('/api/nada')).status).toBe(404);
    const malformado = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ não é json');
    expect(malformado.status).toBe(400);
  });
});

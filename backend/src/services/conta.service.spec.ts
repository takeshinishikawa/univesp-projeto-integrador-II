import { ContaRepository } from '../repositories/conta.repository';
import { Conta } from '../types/novas-features';
import { ContaService } from './conta.service';

const conta = (id: number, nome: string, extra: Partial<Conta> = {}): Conta => ({
  id,
  nome,
  tipo: 'CONTA_CORRENTE',
  saldoInicial: 0,
  identificadorExterno: null,
  arquivada: false,
  ...extra,
});

function montar(existentes: Conta[], transacoesPorConta: Record<number, number> = {}) {
  const repositorio = {
    garantirPrincipal: jest.fn().mockResolvedValue(existentes[0]),
    listar: jest.fn().mockResolvedValue(existentes),
    buscarPorId: jest
      .fn()
      .mockImplementation(async (id: number) => existentes.find((c) => c.id === id) ?? null),
    buscarPorNome: jest
      .fn()
      .mockImplementation(
        async (_u: number, nome: string) => existentes.find((c) => c.nome === nome) ?? null,
      ),
    buscarPorIdentificador: jest
      .fn()
      .mockImplementation(
        async (_u: number, ident: string) =>
          existentes.find((c) => c.identificadorExterno === ident) ?? null,
      ),
    criar: jest
      .fn()
      .mockImplementation(async (_u: number, dados: object) => ({ id: 99, ...dados })),
    atualizar: jest.fn().mockImplementation(async (id: number, dados: object) => ({
      ...existentes.find((c) => c.id === id),
      ...dados,
    })),
    excluir: jest.fn().mockResolvedValue(undefined),
    contarTransacoes: jest
      .fn()
      .mockImplementation(async (id: number) => transacoesPorConta[id] ?? 0),
    totaisPorConta: jest.fn().mockResolvedValue(
      new Map([
        [1, { receitas: 1000, despesas: 250.1, quantidade: 4 }],
        [2, { receitas: 0, despesas: 300, quantidade: 1 }],
      ]),
    ),
  } as unknown as jest.Mocked<ContaRepository>;
  return { service: new ContaService(repositorio), repositorio };
}

describe('ContaService', () => {
  it('lista com saldo = saldo inicial + receitas − despesas e conta as transações', async () => {
    const { service } = montar([
      conta(1, 'Conta principal', { saldoInicial: 100 }),
      conta(2, 'Cartão', { tipo: 'CARTAO_CREDITO' }),
      conta(3, 'Dinheiro', { tipo: 'DINHEIRO' }),
    ]);

    const contas = await service.listar(7);

    expect(contas.map((c) => [c.nome, c.saldo, c.totalTransacoes])).toEqual([
      ['Conta principal', 849.9, 4],
      ['Cartão', -300, 1], // no cartão, negativo = a pagar
      ['Dinheiro', 0, 0],
    ]);
  });

  it('nome repetido (do mesmo usuário) é 409', async () => {
    const { service } = montar([conta(1, 'Conta principal')]);

    await expect(
      service.criar(7, { nome: 'Conta principal', tipo: 'OUTRA', saldoInicial: 0 }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('o mesmo banco/conta do OFX não pode estar em duas contas', async () => {
    const { service } = montar([conta(1, 'Nubank', { identificadorExterno: 'conta:0260:1' })]);

    await expect(
      service.criar(7, {
        nome: 'Outra',
        tipo: 'CONTA_CORRENTE',
        saldoInicial: 0,
        identificadorExterno: 'conta:0260:1',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('conta de outro usuário é 404', async () => {
    const { service } = montar([conta(1, 'Conta principal')]);

    await expect(service.atualizar(7, 55, { nome: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.excluir(7, 55)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('excluir conta com transações é 409 e informa quantas', async () => {
    const { service, repositorio } = montar([conta(1, 'A'), conta(2, 'B')], { 2: 3 });

    await expect(service.excluir(7, 2)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('3 transações'),
    });
    expect(repositorio.excluir).not.toHaveBeenCalled();
  });

  it('exclui uma conta vazia, mas nunca a única ativa', async () => {
    const duas = montar([conta(1, 'A'), conta(2, 'B')]);
    await duas.service.excluir(7, 2);
    expect(duas.repositorio.excluir).toHaveBeenCalledWith(2);

    const uma = montar([conta(1, 'A'), conta(2, 'B', { arquivada: true })]);
    await expect(uma.service.excluir(7, 1)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('arquivar também mantém ao menos uma conta ativa', async () => {
    const { service } = montar([conta(1, 'A')]);

    await expect(service.atualizar(7, 1, { arquivada: true })).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

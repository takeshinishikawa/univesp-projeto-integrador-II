import { CategoriaRepository } from '../repositories/categoria.repository';
import { ContaRepository } from '../repositories/conta.repository';
import { TransacaoRepository } from '../repositories/transacao.repository';
import { CriarTransacaoDTO, Transacao } from '../types';
import { TransacaoService } from './transacao.service';

const dto: CriarTransacaoDTO = {
  categoriaId: 1,
  descricao: 'Mercado',
  valor: 150.75,
  tipo: 'DESPESA',
  dataTransacao: '2026-03-15',
};

const transacaoDoUsuario1: Transacao = {
  id: 10,
  usuarioId: 1,
  createdAt: new Date(),
  ...dto,
  contaId: 1,
};

const receitaDoUsuario1: Transacao = {
  ...transacaoDoUsuario1,
  id: 11,
  descricao: 'Salário',
  tipo: 'RECEITA',
};
const todasDoUsuario1 = [transacaoDoUsuario1, receitaDoUsuario1];

function montar(categoriaExiste = true, tipoDaCategoria: 'DESPESA' | 'RECEITA' = 'DESPESA') {
  const transacoes = {
    criar: jest.fn().mockResolvedValue(transacaoDoUsuario1),
    listarFiltradas: jest.fn().mockResolvedValue([transacaoDoUsuario1]),
    buscarPorIds: jest
      .fn()
      .mockImplementation(async (usuarioId: number, ids: number[]) =>
        usuarioId === 1 ? todasDoUsuario1.filter((t) => ids.includes(t.id)) : [],
      ),
    atualizarCategoria: jest
      .fn()
      .mockImplementation(async (_u: number, ids: number[]) => ids.length),
    deletarVarias: jest.fn().mockImplementation(async (_u: number, ids: number[]) => ids.length),
    buscarPorId: jest
      .fn()
      .mockImplementation(async (id: number) => (id === 10 ? transacaoDoUsuario1 : null)),
    atualizar: jest.fn().mockResolvedValue(transacaoDoUsuario1),
    deletar: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<TransacaoRepository>;
  const categorias = {
    buscarVisivel: jest
      .fn()
      .mockResolvedValue(categoriaExiste ? { id: 1, nome: 'Lazer', tipo: tipoDaCategoria } : null),
  } as unknown as jest.Mocked<CategoriaRepository>;
  const contas = {
    garantirPrincipal: jest.fn().mockResolvedValue({ id: 1, nome: 'Conta principal' }),
    buscarPorId: jest
      .fn()
      .mockImplementation(async (id: number) =>
        [1, 2].includes(id) ? { id, nome: `Conta ${id}` } : null,
      ),
  } as unknown as jest.Mocked<ContaRepository>;
  return { service: new TransacaoService(transacoes, categorias, contas), transacoes };
}

describe('TransacaoService', () => {
  describe('criar', () => {
    it('cria a transação associada ao usuário autenticado', async () => {
      const { service, transacoes } = montar();
      await service.criar(1, dto);
      expect(transacoes.criar).toHaveBeenCalledWith(1, { ...dto, contaId: 1 }); // conta principal
    });

    it('grava na conta escolhida e rejeita conta de outro usuário com 400', async () => {
      const { service, transacoes } = montar();
      await service.criar(1, { ...dto, contaId: 2 });
      expect(transacoes.criar).toHaveBeenCalledWith(1, { ...dto, contaId: 2 });

      await expect(service.criar(1, { ...dto, contaId: 99 })).rejects.toMatchObject({
        statusCode: 400,
        message: 'Conta inexistente',
      });
    });

    it('rejeita categoria inexistente com 400', async () => {
      const { service, transacoes } = montar(false);
      await expect(service.criar(1, dto)).rejects.toMatchObject({ statusCode: 400 });
      expect(transacoes.criar).not.toHaveBeenCalled();
    });
  });

  describe('listar (filtro por mês/ano)', () => {
    it('sem filtro não restringe o período', async () => {
      const { service, transacoes } = montar();
      await service.listar(1);
      expect(transacoes.listarFiltradas).toHaveBeenCalledWith(1, {
        periodo: undefined,
        busca: undefined,
      });
    });

    it('mês/ano resultam em [primeiro dia do mês, primeiro dia do mês seguinte)', async () => {
      const { service, transacoes } = montar();
      await service.listar(1, { mes: 12, ano: 2026 });
      expect(transacoes.listarFiltradas).toHaveBeenCalledWith(1, {
        periodo: { inicio: new Date(Date.UTC(2026, 11, 1)), fim: new Date(Date.UTC(2027, 0, 1)) },
        busca: undefined,
      });
    });

    it('somente ano cobre o ano inteiro', async () => {
      const { service, transacoes } = montar();
      await service.listar(1, { ano: 2026 });
      expect(transacoes.listarFiltradas).toHaveBeenCalledWith(1, {
        periodo: { inicio: new Date(Date.UTC(2026, 0, 1)), fim: new Date(Date.UTC(2027, 0, 1)) },
        busca: undefined,
      });
    });
  });

  describe('listar (demais filtros)', () => {
    it('repassa busca, categoria, tipo e faixa de valor ao repositório', async () => {
      const { service, transacoes } = montar();
      await service.listar(1, {
        busca: 'netflix',
        categoriaId: 4,
        tipo: 'DESPESA',
        valorMin: 10,
        valorMax: 50,
      });
      expect(transacoes.listarFiltradas).toHaveBeenCalledWith(1, {
        periodo: undefined,
        busca: 'netflix',
        categoriaId: 4,
        tipo: 'DESPESA',
        valorMin: 10,
        valorMax: 50,
      });
    });

    it('busca vazia equivale a sem filtro', async () => {
      const { service, transacoes } = montar();
      await service.listar(1, { busca: '' });
      expect(transacoes.listarFiltradas).toHaveBeenCalledWith(1, {
        periodo: undefined,
        busca: undefined,
      });
    });
  });

  describe('recategorizar (edição em massa)', () => {
    it('move as transações para a categoria e informa quantas foram alteradas', async () => {
      const { service, transacoes } = montar();
      await expect(service.recategorizar(1, [10], 1)).resolves.toEqual({ afetadas: 1 });
      expect(transacoes.atualizarCategoria).toHaveBeenCalledWith(1, [10], 1);
    });

    it('rejeita categoria inexistente ou de outro usuário (400) sem alterar nada', async () => {
      const { service, transacoes } = montar(false);
      await expect(service.recategorizar(1, [10], 1)).rejects.toMatchObject({ statusCode: 400 });
      expect(transacoes.atualizarCategoria).not.toHaveBeenCalled();
    });

    it('404 e nada alterado se algum id não for do usuário', async () => {
      const { service, transacoes } = montar();
      await expect(service.recategorizar(1, [10, 999], 1)).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(service.recategorizar(2, [10], 1)).rejects.toMatchObject({ statusCode: 404 });
      expect(transacoes.atualizarCategoria).not.toHaveBeenCalled();
    });

    it('400 quando o tipo da categoria não bate com o de alguma transação', async () => {
      const { service, transacoes } = montar(true, 'DESPESA');
      await expect(service.recategorizar(1, [10, 11], 1)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('1 das transações selecionadas'),
      });
      expect(transacoes.atualizarCategoria).not.toHaveBeenCalled();
    });
  });

  describe('deletarVarias', () => {
    it('exclui as transações do usuário', async () => {
      const { service, transacoes } = montar();
      await expect(service.deletarVarias(1, [10, 11])).resolves.toEqual({ afetadas: 2 });
      expect(transacoes.deletarVarias).toHaveBeenCalledWith(1, [10, 11]);
    });

    it('404 e nada excluído se algum id não for do usuário', async () => {
      const { service, transacoes } = montar();
      await expect(service.deletarVarias(1, [10, 999])).rejects.toMatchObject({ statusCode: 404 });
      expect(transacoes.deletarVarias).not.toHaveBeenCalled();
    });
  });

  describe('ownership (atualizar/deletar)', () => {
    it('permite ao dono atualizar', async () => {
      const { service, transacoes } = montar();
      await service.atualizar(1, 10, dto);
      expect(transacoes.atualizar).toHaveBeenCalledWith(10, { ...dto, contaId: 1 }); // mantém a conta
    });

    it('retorna 404 (não 403) ao atualizar transação de outro usuário', async () => {
      const { service, transacoes } = montar();
      await expect(service.atualizar(2, 10, dto)).rejects.toMatchObject({ statusCode: 404 });
      expect(transacoes.atualizar).not.toHaveBeenCalled();
    });

    it('retorna 404 ao atualizar transação inexistente', async () => {
      const { service } = montar();
      await expect(service.atualizar(1, 999, dto)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('permite ao dono deletar', async () => {
      const { service, transacoes } = montar();
      await service.deletar(1, 10);
      expect(transacoes.deletar).toHaveBeenCalledWith(10);
    });

    it('retorna 404 ao deletar transação de outro usuário', async () => {
      const { service, transacoes } = montar();
      await expect(service.deletar(2, 10)).rejects.toMatchObject({ statusCode: 404 });
      expect(transacoes.deletar).not.toHaveBeenCalled();
    });
  });
});

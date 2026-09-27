import { CategoriaRepository } from '../repositories/categoria.repository';
import { RegraRepository } from '../repositories/regra.repository';
import { TransacaoRepository } from '../repositories/transacao.repository';
import { Categoria, RegraCategoria, Transacao } from '../types';
import { RegraService } from './regra.service';

const ALIMENTACAO: Categoria = { id: 1, nome: 'Alimentação', tipo: 'DESPESA', usuarioId: null };
const ASSINATURAS: Categoria = { id: 10, nome: 'Assinaturas', tipo: 'DESPESA', usuarioId: 7 };
const SALARIO: Categoria = { id: 3, nome: 'Salário', tipo: 'RECEITA', usuarioId: null };
const DE_OUTRO: Categoria = { id: 20, nome: 'Pets', tipo: 'DESPESA', usuarioId: 8 };

const transacao = (id: number, descricao: string, categoriaId: number): Transacao => ({
  id,
  usuarioId: 7,
  categoriaId,
  contaId: 1,
  descricao,
  valor: 10,
  tipo: 'DESPESA',
  dataTransacao: '2026-03-10',
  createdAt: new Date(),
});

function montar(existentes: RegraCategoria[] = [], historico: Transacao[] = []) {
  const visiveis = [ALIMENTACAO, ASSINATURAS, SALARIO]; // Pets (de outro usuário) não aparece
  const regras = {
    listar: jest.fn().mockResolvedValue(existentes),
    buscarPorId: jest
      .fn()
      .mockImplementation((id: number) =>
        Promise.resolve(existentes.find((r) => r.id === id) ?? null),
      ),
    buscarPorTermo: jest
      .fn()
      .mockImplementation((_usuarioId: number, termo: string) =>
        Promise.resolve(existentes.find((r) => r.termo === termo) ?? null),
      ),
    criar: jest
      .fn()
      .mockImplementation((_u: number, dados: { termo: string; categoriaId: number }) =>
        Promise.resolve({ id: 99, ...dados }),
      ),
    atualizar: jest
      .fn()
      .mockImplementation((id: number, dados: object) =>
        Promise.resolve({ ...existentes.find((r) => r.id === id), ...dados }),
      ),
    excluir: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<RegraRepository>;
  const categorias = {
    buscarVisivel: jest
      .fn()
      .mockImplementation((id: number) =>
        Promise.resolve(visiveis.find((c) => c.id === id) ?? null),
      ),
  } as unknown as jest.Mocked<CategoriaRepository>;
  const transacoes = {
    listarFiltradas: jest.fn().mockResolvedValue(historico),
    atualizarCategoria: jest
      .fn()
      .mockImplementation((_u: number, ids: number[]) => Promise.resolve(ids.length)),
  } as unknown as jest.Mocked<TransacaoRepository>;
  return { service: new RegraService(regras, categorias, transacoes), regras, transacoes };
}

const REGRA_NETFLIX: RegraCategoria = { id: 5, categoriaId: 10, termo: 'netflix' };

describe('RegraService', () => {
  describe('criar', () => {
    it('guarda o termo normalizado (minúsculas, sem acento nem pontuação)', async () => {
      const { service, regras } = montar();

      const criada = await service.criar(7, { termo: '  Padaria  PÃO-Quente ', categoriaId: 1 });

      expect(regras.criar).toHaveBeenCalledWith(7, { termo: 'padaria pao quente', categoriaId: 1 });
      expect(criada).toEqual({ id: 99, termo: 'padaria pao quente', categoriaId: 1 });
    });

    it('rejeita termo que, sem pontuação e acento, fica com menos de 3 caracteres (400)', async () => {
      const { service, regras } = montar();

      await expect(service.criar(7, { termo: '***a-', categoriaId: 1 })).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(regras.criar).not.toHaveBeenCalled();
    });

    it('rejeita categoria inexistente ou de outro usuário (400)', async () => {
      const { service, regras } = montar();

      await expect(
        service.criar(7, { termo: 'netflix', categoriaId: DE_OUTRO.id }),
      ).rejects.toMatchObject({ statusCode: 400, message: 'Categoria inexistente' });
      expect(regras.criar).not.toHaveBeenCalled();
    });

    it('rejeita termo duplicado, mesmo com outra grafia (409)', async () => {
      const { service, regras } = montar([REGRA_NETFLIX]);

      await expect(service.criar(7, { termo: 'NETFLIX', categoriaId: 1 })).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(regras.criar).not.toHaveBeenCalled();
    });

    it('aceita categoria de receita (a regra só valerá para receitas)', async () => {
      const { service } = montar();

      await expect(service.criar(7, { termo: 'acme', categoriaId: 3 })).resolves.toMatchObject({
        categoriaId: 3,
      });
    });
  });

  describe('atualizar', () => {
    it('troca só a categoria', async () => {
      const { service, regras } = montar([REGRA_NETFLIX]);

      await service.atualizar(7, 5, { categoriaId: 1 });

      expect(regras.atualizar).toHaveBeenCalledWith(5, { categoriaId: 1 });
    });

    it('troca o termo, normalizando', async () => {
      const { service, regras } = montar([REGRA_NETFLIX]);

      await service.atualizar(7, 5, { termo: 'Netflix.com' });

      expect(regras.atualizar).toHaveBeenCalledWith(5, { termo: 'netflix com' });
    });

    it('aceita "trocar" o termo pelo mesmo (só mudou a grafia)', async () => {
      const { service, regras } = montar([REGRA_NETFLIX]);

      await expect(service.atualizar(7, 5, { termo: 'NETFLIX' })).resolves.toBeDefined();
      expect(regras.buscarPorTermo).not.toHaveBeenCalled();
    });

    it('rejeita termo que já é de outra regra (409)', async () => {
      const outra: RegraCategoria = { id: 6, categoriaId: 1, termo: 'spotify' };
      const { service, regras } = montar([REGRA_NETFLIX, outra]);

      await expect(service.atualizar(7, 5, { termo: 'spotify' })).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(regras.atualizar).not.toHaveBeenCalled();
    });

    it('regra inexistente (ou de outro usuário): 404', async () => {
      const { service, regras } = montar([REGRA_NETFLIX]);

      await expect(service.atualizar(7, 555, { categoriaId: 1 })).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(regras.buscarPorId).toHaveBeenCalledWith(555, 7);
    });
  });

  describe('excluir', () => {
    it('exclui a regra do usuário', async () => {
      const { service, regras } = montar([REGRA_NETFLIX]);

      await service.excluir(7, 5);

      expect(regras.excluir).toHaveBeenCalledWith(5);
    });

    it('regra inexistente: 404 e nada é excluído', async () => {
      const { service, regras } = montar();

      await expect(service.excluir(7, 5)).rejects.toMatchObject({ statusCode: 404 });
      expect(regras.excluir).not.toHaveBeenCalled();
    });
  });

  describe('aplicar', () => {
    it('reclassifica só as do mesmo tipo que casam e ainda não estão na categoria', async () => {
      const historico = [
        transacao(1, 'NETFLIX.COM', 2), // casa, outra categoria → muda
        transacao(2, 'Netflix Brasil', 1), // casa → muda
        transacao(3, 'Netflix', 10), // já está na categoria da regra → não conta
        transacao(4, 'Spotify', 2), // não casa
      ];
      const { service, transacoes } = montar([REGRA_NETFLIX], historico);

      const resultado = await service.aplicar(7, 5);

      expect(resultado).toEqual({ afetadas: 2 });
      expect(transacoes.listarFiltradas).toHaveBeenCalledWith(7, { tipo: 'DESPESA' });
      expect(transacoes.atualizarCategoria).toHaveBeenCalledTimes(1);
      expect(transacoes.atualizarCategoria).toHaveBeenCalledWith(7, [1, 2], 10);
    });

    it('casa pelo texto normalizado, como na importação', async () => {
      const regra: RegraCategoria = { id: 6, categoriaId: 1, termo: 'pao quente' };
      const { service, transacoes } = montar(
        [regra],
        [transacao(1, 'PÃO-Quente*Centro', 2), transacao(2, 'Pao Frio', 2)],
      );

      await service.aplicar(7, 6);

      expect(transacoes.atualizarCategoria).toHaveBeenCalledWith(7, [1], 1);
    });

    it('sem nada para mudar não grava nada e devolve zero', async () => {
      const { service, transacoes } = montar([REGRA_NETFLIX], [transacao(1, 'Spotify', 2)]);

      await expect(service.aplicar(7, 5)).resolves.toEqual({ afetadas: 0 });
      expect(transacoes.atualizarCategoria).not.toHaveBeenCalled();
    });

    it('grava em lotes de 5.000 para não estourar o IN da consulta', async () => {
      const historico = Array.from({ length: 5001 }, (_, i) => transacao(i + 1, 'Netflix', 2));
      const { service, transacoes } = montar([REGRA_NETFLIX], historico);

      const resultado = await service.aplicar(7, 5);

      expect(resultado).toEqual({ afetadas: 5001 });
      expect(transacoes.atualizarCategoria).toHaveBeenCalledTimes(2);
    });

    it('regra de outro usuário: 404', async () => {
      const { service, transacoes } = montar();

      await expect(service.aplicar(7, 5)).rejects.toMatchObject({ statusCode: 404 });
      expect(transacoes.listarFiltradas).not.toHaveBeenCalled();
    });
  });
});

import { CategoriaRepository } from '../repositories/categoria.repository';
import { Categoria } from '../types';
import { CategoriaService } from './categoria.service';

const PADRAO_DESPESA: Categoria = { id: 1, nome: 'Alimentação', tipo: 'DESPESA', usuarioId: null };
const PADRAO_OUTROS: Categoria = { id: 2, nome: 'Outros', tipo: 'DESPESA', usuarioId: null };
const PADRAO_SALARIO: Categoria = { id: 3, nome: 'Salário', tipo: 'RECEITA', usuarioId: null };
const DA_ANA: Categoria = { id: 10, nome: 'Pets', tipo: 'DESPESA', usuarioId: 7 };

function montar(visiveis: Categoria[] = [PADRAO_DESPESA, PADRAO_OUTROS, PADRAO_SALARIO, DA_ANA]) {
  const repositorio = {
    listarVisiveis: jest.fn().mockResolvedValue(visiveis),
    buscarVisivel: jest
      .fn()
      .mockImplementation((id: number) =>
        Promise.resolve(visiveis.find((c) => c.id === id) ?? null),
      ),
    criar: jest
      .fn()
      .mockImplementation(
        (usuarioId: number, dados: { nome: string; tipo: 'RECEITA' | 'DESPESA' }) =>
          Promise.resolve({ id: 99, usuarioId, ...dados }),
      ),
    renomear: jest
      .fn()
      .mockImplementation((id: number, nome: string) => Promise.resolve({ ...DA_ANA, id, nome })),
    excluir: jest.fn().mockResolvedValue(undefined),
    contarTransacoes: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<CategoriaRepository>;
  return { service: new CategoriaService(repositorio), repositorio };
}

describe('CategoriaService', () => {
  it('listar consulta as visíveis ao usuário e marca as padrão, sem expor o dono', async () => {
    const { service, repositorio } = montar();

    const lista = await service.listar(7);

    expect(repositorio.listarVisiveis).toHaveBeenCalledWith(7);
    expect(lista).toContainEqual({ id: 1, nome: 'Alimentação', tipo: 'DESPESA', padrao: true });
    expect(lista).toContainEqual({ id: 10, nome: 'Pets', tipo: 'DESPESA', padrao: false });
    expect(lista.every((c) => !('usuarioId' in c))).toBe(true);
  });

  describe('criar', () => {
    it('cria uma categoria do usuário', async () => {
      const { service, repositorio } = montar();

      const criada = await service.criar(7, { nome: 'Academia', tipo: 'DESPESA' });

      expect(repositorio.criar).toHaveBeenCalledWith(7, { nome: 'Academia', tipo: 'DESPESA' });
      expect(criada).toEqual({ id: 99, nome: 'Academia', tipo: 'DESPESA', padrao: false });
    });

    it('rejeita nome igual ao de uma categoria padrão, ignorando acento e maiúsculas', async () => {
      const { service, repositorio } = montar();

      await expect(
        service.criar(7, { nome: 'alimentacao', tipo: 'DESPESA' }),
      ).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(repositorio.criar).not.toHaveBeenCalled();
    });

    it('rejeita nome igual ao de outra categoria do próprio usuário', async () => {
      const { service } = montar();

      await expect(service.criar(7, { nome: ' PETS ', tipo: 'DESPESA' })).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('permite o mesmo nome em outro tipo (despesa x receita)', async () => {
      const { service } = montar();

      await expect(service.criar(7, { nome: 'Pets', tipo: 'RECEITA' })).resolves.toMatchObject({
        tipo: 'RECEITA',
      });
    });
  });

  describe('renomear', () => {
    it('renomeia uma categoria do usuário', async () => {
      const { service, repositorio } = montar();

      const resposta = await service.renomear(7, 10, { nome: 'Animais' });

      expect(repositorio.renomear).toHaveBeenCalledWith(10, 'Animais');
      expect(resposta.nome).toBe('Animais');
    });

    it('aceita mudar só a caixa/acento do próprio nome', async () => {
      const { service } = montar();

      await expect(service.renomear(7, 10, { nome: 'PETS' })).resolves.toBeDefined();
    });

    it('rejeita nome já usado por outra categoria do mesmo tipo', async () => {
      const { service, repositorio } = montar();

      await expect(service.renomear(7, 10, { nome: 'Outros' })).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(repositorio.renomear).not.toHaveBeenCalled();
    });

    it('categoria padrão: 403; inexistente ou de outro usuário: 404', async () => {
      const { service, repositorio } = montar();

      await expect(service.renomear(7, 1, { nome: 'X' })).rejects.toMatchObject({
        statusCode: 403,
      });
      await expect(service.renomear(7, 555, { nome: 'X' })).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(repositorio.renomear).not.toHaveBeenCalled();
    });
  });

  describe('excluir', () => {
    it('exclui uma categoria do usuário sem transações', async () => {
      const { service, repositorio } = montar();

      await service.excluir(7, 10);

      expect(repositorio.excluir).toHaveBeenCalledWith(10);
    });

    it('não exclui categoria em uso (409) e informa quantas transações a usam', async () => {
      const { service, repositorio } = montar();
      repositorio.contarTransacoes.mockResolvedValue(3);

      await expect(service.excluir(7, 10)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('3 transação'),
      });
      expect(repositorio.excluir).not.toHaveBeenCalled();
    });

    it('categoria padrão: 403; inexistente ou de outro usuário: 404', async () => {
      const { service, repositorio } = montar();

      await expect(service.excluir(7, 2)).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.excluir(7, 555)).rejects.toMatchObject({ statusCode: 404 });
      expect(repositorio.excluir).not.toHaveBeenCalled();
    });
  });
});

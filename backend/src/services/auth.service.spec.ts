import { resetEnvCache } from '../config/env';
import { UsuarioRepository } from '../repositories/usuario.repository';
import { Usuario } from '../types';
import { verificarToken } from '../utils/jwt';
import { compararSenha, gerarHashSenha } from '../utils/password';
import { AuthService } from './auth.service';

describe('hash de senha (bcrypt)', () => {
  it('não guarda a senha em texto puro e valida corretamente', async () => {
    const hash = await gerarHashSenha('senha-segura-123');
    expect(hash).not.toContain('senha-segura-123');
    expect(await compararSenha('senha-segura-123', hash)).toBe(true);
    expect(await compararSenha('senha-errada', hash)).toBe(false);
  });
});

describe('AuthService', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-16-chars';
    resetEnvCache();
  });

  function montar(existente: Usuario | null) {
    const usuarios = {
      buscarPorEmail: jest.fn().mockResolvedValue(existente),
      buscarPorId: jest.fn().mockResolvedValue(existente),
      excluirComDados: jest.fn().mockResolvedValue(undefined),
      criar: jest.fn().mockImplementation(async (dados) => ({
        id: 1,
        createdAt: new Date(),
        ...dados,
      })),
    } as unknown as jest.Mocked<UsuarioRepository>;
    return { service: new AuthService(usuarios), usuarios };
  }

  it('registra guardando apenas o hash e sem expor senhaHash na resposta', async () => {
    const { service, usuarios } = montar(null);

    const publico = await service.registrar({
      nome: 'Ana',
      email: 'ana@exemplo.com',
      senha: 'senha-segura-123',
    });

    const dadosPersistidos = usuarios.criar.mock.calls[0][0];
    expect(dadosPersistidos.senhaHash).not.toBe('senha-segura-123');
    expect(publico).not.toHaveProperty('senhaHash');
  });

  it('retorna 409 para e-mail já cadastrado', async () => {
    const { service, usuarios } = montar({ id: 1 } as Usuario);
    await expect(
      service.registrar({ nome: 'Ana', email: 'ana@exemplo.com', senha: 'senha-segura-123' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(usuarios.criar).not.toHaveBeenCalled();
  });

  it('faz login e emite JWT com sub = id do usuário', async () => {
    const senhaHash = await gerarHashSenha('senha-segura-123');
    const { service } = montar({
      id: 9,
      nome: 'Ana',
      email: 'ana@exemplo.com',
      senhaHash,
      createdAt: new Date(),
    });

    const { token, usuario } = await service.login({
      email: 'ana@exemplo.com',
      senha: 'senha-segura-123',
    });

    expect(verificarToken(token)).toBe(9);
    expect(usuario).not.toHaveProperty('senhaHash');
  });

  it('retorna 401 para senha incorreta', async () => {
    const senhaHash = await gerarHashSenha('senha-segura-123');
    const { service } = montar({ id: 9, senhaHash } as Usuario);
    await expect(
      service.login({ email: 'ana@exemplo.com', senha: 'errada' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('retorna 401 (mesma mensagem) para e-mail inexistente', async () => {
    const { service } = montar(null);
    await expect(
      service.login({ email: 'x@exemplo.com', senha: 'qualquer' }),
    ).rejects.toMatchObject({ statusCode: 401, message: 'Credenciais inválidas' });
  });

  describe('excluirConta', () => {
    async function comSenha() {
      const senhaHash = await gerarHashSenha('senha-segura-123');
      return montar({ id: 9, senhaHash } as Usuario);
    }

    it('exclui o usuário e os dados quando a senha confere', async () => {
      const { service, usuarios } = await comSenha();
      await service.excluirConta(9, 'senha-segura-123');
      expect(usuarios.excluirComDados).toHaveBeenCalledWith(9);
    });

    it('retorna 401 e não exclui nada com a senha errada', async () => {
      const { service, usuarios } = await comSenha();
      await expect(service.excluirConta(9, 'errada')).rejects.toMatchObject({ statusCode: 401 });
      expect(usuarios.excluirComDados).not.toHaveBeenCalled();
    });

    it('retorna 404 se o usuário do token não existe mais', async () => {
      const { service, usuarios } = montar(null);
      await expect(service.excluirConta(9, 'qualquer')).rejects.toMatchObject({ statusCode: 404 });
      expect(usuarios.excluirComDados).not.toHaveBeenCalled();
    });
  });
});

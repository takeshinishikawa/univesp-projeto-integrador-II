import { UsuarioRepository } from '../repositories/usuario.repository';
import { LoginDTO, RegistrarUsuarioDTO, Usuario, UsuarioPublico } from '../types';
import { AppError } from '../utils/app-error';
import { assinarToken } from '../utils/jwt';
import { compararSenha, gerarHashSenha } from '../utils/password';

export function paraUsuarioPublico(usuario: Usuario): UsuarioPublico {
  const { senhaHash: _senhaHash, ...publico } = usuario;
  return publico;
}

export class AuthService {
  constructor(private readonly usuarios: UsuarioRepository) {}

  async registrar(dto: RegistrarUsuarioDTO): Promise<UsuarioPublico> {
    const existente = await this.usuarios.buscarPorEmail(dto.email);
    if (existente) {
      throw new AppError(409, 'E-mail já cadastrado');
    }

    const usuario = await this.usuarios.criar({
      nome: dto.nome,
      email: dto.email,
      senhaHash: await gerarHashSenha(dto.senha),
    });
    return paraUsuarioPublico(usuario);
  }

  async login(dto: LoginDTO): Promise<{ token: string; usuario: UsuarioPublico }> {
    const usuario = await this.usuarios.buscarPorEmail(dto.email);
    const senhaConfere = usuario ? await compararSenha(dto.senha, usuario.senhaHash) : false;
    if (!usuario || !senhaConfere) {
      throw new AppError(401, 'Credenciais inválidas');
    }
    return { token: assinarToken(usuario.id), usuario: paraUsuarioPublico(usuario) };
  }

  // Pede a senha de novo: um token esquecido aberto não basta para apagar tudo.
  async excluirConta(usuarioId: number, senha: string): Promise<void> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (!usuario) {
      throw new AppError(404, 'Usuário não encontrado');
    }
    if (!(await compararSenha(senha, usuario.senhaHash))) {
      throw new AppError(401, 'Senha incorreta');
    }
    await this.usuarios.excluirComDados(usuarioId);
  }
}

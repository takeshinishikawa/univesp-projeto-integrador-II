import { CategoriaRepository } from '../repositories/categoria.repository';
import { ContaRepository } from '../repositories/conta.repository';
import { RegraRepository } from '../repositories/regra.repository';
import { TransacaoRepository } from '../repositories/transacao.repository';
import { UsuarioRepository } from '../repositories/usuario.repository';
import {
  ConfirmarImportacaoDTO,
  LIMITE_LINHAS_IMPORTACAO,
  LinhaImportacaoDTO,
  LinhaPreview,
  PreviewImportacao,
  ResultadoImportacao,
  TipoTransacao,
} from '../types';
import { Conta } from '../types/novas-features';
import { AppError } from '../utils/app-error';
import { lerOfx } from '../utils/ofx-parser';
import { ehPagamentoDeFatura, sugerirCategoria, sugerirIgnorada } from './categorizacao.service';
import { categoriaOutros } from './transferencia.service';

export class ImportacaoService {
  constructor(
    private readonly transacoes: TransacaoRepository,
    private readonly categorias: CategoriaRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly regras: RegraRepository,
    private readonly contas: ContaRepository,
  ) {}

  // Nada é gravado aqui: o arquivo só é lido e as transações confirmadas entram em `confirmar`.
  // As duplicatas são procuradas na conta escolhida (ou na reconhecida pelo arquivo, ou na principal).
  async gerarPreview(
    usuarioId: number,
    arquivo: Buffer,
    contaIdEscolhida?: number,
  ): Promise<PreviewImportacao> {
    const { origem, identificadorExterno, transacoes, linhasIgnoradas } = lerOfx(arquivo);
    if (transacoes.length > LIMITE_LINHAS_IMPORTACAO) {
      throw new AppError(
        422,
        `O arquivo tem ${transacoes.length} lançamentos; o limite por importação é ${LIMITE_LINHAS_IMPORTACAO}`,
      );
    }

    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (!usuario) {
      throw new AppError(404, 'Usuário não encontrado');
    }
    const reconhecida = identificadorExterno
      ? await this.contas.buscarPorIdentificador(usuarioId, identificadorExterno)
      : null;
    const conta =
      contaIdEscolhida === undefined
        ? (reconhecida ?? (await this.contas.garantirPrincipal(usuarioId)))
        : await this.obterConta(usuarioId, contaIdEscolhida);

    const [categorias, regrasDoUsuario] = await Promise.all([
      this.categorias.listarVisiveis(usuarioId),
      this.regras.listar(usuarioId),
    ]);
    const jaImportadas = await this.transacoes.buscarIdsExternos(
      usuarioId,
      conta.id,
      transacoes.map((transacao) => transacao.idExterno),
    );

    const vistos = new Set<string>();
    const linhas = transacoes.map((transacao): LinhaPreview => {
      const sugestao = sugerirCategoria(
        transacao.descricao,
        transacao.tipo,
        categorias,
        regrasDoUsuario,
      );
      if (sugestao === null) {
        throw new AppError(500, 'Categorias padrão não encontradas; execute o seed do banco');
      }

      const ignorada = sugerirIgnorada(transacao.descricao, usuario.nome);
      // O mesmo FITID repetido dentro do arquivo também conta como duplicado.
      const duplicada = jaImportadas.has(transacao.idExterno) || vistos.has(transacao.idExterno);
      vistos.add(transacao.idExterno);

      return {
        idExterno: transacao.idExterno,
        dataTransacao: transacao.data,
        descricao: transacao.descricao,
        valor: transacao.valor,
        tipo: transacao.tipo,
        categoriaId: sugestao.categoriaId,
        origemSugestao: sugestao.origem,
        termoSugestao: sugestao.termo,
        duplicada,
        ignoradaSugerida: ignorada !== null,
        motivoIgnorada: ignorada?.motivo ?? null,
        pagamentoDeFatura: ehPagamentoDeFatura(transacao.descricao),
      };
    });

    return {
      origem,
      identificadorExterno,
      contaId: conta.id,
      contaReconhecida: reconhecida !== null && reconhecida.id === conta.id,
      nomeContaSugerido: origem === 'CARTAO' ? 'Cartão de crédito' : 'Conta corrente',
      tipoContaSugerido: origem === 'CARTAO' ? 'CARTAO_CREDITO' : 'CONTA_CORRENTE',
      linhas,
      linhasIgnoradas,
    };
  }

  // Não confia no preview: revalida categoria/tipo e usa sempre o usuário do token.
  async confirmar(usuarioId: number, dto: ConfirmarImportacaoDTO): Promise<ResultadoImportacao> {
    const conta = await this.resolverContaDaImportacao(usuarioId, dto);
    const categorias = await this.categorias.listarVisiveis(usuarioId);
    const tipoPorCategoria = new Map(categorias.map((categoria) => [categoria.id, categoria.tipo]));

    for (const linha of dto.transacoes) {
      const tipoCategoria = tipoPorCategoria.get(linha.categoriaId);
      if (tipoCategoria === undefined) {
        throw new AppError(400, `Categoria inexistente no lançamento "${linha.descricao}"`);
      }
      if (tipoCategoria !== linha.tipo) {
        throw new AppError(
          400,
          `A categoria do lançamento "${linha.descricao}" não é do tipo ${linha.tipo}`,
        );
      }
      if (linha.contaDestinoId !== undefined) {
        if (linha.contaDestinoId === conta.id) {
          throw new AppError(
            400,
            `A transferência de "${linha.descricao}" não pode ter a própria conta como destino`,
          );
        }
        await this.obterConta(usuarioId, linha.contaDestinoId);
      }
    }

    const unicas = [...new Map(dto.transacoes.map((linha) => [linha.idExterno, linha])).values()];
    const comuns = unicas.filter((linha) => linha.contaDestinoId === undefined);
    const transferencias = unicas.filter((linha) => linha.contaDestinoId !== undefined);

    let importadas = await this.transacoes.criarVarias(usuarioId, conta.id, comuns);
    importadas += await this.importarTransferencias(
      usuarioId,
      conta.id,
      transferencias,
      categorias,
    );

    return { importadas, ignoradasPorDuplicidade: dto.transacoes.length - importadas };
  }

  // Cada linha vira um par (a saída/entrada do arquivo e a ponta oposta na conta de destino).
  private async importarTransferencias(
    usuarioId: number,
    contaId: number,
    linhas: LinhaImportacaoDTO[],
    categorias: Parameters<typeof categoriaOutros>[0],
  ): Promise<number> {
    if (linhas.length === 0) return 0;
    const existentes = await this.transacoes.buscarIdsExternos(
      usuarioId,
      contaId,
      linhas.map((linha) => linha.idExterno),
    );
    let criadas = 0;
    for (const linha of linhas.filter((l) => !existentes.has(l.idExterno))) {
      const oposto: TipoTransacao = linha.tipo === 'DESPESA' ? 'RECEITA' : 'DESPESA';
      const base = {
        descricao: linha.descricao,
        valor: linha.valor,
        dataTransacao: linha.dataTransacao,
      };
      await this.transacoes.criarPar(
        usuarioId,
        {
          ...base,
          tipo: linha.tipo,
          categoriaId: linha.categoriaId,
          contaId,
          idExterno: linha.idExterno,
        },
        {
          ...base,
          tipo: oposto,
          categoriaId: categoriaOutros(categorias, oposto),
          contaId: linha.contaDestinoId as number,
        },
      );
      criadas += 1;
    }
    return criadas;
  }

  // Conta pedida > conta reconhecida pelo identificador > principal. Se a conta ainda não tem
  // identificador, o do arquivo passa a valer para as próximas importações.
  private async resolverContaDaImportacao(
    usuarioId: number,
    dto: ConfirmarImportacaoDTO,
  ): Promise<Conta> {
    let conta: Conta;
    if (dto.contaId !== undefined) {
      conta = await this.obterConta(usuarioId, dto.contaId);
    } else {
      const reconhecida = dto.identificadorExterno
        ? await this.contas.buscarPorIdentificador(usuarioId, dto.identificadorExterno)
        : null;
      conta = reconhecida ?? (await this.contas.garantirPrincipal(usuarioId));
    }
    if (dto.identificadorExterno && !conta.identificadorExterno) {
      const dona = await this.contas.buscarPorIdentificador(usuarioId, dto.identificadorExterno);
      if (!dona) {
        conta = await this.contas.atualizar(conta.id, {
          identificadorExterno: dto.identificadorExterno,
        });
      }
    }
    return conta;
  }

  private async obterConta(usuarioId: number, contaId: number): Promise<Conta> {
    const conta = await this.contas.buscarPorId(contaId, usuarioId);
    if (!conta) {
      throw new AppError(400, 'Conta inexistente');
    }
    return conta;
  }
}

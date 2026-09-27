import { CategoriaRepository } from '../repositories/categoria.repository';
import { ContaRepository } from '../repositories/conta.repository';
import { RegraRepository } from '../repositories/regra.repository';
import { TransacaoRepository } from '../repositories/transacao.repository';
import { UsuarioRepository } from '../repositories/usuario.repository';
import { Categoria, LinhaImportacaoDTO, RegraCategoria, Usuario } from '../types';
import { AppError } from '../utils/app-error';
import { ImportacaoService } from './importacao.service';

const CATEGORIAS: Categoria[] = [
  { id: 1, nome: 'Alimentação', tipo: 'DESPESA' },
  { id: 2, nome: 'Transporte', tipo: 'DESPESA' },
  { id: 3, nome: 'Outros', tipo: 'DESPESA' },
  { id: 4, nome: 'Salário', tipo: 'RECEITA' },
  { id: 5, nome: 'Outros', tipo: 'RECEITA' },
];

const USUARIO = { id: 7, nome: 'Usuario Teste' } as Usuario;

function ofx(...blocos: string[]): Buffer {
  return Buffer.from(
    `OFXHEADER:100\nCHARSET:NONE\n<OFX>\n<BANKMSGSRSV1><STMTRS><BANKTRANLIST>\n${blocos.join('\n')}\n</BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>`,
  );
}

const trn = (fitid: string, valor: string, memo: string, data = '20260310'): string =>
  `<STMTTRN><TRNTYPE>OTHER</TRNTYPE><DTPOSTED>${data}</DTPOSTED><TRNAMT>${valor}</TRNAMT><FITID>${fitid}</FITID><MEMO>${memo}</MEMO></STMTTRN>`;

function montar(
  jaImportadas: string[] = [],
  criadas?: number,
  regrasDoUsuario: RegraCategoria[] = [],
) {
  const transacoes = {
    buscarIdsExternos: jest.fn().mockResolvedValue(new Set(jaImportadas)),
    criarPar: jest.fn().mockResolvedValue('transferencia-1'),
    criarVarias: jest
      .fn()
      .mockImplementation((_usuarioId: number, _contaId: number, linhas: LinhaImportacaoDTO[]) =>
        Promise.resolve(criadas ?? linhas.length),
      ),
  } as unknown as jest.Mocked<TransacaoRepository>;
  const categorias = {
    listarVisiveis: jest.fn().mockResolvedValue(CATEGORIAS),
  } as unknown as jest.Mocked<CategoriaRepository>;
  const usuarios = {
    buscarPorId: jest.fn().mockResolvedValue(USUARIO),
  } as unknown as jest.Mocked<UsuarioRepository>;
  const regras = {
    listar: jest.fn().mockResolvedValue(regrasDoUsuario),
  } as unknown as jest.Mocked<RegraRepository>;
  const conta = {
    id: 1,
    nome: 'Conta principal',
    tipo: 'CONTA_CORRENTE',
    identificadorExterno: null,
  };
  const contas = {
    garantirPrincipal: jest.fn().mockResolvedValue(conta),
    buscarPorIdentificador: jest.fn().mockResolvedValue(null),
    buscarPorId: jest
      .fn()
      .mockImplementation(async (id: number) => (id === 1 || id === 2 ? { ...conta, id } : null)),
    atualizar: jest
      .fn()
      .mockImplementation(async (_id: number, dados: object) => ({ ...conta, ...dados })),
  } as unknown as jest.Mocked<ContaRepository>;
  return {
    service: new ImportacaoService(transacoes, categorias, usuarios, regras, contas),
    transacoes,
    regras,
    contas,
  };
}

const linha = (sobrescrever: Partial<LinhaImportacaoDTO> = {}): LinhaImportacaoDTO => ({
  idExterno: 'f-1',
  categoriaId: 1,
  descricao: 'Padaria',
  valor: 10,
  tipo: 'DESPESA',
  dataTransacao: '2026-03-10',
  ...sobrescrever,
});

describe('ImportacaoService.gerarPreview', () => {
  it('categoriza, resolve o categoriaId pelo banco e não grava nada', async () => {
    const { service, transacoes } = montar();

    const preview = await service.gerarPreview(
      USUARIO.id,
      ofx(trn('a', '-20.00', 'Padaria Pao Quente'), trn('b', '5000.00', 'Salario ACME')),
    );

    expect(preview.origem).toBe('CONTA');
    expect(preview.linhas).toEqual([
      expect.objectContaining({ idExterno: 'a', categoriaId: 1, tipo: 'DESPESA', valor: 20 }),
      expect.objectContaining({ idExterno: 'b', categoriaId: 4, tipo: 'RECEITA', valor: 5000 }),
    ]);
    expect(transacoes.criarVarias).not.toHaveBeenCalled();
  });

  it('informa a origem da sugestão: regra fixa ou "Outros"', async () => {
    const { service } = montar();

    const { linhas } = await service.gerarPreview(
      USUARIO.id,
      ofx(trn('a', '-20.00', 'Padaria Pao Quente'), trn('b', '-9.00', 'Loja Misteriosa')),
    );

    expect(linhas.map((l) => [l.origemSugestao, l.termoSugestao])).toEqual([
      ['REGRA_PADRAO', null],
      ['FALLBACK', null],
    ]);
  });

  it('a regra do usuário vale antes das regras fixas e informa o termo', async () => {
    // "padaria" cairia em Alimentação (1); a regra do usuário manda para Transporte (2).
    const { service, regras } = montar([], undefined, [
      { id: 1, categoriaId: 2, termo: 'padaria pao' },
    ]);

    const { linhas } = await service.gerarPreview(
      USUARIO.id,
      ofx(trn('a', '-20.00', 'PADARIA PÃO Quente'), trn('b', '-8.00', 'Padaria Estrela')),
    );

    expect(regras.listar).toHaveBeenCalledWith(USUARIO.id);
    expect(linhas.map((l) => [l.categoriaId, l.origemSugestao, l.termoSugestao])).toEqual([
      [2, 'REGRA_USUARIO', 'padaria pao'],
      [1, 'REGRA_PADRAO', null],
    ]);
  });

  it('regra de categoria de despesa nunca classifica receita', async () => {
    const { service } = montar([], undefined, [{ id: 1, categoriaId: 2, termo: 'acme' }]);

    const { linhas } = await service.gerarPreview(
      USUARIO.id,
      ofx(trn('a', '-20.00', 'Acme Ltda'), trn('b', '500.00', 'Acme Ltda')),
    );

    expect(linhas.map((l) => [l.categoriaId, l.origemSugestao])).toEqual([
      [2, 'REGRA_USUARIO'],
      [5, 'FALLBACK'], // receita: "Outros" de receita
    ]);
  });

  it('usa "Outros" do tipo certo quando nenhuma regra casa', async () => {
    const { service } = montar();

    const { linhas } = await service.gerarPreview(
      USUARIO.id,
      ofx(trn('a', '-20.00', 'Loja Misteriosa'), trn('b', '20.00', 'Credito qualquer')),
    );

    expect(linhas.map((l) => l.categoriaId)).toEqual([3, 5]);
  });

  it('marca como duplicada a linha cujo FITID o usuário já importou', async () => {
    const { service, transacoes } = montar(['a']);

    const { linhas } = await service.gerarPreview(
      USUARIO.id,
      ofx(trn('a', '-1', 'X'), trn('b', '-1', 'Y')),
    );

    expect(linhas.map((l) => l.duplicada)).toEqual([true, false]);
    expect(transacoes.buscarIdsExternos).toHaveBeenCalledWith(USUARIO.id, 1, ['a', 'b']);
  });

  it('marca como duplicado o FITID repetido dentro do próprio arquivo', async () => {
    const { service } = montar();

    const { linhas } = await service.gerarPreview(
      USUARIO.id,
      ofx(trn('a', '-1', 'X'), trn('a', '-1', 'X')),
    );

    expect(linhas.map((l) => l.duplicada)).toEqual([false, true]);
  });

  it('sugere desmarcar pagamento de fatura e transferência entre contas próprias', async () => {
    const { service } = montar();

    const { linhas } = await service.gerarPreview(
      USUARIO.id,
      ofx(
        trn('a', '-900', 'Pagamento de fatura'),
        trn(
          'b',
          '-300',
          'Transferência enviada pelo Pix - USUARIO TESTE - •••.111.222-•• - Banco XP (0348) Agência: 1 Conta: 2',
        ),
        trn('c', '-30', 'Padaria'),
      ),
    );

    expect(linhas.map((l) => [l.ignoradaSugerida, l.motivoIgnorada])).toEqual([
      [true, 'possível pagamento de fatura'],
      [true, 'possível transferência entre suas contas'],
      [false, null],
    ]);
  });

  it('rejeita arquivo com mais de 1.000 lançamentos (422)', async () => {
    const { service } = montar();
    const muitos = Array.from({ length: 1001 }, (_, i) => trn(`f${i}`, '-1', 'X'));

    await expect(service.gerarPreview(USUARIO.id, ofx(...muitos))).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('propaga o erro de arquivo que não é OFX', async () => {
    const { service } = montar();

    await expect(service.gerarPreview(USUARIO.id, Buffer.from('abc'))).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('ImportacaoService.confirmar', () => {
  it('grava as linhas do usuário do token e devolve os totais', async () => {
    const { service, transacoes } = montar();

    const resultado = await service.confirmar(USUARIO.id, {
      transacoes: [linha(), linha({ idExterno: 'f-2', categoriaId: 4, tipo: 'RECEITA' })],
    });

    expect(resultado).toEqual({ importadas: 2, ignoradasPorDuplicidade: 0 });
    expect(transacoes.criarVarias).toHaveBeenCalledWith(USUARIO.id, 1, expect.any(Array));
  });

  it('conta como ignoradas por duplicidade as que o banco pulou', async () => {
    const { service } = montar([], 1);

    const resultado = await service.confirmar(USUARIO.id, {
      transacoes: [linha(), linha({ idExterno: 'f-2' })],
    });

    expect(resultado).toEqual({ importadas: 1, ignoradasPorDuplicidade: 1 });
  });

  it('descarta FITIDs repetidos no envio antes de gravar', async () => {
    const { service, transacoes } = montar();

    const resultado = await service.confirmar(USUARIO.id, { transacoes: [linha(), linha()] });

    expect(transacoes.criarVarias.mock.calls[0][2]).toHaveLength(1);
    expect(resultado).toEqual({ importadas: 1, ignoradasPorDuplicidade: 1 });
  });

  it('rejeita categoria inexistente (400) sem gravar', async () => {
    const { service, transacoes } = montar();

    await expect(
      service.confirmar(USUARIO.id, { transacoes: [linha({ categoriaId: 99 })] }),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('inexistente') });
    expect(transacoes.criarVarias).not.toHaveBeenCalled();
  });

  it('rejeita categoria de tipo diferente do lançamento (400) sem gravar', async () => {
    const { service, transacoes } = montar();

    await expect(
      service.confirmar(USUARIO.id, { transacoes: [linha({ categoriaId: 4, tipo: 'DESPESA' })] }),
    ).rejects.toBeInstanceOf(AppError);
    expect(transacoes.criarVarias).not.toHaveBeenCalled();
  });
});

describe('ImportacaoService: contas e transferências', () => {
  const ofxComConta = (idConta: string, ...blocos: string[]): Buffer =>
    Buffer.from(
      `OFXHEADER:100\nCHARSET:NONE\n<OFX>\n<BANKMSGSRSV1><STMTRS><BANKACCTFROM><BANKID>0260</BANKID><ACCTID>${idConta}</ACCTID></BANKACCTFROM><BANKTRANLIST>\n${blocos.join('\n')}\n</BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>`,
    );

  it('reconhece a conta pelo identificador do arquivo e procura as duplicatas nela', async () => {
    const { service, transacoes, contas } = montar();
    contas.buscarPorIdentificador.mockResolvedValue({
      id: 2,
      nome: 'Nubank',
      tipo: 'CONTA_CORRENTE',
      saldoInicial: 0,
      identificadorExterno: 'conta:0260:123',
      arquivada: false,
    });

    const preview = await service.gerarPreview(
      USUARIO.id,
      ofxComConta('123', trn('a', '-20.00', 'Padaria')),
    );

    expect(contas.buscarPorIdentificador).toHaveBeenCalledWith(USUARIO.id, 'conta:0260:123');
    expect(preview).toMatchObject({
      contaId: 2,
      contaReconhecida: true,
      identificadorExterno: 'conta:0260:123',
    });
    expect(transacoes.buscarIdsExternos).toHaveBeenCalledWith(USUARIO.id, 2, ['a']);
  });

  it('arquivo desconhecido: usa a conta principal e sugere nome e tipo para criar uma nova', async () => {
    const { service } = montar();

    const preview = await service.gerarPreview(
      USUARIO.id,
      ofxComConta('999', trn('a', '-20.00', 'Padaria')),
    );

    expect(preview).toMatchObject({
      contaId: 1,
      contaReconhecida: false,
      nomeContaSugerido: 'Conta corrente',
      tipoContaSugerido: 'CONTA_CORRENTE',
    });
  });

  it('a conta escolhida na tela manda: outra conta do usuário é 400', async () => {
    const { service } = montar();

    await expect(
      service.gerarPreview(USUARIO.id, ofx(trn('a', '-20.00', 'Padaria')), 99),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('marca o pagamento de fatura como candidato a transferência', async () => {
    const { service } = montar();

    const preview = await service.gerarPreview(
      USUARIO.id,
      ofx(trn('a', '-900.00', 'Pagamento de fatura'), trn('b', '-20.00', 'Padaria')),
    );

    expect(preview.linhas.map((l) => l.pagamentoDeFatura)).toEqual([true, false]);
  });

  it('ao confirmar, liga a conta ao identificador do arquivo se ela ainda não tem um', async () => {
    const { service, contas } = montar();

    await service.confirmar(USUARIO.id, {
      transacoes: [linha()],
      contaId: 1,
      identificadorExterno: 'conta:0260:123',
    });

    expect(contas.atualizar).toHaveBeenCalledWith(1, { identificadorExterno: 'conta:0260:123' });
  });

  it('linha com conta de destino vira transferência: a saída no arquivo e a entrada na outra conta', async () => {
    const { service, transacoes } = montar();

    const resultado = await service.confirmar(USUARIO.id, {
      transacoes: [
        linha({ idExterno: 'f', descricao: 'Pagamento de fatura', valor: 900, contaDestinoId: 2 }),
        linha({ idExterno: 'g' }),
      ],
      contaId: 1,
    });

    expect(
      transacoes.criarVarias.mock.calls[0][2].map((l: LinhaImportacaoDTO) => l.idExterno),
    ).toEqual(['g']);
    expect(transacoes.criarPar).toHaveBeenCalledWith(
      USUARIO.id,
      expect.objectContaining({ contaId: 1, tipo: 'DESPESA', idExterno: 'f', valor: 900 }),
      expect.objectContaining({ contaId: 2, tipo: 'RECEITA', categoriaId: 5 }), // "Outros" de receita
    );
    expect(resultado.importadas).toBe(2);
  });

  it('transferência para a própria conta ou para conta inexistente é 400', async () => {
    const { service } = montar();

    await expect(
      service.confirmar(USUARIO.id, { transacoes: [linha({ contaDestinoId: 1 })], contaId: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.confirmar(USUARIO.id, { transacoes: [linha({ contaDestinoId: 99 })], contaId: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('uma linha de transferência já importada nessa conta é ignorada (sem duplicar)', async () => {
    const { service, transacoes } = montar(['f']);

    const resultado = await service.confirmar(USUARIO.id, {
      transacoes: [linha({ idExterno: 'f', contaDestinoId: 2 })],
      contaId: 1,
    });

    expect(transacoes.criarPar).not.toHaveBeenCalled();
    expect(resultado).toEqual({ importadas: 0, ignoradasPorDuplicidade: 1 });
  });
});

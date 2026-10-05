import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AppError } from './app-error';
import { higienizarDescricao, lerOfx } from './ofx-parser';

const FIXTURES = path.resolve(__dirname, '../../tests/fixtures');

interface ResumoArquivo {
  arquivo: string;
  tipo: 'EXTRATO' | 'FATURA';
  transacoes: number;
  totalReceitas: number;
  totalDespesas: number;
}

const resumo: ResumoArquivo[] = JSON.parse(
  readFileSync(path.join(FIXTURES, 'resumo.json'), 'utf-8'),
);

function lerFixture(item: ResumoArquivo) {
  const pasta = item.tipo === 'EXTRATO' ? 'extratos' : 'faturas';
  return lerOfx(readFileSync(path.join(FIXTURES, pasta, item.arquivo)));
}

const arredondar = (n: number): number => Math.round(n * 100) / 100;

function ofxSgml(transacoes: string, cabecalho = 'CHARSET:NONE'): Buffer {
  return Buffer.from(
    `OFXHEADER:100\nDATA:OFXSGML\n${cabecalho}\n\n<OFX>\n<BANKMSGSRSV1>\n<STMTTRNRS>\n<STMTRS>\n<BANKTRANLIST>\n${transacoes}</BANKTRANLIST>\n</STMTRS>\n</STMTTRNRS>\n</BANKMSGSRSV1>\n</OFX>\n`,
    cabecalho.includes('1252') ? 'latin1' : 'utf-8',
  );
}

function capturarErro(fn: () => unknown): AppError {
  try {
    fn();
  } catch (erro) {
    return erro as AppError;
  }
  throw new Error('Era esperado um erro');
}

describe('lerOfx com os fixtures fictícios', () => {
  it.each(resumo)('$arquivo: quantidade e totais batem com o resumo.json', (item) => {
    const { origem, transacoes } = lerFixture(item);

    expect(origem).toBe(item.tipo === 'EXTRATO' ? 'CONTA' : 'CARTAO');
    expect(transacoes).toHaveLength(item.transacoes);
    const receitas = transacoes
      .filter((t) => t.tipo === 'RECEITA')
      .reduce((s, t) => s + t.valor, 0);
    const despesas = transacoes
      .filter((t) => t.tipo === 'DESPESA')
      .reduce((s, t) => s + t.valor, 0);
    expect(arredondar(receitas)).toBe(item.totalReceitas);
    expect(arredondar(despesas)).toBe(item.totalDespesas);
  });

  it('não devolve FITIDs repetidos dentro de um arquivo e usa datas ISO', () => {
    for (const item of resumo) {
      const { transacoes } = lerFixture(item);
      expect(new Set(transacoes.map((t) => t.idExterno)).size).toBe(transacoes.length);
      for (const t of transacoes) expect(t.data).toMatch(/^2026-\d{2}-\d{2}$/);
    }
  });

  it('o extrato completo contém exatamente os FITIDs dos mensais', () => {
    const mensais = resumo.filter(
      (r) => r.tipo === 'EXTRATO' && !r.arquivo.includes('01JAN2026_25SET2026'),
    );
    const ids = new Set(mensais.flatMap((r) => lerFixture(r).transacoes.map((t) => t.idExterno)));
    const completo = resumo.find((r) => r.arquivo === 'NU_123456789_01JAN2026_25SET2026.ofx')!;
    expect(new Set(lerFixture(completo).transacoes.map((t) => t.idExterno))).toEqual(ids);
  });

  it('a fatura (windows-1252) e o extrato (UTF-8) não têm caracteres corrompidos', () => {
    for (const item of resumo) {
      for (const t of lerFixture(item).transacoes) expect(t.descricao).not.toContain('�');
    }
    const extrato = lerFixture(resumo.find((r) => r.tipo === 'EXTRATO')!);
    expect(extrato.transacoes.some((t) => t.descricao.includes('Transferência'))).toBe(true);
  });

  it('remove CPF, banco, agência e conta das descrições', () => {
    for (const item of resumo) {
      for (const t of lerFixture(item).transacoes) {
        expect(t.descricao).not.toMatch(/Agência|Conta:|•••|\d{3}\.\d{3}\.\d{3}-\d{2}/);
        expect(t.descricao.length).toBeLessThanOrEqual(150);
      }
    }
  });
});

describe('lerOfx com casos sintéticos', () => {
  const bloco = (extra: string) => `<STMTTRN>\n${extra}\n</STMTTRN>\n`;

  it('lê SGML puro, sem tags de fechamento', () => {
    const buffer = ofxSgml(
      '<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260315120000\n<TRNAMT>-25.50\n<FITID>abc-1\n<MEMO>Padaria Central\n</STMTTRN>\n' +
        '<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20260316\n<TRNAMT>100.00\n<FITID>abc-2\n<MEMO>Salário\n</STMTTRN>\n',
    );

    expect(lerOfx(buffer).transacoes).toEqual([
      {
        idExterno: 'abc-1',
        data: '2026-03-15',
        descricao: 'Padaria Central',
        valor: 25.5,
        tipo: 'DESPESA',
      },
      { idExterno: 'abc-2', data: '2026-03-16', descricao: 'Salário', valor: 100, tipo: 'RECEITA' },
    ]);
  });

  it('decodifica acentos em windows-1252 quando o cabeçalho pede CHARSET:1252', () => {
    const buffer = ofxSgml(
      bloco('<DTPOSTED>20260101\n<TRNAMT>-10\n<FITID>x1\n<MEMO>Ação Café'),
      'ENCODING:USASCII\nCHARSET:1252',
    );

    expect(lerOfx(buffer).transacoes[0].descricao).toBe('Ação Café');
  });

  it('ignora hora e fuso da data (não volta para o dia anterior)', () => {
    const buffer = ofxSgml(
      bloco('<DTPOSTED>20260908000000[-3:BRT]\n<TRNAMT>-1\n<FITID>x1\n<MEMO>A'),
    );

    expect(lerOfx(buffer).transacoes[0].data).toBe('2026-09-08');
  });

  it('decide o tipo pelo sinal, não pelo TRNTYPE, e aceita vírgula decimal', () => {
    const buffer = ofxSgml(
      bloco('<TRNTYPE>CREDIT\n<DTPOSTED>20260101\n<TRNAMT>-1.234,56\n<FITID>x1\n<MEMO>A') +
        bloco('<TRNTYPE>DEBIT\n<DTPOSTED>20260101\n<TRNAMT>+7,5\n<FITID>x2\n<MEMO>B'),
    );

    const [a, b] = lerOfx(buffer).transacoes;
    expect(a).toMatchObject({ tipo: 'DESPESA', valor: 1234.56 });
    expect(b).toMatchObject({ tipo: 'RECEITA', valor: 7.5 });
  });

  it('usa NAME quando não há MEMO e decodifica entidades XML', () => {
    const buffer = ofxSgml(
      bloco('<DTPOSTED>20260101\n<TRNAMT>-1\n<FITID>x1\n<NAME>Loja &amp; Cia'),
    );

    expect(lerOfx(buffer).transacoes[0].descricao).toBe('Loja & Cia');
  });

  it('trunca descrições em 150 caracteres', () => {
    const buffer = ofxSgml(
      bloco(`<DTPOSTED>20260101\n<TRNAMT>-1\n<FITID>x1\n<MEMO>${'A'.repeat(300)}`),
    );

    expect(lerOfx(buffer).transacoes[0].descricao).toHaveLength(150);
  });

  it('rejeita arquivo que não é OFX (400)', () => {
    const erro = capturarErro(() => lerOfx(Buffer.from('a;b;c\n1;2;3')));

    expect(erro.statusCode).toBe(400);
  });

  it('rejeita arquivo sem transações (422)', () => {
    const erro = capturarErro(() => lerOfx(ofxSgml('')));

    expect(erro.statusCode).toBe(422);
    expect(erro.message).toMatch(/nenhuma transação/);
  });

  it.each([
    ['data inválida', '<DTPOSTED>20261340\n<TRNAMT>-1\n<FITID>x1\n<MEMO>A', /data inválida/],
    ['valor inválido', '<DTPOSTED>20260101\n<TRNAMT>abc\n<FITID>x1\n<MEMO>A', /valor inválido/],
    ['FITID ausente', '<DTPOSTED>20260101\n<TRNAMT>-1\n<MEMO>A', /FITID/],
  ])('rejeita transação com %s (422)', (_nome, conteudo, mensagem) => {
    const erro = capturarErro(() => lerOfx(ofxSgml(bloco(conteudo))));

    expect(erro.statusCode).toBe(422);
    expect(erro.message).toMatch(mensagem);
  });

  it('ignora linha de valor zero (não é receita nem despesa) sem recusar o arquivo inteiro', () => {
    const buffer = ofxSgml(
      bloco('<DTPOSTED>20260101\n<TRNAMT>-50\n<FITID>x1\n<MEMO>Normal') +
        bloco('<DTPOSTED>20260102\n<TRNAMT>0.00\n<FITID>x2\n<MEMO>Zero'),
    );

    const resultado = lerOfx(buffer);

    expect(resultado.transacoes).toHaveLength(1);
    expect(resultado.transacoes[0].idExterno).toBe('x1');
    expect(resultado.linhasIgnoradas).toBe(1);
  });

  it('arquivo só com linhas de valor zero: "nenhuma transação" (422), não "valor inválido"', () => {
    const erro = capturarErro(() =>
      lerOfx(ofxSgml(bloco('<DTPOSTED>20260101\n<TRNAMT>0.00\n<FITID>x1\n<MEMO>Zero'))),
    );

    expect(erro.statusCode).toBe(422);
    expect(erro.message).toMatch(/nenhuma transação/);
  });
});

describe('higienizarDescricao', () => {
  it('mantém só o nome no Pix com CPF mascarado, banco, agência e conta', () => {
    expect(
      higienizarDescricao(
        'Transferência enviada pelo Pix - CARLOS ANDRADE LIMA - •••.651.204-•• - BCO BRADESCO S.A. (0237) Agência: 2210 Conta: 18845-7',
      ),
    ).toBe('Transferência enviada pelo Pix - CARLOS ANDRADE LIMA');
  });

  it('remove CNPJ e CPF completo', () => {
    expect(
      higienizarDescricao(
        'Transferência recebida pelo Pix - ACME LTDA - 11.222.333/0001-81 - ITAÚ (0341) Agência: 1234 Conta: 56789-0',
      ),
    ).toBe('Transferência recebida pelo Pix - ACME LTDA');
    expect(
      higienizarDescricao('Pix - FULANO - 123.456.789-09 - BANCO X (0001) Agência: 1 Conta: 2'),
    ).toBe('Pix - FULANO');
  });

  it('remove banco e agência mesmo sem documento', () => {
    expect(
      higienizarDescricao('Pix recebido - FULANO - BANCO X S.A. (0001) Agência: 1 Conta: 2-3'),
    ).toBe('Pix recebido - FULANO');
  });

  it('não altera descrições comuns', () => {
    expect(higienizarDescricao('Compra no débito - Hortifruti Verde Vida')).toBe(
      'Compra no débito - Hortifruti Verde Vida',
    );
  });
});

/**
 * Gera arquivos OFX 100% fictícios no formato do Nubank (extrato NuConta e fatura do cartão)
 * para simular um usuário comum de janeiro a setembro de 2026.
 *
 * Determinístico (PRNG com semente fixa): rodar de novo gera exatamente os mesmos arquivos.
 *   npm run fixtures:ofx
 *
 * Saída em tests/fixtures/: extratos/, faturas/, gabarito.json e resumo.json.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SAIDA = join(__dirname, '..', 'tests', 'fixtures');
const ANO = 2026;
const SALDO_INICIAL = 5000;
const TITULAR = 'USUARIO TESTE';
const DTSERVER = '20260926211149[0:GMT]';
const ACCTID_CONTA = '12345678-9';
const ACCTID_CARTAO = '0f3c9a52-7d14-4b8e-a6c1-5e2d8b9f4a10';

// ---------- utilidades ----------

function mulberry32(semente: number): () => number {
  let a = semente;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260926);
const entre = (min: number, max: number): number => min + rnd() * (max - min);
const inteiro = (min: number, max: number): number => Math.floor(entre(min, max + 1));
const dinheiro = (min: number, max: number): number => Math.round(entre(min, max) * 100) / 100;
const escolher = <T>(lista: readonly T[]): T => lista[inteiro(0, lista.length - 1)];
const r2 = (n: number): number => Math.round(n * 100) / 100;
const soma = (valores: number[]): number => r2(valores.reduce((s, v) => s + v, 0));

function uuid(): string {
  const hex = Array.from({ length: 32 }, () => inteiro(0, 15).toString(16)).join('');
  return `6a${hex.slice(0, 6)}-${hex.slice(6, 10)}-4${hex.slice(11, 14)}-${hex.slice(14, 18)}-${hex.slice(18, 30)}`;
}

/** 'AAAAMMDD' a partir de partes; aceita estouro de dia/mês (Date normaliza). */
function ymd(ano: number, mes: number, dia: number): string {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function dias(inicio: string, fim: string): string[] {
  const lista: string[] = [];
  let atual = ymd(+inicio.slice(0, 4), +inicio.slice(4, 6), +inicio.slice(6, 8));
  while (atual <= fim) {
    lista.push(atual);
    atual = ymd(+atual.slice(0, 4), +atual.slice(4, 6), +atual.slice(6, 8) + 1);
  }
  return lista;
}

const brt = (data: string): string => `${data}000000[-3:BRT]`;
const valorOfx = (n: number): string => n.toFixed(2);

// ---------- modelo ----------

interface Lancamento {
  data: string; // AAAAMMDD
  valor: number; // negativo = despesa
  memo: string;
  fitid: string;
  categoria: string; // gabarito: categoria ideal
  ignorada: boolean; // gabarito: pagamento de fatura / transferência entre contas próprias
}

const lanc = (
  data: string,
  valor: number,
  memo: string,
  categoria: string,
  ignorada = false,
  fitid = uuid(),
): Lancamento => ({ data, valor: r2(valor), memo, fitid, categoria, ignorada });

// ---------- faturas do cartão ----------

interface Fatura {
  mes: number; // mês de fechamento (dia 28)
  inicio: string;
  fim: string;
  vencimento: string;
  lancamentos: Lancamento[]; // já com o "Pagamento recebido" da fatura anterior
  total: number; // valor a pagar desta fatura (despesas - estornos)
  arquivo: string;
}

const MERCADOS = [
  'Mercado Bom Preco',
  'Supermercado Estrela',
  'Hortifruti Verde Vida',
  'Atacadao Casa Nova',
];
const RESTAURANTES = [
  'Ifd*Restaurante Sabor',
  'Ifd*Pizzaria Napoli',
  'Ifd*Nara Obento',
  'Kee*Restaurante New',
  'Keetabr*Churrascaria e',
  'Yakitori',
  'Toshe Pasteis',
  'Tom Buffet',
];
const LANCHES = [
  'Cafe e Letras',
  'Bh Lanches',
  'Padaria Pao Quente',
  'Ebanossorvete',
  'Gran Sapore',
];
const CORRIDAS = ['Dl*Uberrides', 'Uber *Trip', '99*Pop'];
const POSTOS = ['Posto Ipiranga Sul', 'Auto Posto Central'];
const ESTACIONAMENTOS = ['Entry Park Estacioname', 'Stoppark Brigadeiro'];
const FARMACIAS = ['Drogaria Sao Paulo', 'Drogaria Pacheco', 'Farmacia Bem Estar'];
const COMPRAS_ONLINE = [
  'Amazon Marketplace',
  'Mercadolivre*Mercadol',
  'Enjoei *Vendedor',
  'Shopee*Loja',
];

function gerarFatura(mes: number, pagamentoAnterior: { valor: number; fitid: string }): Fatura {
  const inicio = mes === 1 ? ymd(ANO, 1, 1) : ymd(ANO, mes - 1, 29);
  const fim = ymd(ANO, mes, 28);
  const ultimaCompra = mes === 9 ? ymd(ANO, 9, 26) : fim;
  const periodo = dias(inicio, ultimaCompra);
  const noDia = (dom: number): string => {
    const achado = periodo.find((d) => Number(d.slice(6, 8)) === dom);
    if (!achado) throw new Error(`Dia ${dom} fora do período ${inicio}-${ultimaCompra}`);
    return achado;
  };
  const lancs: Lancamento[] = [];
  const compra = (data: string, valor: number, memo: string, categoria: string): void => {
    lancs.push(lanc(data, -valor, memo, categoria));
  };
  const varias = (
    qtd: number,
    pool: readonly string[],
    min: number,
    max: number,
    categoria: string,
  ): void => {
    for (let i = 0; i < qtd; i++)
      compra(escolher(periodo), dinheiro(min, max), escolher(pool), categoria);
  };

  // Pagamento da fatura anterior (mesmo FITID do "Pagamento de fatura" do extrato)
  lancs.push(
    lanc(
      noDia(8),
      pagamentoAnterior.valor,
      'Pagamento recebido',
      'Outros',
      true,
      pagamentoAnterior.fitid,
    ),
  );

  // Assinaturas e recorrentes
  compra(noDia(25), 44.9, 'Netflix Entretenimento', 'Lazer');
  compra(noDia(14), 31.9, 'Ebn *Spotify', 'Lazer');
  compra(noDia(26), 113.85, 'Anthropic* Claude Sub', 'Outros');
  compra(noDia(10), 119.9, 'Smart Fit Academia', 'Saúde');
  compra(noDia(7), 130.99, 'Conta Vivo', 'Moradia');

  // Variáveis
  varias(inteiro(4, 6), MERCADOS, 55, 320, 'Alimentação');
  varias(inteiro(5, 9), RESTAURANTES, 28, 115, 'Alimentação');
  varias(inteiro(3, 5), LANCHES, 8, 32, 'Alimentação');
  varias(inteiro(4, 7), CORRIDAS, 11, 46, 'Transporte');
  varias(2, POSTOS, 140, 285, 'Transporte');
  varias(inteiro(1, 3), ESTACIONAMENTOS, 15, 70, 'Transporte');
  varias(inteiro(1, 2), FARMACIAS, 24, 190, 'Saúde');
  varias(inteiro(1, 2), COMPRAS_ONLINE, 27, 260, 'Outros');
  if (mes % 2 === 0) compra(escolher(periodo), dinheiro(48, 76), 'Cinemark Ingressos', 'Lazer');
  if (mes % 3 === 0)
    compra(escolher(periodo), dinheiro(27.9, 89.9), 'Udemy*Curso Online', 'Educação');
  if (mes === 4 || mes === 8)
    compra(escolher(periodo), dinheiro(210, 340), 'Clinica Odonto Sorriso', 'Saúde');
  if (mes === 5) compra(escolher(periodo), dinheiro(95, 430), 'Leroy Merlin Casa', 'Moradia');

  // Parcelados (uma parcela por fatura, como no Nubank)
  if (mes >= 1 && mes <= 4)
    compra(noDia(3), 38.37, `Amazon Marketplace - Parcela ${mes + 2}/6`, 'Outros');
  if (mes >= 2 && mes <= 9)
    compra(noDia(12), 289.9, `Kabum Informatica - Parcela ${mes - 1}/10`, 'Outros');
  if (mes >= 4 && mes <= 8)
    compra(noDia(4), 119.9, `Dargham Importacao - Parcela ${mes - 3}/5`, 'Outros');

  // Casos especiais
  if (mes === 6) {
    compra(noDia(11), 27.9, 'Mercadolivre*Mercadol', 'Outros');
    lancs.push(lanc(noDia(20), 27.9, 'Estorno - Mercadolivre*Mercadol', 'Outros'));
  }
  if (mes === 7) compra(noDia(9), 1850, 'Latam*Passagem Aerea', 'Lazer');

  const total = soma(lancs.filter((l) => l.memo !== 'Pagamento recebido').map((l) => -l.valor));
  lancs.sort((a, b) => b.data.localeCompare(a.data));
  const vencimento = ymd(ANO, mes + 1, 5);
  return {
    mes,
    inicio,
    fim,
    vencimento,
    lancamentos: lancs,
    total,
    arquivo: `Nubank_${vencimento.slice(0, 4)}-${vencimento.slice(4, 6)}-${vencimento.slice(6, 8)}.ofx`,
  };
}

// ---------- extrato da conta ----------

const PESSOAS = [
  {
    nome: 'MARIANA COSTA PEREIRA',
    cpf: '148.552',
    banco: 'BCO SAFRA S.A. (0422)',
    ag: '71',
    conta: '773867-1',
  },
  {
    nome: 'RAFAEL TEIXEIRA ALVES',
    cpf: '236.910',
    banco: 'ITAÚ UNIBANCO S.A. (0341)',
    ag: '4521',
    conta: '30281-6',
  },
  {
    nome: 'BEATRIZ NOGUEIRA LOPES',
    cpf: '319.427',
    banco: 'BCO BRADESCO S.A. (0237)',
    ag: '1089',
    conta: '55012-3',
  },
  {
    nome: 'THIAGO MARTINS RIBEIRO',
    cpf: '402.773',
    banco: 'NU PAGAMENTOS - IP (0260)',
    ag: '1',
    conta: '9134426-5',
  },
  {
    nome: 'CAMILA FERREIRA DUARTE',
    cpf: '577.038',
    banco: 'BANCO INTER (0077)',
    ag: '1',
    conta: '4409172-0',
  },
];
const LOCADOR = {
  nome: 'CARLOS ANDRADE LIMA',
  cpf: '651.204',
  banco: 'BCO BRADESCO S.A. (0237)',
  ag: '2210',
  conta: '18845-7',
};
const EMPREGADOR =
  'ACME TECNOLOGIA LTDA - 11.222.333/0001-81 - ITAÚ UNIBANCO S.A. (0341) Agência: 1234 Conta: 56789-0';
const CONTA_PROPRIA = 'Banco XP S.A. (0348) Agência: 1 Conta: 123456-7';
const DEBITOS = [
  'Supermercado Bom Preco',
  'Padaria Pao Quente',
  'Hortifruti Verde Vida',
  'Farmacia Bem Estar',
  'Feira Livre do Bairro',
];

const pixEnviado = (p: {
  nome: string;
  cpf: string;
  banco: string;
  ag: string;
  conta: string;
}): string =>
  `Transferência enviada pelo Pix - ${p.nome} - •••.${p.cpf}-•• - ${p.banco} Agência: ${p.ag} Conta: ${p.conta}`;
const pixRecebido = (p: {
  nome: string;
  cpf: string;
  banco: string;
  ag: string;
  conta: string;
}): string =>
  `Transferência recebida pelo Pix - ${p.nome} - •••.${p.cpf}-•• - ${p.banco} Agência: ${p.ag} Conta: ${p.conta}`;

const CONSUMO_ENERGIA = [230, 250, 220, 170, 140, 130, 125, 135, 150];

function gerarExtrato(
  faturas: (Fatura & { fitid: string })[],
  pagamentoDezembro: { valor: number; fitid: string },
): Lancamento[] {
  const lancs: Lancamento[] = [];
  for (let mes = 1; mes <= 9; mes++) {
    const d = (dia: number): string => ymd(ANO, mes, dia);
    const pagamento =
      mes === 1
        ? pagamentoDezembro
        : { valor: faturas[mes - 2].total, fitid: faturas[mes - 2].fitid };
    // (fitid do pagamento = o mesmo usado na linha "Pagamento recebido" da fatura do mês)

    lancs.push(lanc(d(5), 10000, `Transferência recebida pelo Pix - ${EMPREGADOR}`, 'Salário'));
    lancs.push(lanc(d(5), -2800, pixEnviado(LOCADOR), 'Moradia'));
    lancs.push(
      lanc(
        d(6),
        -1500,
        `Transferência enviada pelo Pix - ${TITULAR} - •••.111.222-•• - ${CONTA_PROPRIA}`,
        'Investimentos',
        true,
      ),
    );
    lancs.push(
      lanc(d(8), -pagamento.valor, 'Pagamento de fatura', 'Outros', true, pagamento.fitid),
    );
    lancs.push(
      lanc(d(8), -489.9, 'Pagamento de boleto efetuado - UNIMED SEGUROS SAUDE S.A.', 'Saúde'),
    );
    lancs.push(
      lanc(
        d(10),
        -dinheiro(640, 665),
        'Pagamento de boleto efetuado - CONDOMINIO EDIFICIO ALVORADA',
        'Moradia',
      ),
    );
    lancs.push(
      lanc(
        d(12),
        -dinheiro(65, 110),
        'Pagamento de boleto efetuado - SABESP CIA SANEAMENTO BASICO',
        'Moradia',
      ),
    );
    lancs.push(
      lanc(
        d(15),
        -r2(CONSUMO_ENERGIA[mes - 1] * entre(0.88, 1.12)),
        'Pagamento de boleto efetuado - ENEL DISTRIBUICAO SAO PAULO',
        'Moradia',
      ),
    );
    lancs.push(
      lanc(
        d(20),
        -119.9,
        'Pagamento de boleto efetuado - TELEFONICA BRASIL S.A. VIVO FIBRA',
        'Moradia',
      ),
    );
    if (mes % 2 === 0)
      lancs.push(
        lanc(d(18), -135, 'Pagamento de boleto efetuado - ULTRAGAZ COMERCIAL LTDA', 'Moradia'),
      );

    // Débito e Pix do dia a dia
    for (let i = inteiro(3, 6); i > 0; i--) {
      const dia = d(inteiro(1, 27));
      const valor = -dinheiro(9, 190);
      const loja = escolher(DEBITOS);
      lancs.push(
        lanc(
          dia,
          valor,
          `Compra no débito - ${loja}`,
          loja.startsWith('Farmacia') ? 'Saúde' : 'Alimentação',
        ),
      );
    }
    for (let i = inteiro(2, 4); i > 0; i--) {
      const p = escolher(PESSOAS);
      const memo =
        rnd() < 0.5
          ? pixEnviado(p)
          : `Transferência enviada pelo Pix - ${p.nome} (Transferência enviada)`;
      lancs.push(lanc(d(inteiro(1, 27)), -dinheiro(25, 180), memo, 'Outros'));
    }
    for (let i = inteiro(0, 2); i > 0; i--) {
      lancs.push(
        lanc(d(inteiro(1, 27)), dinheiro(30, 150), pixRecebido(escolher(PESSOAS)), 'Outros'),
      );
    }

    // Freelances e movimentos pontuais
    if (mes === 3)
      lancs.push(
        lanc(
          d(14),
          1800,
          'Transferência recebida pelo Pix - ESTUDIO CRIATIVO ME - 55.666.777/0001-88 - BANCO INTER (0077) Agência: 1 Conta: 8873210-4',
          'Freelance',
        ),
      );
    if (mes === 6)
      lancs.push(
        lanc(
          d(21),
          2500,
          'Transferência recebida pelo Pix - ESTUDIO CRIATIVO ME - 55.666.777/0001-88 - BANCO INTER (0077) Agência: 1 Conta: 8873210-4',
          'Freelance',
        ),
      );
    if (mes === 8) lancs.push(lanc(d(11), 1200, pixRecebido(PESSOAS[2]), 'Freelance'));
    if (mes === 7)
      lancs.push(
        lanc(
          d(2),
          3000,
          `Transferência recebida pelo Pix - ${TITULAR} - •••.111.222-•• - ${CONTA_PROPRIA}`,
          'Investimentos',
          true,
        ),
      );
  }
  return lancs
    .filter((l) => l.data <= ymd(ANO, 9, 25))
    .sort((a, b) => a.data.localeCompare(b.data));
}

// ---------- renderização OFX ----------

const SIGNON = [
  '<SIGNONMSGSRSV1>',
  '<SONRS>',
  '<STATUS>',
  '<CODE>0</CODE>',
  '<SEVERITY>INFO</SEVERITY>',
  '</STATUS>',
  `<DTSERVER>${DTSERVER}</DTSERVER>`,
  '<LANGUAGE>POR</LANGUAGE>',
  '<FI>',
  '<ORG>NU PAGAMENTOS S.A.</ORG>',
  '<FID>260</FID>',
  '</FI>',
  '</SONRS>',
  '</SIGNONMSGSRSV1>',
];

const STATUS = ['<STATUS>', '<CODE>0</CODE>', '<SEVERITY>INFO</SEVERITY>', '</STATUS>'];

function transacoes(lista: Lancamento[]): string[] {
  return lista.flatMap((l) => [
    '<STMTTRN>',
    `<TRNTYPE>${l.valor < 0 ? 'DEBIT' : 'CREDIT'}</TRNTYPE>`,
    `<DTPOSTED>${brt(l.data)}</DTPOSTED>`,
    `<TRNAMT>${valorOfx(l.valor)}</TRNAMT>`,
    `<FITID>${l.fitid}</FITID>`,
    `<MEMO>${l.memo}</MEMO>`,
    '</STMTTRN>',
  ]);
}

function ofxExtrato(lista: Lancamento[], inicio: string, fim: string, saldoFinal: number): string {
  const rendimento = r2(Math.max(saldoFinal, 0) * 0.0092);
  return [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'SECURITY:NONE',
    'ENCODING:UTF-8',
    'CHARSET:NONE',
    'COMPRESSION:NONE',
    'OLDFILEUID:NONE',
    'NEWFILEUID:NONE',
    '<OFX>',
    ...SIGNON,
    '<BANKMSGSRSV1>',
    '<STMTTRNRS>',
    '<TRNUID>1</TRNUID>',
    ...STATUS,
    '<STMTRS>',
    '<CURDEF>BRL</CURDEF>',
    '<BANKACCTFROM>',
    '<BANKID>0260</BANKID>',
    '<BRANCHID>1</BRANCHID>',
    `<ACCTID>${ACCTID_CONTA}</ACCTID>`,
    '<ACCTTYPE>CHECKING</ACCTTYPE>',
    '</BANKACCTFROM>',
    '<BANKTRANLIST>',
    `<DTSTART>${brt(inicio)}</DTSTART>`,
    `<DTEND>${brt(fim)}</DTEND>`,
    ...transacoes(lista),
    '</BANKTRANLIST>',
    '<LEDGERBAL>',
    `<BALAMT>${valorOfx(saldoFinal)}</BALAMT>`,
    `<DTASOF>${brt(fim)}</DTASOF>`,
    '</LEDGERBAL>',
    '<BALLIST>',
    '<BAL>',
    '<NAME>RENDIMENTO LIQUIDO</NAME>',
    '<DESC>RENDIMENTO LIQUIDO NO PERIODO</DESC>',
    '<BALTYPE>NUMBER</BALTYPE>',
    `<VALUE>${valorOfx(rendimento)}</VALUE>`,
    '</BAL>',
    '</BALLIST>',
    '</STMTRS>',
    '</STMTTRNRS>',
    '</BANKMSGSRSV1>',
    '</OFX>',
  ].join('\n');
}

function ofxFatura(f: Fatura): string {
  return [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'SECURITY:NONE',
    'ENCODING:USASCII',
    'CHARSET:1252',
    'COMPRESSION:NONE',
    'OLDFILEUID:NONE',
    'NEWFILEUID:NONE',
    '<OFX>',
    ...SIGNON,
    '<CREDITCARDMSGSRSV1>',
    '<CCSTMTTRNRS>',
    '<TRNUID>1001</TRNUID>',
    ...STATUS,
    '<CCSTMTRS>',
    '<CURDEF>BRL</CURDEF>',
    '<CCACCTFROM>',
    `<ACCTID>${ACCTID_CARTAO}</ACCTID>`,
    '</CCACCTFROM>',
    '<BANKTRANLIST>',
    `<DTSTART>${brt(f.inicio)}</DTSTART>`,
    `<DTEND>${brt(f.fim)}</DTEND>`,
    ...transacoes(f.lancamentos),
    '</BANKTRANLIST>',
    '<LEDGERBAL>',
    `<BALAMT>${valorOfx(-f.total)}</BALAMT>`,
    `<DTASOF>${brt(f.fim)}</DTASOF>`,
    '</LEDGERBAL>',
    '</CCSTMTRS>',
    '</CCSTMTTRNRS>',
    '</CREDITCARDMSGSRSV1>',
    '</OFX>',
  ].join('\n');
}

// ---------- execução ----------

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const nomeExtrato = (inicio: string, fim: string): string =>
  `NU_${ACCTID_CONTA.replace('-', '')}_${inicio.slice(6)}${MESES[+inicio.slice(4, 6) - 1]}${inicio.slice(0, 4)}_${fim.slice(6)}${MESES[+fim.slice(4, 6) - 1]}${fim.slice(0, 4)}.ofx`;

// 1) Faturas (cada uma precisa do pagamento da anterior, e o extrato usa os mesmos FITIDs)
const pagamentoDezembro = { valor: 3180.44, fitid: uuid() };
const faturas: (Fatura & { fitid: string })[] = [];
let anterior = pagamentoDezembro;
for (let mes = 1; mes <= 9; mes++) {
  const f = gerarFatura(mes, anterior);
  // FITID do pagamento DESTA fatura (feito no dia 8 do mês seguinte), reaproveitado no extrato e na fatura seguinte
  const fitid = uuid();
  faturas.push({ ...f, fitid });
  anterior = { valor: f.total, fitid };
}

// 2) Extrato de toda a série
const extrato = gerarExtrato(faturas, pagamentoDezembro);

// 3) Saldo corrente
const saldoAte = new Map<string, number>();
{
  let saldo = SALDO_INICIAL;
  for (const l of extrato) {
    saldo = r2(saldo + l.valor);
    saldoAte.set(l.fitid, saldo);
  }
}
const saldoNoFim = (fim: string): number => {
  const ate = extrato.filter((l) => l.data <= fim);
  return ate.length ? (saldoAte.get(ate[ate.length - 1].fitid) as number) : SALDO_INICIAL;
};

for (const pasta of ['extratos', 'faturas']) {
  rmSync(join(SAIDA, pasta), { recursive: true, force: true });
  mkdirSync(join(SAIDA, pasta), { recursive: true });
}

interface ResumoArquivo {
  arquivo: string;
  tipo: 'EXTRATO' | 'FATURA';
  periodo: string;
  transacoes: number;
  totalReceitas: number;
  totalDespesas: number;
  ignoradasEsperadas: number;
}
const resumo: ResumoArquivo[] = [];
const resumir = (
  arquivo: string,
  tipo: ResumoArquivo['tipo'],
  periodo: string,
  lista: Lancamento[],
): void => {
  resumo.push({
    arquivo,
    tipo,
    periodo,
    transacoes: lista.length,
    totalReceitas: soma(lista.filter((l) => l.valor > 0).map((l) => l.valor)),
    totalDespesas: soma(lista.filter((l) => l.valor < 0).map((l) => -l.valor)),
    ignoradasEsperadas: lista.filter((l) => l.ignorada).length,
  });
};

// Extratos mensais + um arquivo com a série inteira (para testar sobreposição/duplicidade)
for (let mes = 1; mes <= 9; mes++) {
  const inicio = ymd(ANO, mes, 1);
  const fim = mes === 9 ? ymd(ANO, 9, 25) : ymd(ANO, mes + 1, 0);
  const lista = extrato.filter((l) => l.data >= inicio && l.data <= fim);
  const arquivo = nomeExtrato(inicio, fim);
  writeFileSync(
    join(SAIDA, 'extratos', arquivo),
    ofxExtrato(lista, inicio, fim, saldoNoFim(fim)),
    'utf8',
  );
  resumir(arquivo, 'EXTRATO', `${inicio}-${fim}`, lista);
}
{
  const inicio = ymd(ANO, 1, 1);
  const fim = ymd(ANO, 9, 25);
  const arquivo = nomeExtrato(inicio, fim);
  writeFileSync(
    join(SAIDA, 'extratos', arquivo),
    ofxExtrato(extrato, inicio, fim, saldoNoFim(fim)),
    'utf8',
  );
  resumir(arquivo, 'EXTRATO', `${inicio}-${fim}`, extrato);
}

for (const f of faturas) {
  const conteudo = ofxFatura(f);
  if (/[^\n -~]/.test(conteudo)) throw new Error(`Fatura ${f.arquivo} contém caracteres não ASCII`);
  writeFileSync(join(SAIDA, 'faturas', f.arquivo), conteudo, 'latin1');
  resumir(f.arquivo, 'FATURA', `${f.inicio}-${f.fim}`, f.lancamentos);
}

// Gabarito por FITID (categoria ideal e se deve vir desmarcada). O pagamento de fatura aparece
// nos dois tipos de arquivo com o mesmo FITID, então basta uma entrada.
const gabarito: Record<string, { categoria: string; ignorada: boolean; memo: string }> = {};
for (const l of [...extrato, ...faturas.flatMap((f) => f.lancamentos)]) {
  gabarito[l.fitid] = { categoria: l.categoria, ignorada: l.ignorada, memo: l.memo };
}
writeFileSync(join(SAIDA, 'gabarito.json'), JSON.stringify(gabarito, null, 2) + '\n', 'utf8');
writeFileSync(join(SAIDA, 'resumo.json'), JSON.stringify(resumo, null, 2) + '\n', 'utf8');

// ---------- verificações ----------

const menorSaldo = Math.min(SALDO_INICIAL, ...extrato.map((l) => saldoAte.get(l.fitid) as number));
const fitids = [...extrato, ...faturas.flatMap((f) => f.lancamentos)].map((l) => l.fitid);
const unicosExtrato = new Set(extrato.map((l) => l.fitid)).size === extrato.length;
const pagamentosCasam = faturas.slice(1).every((f) => {
  const noExtrato = extrato.find(
    (l) => l.fitid === f.lancamentos.find((x) => x.memo === 'Pagamento recebido')?.fitid,
  );
  return noExtrato !== undefined && noExtrato.valor === -faturas[f.mes - 2].total;
});

console.log(`Arquivos em ${SAIDA}`);
console.table(resumo.map((r) => ({ ...r, arquivo: r.arquivo.slice(0, 40) })));
console.log(
  `FITIDs distintos: ${new Set(fitids).size} (linhas: ${fitids.length}; o pagamento de fatura repete de propósito)`,
);
console.log(`FITIDs únicos no extrato: ${unicosExtrato}`);
console.log(`Pagamentos do extrato batem com o total da fatura anterior: ${pagamentosCasam}`);
console.log(`Menor saldo da conta no período: ${menorSaldo.toFixed(2)}`);
if (menorSaldo < 0) console.warn('ATENÇÃO: saldo negativo em algum ponto; ajuste os valores.');

/**
 * Carga de dados fictícios para o teste com a comunidade: cria um usuário para cada participante
 * (Maurício e Andressa), com extratos e faturas OFX gerados a partir de um perfil de gastos e metas
 * por categoria diferentes para cada um. Nenhum dado real entra no banco (ver TCLE e LGPD).
 *
 *   CARGA_SENHA=<senha> npm run carga:participantes
 *   CARGA_SENHA=<senha> npm run carga:participantes -- --pessoa mauricio   # só um (ou andressa)
 *   CARGA_SENHA=<senha> npm run carga:participantes -- --data 2026-11-10   # dia do teste
 *   CARGA_SENHA=<senha> npm run carga:participantes -- --recriar           # apaga e recria
 *   npm run carga:participantes -- --so-arquivos                           # só gera os OFX
 *
 * Os arquivos cobrem os três meses anteriores e o mês do teste até a data informada (padrão: hoje)
 * e ficam em backend/carga-participantes/<pessoa>/ (fora do versionamento). Todos são importados,
 * menos a fatura do mês do teste, que vai para <pessoa>/para-o-teste/: o participante a importa
 * durante a sessão. As metas valem para os quatro meses, para o Resumo e a tela de Metas mostrarem
 * o histórico. A geração é determinística: a mesma data gera os mesmos arquivos.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/config/database';
import { PrismaCategoriaRepository } from '../src/repositories/categoria.repository';
import { PrismaContaRepository } from '../src/repositories/conta.repository';
import { PrismaRegraRepository } from '../src/repositories/regra.repository';
import { PrismaTransacaoRepository } from '../src/repositories/transacao.repository';
import { PrismaUsuarioRepository } from '../src/repositories/usuario.repository';
import { AuthService } from '../src/services/auth.service';
import { ImportacaoService } from '../src/services/importacao.service';
import { confirmarImportacaoSchema } from '../src/types';
import { dataLocalIso, diasNoMes } from '../src/utils/datas';

const SAIDA = path.resolve(__dirname, '..', 'carga-participantes');
const MESES_ANTERIORES = 3;
const DIA_VENCIMENTO = 10;

// ---------- perfis ----------

type CategoriaDespesa =
  'Alimentação' | 'Moradia' | 'Transporte' | 'Lazer' | 'Saúde' | 'Educação' | 'Outros';

/** Lançamento que se repete todo mês no mesmo dia. Valor negativo = saída. */
interface Fixo {
  dia: number;
  valor: number | [number, number];
  memo: string;
}

/** Compras soltas: de `qtd[0]` a `qtd[1]` por mês, cada uma entre `valor[0]` e `valor[1]`. */
interface Variavel {
  qtd: [number, number];
  valor: [number, number];
  memos: string[];
}

interface Perfil {
  chave: string;
  nome: string;
  email: string;
  semente: number;
  descricao: string;
  saldoInicial: number;
  conta: { fixos: Fixo[]; variaveis: Variavel[] };
  cartao: { fixos: Fixo[]; variaveis: Variavel[] };
  metaTotal: number;
  metas: Partial<Record<CategoriaDespesa, number>>;
}

export const PERFIS: Perfil[] = [
  {
    chave: 'mauricio',
    nome: 'Maurício',
    email: 'mauricio@projetointegrador.com.br',
    semente: 1101,
    descricao:
      'Solteiro, mora sozinho de aluguel e usa muito o cartão: pede delivery, sai bastante e anda de carro. ' +
      'As metas de Alimentação e Lazer são apertadas para o jeito dele gastar e costumam estourar.',
    saldoInicial: 3200,
    conta: {
      fixos: [
        { dia: 5, valor: 6800, memo: 'Salario - Folha de pagamento Tecnologia Alfa Ltda' },
        { dia: 6, valor: -1950, memo: 'Pix enviado - Aluguel apartamento' },
        { dia: 12, valor: [-95, -160], memo: 'Pagamento de boleto - ENEL Distribuicao' },
        { dia: 15, valor: -99.9, memo: 'Pagamento de boleto - Internet Fibra Net' },
        { dia: 20, valor: [-500, -500], memo: 'Pix enviado - Reserva Tesouro Direto' },
      ],
      variaveis: [
        {
          qtd: [3, 5],
          valor: [18, 60],
          memos: ['Compra no debito - Padaria Pao Quente', 'Compra no debito - Lanchonete Central'],
        },
        { qtd: [1, 2], valor: [40, 120], memos: ['Pix enviado - Racha churrasco amigos'] },
      ],
    },
    cartao: {
      fixos: [
        { dia: 3, valor: -55.9, memo: 'Netflix Entretenimento' },
        { dia: 8, valor: -34.9, memo: 'Ebn *Spotify' },
        { dia: 9, valor: -59.9, memo: 'Playstation Plus' },
        { dia: 11, valor: -149.9, memo: 'Smart Fit Academia' },
        { dia: 18, valor: -64.99, memo: 'Conta Vivo Celular' },
      ],
      variaveis: [
        {
          qtd: [12, 16],
          valor: [32, 95],
          memos: [
            'Ifd*Hamburgueria Brasa',
            'Ifd*Sushi Kento',
            'Ifd*Pizzaria Napoli',
            'Ifd*Restaurante Sabor',
          ],
        },
        {
          qtd: [4, 6],
          valor: [45, 140],
          memos: ['Restaurante Boteco Vila', 'Churrascaria Gaucha', 'Yakitori'],
        },
        { qtd: [2, 3], valor: [80, 210], memos: ['Supermercado Estrela', 'Mercado Bom Preco'] },
        { qtd: [3, 4], valor: [190, 260], memos: ['Posto Ipiranga Sul', 'Auto Posto Central'] },
        { qtd: [3, 6], valor: [15, 45], memos: ['Stoppark Brigadeiro', 'Entry Park Estacioname'] },
        { qtd: [2, 5], valor: [14, 42], memos: ['Uber *Trip', '99*Pop'] },
        {
          qtd: [2, 4],
          valor: [60, 180],
          memos: [
            'Bar do Ze Choperia',
            'Ingresso Rapido Show',
            'Cinemark Ingressos',
            'Steam Games',
          ],
        },
        { qtd: [1, 2], valor: [70, 320], memos: ['Amazon Marketplace', 'Mercadolivre*Mercadol'] },
        { qtd: [0, 1], valor: [25, 90], memos: ['Drogaria Sao Paulo'] },
      ],
    },
    metaTotal: 5600,
    metas: {
      Alimentação: 1300,
      Lazer: 450,
      Transporte: 1100,
      Moradia: 2300,
      Saúde: 250,
    },
  },
  {
    chave: 'andressa',
    nome: 'Andressa',
    email: 'andressa@projetointegrador.com.br',
    semente: 2202,
    descricao:
      'Casada, um filho em idade escolar, paga as contas da casa e faz o mercado da família. Usa ônibus e metrô, ' +
      'gasta pouco com lazer e tem renda extra com aulas particulares. Metas mais próximas do que ela gasta: ' +
      'Alimentação e Saúde ficam perto do limite, e o resto dentro.',
    saldoInicial: 1800,
    conta: {
      fixos: [
        { dia: 5, valor: 5400, memo: 'Salario - Proventos Secretaria da Educacao' },
        { dia: 10, valor: -1250, memo: 'Pagamento de boleto - Financiamento habitacional' },
        { dia: 10, valor: -480, memo: 'Pagamento de boleto - Condominio Residencial Ipe' },
        { dia: 12, valor: [-70, -110], memo: 'Pagamento de boleto - SABESP' },
        { dia: 14, valor: [-140, -210], memo: 'Pagamento de boleto - ENEL Distribuicao' },
        { dia: 8, valor: -890, memo: 'Pagamento de boleto - Escola Pequeno Saber' },
        { dia: 15, valor: -410, memo: 'Pagamento de boleto - Unimed plano de saude' },
        {
          dia: 22,
          valor: [650, 950],
          memo: 'Pix recebido - Prestacao de servico aulas particulares',
        },
      ],
      variaveis: [
        {
          qtd: [2, 3],
          valor: [150, 380],
          memos: [
            'Compra no debito - Atacadao Casa Nova',
            'Compra no debito - Supermercado Estrela',
          ],
        },
        {
          qtd: [3, 5],
          valor: [8, 25],
          memos: [
            'Compra no debito - Feira Livre Barra Funda',
            'Compra no debito - Padaria Pao Quente',
          ],
        },
        {
          qtd: [2, 3],
          valor: [50, 100],
          memos: ['Recarga Bilhete Unico Onibus', 'Recarga Metro SP'],
        },
      ],
    },
    cartao: {
      fixos: [
        { dia: 4, valor: -39.9, memo: 'Disney Plus' },
        { dia: 16, valor: -89.9, memo: 'Conta Vivo Fibra Internet' },
      ],
      variaveis: [
        {
          qtd: [3, 4],
          valor: [90, 260],
          memos: ['Supermercado Estrela', 'Hortifruti Verde Vida', 'Mercado Bom Preco'],
        },
        { qtd: [1, 3], valor: [35, 80], memos: ['Ifd*Pizzaria Napoli', 'Padaria Pao Quente'] },
        { qtd: [2, 3], valor: [30, 85], memos: ['Drogaria Pacheco', 'Farmacia Bem Estar'] },
        { qtd: [0, 1], valor: [120, 220], memos: ['Clinica Pediatrica Crescer'] },
        { qtd: [1, 2], valor: [30, 95], memos: ['Livraria Cultura', 'Papelaria Escola Feliz'] },
        { qtd: [1, 3], valor: [14, 35], memos: ['Uber *Trip', '99*Pop'] },
        {
          qtd: [1, 2],
          valor: [40, 110],
          memos: ['Cinemark Ingressos', 'Parque Diversao Ingresso'],
        },
        { qtd: [1, 2], valor: [45, 160], memos: ['Shopee*Loja', 'Lojas Renner'] },
      ],
    },
    metaTotal: 6200,
    metas: {
      Alimentação: 1400,
      Moradia: 2150,
      Educação: 1000,
      Saúde: 620,
      Transporte: 300,
      Lazer: 200,
    },
  },
];

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

const r2 = (n: number): number => Math.round(n * 100) / 100;
const dois = (n: number): string => String(n).padStart(2, '0');
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

interface Mes {
  ano: number;
  mes: number;
}

const somarMes = ({ ano, mes }: Mes, n: number): Mes => {
  const indice = ano * 12 + (mes - 1) + n;
  return { ano: Math.floor(indice / 12), mes: (indice % 12) + 1 };
};
const iso = ({ ano, mes }: Mes, dia: number): string => `${ano}-${dois(mes)}-${dois(dia)}`;
const compacta = (data: string): string => data.replace(/-/g, '');

interface Lancamento {
  data: string; // YYYY-MM-DD
  valor: number; // negativo = saída
  memo: string;
  fitid: string;
}

/** Sorteios de um perfil num mês: a mesma semente e o mesmo mês geram os mesmos lançamentos. */
const LADOS = { conta: 1, cartao: 2, pagamento: 3 } as const;

function sorteador(perfil: Perfil, m: Mes, lado: keyof typeof LADOS) {
  const rnd = mulberry32(perfil.semente * 1_000_000 + (m.ano * 12 + m.mes) * 10 + LADOS[lado]);
  const entre = (min: number, max: number): number => min + rnd() * (max - min);
  const inteiro = (min: number, max: number): number => Math.floor(entre(min, max + 1));
  const fitid = (): string =>
    Array.from({ length: 32 }, () => inteiro(0, 15).toString(16))
      .join('')
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  return { entre, inteiro, fitid };
}

function lancamentosDoMes(perfil: Perfil, m: Mes, lado: 'conta' | 'cartao'): Lancamento[] {
  const { entre, inteiro, fitid } = sorteador(perfil, m, lado);
  const ultimoDia = diasNoMes(m.ano, m.mes);
  const lista: Lancamento[] = [];
  for (const fixo of perfil[lado].fixos) {
    const valor = Array.isArray(fixo.valor) ? entre(fixo.valor[0], fixo.valor[1]) : fixo.valor;
    lista.push({
      data: iso(m, Math.min(fixo.dia, ultimoDia)),
      valor: r2(valor),
      memo: fixo.memo,
      fitid: fitid(),
    });
  }
  for (const variavel of perfil[lado].variaveis) {
    const qtd = inteiro(variavel.qtd[0], variavel.qtd[1]);
    for (let i = 0; i < qtd; i++) {
      lista.push({
        data: iso(m, inteiro(1, ultimoDia)),
        valor: -r2(entre(variavel.valor[0], variavel.valor[1])),
        memo: variavel.memos[inteiro(0, variavel.memos.length - 1)],
        fitid: fitid(),
      });
    }
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

// ---------- OFX (mesmo formato do Nubank usado em tests/fixtures) ----------

const brt = (data: string): string => `${compacta(data)}000000[-3:BRT]`;

function cabecalho(encoding: string, charset: string, dtserver: string): string[] {
  return [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'SECURITY:NONE',
    `ENCODING:${encoding}`,
    `CHARSET:${charset}`,
    'COMPRESSION:NONE',
    'OLDFILEUID:NONE',
    'NEWFILEUID:NONE',
    '<OFX>',
    '<SIGNONMSGSRSV1>',
    '<SONRS>',
    '<STATUS>',
    '<CODE>0</CODE>',
    '<SEVERITY>INFO</SEVERITY>',
    '</STATUS>',
    `<DTSERVER>${compacta(dtserver)}120000[0:GMT]</DTSERVER>`,
    '<LANGUAGE>POR</LANGUAGE>',
    '<FI>',
    '<ORG>NU PAGAMENTOS S.A.</ORG>',
    '<FID>260</FID>',
    '</FI>',
    '</SONRS>',
    '</SIGNONMSGSRSV1>',
  ];
}

const STATUS = ['<STATUS>', '<CODE>0</CODE>', '<SEVERITY>INFO</SEVERITY>', '</STATUS>'];

function transacoes(lista: Lancamento[]): string[] {
  return lista.flatMap((l) => [
    '<STMTTRN>',
    `<TRNTYPE>${l.valor < 0 ? 'DEBIT' : 'CREDIT'}</TRNTYPE>`,
    `<DTPOSTED>${brt(l.data)}</DTPOSTED>`,
    `<TRNAMT>${l.valor.toFixed(2)}</TRNAMT>`,
    `<FITID>${l.fitid}</FITID>`,
    `<MEMO>${l.memo}</MEMO>`,
    '</STMTTRN>',
  ]);
}

function ofxExtrato(
  acctid: string,
  lista: Lancamento[],
  inicio: string,
  fim: string,
  saldo: number,
): string {
  return [
    ...cabecalho('UTF-8', 'NONE', fim),
    '<BANKMSGSRSV1>',
    '<STMTTRNRS>',
    '<TRNUID>1</TRNUID>',
    ...STATUS,
    '<STMTRS>',
    '<CURDEF>BRL</CURDEF>',
    '<BANKACCTFROM>',
    '<BANKID>0260</BANKID>',
    '<BRANCHID>1</BRANCHID>',
    `<ACCTID>${acctid}</ACCTID>`,
    '<ACCTTYPE>CHECKING</ACCTTYPE>',
    '</BANKACCTFROM>',
    '<BANKTRANLIST>',
    `<DTSTART>${brt(inicio)}</DTSTART>`,
    `<DTEND>${brt(fim)}</DTEND>`,
    ...transacoes(lista),
    '</BANKTRANLIST>',
    '<LEDGERBAL>',
    `<BALAMT>${saldo.toFixed(2)}</BALAMT>`,
    `<DTASOF>${brt(fim)}</DTASOF>`,
    '</LEDGERBAL>',
    '</STMTRS>',
    '</STMTTRNRS>',
    '</BANKMSGSRSV1>',
    '</OFX>',
  ].join('\n');
}

function ofxFatura(
  acctid: string,
  lista: Lancamento[],
  inicio: string,
  fim: string,
  total: number,
): string {
  return [
    ...cabecalho('USASCII', '1252', fim),
    '<CREDITCARDMSGSRSV1>',
    '<CCSTMTTRNRS>',
    '<TRNUID>1001</TRNUID>',
    ...STATUS,
    '<CCSTMTRS>',
    '<CURDEF>BRL</CURDEF>',
    '<CCACCTFROM>',
    `<ACCTID>${acctid}</ACCTID>`,
    '</CCACCTFROM>',
    '<BANKTRANLIST>',
    `<DTSTART>${brt(inicio)}</DTSTART>`,
    `<DTEND>${brt(fim)}</DTEND>`,
    ...transacoes(lista),
    '</BANKTRANLIST>',
    '<LEDGERBAL>',
    `<BALAMT>${(-total).toFixed(2)}</BALAMT>`,
    `<DTASOF>${brt(fim)}</DTASOF>`,
    '</LEDGERBAL>',
    '</CCSTMTRS>',
    '</CCSTMTTRNRS>',
    '</CREDITCARDMSGSRSV1>',
    '</OFX>',
  ].join('\n');
}

// ---------- geração dos arquivos ----------

interface Arquivo {
  caminho: string;
  tipo: 'extrato' | 'fatura';
  paraOTeste: boolean;
}

/**
 * Gera extrato e fatura de cada mês, de `MESES_ANTERIORES` meses antes do teste até `dataTeste`.
 * A fatura de um mês fecha no último dia e é paga no dia 10 do mês seguinte: o pagamento aparece no
 * extrato ("Pagamento de fatura") e na fatura seguinte ("Pagamento recebido") com o mesmo FITID,
 * como no Nubank, e o importador já os desmarca.
 */
export function gerarArquivos(perfil: Perfil, dataTeste: string, saida: string): Arquivo[] {
  const [ano, mes] = dataTeste.split('-').map(Number);
  const doTeste: Mes = { ano, mes };
  const pasta = path.join(saida, perfil.chave);
  rmSync(pasta, { recursive: true, force: true });
  mkdirSync(path.join(pasta, 'para-o-teste'), { recursive: true });

  const acctConta = `${perfil.semente}${perfil.semente}-1`;
  const acctCartao = `${perfil.semente}-cartao-${perfil.chave}`;
  const arquivos: Arquivo[] = [];
  let saldo = perfil.saldoInicial;
  let pagamento: Lancamento | null = null; // da fatura do mês anterior

  for (let i = -MESES_ANTERIORES; i <= 0; i++) {
    const m = somarMes(doTeste, i);
    const inicio = iso(m, 1);
    const fim = i === 0 ? dataTeste : iso(m, diasNoMes(m.ano, m.mes));
    const ate = (l: Lancamento): boolean => l.data <= fim;

    const compras = lancamentosDoMes(perfil, m, 'cartao');
    const fatura = [
      ...(pagamento ? [{ ...pagamento, valor: -pagamento.valor, memo: 'Pagamento recebido' }] : []),
      ...compras,
    ].filter(ate);
    const totalFatura = r2(-compras.reduce((s, l) => s + l.valor, 0));

    const extrato = [...lancamentosDoMes(perfil, m, 'conta'), ...(pagamento ? [pagamento] : [])]
      .filter(ate)
      .sort((a, b) => a.data.localeCompare(b.data));
    saldo = r2(saldo + extrato.reduce((s, l) => s + l.valor, 0));

    const nomeExtrato = `NU_${acctConta.replace('-', '')}_01${MESES[m.mes - 1]}${m.ano}_${fim.slice(8)}${MESES[m.mes - 1]}${m.ano}.ofx`;
    const venc = somarMes(m, 1);
    const nomeFatura = `Nubank_${iso(venc, DIA_VENCIMENTO)}.ofx`;
    const caminhoExtrato = path.join(pasta, nomeExtrato);
    const caminhoFatura = path.join(pasta, i === 0 ? 'para-o-teste' : '', nomeFatura);
    writeFileSync(caminhoExtrato, ofxExtrato(acctConta, extrato, inicio, fim, saldo));
    writeFileSync(caminhoFatura, ofxFatura(acctCartao, fatura, inicio, fim, totalFatura));
    arquivos.push({ caminho: caminhoExtrato, tipo: 'extrato', paraOTeste: false });
    arquivos.push({ caminho: caminhoFatura, tipo: 'fatura', paraOTeste: i === 0 });

    pagamento = {
      data: iso(venc, DIA_VENCIMENTO),
      valor: -totalFatura,
      memo: 'Pagamento de fatura',
      fitid: sorteador(perfil, m, 'pagamento').fitid(),
    };
  }
  return arquivos;
}

// ---------- carga no banco ----------

function lerArgumentos(argv: string[]) {
  const valor = (nome: string): string | undefined => {
    const i = argv.indexOf(nome);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const data = valor('--data') ?? dataLocalIso(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('--data deve estar no formato AAAA-MM-DD');
  const pessoa = valor('--pessoa');
  const chaves = PERFIS.map((perfil) => perfil.chave);
  if (pessoa !== undefined && !chaves.includes(pessoa)) {
    throw new Error(`--pessoa deve ser ${chaves.join(' ou ')}`);
  }
  return {
    data,
    perfis: PERFIS.filter((perfil) => pessoa === undefined || perfil.chave === pessoa),
    recriar: argv.includes('--recriar'),
    soArquivos: argv.includes('--so-arquivos'),
  };
}

async function main(): Promise<void> {
  const { data, perfis, recriar, soArquivos } = lerArgumentos(process.argv.slice(2));
  const senha = process.env.CARGA_SENHA;
  if (!soArquivos && (!senha || senha.length < 8)) {
    throw new Error('Defina CARGA_SENHA (mínimo de 8 caracteres) com a senha dos participantes');
  }

  const usuarios = new PrismaUsuarioRepository();
  const contas = new PrismaContaRepository();
  const categorias = new PrismaCategoriaRepository();
  const auth = new AuthService(usuarios);
  const importacao = new ImportacaoService(
    new PrismaTransacaoRepository(),
    categorias,
    usuarios,
    new PrismaRegraRepository(),
    contas,
  );

  for (const perfil of perfis) {
    const arquivos = gerarArquivos(perfil, data, SAIDA);
    console.log(
      `${perfil.nome}: ${arquivos.length} arquivos OFX em ${path.join(SAIDA, perfil.chave)}`,
    );
    if (soArquivos) continue;

    const existente = await usuarios.buscarPorEmail(perfil.email);
    if (existente && !recriar) {
      console.log(
        `  ${perfil.email}: já existe, mantido (use --recriar para apagar e criar de novo).`,
      );
      continue;
    }
    if (existente) await usuarios.excluirComDados(existente.id);

    const { id: usuarioId } = await auth.registrar({
      nome: perfil.nome,
      email: perfil.email,
      senha: senha!,
    });
    const corrente = await contas.criar(usuarioId, {
      nome: 'Conta Nubank',
      tipo: 'CONTA_CORRENTE',
      saldoInicial: perfil.saldoInicial,
    });
    const cartao = await contas.criar(usuarioId, {
      nome: 'Cartão Nubank',
      tipo: 'CARTAO_CREDITO',
      saldoInicial: 0,
    });

    let importadas = 0;
    for (const arquivo of arquivos.filter((a) => !a.paraOTeste)) {
      const contaId = arquivo.tipo === 'extrato' ? corrente.id : cartao.id;
      const preview = await importacao.gerarPreview(
        usuarioId,
        readFileSync(arquivo.caminho),
        contaId,
      );
      // O mesmo filtro da tela de revisão: só as linhas novas e não desmarcadas.
      const linhas = preview.linhas.filter((linha) => !linha.duplicada && !linha.ignoradaSugerida);
      if (linhas.length === 0) continue;
      const dto = confirmarImportacaoSchema.parse({
        transacoes: linhas,
        contaId,
        identificadorExterno: preview.identificadorExterno ?? undefined,
      });
      importadas += (await importacao.confirmar(usuarioId, dto)).importadas;
    }

    // Metas iguais nos quatro meses, para a tela de Metas e o Resumo terem histórico.
    const doUsuario = await categorias.listarVisiveis(usuarioId);
    const [ano, mes] = data.split('-').map(Number);
    for (let i = -MESES_ANTERIORES; i <= 0; i++) {
      const m = somarMes({ ano, mes }, i);
      await prisma.metaMensal.create({
        data: { usuarioId, ano: m.ano, mes: m.mes, orcamentoLimite: perfil.metaTotal },
      });
      for (const [nome, valor] of Object.entries(perfil.metas)) {
        const categoria = doUsuario.find((c) => c.nome === nome && c.tipo === 'DESPESA');
        if (!categoria) throw new Error(`Categoria de despesa "${nome}" não encontrada`);
        await prisma.metaCategoria.create({
          data: { usuarioId, categoriaId: categoria.id, ano: m.ano, mes: m.mes, valor },
        });
      }
    }

    const paraOTeste = arquivos.find((a) => a.paraOTeste)!;
    console.log(
      `  ${perfil.email}: criado com ${importadas} transações e metas de ${Object.keys(perfil.metas).length} categorias.`,
    );
    console.log(`  Para importar durante o teste: ${paraOTeste.caminho}`);
  }
}

if (require.main === module) {
  main()
    .catch((erro: unknown) => {
      console.error(erro instanceof Error ? erro.message : erro);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

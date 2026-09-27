import { Categoria, OrigemSugestao, RegraCategoria, TipoTransacao } from '../types';

const NOME_FALLBACK = 'Outros';

interface Regra {
  categoria: string;
  padrao: RegExp;
}

// Aplicadas sobre o texto normalizado (minúsculas, sem acento, sem pontuação).
// A primeira regra que casar vence, então a ordem importa.
// Sem categoria óbvia (candidatos à fase 2): Anthropic, Mercadolivre, Amazon, Enjoei, Kabum, Pix entre pessoas.
const REGRAS_DESPESA: Regra[] = [
  {
    categoria: 'Saúde',
    padrao:
      /drogaria|farmacia|clinica|odonto|dentista|unimed|saude|hospital|laboratorio|academia|smart fit|petlove/,
  },
  {
    categoria: 'Educação',
    padrao: /udemy|alura|coursera|\bcurso\b|faculdade|universidade|escola|livraria/,
  },
  {
    categoria: 'Transporte',
    padrao:
      /\buber|\b99\b|cabify|\bposto\b|combustivel|estaciona|\bpark\b|stoppark|pedagio|\bmetro\b|onibus/,
  },
  {
    categoria: 'Moradia',
    padrao:
      /aluguel|condominio|\benel\b|sabesp|ultragaz|telefonica|\bvivo\b|\bagua\b|\bluz\b|energia|internet|\bgas\b|leroy|iptu/,
  },
  {
    categoria: 'Lazer',
    padrao:
      /netflix|spotify|disney|\bhbo\b|\bsteam\b|playstation|cinema|cinemark|ingresso|latam|passagem|hotel|airbnb|\bshow\b/,
  },
  {
    categoria: 'Alimentação',
    padrao:
      /\bmercado\b|supermercado|atacad|hortifruti|feira|padaria|lanche|cafe|restaurante|pizzaria|churrascaria|\bifd\b|ifood|buffet|pastel|sorvete|yakitori|sapore|obento|acougue|hamburg|burger|sushi/,
  },
];

const REGRAS_RECEITA: Regra[] = [
  { categoria: 'Salário', padrao: /salario|folha de pagamento|proventos|holerite/ },
  { categoria: 'Freelance', padrao: /freela|honorario|prestacao de servico/ },
  { categoria: 'Investimentos', padrao: /rendimento|\bcdb\b|\brdb\b|dividendo|tesouro|juros/ },
];

const PAGAMENTO_FATURA = /^pagamento (de fatura|recebido)\b/;
const STOPWORDS_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export interface SugestaoIgnorada {
  motivo: string;
}

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nomeDaRegraPadrao(descricao: string, tipo: TipoTransacao): string | null {
  const texto = normalizar(descricao);
  const regras = tipo === 'RECEITA' ? REGRAS_RECEITA : REGRAS_DESPESA;
  return regras.find((regra) => regra.padrao.test(texto))?.categoria ?? null;
}

export function sugerirNomeCategoria(descricao: string, tipo: TipoTransacao): string {
  return nomeDaRegraPadrao(descricao, tipo) ?? NOME_FALLBACK;
}

/** Descrição (já normalizada ou não) contém o termo da regra, comparando texto normalizado. */
export function descricaoCasaComTermo(descricao: string, termo: string): boolean {
  return normalizar(descricao).includes(termo);
}

export interface SugestaoCategoria {
  categoriaId: number;
  origem: OrigemSugestao;
  /** Termo da regra do usuário que decidiu; nulo nas outras origens. */
  termo: string | null;
}

/**
 * Precedência: regra do usuário (a de termo mais longo vence) → regras fixas → "Outros".
 * A regra do usuário só vale para categoria do mesmo tipo da transação.
 * Devolve null se nem "Outros" existir (banco sem seed).
 */
export function sugerirCategoria(
  descricao: string,
  tipo: TipoTransacao,
  categorias: ReadonlyArray<Categoria>,
  regrasDoUsuario: ReadonlyArray<Pick<RegraCategoria, 'categoriaId' | 'termo'>> = [],
): SugestaoCategoria | null {
  const texto = normalizar(descricao);
  const tipoPorCategoria = new Map(categorias.map((c) => [c.id, c.tipo]));

  const daRegra = regrasDoUsuario
    .filter((r) => tipoPorCategoria.get(r.categoriaId) === tipo && texto.includes(r.termo))
    .sort((a, b) => b.termo.length - a.termo.length || a.termo.localeCompare(b.termo))[0];
  if (daRegra) {
    return { categoriaId: daRegra.categoriaId, origem: 'REGRA_USUARIO', termo: daRegra.termo };
  }

  const nomePadrao = nomeDaRegraPadrao(descricao, tipo);
  const categoriaId = resolverCategoriaId(categorias, nomePadrao ?? NOME_FALLBACK, tipo);
  if (categoriaId === null) return null;
  // Se a categoria da regra fixa não existe, resolverCategoriaId cai em "Outros".
  const casouPadrao =
    nomePadrao !== null &&
    categorias.some((c) => c.id === categoriaId && c.tipo === tipo && c.nome === nomePadrao);
  return { categoriaId, origem: casouPadrao ? 'REGRA_PADRAO' : 'FALLBACK', termo: null };
}

// Não fixa IDs: resolve pelo nome e tipo entre as categorias que existem no banco.
export function resolverCategoriaId(
  categorias: ReadonlyArray<Categoria>,
  nome: string,
  tipo: TipoTransacao,
): number | null {
  const doTipo = categorias.filter((categoria) => categoria.tipo === tipo);
  const escolhida =
    doTipo.find((categoria) => categoria.nome === nome) ??
    doTipo.find((categoria) => categoria.nome === NOME_FALLBACK);
  return escolhida?.id ?? null;
}

// O pagamento aparece no extrato e de novo (mesmo FITID) como "Pagamento recebido" na fatura;
// somar as duas pontas contaria a despesa em dobro.
export function ehPagamentoDeFatura(descricao: string): boolean {
  return PAGAMENTO_FATURA.test(normalizar(descricao));
}

// Pix cuja descrição contém o nome completo do próprio usuário: transferência entre contas suas.
// Exige ao menos duas partes no nome para não confundir "Maria" com qualquer Maria.
export function ehTransferenciaPropria(descricao: string, nomeUsuario: string): boolean {
  const partes = normalizar(nomeUsuario)
    .split(' ')
    .filter((parte) => parte.length > 1 && !STOPWORDS_NOME.has(parte));
  if (partes.length < 2) return false;

  const palavras = new Set(normalizar(descricao).split(' '));
  return partes.every((parte) => palavras.has(parte));
}

export function sugerirIgnorada(descricao: string, nomeUsuario: string): SugestaoIgnorada | null {
  if (ehPagamentoDeFatura(descricao)) {
    return { motivo: 'possível pagamento de fatura' };
  }
  if (ehTransferenciaPropria(descricao, nomeUsuario)) {
    return { motivo: 'possível transferência entre suas contas' };
  }
  return null;
}

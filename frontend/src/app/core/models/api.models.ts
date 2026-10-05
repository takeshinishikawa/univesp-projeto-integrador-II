// Contratos da API (espelham backend/src/types/index.ts; datas trafegam como string JSON).

export type TipoTransacao = 'RECEITA' | 'DESPESA';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  senha: string;
}

export interface LoginResponse {
  token: string;
  usuario: Usuario;
}

export interface RegistrarUsuarioRequest {
  nome: string;
  email: string;
  senha: string;
}

export interface Categoria {
  id: number;
  nome: string;
  tipo: TipoTransacao;
  /** `true` = categoria padrão (não editável); `false` = criada pelo usuário. */
  padrao: boolean;
}

export interface CategoriaRequest {
  nome: string;
  tipo: TipoTransacao;
}

export interface Transacao {
  id: number;
  usuarioId: number;
  categoriaId: number;
  descricao: string;
  valor: number;
  tipo: TipoTransacao;
  dataTransacao: string; // YYYY-MM-DD
  contaId: number;
  /** Preenchido nas duas pontas de uma transferência entre contas. */
  transferenciaId?: string | null;
  createdAt: string;
}

export interface TransacaoRequest {
  categoriaId: number;
  descricao: string;
  valor: number;
  tipo: TipoTransacao;
  dataTransacao: string; // YYYY-MM-DD
  /** Sem conta, a API usa a principal. */
  contaId?: number;
}

export interface PeriodoFiltro {
  mes?: number;
  ano?: number;
  /** Só as transações desta conta (sem ele, todas as contas). */
  contaId?: number;
}

/** Filtros da listagem de transações (todos opcionais; combinam com "E"). */
export interface FiltroTransacoes extends PeriodoFiltro {
  busca?: string;
  categoriaId?: number;
  tipo?: TipoTransacao;
  valorMin?: number;
  valorMax?: number;
}

export interface ResultadoEdicaoEmMassa {
  afetadas: number;
}

export type SituacaoMeta = 'DENTRO' | 'ATENCAO' | 'ESTOURADA';

export interface ResumoFinanceiro {
  totalReceitas: number;
  totalDespesas: number;
  saldoAtual: number;
  /** Meta de gastos do mês consultado; null sem meta, no ano inteiro ou sem período. */
  orcamentoLimite: number | null;
  /** Só no ano inteiro: meses (1-12) cujas despesas passaram da meta do próprio mês. */
  mesesAcimaDaMeta: number[];
  /** Só no ano inteiro: quantos meses do ano têm meta definida. */
  mesesComMeta: number;
  /** Só no ano inteiro: meses (1-12) em que alguma categoria passou da própria meta. */
  mesesComCategoriaEstourada: number[];
  alertaOrcamentoEstourado: boolean;
  /** Gasto em relação à meta total: atenção a partir de 80%, estourada acima de 100%. */
  situacaoOrcamento: SituacaoMeta | 'SEM_META';
}

/** De onde vem a meta do mês: soma das metas por categoria ou o total definido antes delas. */
export type OrigemMeta = 'CATEGORIAS' | 'ANTIGA';

export interface MetaMes {
  mes: number; // 1-12
  /** Soma das metas por categoria do mês (ou a meta total antiga, se não há meta por categoria). */
  orcamentoLimite: number | null;
  origem: OrigemMeta | null; // null sem meta
}

export interface MetasDoAno {
  ano: number;
  meses: MetaMes[]; // sempre 12
}

/** `orcamentoLimite: null` remove a meta do mês. */
export interface DefinirMetaRequest {
  ano: number;
  mes: number;
  orcamentoLimite: number | null;
}

export interface MesDoAno {
  ano: number;
  mes: number; // 1-12
}

/** `valor: null` remove a meta da categoria no mês. */
export interface DefinirMetaCategoriaRequest extends MesDoAno {
  categoriaId: number;
  valor: number | null;
}

export interface MetaCategoriaMes {
  categoriaId: number;
  categoria: string;
  meta: number;
  gasto: number;
  percentual: number; // 1 casa decimal; passa de 100 quando estoura
  situacao: SituacaoMeta;
}

export interface CategoriaSemMeta {
  categoriaId: number;
  categoria: string;
  gasto: number;
}

export interface MetasCategoriaDoMes extends MesDoAno {
  comMeta: MetaCategoriaMes[]; // das mais próximas de estourar para as menos
  semMeta: CategoriaSemMeta[]; // de maior gasto para menor
  totalMetas: number;
}

export type ItensDaCopia = 'TOTAL' | 'CATEGORIAS' | 'AMBAS';

export interface CopiarMetasRequest {
  origem: MesDoAno;
  destino: MesDoAno[];
  incluir: ItensDaCopia;
  sobrescrever: boolean;
}

export interface ResultadoCopiaMetas {
  copiadas: number;
  puladas: number; // já existiam no destino e foram preservadas
  mesesPulados: MesDoAno[];
}

export interface MesEvolucao {
  mes: number; // 1-12
  totalReceitas: number;
  totalDespesas: number;
  saldo: number;
  orcamentoLimite: number | null; // meta de gastos do mês; null sem meta
}

export interface EvolucaoMensal {
  ano: number;
  meses: MesEvolucao[];
}

export interface CategoriaTotal {
  categoriaId: number;
  categoria: string;
  total: number;
  percentual: number;
}

export interface TotaisPorCategoria {
  tipo: TipoTransacao;
  total: number;
  categorias: CategoriaTotal[];
}

/** Regra "descrição contém `termo` → categoria"; o termo vem normalizado (minúsculas, sem acento). */
export interface Regra {
  id: number;
  categoriaId: number;
  termo: string;
}

export interface RegraRequest {
  termo: string;
  categoriaId: number;
}

export type OrigemSugestao = 'REGRA_USUARIO' | 'REGRA_PADRAO' | 'FALLBACK';

export type OrigemImportacao = 'CONTA' | 'CARTAO';

/** Linha devolvida pelo preview; também é o formato aceito no confirmar (sem os campos de aviso). */
export interface LinhaPreview extends TransacaoRequest {
  idExterno: string;
  /** De onde veio a categoria sugerida; `termoSugestao` é o termo da regra do usuário, se foi ela. */
  origemSugestao: OrigemSugestao;
  termoSugestao: string | null;
  duplicada: boolean;
  ignoradaSugerida: boolean;
  motivoIgnorada: string | null;
  /** Dá para registrar como transferência para a conta do cartão. */
  pagamentoDeFatura: boolean;
}

export interface PreviewImportacao {
  origem: OrigemImportacao;
  /** Banco/conta do arquivo (`null` se o OFX não traz). */
  identificadorExterno: string | null;
  /** Conta em que as duplicatas foram procuradas. */
  contaId: number;
  contaReconhecida: boolean;
  nomeContaSugerido: string;
  tipoContaSugerido: TipoConta;
  linhas: LinhaPreview[];
  /** Linhas de valor R$ 0,00 no arquivo (não são receita nem despesa), ignoradas automaticamente. */
  linhasIgnoradas: number;
}

export interface LinhaImportacaoRequest extends TransacaoRequest {
  idExterno: string;
  /** Registra a linha como transferência da conta importada para esta conta. */
  contaDestinoId?: number;
}

export interface ResultadoImportacao {
  importadas: number;
  ignoradasPorDuplicidade: number;
}

// ---- Contas e transferências

export type TipoConta = 'CONTA_CORRENTE' | 'CARTAO_CREDITO' | 'DINHEIRO' | 'OUTRA';

export interface Conta {
  id: number;
  nome: string;
  tipo: TipoConta;
  saldoInicial: number;
  identificadorExterno: string | null;
  arquivada: boolean;
  /** Saldo inicial + receitas − despesas; no cartão, negativo = a pagar. */
  saldo: number;
  totalTransacoes: number;
}

export interface ContaRequest {
  nome: string;
  tipo: TipoConta;
  saldoInicial?: number;
  identificadorExterno?: string | null;
}

export interface TransferenciaRequest {
  contaOrigemId: number;
  contaDestinoId: number;
  valor: number;
  data: string; // YYYY-MM-DD
  descricao?: string;
}

// ---- Insights

export type SeveridadeInsight = 'INFO' | 'ATENCAO' | 'POSITIVO';

/** Filtro de Transações que o insight abre. */
export interface LinkInsight {
  mes: number;
  ano: number;
  categoriaId?: number;
  tipo?: TipoTransacao;
  busca?: string;
}

export interface Insight {
  id: string;
  tipo: string;
  severidade: SeveridadeInsight;
  titulo: string;
  texto: string;
  link: LinkInsight | null;
}

// ---- Recorrentes

export interface Recorrencia {
  chave: string;
  descricao: string;
  categoriaId: number;
  valorTipico: number;
  valorAtual: number;
  valorAnterior: number | null;
  variacaoPercentual: number | null;
  valorVariavel: boolean;
  periodicidade: 'MENSAL';
  ultimaData: string;
  proximaData: string;
  situacao: 'ATIVA' | 'POSSIVELMENTE_ENCERRADA';
  ocorrencias: number;
  ignorada: boolean;
}

export interface RecorrentesResumo {
  recorrencias: Recorrencia[];
  custoMensal: number;
  custoAnual: number;
  comprometidoNoMes: { valor: number; quantidade: number };
}

// ---- Objetivos

export type SituacaoObjetivo = 'NO_RITMO' | 'ATRASADO' | 'CONCLUIDO' | 'VENCIDO';

export interface AporteObjetivo {
  id: number;
  valor: number;
  data: string; // YYYY-MM-DD
  observacao: string | null;
}

export interface Objetivo {
  id: number;
  nome: string;
  valorAlvo: number;
  prazoAno: number;
  prazoMes: number;
  criadoEm: string;
  concluidoEm: string | null;
  acumulado: number;
  percentual: number;
  mesesRestantes: number;
  valorMensalNecessario: number;
  guardarEsteMes: number;
  situacao: SituacaoObjetivo;
  aportes: AporteObjetivo[];
}

export interface ObjetivoRequest {
  nome: string;
  valorAlvo: number;
  prazoAno: number;
  prazoMes: number;
  /** Só na criação: vira o primeiro aporte. */
  valorInicial?: number;
}

export interface AporteRequest {
  valor: number;
  data: string; // YYYY-MM-DD
  observacao?: string;
}

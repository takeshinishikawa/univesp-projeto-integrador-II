import { z } from 'zod';

export type TipoTransacao = 'RECEITA' | 'DESPESA';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  senhaHash: string;
  createdAt: Date;
}

export type UsuarioPublico = Omit<Usuario, 'senhaHash'>;

export interface Categoria {
  id: number;
  nome: string;
  tipo: TipoTransacao;
  usuarioId?: number | null; // nulo = categoria padrão; preenchido = criada pelo usuário
}

/** Categoria como a API a devolve: sem expor o dono, só se é padrão. */
export interface CategoriaPublica {
  id: number;
  nome: string;
  tipo: TipoTransacao;
  padrao: boolean;
}

export interface Transacao {
  id: number;
  usuarioId: number;
  categoriaId: number;
  descricao: string;
  valor: number;
  tipo: TipoTransacao;
  dataTransacao: string; // YYYY-MM-DD
  idExterno?: string | null; // FITID do OFX, quando veio de importação
  contaId: number;
  transferenciaId?: string | null; // preenchido nas duas pontas de uma transferência entre contas
  createdAt: Date;
}

export const TIPOS_CONTA = ['CONTA_CORRENTE', 'CARTAO_CREDITO', 'DINHEIRO', 'OUTRA'] as const;
export type TipoConta = (typeof TIPOS_CONTA)[number];

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
  /** Onde o gasto está em relação à meta total; `SEM_META` sem meta ou sem período. */
  situacaoOrcamento: SituacaoMeta | 'SEM_META';
}

const tipoTransacaoSchema = z.enum(['RECEITA', 'DESPESA']);

export const dataIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
  .refine((valor) => {
    const data = new Date(`${valor}T00:00:00.000Z`);
    return !Number.isNaN(data.getTime()) && data.toISOString().startsWith(valor);
  }, 'Data inválida');

export const registrarUsuarioSchema = z.object({
  nome: z.string().trim().min(1, 'Nome é obrigatório').max(100),
  email: z
    .email('E-mail inválido')
    .max(100)
    .transform((email) => email.toLowerCase()),
  senha: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(72),
});
export type RegistrarUsuarioDTO = z.infer<typeof registrarUsuarioSchema>;

export const criarCategoriaSchema = z.object({
  nome: z.string().trim().min(1, 'Nome é obrigatório').max(50, 'Use no máximo 50 caracteres'),
  tipo: tipoTransacaoSchema,
});
export type CriarCategoriaDTO = z.infer<typeof criarCategoriaSchema>;

export const atualizarCategoriaSchema = criarCategoriaSchema.pick({ nome: true });
export type AtualizarCategoriaDTO = z.infer<typeof atualizarCategoriaSchema>;

export const anoSchema = z.coerce.number().int().min(1970).max(9999);

export const metasQuerySchema = z.object({ ano: anoSchema });
export type MetasQuery = z.infer<typeof metasQuerySchema>;

export const definirMetaSchema = z.object({
  ano: z.number().int().min(1970).max(9999),
  mes: z.number().int().min(1).max(12),
  // null remove a meta do mês
  orcamentoLimite: z
    .number()
    .positive('A meta deve ser maior que zero')
    .max(99_999_999.99)
    .nullable(),
});
export type DefinirMetaDTO = z.infer<typeof definirMetaSchema>;

// De onde vem a meta do mês: soma das metas por categoria ou o total definido antes delas.
export type OrigemMeta = 'CATEGORIAS' | 'ANTIGA';

export interface MetaMes {
  mes: number; // 1-12
  orcamentoLimite: number | null;
  origem: OrigemMeta | null; // null sem meta
}

export interface MetasDoAno {
  ano: number;
  meses: MetaMes[]; // sempre 12 itens
}

export interface MetaDefinida {
  ano: number;
  mes: number;
  orcamentoLimite: number | null;
}

export const LIMITE_ATENCAO_META_PERCENTUAL = 80;
export const MAXIMO_MESES_COPIA = 24;

export const mesSchema = z.number().int().min(1).max(12);
export const anoNumeroSchema = z.number().int().min(1970).max(9999);
const valorMetaSchema = z.number().positive('A meta deve ser maior que zero').max(99_999_999.99);

export const metasCategoriaQuerySchema = z.object({
  ano: anoSchema,
  mes: z.coerce.number().int().min(1).max(12),
});
export type MetasCategoriaQuery = z.infer<typeof metasCategoriaQuerySchema>;

export const definirMetaCategoriaSchema = z.object({
  ano: anoNumeroSchema,
  mes: mesSchema,
  categoriaId: z.number().int().positive(),
  // null remove a meta da categoria no mês
  valor: valorMetaSchema.nullable(),
});
export type DefinirMetaCategoriaDTO = z.infer<typeof definirMetaCategoriaSchema>;

const mesDoAnoSchema = z.object({ ano: anoNumeroSchema, mes: mesSchema });
export type MesDoAno = z.infer<typeof mesDoAnoSchema>;

export const copiarMetasSchema = z.object({
  origem: mesDoAnoSchema,
  destino: z
    .array(mesDoAnoSchema)
    .min(1, 'Escolha ao menos um mês de destino')
    .max(MAXIMO_MESES_COPIA, `Escolha no máximo ${MAXIMO_MESES_COPIA} meses por vez`),
  incluir: z.enum(['TOTAL', 'CATEGORIAS', 'AMBAS']),
  sobrescrever: z.boolean().default(false),
});
export type CopiarMetasDTO = z.infer<typeof copiarMetasSchema>;

export interface MetaCategoriaDefinida {
  ano: number;
  mes: number;
  categoriaId: number;
  valor: number | null;
}

/** Categoria de despesa com meta no mês, com o gasto e o quanto da meta já foi usado. */
export interface MetaCategoriaMes {
  categoriaId: number;
  categoria: string;
  meta: number;
  gasto: number;
  percentual: number; // 1 casa decimal; pode passar de 100
  situacao: SituacaoMeta;
}

export interface CategoriaSemMeta {
  categoriaId: number;
  categoria: string;
  gasto: number;
}

export interface MetasCategoriaDoMes {
  ano: number;
  mes: number;
  comMeta: MetaCategoriaMes[]; // das mais próximas de estourar para as menos
  semMeta: CategoriaSemMeta[]; // de maior gasto para menor
  totalMetas: number; // soma das metas por categoria
}

export interface ResultadoCopiaMetas {
  copiadas: number;
  puladas: number; // já existiam no destino e foram preservadas (sem `sobrescrever`)
  mesesPulados: MesDoAno[]; // meses em que alguma meta foi preservada
}

export const TERMO_MINIMO = 3;
export const TERMO_MAXIMO = 100;

// O mínimo de caracteres não é validado aqui: a contagem bruta não bate com a normalizada
// (pontuação vira espaço, ex. "a.b" tem 3 chars brutos mas só 2 úteis). Quem valida o mínimo,
// sobre o termo já normalizado, é RegraService.normalizarTermo — mensagem única, sem divergir.
const termoSchema = z
  .string()
  .trim()
  .min(1, 'Informe um termo')
  .max(TERMO_MAXIMO, `Use no máximo ${TERMO_MAXIMO} caracteres`);

export const criarRegraSchema = z.object({
  termo: termoSchema,
  categoriaId: z.number().int().positive(),
});
export type CriarRegraDTO = z.infer<typeof criarRegraSchema>;

export const atualizarRegraSchema = criarRegraSchema
  .partial()
  .refine((dados) => dados.termo !== undefined || dados.categoriaId !== undefined, {
    message: 'Informe o termo e/ou a categoria',
  });
export type AtualizarRegraDTO = z.infer<typeof atualizarRegraSchema>;

export const aplicarRegraSchema = z.object({ regraId: z.number().int().positive() });

/** Regra como a API a devolve; `termo` já vem normalizado (minúsculas, sem acento nem pontuação). */
export interface RegraCategoria {
  id: number;
  categoriaId: number;
  termo: string;
}

export type OrigemSugestao = 'REGRA_USUARIO' | 'REGRA_PADRAO' | 'FALLBACK';

export const loginSchema = z.object({
  email: z.email('E-mail inválido').transform((email) => email.toLowerCase()),
  senha: z.string().min(1, 'Senha é obrigatória'),
});
export type LoginDTO = z.infer<typeof loginSchema>;

export const criarTransacaoSchema = z.object({
  categoriaId: z.number().int().positive(),
  descricao: z.string().trim().min(1, 'Descrição é obrigatória').max(150),
  valor: z.number().positive('Valor deve ser positivo').max(99_999_999.99),
  tipo: tipoTransacaoSchema,
  dataTransacao: dataIsoSchema,
  // Sem conta, vale a principal do usuário.
  contaId: z.number().int().positive().optional(),
});
export type CriarTransacaoDTO = z.infer<typeof criarTransacaoSchema>;

export const atualizarTransacaoSchema = criarTransacaoSchema;
export type AtualizarTransacaoDTO = CriarTransacaoDTO;

export const periodoQuerySchema = z
  .object({
    mes: z.coerce.number().int().min(1).max(12).optional(),
    ano: z.coerce.number().int().min(1970).max(9999).optional(),
    contaId: z.coerce.number().int().positive().optional(),
  })
  .refine((q) => q.mes === undefined || q.ano !== undefined, {
    message: 'Informe o ano ao filtrar por mês',
    path: ['ano'],
  });
export type PeriodoQuery = z.infer<typeof periodoQuerySchema>;

const VALOR_MAXIMO = 99_999_999.99;

/** Filtros da listagem de transações; todos opcionais e combinados com "E". */
export const transacoesQuerySchema = z
  .object({
    mes: z.coerce.number().int().min(1).max(12).optional(),
    ano: z.coerce.number().int().min(1970).max(9999).optional(),
    busca: z.string().trim().max(150).optional(), // trecho da descrição
    categoriaId: z.coerce.number().int().positive().optional(),
    contaId: z.coerce.number().int().positive().optional(),
    tipo: tipoTransacaoSchema.optional(),
    valorMin: z.coerce.number().min(0).max(VALOR_MAXIMO).optional(),
    valorMax: z.coerce.number().min(0).max(VALOR_MAXIMO).optional(),
  })
  .refine((q) => q.mes === undefined || q.ano !== undefined, {
    message: 'Informe o ano ao filtrar por mês',
    path: ['ano'],
  })
  .refine((q) => q.valorMin === undefined || q.valorMax === undefined || q.valorMin <= q.valorMax, {
    message: 'O valor mínimo não pode ser maior que o máximo',
    path: ['valorMin'],
  });
export type TransacoesQuery = z.infer<typeof transacoesQuerySchema>;

export const LIMITE_EDICAO_EM_MASSA = 5000;

export const idsSchema = z
  .array(z.number().int().positive())
  .min(1, 'Selecione ao menos uma transação')
  .max(LIMITE_EDICAO_EM_MASSA, `Selecione no máximo ${LIMITE_EDICAO_EM_MASSA} transações por vez`)
  .transform((ids) => [...new Set(ids)]);

export const recategorizarTransacoesSchema = z.object({
  ids: idsSchema,
  categoriaId: z.number().int().positive(),
});
export type RecategorizarTransacoesDTO = z.infer<typeof recategorizarTransacoesSchema>;

export const excluirTransacoesSchema = z.object({ ids: idsSchema });
export type ExcluirTransacoesDTO = z.infer<typeof excluirTransacoesSchema>;

export interface ResultadoEdicaoEmMassa {
  afetadas: number;
}

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const linhaImportacaoSchema = criarTransacaoSchema.extend({
  idExterno: z.string().trim().min(1).max(100),
  // Pagamento de fatura e similares: vira transferência da conta importada para esta conta.
  contaDestinoId: z.number().int().positive().optional(),
});
export type LinhaImportacaoDTO = z.infer<typeof linhaImportacaoSchema>;

export const LIMITE_LINHAS_IMPORTACAO = 1000;

export const confirmarImportacaoSchema = z.object({
  transacoes: z.array(linhaImportacaoSchema).min(1).max(LIMITE_LINHAS_IMPORTACAO),
  // Conta de destino (sem ela, vale a reconhecida pelo arquivo ou a principal).
  contaId: z.number().int().positive().optional(),
  // Identificador do OFX: se a conta ainda não tem um, ela passa a ser reconhecida por ele.
  identificadorExterno: z.string().trim().min(1).max(100).optional(),
});
export type ConfirmarImportacaoDTO = z.infer<typeof confirmarImportacaoSchema>;

export interface LinhaPreview {
  idExterno: string;
  dataTransacao: string;
  descricao: string;
  valor: number;
  tipo: TipoTransacao;
  categoriaId: number;
  /** De onde veio a categoria sugerida; `termoSugestao` é o termo da regra do usuário, quando foi ela. */
  origemSugestao: OrigemSugestao;
  termoSugestao: string | null;
  duplicada: boolean;
  ignoradaSugerida: boolean;
  motivoIgnorada: string | null;
  /** Pagamento de fatura: dá para registrar como transferência para a conta do cartão. */
  pagamentoDeFatura: boolean;
}

export interface PreviewImportacao {
  origem: 'CONTA' | 'CARTAO';
  /** Banco/conta do arquivo; `null` se o OFX não traz. */
  identificadorExterno: string | null;
  /** Conta usada para achar duplicatas (a escolhida, a reconhecida ou a principal). */
  contaId: number;
  contaReconhecida: boolean;
  /** Para oferecer a criação de uma conta nova quando o arquivo não é reconhecido. */
  nomeContaSugerido: string;
  tipoContaSugerido: TipoConta;
  linhas: LinhaPreview[];
  /** Linhas de valor R$ 0,00 no arquivo (não são receita nem despesa), ignoradas automaticamente. */
  linhasIgnoradas: number;
}

export interface ResultadoImportacao {
  importadas: number;
  ignoradasPorDuplicidade: number;
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
  percentual: number; // 1 casa decimal; a soma da lista é 100
}

export interface DespesasPorCategoria {
  tipo: TipoTransacao;
  total: number;
  categorias: CategoriaTotal[];
}

export const evolucaoQuerySchema = z.object({
  ano: z.coerce.number().int().min(1970).max(9999).optional(),
  contaId: z.coerce.number().int().positive().optional(),
});

export const categoriasQuerySchema = z
  .object({
    mes: z.coerce.number().int().min(1).max(12).optional(),
    ano: z.coerce.number().int().min(1970).max(9999).optional(),
    tipo: tipoTransacaoSchema.default('DESPESA'),
    contaId: z.coerce.number().int().positive().optional(),
  })
  .refine((q) => q.mes === undefined || q.ano !== undefined, {
    message: 'Informe o ano ao filtrar por mês',
    path: ['ano'],
  });

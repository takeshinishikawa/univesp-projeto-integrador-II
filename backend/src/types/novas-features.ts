import { z } from 'zod';
import {
  anoNumeroSchema,
  anoSchema,
  dataIsoSchema,
  idsSchema,
  mesSchema,
  TIPOS_CONTA,
  TipoConta,
  TipoTransacao,
} from './index';

// ---- Contas e transferências

const nomeContaSchema = z
  .string()
  .trim()
  .min(1, 'Nome é obrigatório')
  .max(60, 'Use no máximo 60 caracteres');
const saldoInicialSchema = z.number().min(-99_999_999.99).max(99_999_999.99);
const identificadorContaSchema = z.string().trim().min(1).max(100);

export const criarContaSchema = z.object({
  nome: nomeContaSchema,
  tipo: z.enum(TIPOS_CONTA),
  saldoInicial: saldoInicialSchema.default(0),
  identificadorExterno: identificadorContaSchema.nullable().optional(),
});
export type CriarContaDTO = z.infer<typeof criarContaSchema>;

export const atualizarContaSchema = z
  .object({
    nome: nomeContaSchema.optional(),
    tipo: z.enum(TIPOS_CONTA).optional(),
    saldoInicial: saldoInicialSchema.optional(),
    identificadorExterno: identificadorContaSchema.nullable().optional(),
    arquivada: z.boolean().optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: 'Informe ao menos um campo para alterar',
  });
export type AtualizarContaDTO = z.infer<typeof atualizarContaSchema>;

export interface Conta {
  id: number;
  nome: string;
  tipo: TipoConta;
  saldoInicial: number;
  identificadorExterno: string | null;
  arquivada: boolean;
}

/** `saldo` = saldo inicial + receitas − despesas (transferências incluídas). No cartão, negativo = a pagar. */
export interface ContaComSaldo extends Conta {
  saldo: number;
  totalTransacoes: number;
}

export const criarTransferenciaSchema = z
  .object({
    contaOrigemId: z.number().int().positive(),
    contaDestinoId: z.number().int().positive(),
    valor: z.number().positive('Valor deve ser positivo').max(99_999_999.99),
    data: dataIsoSchema,
    descricao: z.string().trim().max(150).optional(),
  })
  .refine((t) => t.contaOrigemId !== t.contaDestinoId, {
    message: 'A conta de origem e a de destino devem ser diferentes',
    path: ['contaDestinoId'],
  });
export type CriarTransferenciaDTO = z.infer<typeof criarTransferenciaSchema>;

export const marcarTransferenciaSchema = z.object({ contaDestinoId: z.number().int().positive() });

export const moverParaContaSchema = z.object({
  ids: idsSchema,
  contaId: z.number().int().positive(),
});

export const transferenciaIdParamSchema = z.object({ transferenciaId: z.string().uuid() });

// ---- Insights

export type TipoInsight =
  | 'CATEGORIA_EM_ALTA'
  | 'CATEGORIA_EM_QUEDA'
  | 'MAIORES_DESPESAS'
  | 'VARIACAO_TOTAL_MES_ANTERIOR'
  | 'PROJECAO_FIM_DO_MES'
  | 'OUTROS_ALTO'
  | 'REAJUSTE_RECORRENTE'
  | 'ASSINATURA_NOVA';
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
  tipo: TipoInsight;
  severidade: SeveridadeInsight;
  titulo: string;
  texto: string;
  link: LinkInsight | null;
}

export const insightsQuerySchema = z.object({
  ano: anoSchema,
  mes: z.coerce.number().int().min(1).max(12),
});

// ---- Recorrentes

export type SituacaoRecorrencia = 'ATIVA' | 'POSSIVELMENTE_ENCERRADA';

export interface Recorrencia {
  chave: string; // descrição normalizada, sem números
  descricao: string; // a mais recente
  categoriaId: number;
  valorTipico: number; // mediana (ou média, se o valor varia)
  valorAtual: number;
  valorAnterior: number | null;
  variacaoPercentual: number | null; // do valor atual sobre o anterior; null se o valor é variável
  valorVariavel: boolean;
  periodicidade: 'MENSAL';
  ultimaData: string;
  proximaData: string;
  situacao: SituacaoRecorrencia;
  ocorrencias: number;
  ignorada: boolean;
}

export interface RecorrentesResumo {
  recorrencias: Recorrencia[];
  custoMensal: number;
  custoAnual: number;
  /** Ativas previstas para o mês corrente que ainda não tiveram lançamento. */
  comprometidoNoMes: { valor: number; quantidade: number };
}

export const recorrentesQuerySchema = z.object({
  ignoradas: z
    .enum(['true', 'false'])
    .default('false')
    .transform((valor) => valor === 'true'),
});
export const ignorarRecorrenciaSchema = z.object({ chave: z.string().trim().min(1).max(150) });
export const chaveRecorrenciaParamSchema = z.object({ chave: z.string().trim().min(1).max(150) });

// ---- Objetivos

export const MAXIMO_OBJETIVOS_ATIVOS = 20;

const valorObjetivoSchema = z
  .number()
  .positive('O valor deve ser maior que zero')
  .max(99_999_999.99);

const camposObjetivo = {
  nome: z.string().trim().min(1, 'Nome é obrigatório').max(60, 'Use no máximo 60 caracteres'),
  valorAlvo: valorObjetivoSchema,
  prazoAno: anoNumeroSchema,
  prazoMes: mesSchema,
};
export const criarObjetivoSchema = z.object({
  ...camposObjetivo,
  valorInicial: z.number().min(0).max(99_999_999.99).optional(),
});
export type CriarObjetivoDTO = z.infer<typeof criarObjetivoSchema>;
export const atualizarObjetivoSchema = z.object(camposObjetivo);
export type AtualizarObjetivoDTO = z.infer<typeof atualizarObjetivoSchema>;

export const criarAporteSchema = z.object({
  valor: valorObjetivoSchema,
  data: dataIsoSchema,
  observacao: z.string().trim().max(150).optional(),
});
export type CriarAporteDTO = z.infer<typeof criarAporteSchema>;

export const aporteParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  aporteId: z.coerce.number().int().positive(),
});

export type SituacaoObjetivo = 'NO_RITMO' | 'ATRASADO' | 'CONCLUIDO' | 'VENCIDO';

export interface AporteObjetivo {
  id: number;
  valor: number;
  data: string; // YYYY-MM-DD
  observacao: string | null;
}

export interface ObjetivoComProgresso {
  id: number;
  nome: string;
  valorAlvo: number;
  prazoAno: number;
  prazoMes: number;
  criadoEm: string; // YYYY-MM-DD
  concluidoEm: string | null;
  acumulado: number;
  percentual: number; // 1 casa decimal; pode passar de 100
  mesesRestantes: number; // pelo menos 1
  valorMensalNecessario: number; // 0 se já concluído
  guardarEsteMes: number; // o necessário menos o que já foi guardado no mês corrente
  situacao: SituacaoObjetivo;
  aportes: AporteObjetivo[]; // do mais recente para o mais antigo
}

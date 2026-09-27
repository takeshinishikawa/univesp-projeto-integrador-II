import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'API — Plataforma de Educação e Controle Financeiro Pessoal',
      version: '1.0.0',
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        TipoTransacao: { type: 'string', enum: ['RECEITA', 'DESPESA'] },
        Erro: {
          type: 'object',
          properties: { erro: { type: 'string' }, detalhes: {} },
        },
        UsuarioPublico: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nome: { type: 'string' },
            email: { type: 'string', format: 'email' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Categoria: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nome: { type: 'string' },
            tipo: { $ref: '#/components/schemas/TipoTransacao' },
            padrao: {
              type: 'boolean',
              description: 'true = categoria padrão (não editável); false = criada pelo usuário',
            },
          },
        },
        TransacaoEntrada: {
          type: 'object',
          required: ['categoriaId', 'descricao', 'valor', 'tipo', 'dataTransacao'],
          properties: {
            categoriaId: { type: 'integer' },
            descricao: { type: 'string', maxLength: 150 },
            valor: { type: 'number', minimum: 0.01 },
            tipo: { $ref: '#/components/schemas/TipoTransacao' },
            dataTransacao: { type: 'string', format: 'date', example: '2026-03-15' },
          },
        },
        Transacao: {
          allOf: [
            { $ref: '#/components/schemas/TransacaoEntrada' },
            {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                usuarioId: { type: 'integer' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          ],
        },
        LinhaImportacao: {
          allOf: [
            { $ref: '#/components/schemas/TransacaoEntrada' },
            {
              type: 'object',
              required: ['idExterno'],
              properties: {
                idExterno: { type: 'string', maxLength: 100, description: 'FITID do OFX' },
              },
            },
          ],
        },
        PreviewImportacao: {
          type: 'object',
          properties: {
            origem: { type: 'string', enum: ['CONTA', 'CARTAO'] },
            linhas: {
              type: 'array',
              items: {
                allOf: [
                  { $ref: '#/components/schemas/LinhaImportacao' },
                  {
                    type: 'object',
                    properties: {
                      duplicada: { type: 'boolean', description: 'Já importada por este usuário' },
                      ignoradaSugerida: {
                        type: 'boolean',
                        description: 'Pagamento de fatura ou transferência entre contas próprias',
                      },
                      motivoIgnorada: { type: 'string', nullable: true },
                      origemSugestao: {
                        type: 'string',
                        enum: ['REGRA_USUARIO', 'REGRA_PADRAO', 'FALLBACK'],
                        description: 'De onde veio a categoria sugerida',
                      },
                      termoSugestao: {
                        type: 'string',
                        nullable: true,
                        description: 'Termo da regra do usuário que decidiu a sugestão',
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        EvolucaoMensal: {
          type: 'object',
          properties: {
            ano: { type: 'integer' },
            meses: {
              type: 'array',
              minItems: 12,
              maxItems: 12,
              items: {
                type: 'object',
                properties: {
                  mes: { type: 'integer', minimum: 1, maximum: 12 },
                  totalReceitas: { type: 'number' },
                  totalDespesas: { type: 'number' },
                  saldo: { type: 'number' },
                  orcamentoLimite: {
                    type: 'number',
                    nullable: true,
                    description: 'Meta de gastos do mês; null = sem meta',
                  },
                },
              },
            },
          },
        },
        DespesasPorCategoria: {
          type: 'object',
          properties: {
            tipo: { $ref: '#/components/schemas/TipoTransacao' },
            total: { type: 'number' },
            categorias: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  categoriaId: { type: 'integer' },
                  categoria: { type: 'string' },
                  total: { type: 'number' },
                  percentual: { type: 'number', description: 'Uma casa decimal; a soma é 100' },
                },
              },
            },
          },
        },
        MetasDoAno: {
          type: 'object',
          properties: {
            ano: { type: 'integer' },
            meses: {
              type: 'array',
              minItems: 12,
              maxItems: 12,
              items: {
                type: 'object',
                properties: {
                  mes: { type: 'integer', minimum: 1, maximum: 12 },
                  orcamentoLimite: {
                    type: 'number',
                    nullable: true,
                    description:
                      'Soma das metas por categoria do mês (ou a meta total antiga, se o mês não tem meta por categoria)',
                  },
                  origem: {
                    type: 'string',
                    enum: ['CATEGORIAS', 'ANTIGA'],
                    nullable: true,
                    description: 'De onde vem a meta do mês; null quando não há meta',
                  },
                },
              },
            },
          },
        },
        Regra: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            categoriaId: { type: 'integer' },
            termo: {
              type: 'string',
              description: 'Normalizado: minúsculas, sem acento nem pontuação',
            },
          },
        },
        MesDoAno: {
          type: 'object',
          required: ['ano', 'mes'],
          properties: {
            ano: { type: 'integer' },
            mes: { type: 'integer', minimum: 1, maximum: 12 },
          },
        },
        SituacaoMeta: { type: 'string', enum: ['DENTRO', 'ATENCAO', 'ESTOURADA'] },
        MetaCategoriaDefinida: {
          type: 'object',
          properties: {
            ano: { type: 'integer' },
            mes: { type: 'integer' },
            categoriaId: { type: 'integer' },
            valor: { type: 'number', nullable: true },
          },
        },
        MetasCategoriaDoMes: {
          type: 'object',
          properties: {
            ano: { type: 'integer' },
            mes: { type: 'integer' },
            totalMetas: { type: 'number', description: 'Soma das metas por categoria do mês' },
            comMeta: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  categoriaId: { type: 'integer' },
                  categoria: { type: 'string' },
                  meta: { type: 'number' },
                  gasto: { type: 'number' },
                  percentual: {
                    type: 'number',
                    description: 'Uma casa decimal; pode passar de 100',
                  },
                  situacao: { $ref: '#/components/schemas/SituacaoMeta' },
                },
              },
            },
            semMeta: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  categoriaId: { type: 'integer' },
                  categoria: { type: 'string' },
                  gasto: { type: 'number' },
                },
              },
            },
          },
        },
        ResultadoCopiaMetas: {
          type: 'object',
          properties: {
            copiadas: { type: 'integer' },
            puladas: {
              type: 'integer',
              description: 'Metas que já existiam no destino e foram preservadas',
            },
            mesesPulados: { type: 'array', items: { $ref: '#/components/schemas/MesDoAno' } },
          },
        },
        ResultadoEdicaoEmMassa: {
          type: 'object',
          properties: { afetadas: { type: 'integer' } },
        },
        MetaDefinida: {
          type: 'object',
          properties: {
            ano: { type: 'integer' },
            mes: { type: 'integer', minimum: 1, maximum: 12 },
            orcamentoLimite: { type: 'number', nullable: true },
          },
        },
        ResumoFinanceiro: {
          type: 'object',
          properties: {
            totalReceitas: { type: 'number' },
            totalDespesas: { type: 'number' },
            saldoAtual: { type: 'number' },
            orcamentoLimite: {
              type: 'number',
              nullable: true,
              description: 'Meta de gastos do mês consultado; null sem meta ou no ano inteiro',
            },
            mesesAcimaDaMeta: {
              type: 'array',
              items: { type: 'integer' },
              description: 'Só no ano inteiro: meses cujas despesas passaram da meta do mês',
            },
            mesesComMeta: {
              type: 'integer',
              description: 'Só no ano inteiro: quantos meses do ano têm meta',
            },
            mesesComCategoriaEstourada: {
              type: 'array',
              items: { type: 'integer' },
              description:
                'Só no ano inteiro: meses em que alguma categoria passou da própria meta',
            },
            alertaOrcamentoEstourado: { type: 'boolean' },
            situacaoOrcamento: {
              type: 'string',
              enum: ['DENTRO', 'ATENCAO', 'ESTOURADA', 'SEM_META'],
              description:
                'Gasto em relação à meta total: atenção a partir de 80%, estourada acima de 100%',
            },
          },
        },
      },
    },
  },
  // glob exige barras normais, inclusive no Windows
  apis: [path.join(__dirname, '../routes/*.{ts,js}').replace(/\\/g, '/')],
});

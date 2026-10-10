import { Router } from 'express';
import { prisma } from '../config/database';
import { AuthController } from '../controllers/auth.controller';
import { CategoriaController } from '../controllers/categoria.controller';
import { DashboardController } from '../controllers/dashboard.controller';
import { MetaController } from '../controllers/meta.controller';
import { MetaCategoriaController } from '../controllers/meta-categoria.controller';
import { RegraController } from '../controllers/regra.controller';
import { ContaController } from '../controllers/conta.controller';
import { ImportacaoController } from '../controllers/importacao.controller';
import { ObjetivoController } from '../controllers/objetivo.controller';
import { RecorrenciaController } from '../controllers/recorrencia.controller';
import { TransacaoController } from '../controllers/transacao.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { limiteCadastro, limiteLogin } from '../middlewares/rate-limit';
import { uploadOfx } from '../middlewares/upload.middleware';
import { PrismaCategoriaRepository } from '../repositories/categoria.repository';
import { PrismaContaRepository } from '../repositories/conta.repository';
import { PrismaMetaRepository } from '../repositories/meta.repository';
import { PrismaObjetivoRepository } from '../repositories/objetivo.repository';
import { PrismaRecorrenciaRepository } from '../repositories/recorrencia.repository';
import { PrismaMetaCategoriaRepository } from '../repositories/meta-categoria.repository';
import { PrismaRegraRepository } from '../repositories/regra.repository';
import { PrismaTransacaoRepository } from '../repositories/transacao.repository';
import { PrismaUsuarioRepository } from '../repositories/usuario.repository';
import { AuthService } from '../services/auth.service';
import { CategoriaService } from '../services/categoria.service';
import { DashboardService } from '../services/dashboard.service';
import { ContaService } from '../services/conta.service';
import { ImportacaoService } from '../services/importacao.service';
import { InsightService } from '../services/insight.service';
import { ObjetivoService } from '../services/objetivo.service';
import { RecorrenciaService } from '../services/recorrencia.service';
import { TransferenciaService } from '../services/transferencia.service';
import { MetaService } from '../services/meta.service';
import { MetaCategoriaService } from '../services/meta-categoria.service';
import { RegraService } from '../services/regra.service';
import { TransacaoService } from '../services/transacao.service';

const usuarioRepository = new PrismaUsuarioRepository();
const categoriaRepository = new PrismaCategoriaRepository();
const transacaoRepository = new PrismaTransacaoRepository();
const metaRepository = new PrismaMetaRepository();
const metaCategoriaRepository = new PrismaMetaCategoriaRepository();
const regraRepository = new PrismaRegraRepository();
const contaRepository = new PrismaContaRepository();
const recorrenciaRepository = new PrismaRecorrenciaRepository();
const objetivoRepository = new PrismaObjetivoRepository();

const authController = new AuthController(new AuthService(usuarioRepository));
const categoriaController = new CategoriaController(new CategoriaService(categoriaRepository));
const transacaoController = new TransacaoController(
  new TransacaoService(transacaoRepository, categoriaRepository, contaRepository),
);
const dashboardController = new DashboardController(
  new DashboardService(
    transacaoRepository,
    metaRepository,
    categoriaRepository,
    metaCategoriaRepository,
  ),
);
const importacaoController = new ImportacaoController(
  new ImportacaoService(
    transacaoRepository,
    categoriaRepository,
    usuarioRepository,
    regraRepository,
    contaRepository,
  ),
);

const metaController = new MetaController(new MetaService(metaRepository, metaCategoriaRepository));
const metaCategoriaController = new MetaCategoriaController(
  new MetaCategoriaService(
    metaCategoriaRepository,
    metaRepository,
    categoriaRepository,
    transacaoRepository,
  ),
);
const recorrenciaService = new RecorrenciaService(transacaoRepository, recorrenciaRepository);
const recorrenciaController = new RecorrenciaController(
  recorrenciaService,
  new InsightService(
    transacaoRepository,
    categoriaRepository,
    metaRepository,
    metaCategoriaRepository,
    recorrenciaService,
  ),
);
const objetivoController = new ObjetivoController(new ObjetivoService(objetivoRepository));
const contaController = new ContaController(
  new ContaService(contaRepository),
  new TransferenciaService(transacaoRepository, contaRepository, categoriaRepository),
);
const regraController = new RegraController(
  new RegraService(regraRepository, categoriaRepository, transacaoRepository),
);

export const routes = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Autenticação]
 *     summary: Cadastra um novo usuário
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, email, senha]
 *             properties:
 *               nome: { type: string }
 *               email: { type: string, format: email }
 *               senha: { type: string, minLength: 8 }
 *     responses:
 *       201:
 *         description: Usuário criado (sem senhaHash)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UsuarioPublico' }
 *       400: { description: Dados inválidos }
 *       409: { description: E-mail já cadastrado }
 *       429: { description: Muitos cadastros a partir do mesmo IP }
 */
routes.post('/auth/register', limiteCadastro, authController.registrar);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Autenticação]
 *     summary: Autentica e retorna um JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, senha]
 *             properties:
 *               email: { type: string, format: email }
 *               senha: { type: string }
 *     responses:
 *       200:
 *         description: Token JWT e dados públicos do usuário
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 usuario: { $ref: '#/components/schemas/UsuarioPublico' }
 *       401: { description: Credenciais inválidas }
 *       429: { description: Muitas tentativas com erro a partir do mesmo IP }
 */
routes.post('/auth/login', limiteLogin, authController.login);

/**
 * @openapi
 * /auth/conta:
 *   delete:
 *     tags: [Autenticação]
 *     summary: Exclui a conta do usuário autenticado e todos os dados dele (LGPD, art. 18)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [senha]
 *             properties:
 *               senha: { type: string, description: Senha atual, para confirmar a exclusão }
 *     responses:
 *       204: { description: Conta e dados excluídos }
 *       401: { description: Não autenticado ou senha incorreta }
 */
routes.delete('/auth/conta', authMiddleware, limiteLogin, authController.excluirConta);

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Sistema]
 *     summary: Verifica se a API está de pé e consegue falar com o banco
 *     responses:
 *       200: { description: API e banco respondendo }
 *       500: { description: Banco indisponível }
 */
routes.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.status(200).json({ status: 'ok' });
});

routes.use('/categorias', authMiddleware);

/**
 * @openapi
 * /categorias:
 *   get:
 *     tags: [Categorias]
 *     summary: Lista as categorias padrão e as criadas pelo usuário autenticado
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de categorias
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Categoria' }
 *       401: { description: Não autenticado }
 */
routes.get('/categorias', categoriaController.listar);

/**
 * @openapi
 * /categorias:
 *   post:
 *     tags: [Categorias]
 *     summary: Cria uma categoria do usuário
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, tipo]
 *             properties:
 *               nome: { type: string, maxLength: 50 }
 *               tipo: { $ref: '#/components/schemas/TipoTransacao' }
 *     responses:
 *       201:
 *         description: Categoria criada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Categoria' }
 *       400: { description: Dados inválidos }
 *       409: { description: Já existe categoria com esse nome (sem diferenciar acento ou maiúsculas) }
 */
routes.post('/categorias', categoriaController.criar);

/**
 * @openapi
 * /categorias/{id}:
 *   put:
 *     tags: [Categorias]
 *     summary: Renomeia uma categoria do usuário
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome]
 *             properties:
 *               nome: { type: string, maxLength: 50 }
 *     responses:
 *       200:
 *         description: Categoria renomeada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Categoria' }
 *       403: { description: Categoria padrão não pode ser alterada }
 *       404: { description: Categoria não encontrada }
 *       409: { description: Já existe categoria com esse nome }
 */
routes.put('/categorias/:id', categoriaController.renomear);

/**
 * @openapi
 * /categorias/{id}:
 *   delete:
 *     tags: [Categorias]
 *     summary: Exclui uma categoria do usuário que não tenha transações
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Excluída }
 *       403: { description: Categoria padrão não pode ser excluída }
 *       404: { description: Categoria não encontrada }
 *       409: { description: Categoria em uso por transações }
 */
routes.delete('/categorias/:id', categoriaController.excluir);

routes.use('/transacoes', authMiddleware);

/**
 * @openapi
 * /transacoes:
 *   get:
 *     tags: [Transações]
 *     summary: Lista as transações do usuário autenticado
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: mes, schema: { type: integer, minimum: 1, maximum: 12 }, description: Requer ano }
 *       - { in: query, name: ano, schema: { type: integer } }
 *       - { in: query, name: busca, schema: { type: string, maxLength: 150 }, description: Trecho da descrição (sem diferenciar acento ou maiúsculas) }
 *       - { in: query, name: categoriaId, schema: { type: integer } }
 *       - { in: query, name: tipo, schema: { type: string, enum: [RECEITA, DESPESA] } }
 *       - { in: query, name: valorMin, schema: { type: number, minimum: 0 } }
 *       - { in: query, name: valorMax, schema: { type: number, minimum: 0 } }
 *     responses:
 *       200:
 *         description: Lista de transações (os filtros se combinam com "E")
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Transacao' }
 *       400: { description: Filtro inválido }
 *       401: { description: Não autenticado }
 */
routes.get('/transacoes', transacaoController.listar);

/**
 * @openapi
 * /transacoes/categoria:
 *   patch:
 *     tags: [Transações]
 *     summary: Move várias transações para outra categoria (edição em massa)
 *     description: Tudo ou nada. A categoria precisa ser do mesmo tipo (receita/despesa) de todas as transações.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids, categoriaId]
 *             properties:
 *               ids: { type: array, minItems: 1, maxItems: 5000, items: { type: integer } }
 *               categoriaId: { type: integer }
 *     responses:
 *       200:
 *         description: Quantas transações foram alteradas
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ResultadoEdicaoEmMassa' }
 *       400: { description: Dados inválidos, categoria inexistente ou de tipo diferente }
 *       401: { description: Não autenticado }
 *       404: { description: Alguma transação não existe (ou é de outro usuário); nada é alterado }
 */
routes.patch('/transacoes/categoria', transacaoController.recategorizar);

/**
 * @openapi
 * /transacoes/excluir:
 *   post:
 *     tags: [Transações]
 *     summary: Exclui várias transações de uma vez
 *     description: Tudo ou nada.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids: { type: array, minItems: 1, maxItems: 5000, items: { type: integer } }
 *     responses:
 *       200:
 *         description: Quantas transações foram excluídas
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ResultadoEdicaoEmMassa' }
 *       400: { description: Dados inválidos }
 *       401: { description: Não autenticado }
 *       404: { description: Alguma transação não existe (ou é de outro usuário); nada é excluído }
 */
routes.post('/transacoes/excluir', transacaoController.deletarVarias);

/**
 * @openapi
 * /transacoes:
 *   post:
 *     tags: [Transações]
 *     summary: Cria uma transação (receita ou despesa)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TransacaoEntrada' }
 *     responses:
 *       201:
 *         description: Transação criada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Transacao' }
 *       400: { description: Dados inválidos ou categoria inexistente }
 *       401: { description: Não autenticado }
 */
routes.post('/transacoes', transacaoController.criar);

/**
 * @openapi
 * /transacoes/{id}:
 *   put:
 *     tags: [Transações]
 *     summary: Atualiza uma transação do usuário
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TransacaoEntrada' }
 *     responses:
 *       200:
 *         description: Transação atualizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Transacao' }
 *       400: { description: Dados inválidos }
 *       401: { description: Não autenticado }
 *       404: { description: Não encontrada (ou de outro usuário) }
 */
routes.put('/transacoes/:id', transacaoController.atualizar);

/**
 * @openapi
 * /transacoes/{id}:
 *   delete:
 *     tags: [Transações]
 *     summary: Remove uma transação do usuário
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Removida }
 *       401: { description: Não autenticado }
 *       404: { description: Não encontrada (ou de outro usuário) }
 */
routes.delete('/transacoes/:id', transacaoController.deletar);

/**
 * @openapi
 * /dashboard/resumo:
 *   get:
 *     tags: [Dashboard]
 *     summary: Resumo financeiro (receitas, despesas, saldo e alerta de orçamento)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: mes, schema: { type: integer, minimum: 1, maximum: 12 }, description: Requer ano }
 *       - { in: query, name: ano, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Resumo do período (todo o histórico se sem filtro)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ResumoFinanceiro' }
 *       401: { description: Não autenticado }
 */
routes.get('/dashboard/resumo', authMiddleware, dashboardController.resumo);

/**
 * @openapi
 * /dashboard/evolucao:
 *   get:
 *     tags: [Dashboard]
 *     summary: Evolução mensal (receitas, despesas e saldo) dos 12 meses de um ano
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: ano, schema: { type: integer }, description: Padrão, o ano corrente }
 *     responses:
 *       200:
 *         description: Sempre 12 itens; meses sem lançamento vêm zerados
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/EvolucaoMensal' }
 *       400: { description: Ano inválido }
 *       401: { description: Não autenticado }
 */
routes.get('/dashboard/evolucao', authMiddleware, dashboardController.evolucao);

/**
 * @openapi
 * /dashboard/categorias:
 *   get:
 *     tags: [Dashboard]
 *     summary: Total por categoria (despesas por padrão), do maior para o menor
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: mes, schema: { type: integer, minimum: 1, maximum: 12 }, description: Requer ano }
 *       - { in: query, name: ano, schema: { type: integer } }
 *       - { in: query, name: tipo, schema: { $ref: '#/components/schemas/TipoTransacao', default: DESPESA } }
 *     responses:
 *       200:
 *         description: Categorias com lançamentos no período (todo o histórico se sem filtro)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/DespesasPorCategoria' }
 *       400: { description: Filtro inválido }
 *       401: { description: Não autenticado }
 */
routes.get('/dashboard/categorias', authMiddleware, dashboardController.categorias);

/**
 * @openapi
 * /importacoes/preview:
 *   post:
 *     tags: [Importação]
 *     summary: Lê um arquivo OFX (extrato ou fatura) e sugere categorias, sem gravar nada
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [arquivo]
 *             properties:
 *               arquivo: { type: string, format: binary, description: 'Arquivo .ofx de até 2 MB' }
 *     responses:
 *       200:
 *         description: Linhas do arquivo com categoria sugerida
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PreviewImportacao' }
 *       400: { description: Arquivo ausente, sem extensão .ofx ou que não é OFX }
 *       401: { description: Não autenticado }
 *       413: { description: Arquivo maior que 2 MB }
 *       422: { description: OFX sem transações, com valores/datas inválidos ou com mais de 1.000 lançamentos }
 */
routes.post('/importacoes/preview', authMiddleware, uploadOfx, importacaoController.preview);

/**
 * @openapi
 * /importacoes/confirmar:
 *   post:
 *     tags: [Importação]
 *     summary: Grava as transações revisadas (as já importadas são ignoradas)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [transacoes]
 *             properties:
 *               transacoes:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 1000
 *                 items: { $ref: '#/components/schemas/LinhaImportacao' }
 *     responses:
 *       200:
 *         description: Quantidade gravada e quantidade ignorada por já existir
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 importadas: { type: integer }
 *                 ignoradasPorDuplicidade: { type: integer }
 *       400: { description: Dados inválidos, categoria inexistente ou de outro tipo }
 *       401: { description: Não autenticado }
 *       413: { description: Corpo da requisição grande demais }
 */
routes.post('/importacoes/confirmar', authMiddleware, importacaoController.confirmar);

/**
 * @openapi
 * /metas:
 *   get:
 *     tags: [Metas]
 *     summary: Metas de gastos de cada mês do ano
 *     description: >
 *       A meta do mês é a soma das metas por categoria (`origem: CATEGORIAS`). Só onde o mês não tem
 *       meta por categoria vale a meta total antiga (`origem: ANTIGA`), se existir.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: ano, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Os 12 meses do ano, com a meta (ou null quando não há)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MetasDoAno' }
 *       400: { description: Ano inválido ou ausente }
 *       401: { description: Não autenticado }
 */
routes.get('/metas', authMiddleware, metaController.obterAno);

/**
 * @openapi
 * /metas:
 *   put:
 *     tags: [Metas]
 *     summary: Define ou remove a meta total antiga de um mês
 *     description: >
 *       Legado: a meta do mês agora é a soma das metas por categoria (PUT /metas/categorias). Este
 *       valor só é usado nos meses sem meta por categoria; a tela usa esta rota apenas para removê-lo.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ano, mes, orcamentoLimite]
 *             properties:
 *               ano: { type: integer }
 *               mes: { type: integer, minimum: 1, maximum: 12 }
 *               orcamentoLimite: { type: number, nullable: true, description: 'null remove a meta do mês' }
 *     responses:
 *       200:
 *         description: Meta do mês após a alteração
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MetaDefinida' }
 *       400: { description: Dados inválidos }
 *       401: { description: Não autenticado }
 */
routes.put('/metas', authMiddleware, metaController.definir);

/**
 * @openapi
 * /metas/categorias:
 *   get:
 *     tags: [Metas]
 *     summary: Metas por categoria de um mês, com o gasto e a situação de cada uma
 *     description: >
 *       Situação: DENTRO (até 79% da meta), ATENCAO (de 80% até 100%) e ESTOURADA (acima de 100%).
 *       `comMeta` vem das mais próximas de estourar para as menos; `semMeta` lista as demais
 *       categorias de despesa com o gasto do mês.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: ano, required: true, schema: { type: integer } }
 *       - { in: query, name: mes, required: true, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     responses:
 *       200:
 *         description: Metas por categoria do mês
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MetasCategoriaDoMes' }
 *       400: { description: Ano ou mês inválido ou ausente }
 *       401: { description: Não autenticado }
 */
routes.get('/metas/categorias', authMiddleware, metaCategoriaController.obterDoMes);

/**
 * @openapi
 * /metas/categorias:
 *   put:
 *     tags: [Metas]
 *     summary: Define ou remove a meta de uma categoria de despesa em um mês
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ano, mes, categoriaId, valor]
 *             properties:
 *               ano: { type: integer }
 *               mes: { type: integer, minimum: 1, maximum: 12 }
 *               categoriaId: { type: integer }
 *               valor: { type: number, nullable: true, description: 'null remove a meta da categoria no mês' }
 *     responses:
 *       200:
 *         description: Meta da categoria após a alteração
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MetaCategoriaDefinida' }
 *       400: { description: Dados inválidos, categoria inexistente ou que não é de despesa }
 *       401: { description: Não autenticado }
 */
routes.put('/metas/categorias', authMiddleware, metaCategoriaController.definir);

/**
 * @openapi
 * /metas/copiar:
 *   post:
 *     tags: [Metas]
 *     summary: Copia as metas de um mês (total e/ou por categoria) para outros meses
 *     description: >
 *       Sem `sobrescrever`, o que já existe no destino é preservado e os meses em que isso
 *       aconteceu voltam em `mesesPulados`.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [origem, destino, incluir]
 *             properties:
 *               origem: { $ref: '#/components/schemas/MesDoAno' }
 *               destino: { type: array, minItems: 1, maxItems: 24, items: { $ref: '#/components/schemas/MesDoAno' } }
 *               incluir: { type: string, enum: [TOTAL, CATEGORIAS, AMBAS] }
 *               sobrescrever: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Quantas metas foram copiadas e quantas foram preservadas
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ResultadoCopiaMetas' }
 *       400: { description: Dados inválidos, origem sem metas ou origem também como destino }
 *       401: { description: Não autenticado }
 */
routes.post('/metas/copiar', authMiddleware, metaCategoriaController.copiar);

routes.use('/regras', authMiddleware);

/**
 * @openapi
 * /regras:
 *   get:
 *     tags: [Regras de categorização]
 *     summary: Lista as regras do usuário (descrição contém o termo → categoria)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Regras, da mais recente para a mais antiga
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Regra' }
 *       401: { description: Não autenticado }
 */
routes.get('/regras', regraController.listar);

/**
 * @openapi
 * /regras:
 *   post:
 *     tags: [Regras de categorização]
 *     summary: Cria uma regra
 *     description: >
 *       O termo é guardado normalizado (minúsculas, sem acento nem pontuação). Nas importações,
 *       a regra do usuário vale antes das regras fixas; se várias casarem, vence a de termo mais longo.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [termo, categoriaId]
 *             properties:
 *               termo: { type: string, minLength: 3, maxLength: 100 }
 *               categoriaId: { type: integer }
 *     responses:
 *       201:
 *         description: Regra criada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Regra' }
 *       400: { description: Termo curto demais ou categoria inexistente }
 *       401: { description: Não autenticado }
 *       409: { description: Já existe regra com esse termo }
 */
routes.post('/regras', regraController.criar);

/**
 * @openapi
 * /regras/aplicar:
 *   post:
 *     tags: [Regras de categorização]
 *     summary: Aplica uma regra às transações que já existem
 *     description: Move para a categoria da regra as transações do mesmo tipo cuja descrição contém o termo.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [regraId]
 *             properties:
 *               regraId: { type: integer }
 *     responses:
 *       200:
 *         description: Quantas transações mudaram de categoria
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ResultadoEdicaoEmMassa' }
 *       400: { description: Dados inválidos }
 *       401: { description: Não autenticado }
 *       404: { description: Regra não encontrada }
 */
routes.post('/regras/aplicar', regraController.aplicar);

/**
 * @openapi
 * /regras/{id}:
 *   put:
 *     tags: [Regras de categorização]
 *     summary: Altera o termo e/ou a categoria de uma regra
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               termo: { type: string, minLength: 3, maxLength: 100 }
 *               categoriaId: { type: integer }
 *     responses:
 *       200:
 *         description: Regra atualizada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Regra' }
 *       400: { description: Dados inválidos, termo curto ou categoria inexistente }
 *       404: { description: Regra não encontrada }
 *       409: { description: Já existe regra com esse termo }
 */
routes.put('/regras/:id', regraController.atualizar);

/**
 * @openapi
 * /regras/{id}:
 *   delete:
 *     tags: [Regras de categorização]
 *     summary: Exclui uma regra (as transações já classificadas não mudam)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Excluída }
 *       404: { description: Regra não encontrada }
 */
routes.delete('/regras/:id', regraController.excluir);

/**
 * @openapi
 * /transacoes/conta:
 *   patch:
 *     tags: [Contas]
 *     summary: Move várias transações para outra conta (tudo ou nada)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids, contaId]
 *             properties:
 *               ids: { type: array, items: { type: integer }, minItems: 1 }
 *               contaId: { type: integer }
 *     responses:
 *       200: { description: 'Quantidade movida ({ afetadas })' }
 *       400: { description: Conta inexistente ou seleção com transferências }
 *       404: { description: Alguma transação não foi encontrada }
 *       409: { description: Alguma transação já existe na conta de destino }
 */
routes.patch('/transacoes/conta', transacaoController.moverParaConta);

/**
 * @openapi
 * /transacoes/{id}/transferencia:
 *   post:
 *     tags: [Contas]
 *     summary: 'Marca uma transação existente (ex.: pagamento de fatura) como transferência para outra conta'
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contaDestinoId]
 *             properties:
 *               contaDestinoId: { type: integer }
 *     responses:
 *       200: { description: 'Transferência criada ({ transferenciaId })' }
 *       400: { description: Conta inexistente ou igual à da transação }
 *       404: { description: Transação não encontrada }
 *       409: { description: A transação já é uma transferência }
 */
routes.post('/transacoes/:id/transferencia', contaController.marcarComoTransferencia);

routes.use('/contas', authMiddleware);

/**
 * @openapi
 * /contas:
 *   get:
 *     tags: [Contas]
 *     summary: Contas do usuário com o saldo atual (no cartão, saldo negativo = a pagar)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de contas com `saldo` e `totalTransacoes` }
 */
routes.get('/contas', contaController.listar);

/**
 * @openapi
 * /contas:
 *   post:
 *     tags: [Contas]
 *     summary: Cria uma conta
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, tipo]
 *             properties:
 *               nome: { type: string, maxLength: 60 }
 *               tipo: { type: string, enum: [CONTA_CORRENTE, CARTAO_CREDITO, DINHEIRO, OUTRA] }
 *               saldoInicial: { type: number, default: 0 }
 *               identificadorExterno: { type: string, nullable: true, description: Banco/conta do OFX }
 *     responses:
 *       201: { description: Conta criada }
 *       400: { description: Dados inválidos }
 *       409: { description: Nome ou identificador já usado }
 */
routes.post('/contas', contaController.criar);

/**
 * @openapi
 * /contas/{id}:
 *   put:
 *     tags: [Contas]
 *     summary: Edita ou arquiva uma conta
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome: { type: string }
 *               tipo: { type: string, enum: [CONTA_CORRENTE, CARTAO_CREDITO, DINHEIRO, OUTRA] }
 *               saldoInicial: { type: number }
 *               identificadorExterno: { type: string, nullable: true }
 *               arquivada: { type: boolean }
 *     responses:
 *       200: { description: Conta atualizada }
 *       404: { description: Conta não encontrada }
 *       409: { description: Nome repetido ou última conta ativa }
 */
routes.put('/contas/:id', contaController.atualizar);

/**
 * @openapi
 * /contas/{id}:
 *   delete:
 *     tags: [Contas]
 *     summary: Exclui uma conta sem transações
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Excluída }
 *       404: { description: Conta não encontrada }
 *       409: { description: A conta tem transações (a resposta informa quantas) ou é a única ativa }
 */
routes.delete('/contas/:id', contaController.excluir);

routes.use('/transferencias', authMiddleware);

/**
 * @openapi
 * /transferencias:
 *   post:
 *     tags: [Contas]
 *     summary: Registra uma transferência entre contas (não entra em receitas, despesas, metas nem gráficos)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contaOrigemId, contaDestinoId, valor, data]
 *             properties:
 *               contaOrigemId: { type: integer }
 *               contaDestinoId: { type: integer }
 *               valor: { type: number }
 *               data: { type: string, format: date }
 *               descricao: { type: string }
 *     responses:
 *       201: { description: 'Criada ({ transferenciaId })' }
 *       400: { description: Contas iguais, inexistentes ou dados inválidos }
 */
routes.post('/transferencias', contaController.criarTransferencia);

/**
 * @openapi
 * /transferencias/{transferenciaId}:
 *   delete:
 *     tags: [Contas]
 *     summary: Exclui uma transferência (as duas pontas)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: transferenciaId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Excluída }
 *       404: { description: Transferência não encontrada }
 */
routes.delete('/transferencias/:transferenciaId', contaController.excluirTransferencia);

/**
 * @openapi
 * /dashboard/insights:
 *   get:
 *     tags: [Dashboard]
 *     summary: Até 5 frases sobre o mês, geradas por regras (sem IA), cada uma com o filtro de Transações que abre
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: ano, required: true, schema: { type: integer } }
 *       - { in: query, name: mes, required: true, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     responses:
 *       200: { description: 'Lista de insights ({ id, tipo, severidade, titulo, texto, link })' }
 *       400: { description: Ano ou mês inválido }
 */
routes.get('/dashboard/insights', authMiddleware, recorrenciaController.insightsDoMes);

/**
 * @openapi
 * /dashboard/objetivos-resumo:
 *   get:
 *     tags: [Objetivos]
 *     summary: Objetivos ainda não concluídos, com progresso e quanto guardar este mês
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de objetivos com progresso }
 */
routes.get('/dashboard/objetivos-resumo', authMiddleware, objetivoController.resumo);

routes.use('/recorrentes', authMiddleware);

/**
 * @openapi
 * /recorrentes:
 *   get:
 *     tags: [Recorrentes]
 *     summary: Gastos que se repetem todo mês, com custo mensal/anual e o já comprometido no mês
 *     description: >
 *       Detecta despesas com a mesma descrição (sem números) em 3 ou mais meses, com intervalos de 25 a
 *       35 dias. Valores dentro de ±15% da mediana são "valor fixo"; fora disso, "valor variável".
 *       Não cria transações futuras.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: ignoradas, schema: { type: boolean, default: false }, description: Inclui as marcadas como "não é recorrente" }
 *     responses:
 *       200: { description: '{ recorrencias, custoMensal, custoAnual, comprometidoNoMes }' }
 */
routes.get('/recorrentes', recorrenciaController.listar);

/**
 * @openapi
 * /recorrentes/ignorar:
 *   post:
 *     tags: [Recorrentes]
 *     summary: Marca uma recorrência como "isso não é recorrente"
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [chave]
 *             properties:
 *               chave: { type: string }
 *     responses:
 *       200: { description: 'Marcada ({ chave })' }
 */
routes.post('/recorrentes/ignorar', recorrenciaController.ignorar);

/**
 * @openapi
 * /recorrentes/ignorar/{chave}:
 *   delete:
 *     tags: [Recorrentes]
 *     summary: Desfaz o "não é recorrente"
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: chave, required: true, schema: { type: string } }
 *     responses:
 *       204: { description: Desfeito }
 */
routes.delete('/recorrentes/ignorar/:chave', recorrenciaController.desfazer);

routes.use('/objetivos', authMiddleware);

/**
 * @openapi
 * /objetivos:
 *   get:
 *     tags: [Objetivos]
 *     summary: Objetivos de reserva com progresso, valor mensal necessário, situação e aportes
 *     description: 'Situação: NO_RITMO, ATRASADO, CONCLUIDO ou VENCIDO.'
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Lista de objetivos }
 */
routes.get('/objetivos', objetivoController.listar);

/**
 * @openapi
 * /objetivos:
 *   post:
 *     tags: [Objetivos]
 *     summary: Cria um objetivo (nome, valor-alvo, prazo por mês/ano e valor inicial opcional)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, valorAlvo, prazoAno, prazoMes]
 *             properties:
 *               nome: { type: string, maxLength: 60 }
 *               valorAlvo: { type: number }
 *               prazoAno: { type: integer }
 *               prazoMes: { type: integer, minimum: 1, maximum: 12 }
 *               valorInicial: { type: number }
 *     responses:
 *       201: { description: Objetivo criado }
 *       400: { description: Dados inválidos ou prazo anterior ao mês atual }
 *       409: { description: Limite de 20 objetivos ativos }
 */
routes.post('/objetivos', objetivoController.criar);

/**
 * @openapi
 * /objetivos/{id}:
 *   put:
 *     tags: [Objetivos]
 *     summary: Edita nome, valor-alvo e prazo
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Objetivo atualizado }
 *       404: { description: Objetivo não encontrado }
 */
routes.put('/objetivos/:id', objetivoController.atualizar);

/**
 * @openapi
 * /objetivos/{id}:
 *   delete:
 *     tags: [Objetivos]
 *     summary: Exclui o objetivo e os aportes dele
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Excluído }
 *       404: { description: Objetivo não encontrado }
 */
routes.delete('/objetivos/:id', objetivoController.excluir);

/**
 * @openapi
 * /objetivos/{id}/aportes:
 *   post:
 *     tags: [Objetivos]
 *     summary: Registra quanto foi guardado (aporte manual)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [valor, data]
 *             properties:
 *               valor: { type: number }
 *               data: { type: string, format: date }
 *               observacao: { type: string }
 *     responses:
 *       201: { description: Objetivo com o aporte já somado }
 *       404: { description: Objetivo não encontrado }
 */
routes.post('/objetivos/:id/aportes', objetivoController.guardar);

/**
 * @openapi
 * /objetivos/{id}/aportes/{aporteId}:
 *   delete:
 *     tags: [Objetivos]
 *     summary: Desfaz um aporte
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: path, name: aporteId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Objetivo sem o aporte }
 *       404: { description: Objetivo ou aporte não encontrado }
 */
routes.delete('/objetivos/:id/aportes/:aporteId', objetivoController.desfazerAporte);

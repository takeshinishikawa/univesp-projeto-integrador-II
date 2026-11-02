/**
 * Cria contas de demonstração com os extratos e faturas fictícios de tests/fixtures/, para o teste
 * com a comunidade: ninguém precisa digitar dados financeiros reais (ver TCLE).
 *
 *   DEMO_SENHA=<senha> npm run demo:criar                 # cria demo1@financas.demo
 *   DEMO_SENHA=<senha> npm run demo:criar -- --quantidade 5   # demo1 ... demo5
 *
 * Contra o banco publicado, rode na sua máquina com DATABASE_URL apontando para ele.
 * Os lançamentos são deslocados para que o último mês dos arquivos (set/2026) caia no mês atual,
 * e os que ficariam no futuro são descartados; assim o Resumo abre com dados. Use --sem-deslocar
 * para manter as datas originais.
 * Cada conta também ganha metas por categoria (mês atual e os 3 anteriores, a partir da média de gastos)
 * e três objetivos: um no ritmo, um atrasado e um concluído.
 * Contas que já existem são mantidas como estão (apague antes com `npm run demo:limpar`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/config/database';
import { PrismaCategoriaRepository } from '../src/repositories/categoria.repository';
import { PrismaContaRepository } from '../src/repositories/conta.repository';
import { PrismaMetaCategoriaRepository } from '../src/repositories/meta-categoria.repository';
import { PrismaRegraRepository } from '../src/repositories/regra.repository';
import { PrismaTransacaoRepository } from '../src/repositories/transacao.repository';
import { PrismaUsuarioRepository } from '../src/repositories/usuario.repository';
import { AuthService } from '../src/services/auth.service';
import { ImportacaoService } from '../src/services/importacao.service';
import { confirmarImportacaoSchema } from '../src/types';
import { dataLocalIso, somarMeses } from '../src/utils/datas';

export const DOMINIO_DEMO = 'financas.demo';
// O mesmo titular dos OFX: assim os aportes entre contas próprias são reconhecidos e desmarcados.
const NOME_DEMO = 'Usuario Teste';
// Último mês coberto pelos arquivos fictícios.
const ULTIMO_MES_FIXTURES = { ano: 2026, mes: 9 };

const FIXTURES = path.resolve(__dirname, '..', 'tests', 'fixtures');
const EXTRATO_COMPLETO = 'NU_123456789_01JAN2026_25SET2026.ofx';

function lerArgumentos(argv: string[]) {
  const indice = argv.indexOf('--quantidade');
  const quantidade = indice >= 0 ? Number(argv[indice + 1]) : 1;
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 20) {
    throw new Error('--quantidade deve ser um número inteiro de 1 a 20');
  }
  return { quantidade, deslocar: !argv.includes('--sem-deslocar') };
}

function arquivos(pasta: string): string[] {
  return readdirSync(path.join(FIXTURES, pasta))
    .filter((nome) => nome.endsWith('.ofx') && nome !== EXTRATO_COMPLETO)
    .sort()
    .map((nome) => path.join(FIXTURES, pasta, nome));
}

interface AnoMes {
  ano: number;
  mes: number;
}

function deslocarMes({ ano, mes }: AnoMes, n: number): AnoMes {
  const indice = ano * 12 + (mes - 1) + n;
  return { ano: Math.floor(indice / 12), mes: (indice % 12) + 1 };
}

const inicioDoMes = ({ ano, mes }: AnoMes): Date => new Date(Date.UTC(ano, mes - 1, 1));

/**
 * Meta de cada categoria de despesa = média dos 3 meses anteriores ao mês da meta + 10%, arredondada
 * para cima em múltiplos de 50. Como os gastos variam, umas ficam dentro, outras em atenção ou estouradas.
 */
async function criarMetas(usuarioId: number, atual: AnoMes): Promise<number> {
  const metas = new PrismaMetaCategoriaRepository();
  let criadas = 0;
  for (let i = -3; i <= 0; i++) {
    const mesMeta = deslocarMes(atual, i);
    const gastos = await prisma.transacao.groupBy({
      by: ['categoriaId'],
      where: {
        usuarioId,
        tipo: 'DESPESA',
        transferenciaId: null,
        dataTransacao: { gte: inicioDoMes(deslocarMes(mesMeta, -3)), lt: inicioDoMes(mesMeta) },
      },
      _sum: { valor: true },
    });
    for (const { categoriaId, _sum } of gastos) {
      const media = (_sum.valor?.toNumber() ?? 0) / 3;
      if (media < 30) continue;
      const valor = Math.ceil((media * 1.1) / 50) * 50;
      await metas.definir(usuarioId, mesMeta.ano, mesMeta.mes, categoriaId, valor);
      criadas++;
    }
  }
  return criadas;
}

/**
 * Objetivos gravados direto no banco para poder datar a criação no passado: é ela que define o ritmo
 * esperado (no ritmo ou atrasado), e pelo serviço todo objetivo nasceria hoje.
 */
async function criarObjetivos(usuarioId: number, atual: AnoMes): Promise<number> {
  const exemplos = [
    // Guardou 6 x R$ 1.000 de 13 meses: acima da linha reta até o prazo.
    {
      nome: 'Reserva de emergência',
      valorAlvo: 12000,
      criado: -5,
      prazo: 8,
      aportes: [1000, 1000, 1000, 1000, 1000, 1000],
    },
    // Guardou R$ 800 de R$ 6.000 na metade do prazo.
    { nome: 'Viagem de férias', valorAlvo: 6000, criado: -4, prazo: 4, aportes: [500, 300] },
    {
      nome: 'Notebook novo',
      valorAlvo: 3500,
      criado: -6,
      prazo: -1,
      aportes: [1000, 1000, 1000, 500],
    },
  ];
  for (const exemplo of exemplos) {
    const criadoEm = inicioDoMes(deslocarMes(atual, exemplo.criado));
    const prazo = deslocarMes(atual, exemplo.prazo);
    const datas = exemplo.aportes.map((_, i) => {
      const data = new Date(criadoEm);
      data.setUTCMonth(data.getUTCMonth() + i, 5);
      return data;
    });
    const total = exemplo.aportes.reduce((soma, valor) => soma + valor, 0);
    await prisma.objetivo.create({
      data: {
        usuarioId,
        nome: exemplo.nome,
        valorAlvo: exemplo.valorAlvo,
        prazoAno: prazo.ano,
        prazoMes: prazo.mes,
        createdAt: criadoEm,
        concluidoEm: total >= exemplo.valorAlvo ? datas[datas.length - 1] : null,
        aportes: {
          create: exemplo.aportes.map((valor, i) => ({ valor, data: datas[i] })),
        },
      },
    });
  }
  return exemplos.length;
}

async function main(): Promise<void> {
  const senha = process.env.DEMO_SENHA;
  if (!senha || senha.length < 8) {
    throw new Error('Defina DEMO_SENHA (mínimo de 8 caracteres) com a senha das contas demo');
  }
  const { quantidade, deslocar } = lerArgumentos(process.argv.slice(2));

  const hoje = dataLocalIso(new Date());
  const [anoHoje, mesHoje] = hoje.split('-').map(Number);
  const meses = deslocar
    ? anoHoje * 12 + mesHoje - (ULTIMO_MES_FIXTURES.ano * 12 + ULTIMO_MES_FIXTURES.mes)
    : 0;

  const usuarios = new PrismaUsuarioRepository();
  const contas = new PrismaContaRepository();
  const auth = new AuthService(usuarios);
  const importacao = new ImportacaoService(
    new PrismaTransacaoRepository(),
    new PrismaCategoriaRepository(),
    usuarios,
    new PrismaRegraRepository(),
    contas,
  );

  for (let i = 1; i <= quantidade; i++) {
    const email = `demo${i}@${DOMINIO_DEMO}`;
    if (await usuarios.buscarPorEmail(email)) {
      console.log(`${email}: já existe, mantida.`);
      continue;
    }

    const { id: usuarioId } = await auth.registrar({ nome: NOME_DEMO, email, senha });
    const corrente = await contas.criar(usuarioId, {
      nome: 'Conta Nubank',
      tipo: 'CONTA_CORRENTE',
      saldoInicial: 5000,
    });
    const cartao = await contas.criar(usuarioId, {
      nome: 'Cartão Nubank',
      tipo: 'CARTAO_CREDITO',
      saldoInicial: 0,
    });

    let total = 0;
    const lotes = [
      { contaId: corrente.id, lista: arquivos('extratos') },
      { contaId: cartao.id, lista: arquivos('faturas') },
    ];
    for (const { contaId, lista } of lotes) {
      for (const arquivo of lista) {
        const preview = await importacao.gerarPreview(usuarioId, readFileSync(arquivo), contaId);
        // O mesmo filtro da tela de revisão: só as linhas novas e não desmarcadas.
        const linhas = preview.linhas
          .filter((linha) => !linha.duplicada && !linha.ignoradaSugerida)
          .map((linha) => ({ ...linha, dataTransacao: somarMeses(linha.dataTransacao, meses) }))
          .filter((linha) => linha.dataTransacao <= hoje);
        if (linhas.length === 0) continue;

        const dto = confirmarImportacaoSchema.parse({
          transacoes: linhas,
          contaId,
          identificadorExterno: preview.identificadorExterno ?? undefined,
        });
        total += (await importacao.confirmar(usuarioId, dto)).importadas;
      }
    }
    const atual = { ano: anoHoje, mes: mesHoje };
    const metas = await criarMetas(usuarioId, atual);
    const objetivos = await criarObjetivos(usuarioId, atual);
    console.log(
      `${email}: criada com ${total} transações, ${metas} metas por categoria e ${objetivos} objetivos.`,
    );
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

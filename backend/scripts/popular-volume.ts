/**
 * Cria a conta volume@financas.demo com muitos lançamentos fictícios, para o teste de volume
 * (testes-carga/volume.js). Os lançamentos se espalham pelos últimos meses, com as categorias
 * padrão, e o usuário sai junto com as contas demo em `npm run demo:limpar -- --confirmar`.
 *
 *   DEMO_SENHA=<senha> npm run carga:volume                          # 20.000 em 60 meses
 *   DEMO_SENHA=<senha> npm run carga:volume -- --transacoes 50000 --meses 120
 *
 * Se a conta já existir, ela é apagada e recriada.
 */
import { prisma } from '../src/config/database';
import { PrismaContaRepository } from '../src/repositories/conta.repository';
import { PrismaUsuarioRepository } from '../src/repositories/usuario.repository';
import { AuthService } from '../src/services/auth.service';
import { dataLocalIso, somarMeses } from '../src/utils/datas';
import { DOMINIO_DEMO } from './contas-demo';

export const EMAIL_VOLUME = `volume@${DOMINIO_DEMO}`;
const LOTE = 2000;
const DESCRICOES = ['Mercado', 'Uber', 'Farmácia', 'Padaria', 'Restaurante', 'Streaming', 'Posto'];

function lerNumero(argv: string[], nome: string, padrao: number, maximo: number): number {
  const indice = argv.indexOf(nome);
  const valor = indice >= 0 ? Number(argv[indice + 1]) : padrao;
  if (!Number.isInteger(valor) || valor < 1 || valor > maximo) {
    throw new Error(`${nome} deve ser um número inteiro de 1 a ${maximo}`);
  }
  return valor;
}

async function main(): Promise<void> {
  const senha = process.env.DEMO_SENHA;
  if (!senha || senha.length < 8) {
    throw new Error('Defina DEMO_SENHA (mínimo de 8 caracteres) com a senha da conta de volume');
  }
  const argv = process.argv.slice(2);
  const quantidade = lerNumero(argv, '--transacoes', 20_000, 200_000);
  const meses = lerNumero(argv, '--meses', 60, 240);

  const existente = await prisma.usuario.findUnique({ where: { email: EMAIL_VOLUME } });
  if (existente) {
    await prisma.$transaction([
      prisma.transacao.deleteMany({ where: { usuarioId: existente.id } }),
      prisma.usuario.delete({ where: { id: existente.id } }),
    ]);
  }

  const usuarios = new PrismaUsuarioRepository();
  const { id: usuarioId } = await new AuthService(usuarios).registrar({
    nome: 'Usuario Volume',
    email: EMAIL_VOLUME,
    senha,
  });
  const conta = await new PrismaContaRepository().criar(usuarioId, {
    nome: 'Conta principal',
    tipo: 'CONTA_CORRENTE',
    saldoInicial: 0,
  });
  const categorias = await prisma.categoria.findMany({ where: { usuarioId: null } });
  const despesas = categorias.filter((c) => c.tipo === 'DESPESA');
  const receita = categorias.find((c) => c.tipo === 'RECEITA' && c.nome === 'Salário');
  if (despesas.length === 0 || !receita) throw new Error('Rode o seed antes (categorias padrão)');

  const hoje = dataLocalIso(new Date());
  const inicio = somarMeses(`${hoje.slice(0, 7)}-01`, -(meses - 1));
  const porMes = Math.ceil(quantidade / meses);

  let gravadas = 0;
  while (gravadas < quantidade) {
    const tamanho = Math.min(LOTE, quantidade - gravadas);
    const data = Array.from({ length: tamanho }, (_, i) => {
      const n = gravadas + i;
      const mes = Math.min(Math.floor(n / porMes), meses - 1);
      const dia = (n % 28) + 1;
      const dataTransacao = `${somarMeses(inicio, mes).slice(0, 8)}${String(dia).padStart(2, '0')}`;
      // Um salário por mês; o resto são despesas de valores variados.
      const ehSalario = n % porMes === 0;
      return {
        usuarioId,
        contaId: conta.id,
        tipo: ehSalario ? ('RECEITA' as const) : ('DESPESA' as const),
        categoriaId: ehSalario ? receita.id : despesas[n % despesas.length].id,
        descricao: ehSalario ? 'Salário' : `${DESCRICOES[n % DESCRICOES.length]} ${n}`,
        valor: ehSalario ? 6000 : ((n * 37) % 25000) / 100 + 5,
        dataTransacao: new Date(`${dataTransacao}T00:00:00.000Z`),
      };
    });
    await prisma.transacao.createMany({ data });
    gravadas += tamanho;
  }
  console.log(`${EMAIL_VOLUME}: criada com ${gravadas} transações em ${meses} meses.`);
}

if (require.main === module) {
  main()
    .catch((erro: unknown) => {
      console.error(erro instanceof Error ? erro.message : erro);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

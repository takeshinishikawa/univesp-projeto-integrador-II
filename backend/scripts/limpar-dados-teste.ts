/**
 * Apaga os dados do teste com a comunidade, como o TCLE promete ao final da aplicação.
 *
 *   npm run demo:limpar                      # mostra o que seria apagado e não apaga nada
 *   npm run demo:limpar -- --confirmar       # apaga só as contas demo (demoN@financas.demo)
 *   npm run demo:limpar -- --confirmar --todos   # apaga TODOS os usuários e os dados deles
 *
 * As categorias padrão ficam (são de todos e o seed as recria de qualquer forma).
 * Contra o banco publicado, rode na sua máquina com DATABASE_URL apontando para ele.
 */
import { prisma } from '../src/config/database';
import { PrismaUsuarioRepository } from '../src/repositories/usuario.repository';
import { DOMINIO_DEMO } from './contas-demo';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const confirmar = argv.includes('--confirmar');
  const todos = argv.includes('--todos');

  const alvo = await prisma.usuario.findMany({
    where: todos ? {} : { email: { endsWith: `@${DOMINIO_DEMO}` } },
    select: { id: true, email: true, _count: { select: { transacoes: true } } },
    orderBy: { id: 'asc' },
  });

  const escopo = todos ? 'todos os usuários' : `contas demo (@${DOMINIO_DEMO})`;
  console.log(`${alvo.length} usuário(s) em ${escopo}:`);
  for (const usuario of alvo) {
    console.log(`  - ${usuario.email} (${usuario._count.transacoes} transações)`);
  }

  if (!confirmar) {
    console.log('\nNada foi apagado. Rode de novo com --confirmar para apagar.');
    return;
  }

  const usuarios = new PrismaUsuarioRepository();
  for (const usuario of alvo) {
    await usuarios.excluirComDados(usuario.id);
  }
  console.log(`\n${alvo.length} usuário(s) e todos os dados deles foram apagados.`);
}

main()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

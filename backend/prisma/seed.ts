import 'dotenv/config';
import { PrismaClient, TipoTransacao } from '@prisma/client';

const prisma = new PrismaClient();

const categorias: { nome: string; tipo: TipoTransacao }[] = [
  { nome: 'Alimentação', tipo: 'DESPESA' },
  { nome: 'Moradia', tipo: 'DESPESA' },
  { nome: 'Transporte', tipo: 'DESPESA' },
  { nome: 'Lazer', tipo: 'DESPESA' },
  { nome: 'Saúde', tipo: 'DESPESA' },
  { nome: 'Educação', tipo: 'DESPESA' },
  { nome: 'Outros', tipo: 'DESPESA' },
  { nome: 'Salário', tipo: 'RECEITA' },
  { nome: 'Freelance', tipo: 'RECEITA' },
  { nome: 'Investimentos', tipo: 'RECEITA' },
  { nome: 'Outros', tipo: 'RECEITA' },
];

async function main(): Promise<void> {
  for (const categoria of categorias) {
    const existente = await prisma.categoria.findFirst({
      where: { nome: categoria.nome, tipo: categoria.tipo, usuarioId: null },
    });
    if (!existente) {
      await prisma.categoria.create({ data: categoria });
    }
  }
  console.log(`Seed concluído: ${categorias.length} categorias garantidas.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

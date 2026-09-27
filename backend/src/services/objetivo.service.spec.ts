import { ObjetivoRegistro, ObjetivoRepository } from '../repositories/objetivo.repository';
import { ObjetivoService } from './objetivo.service';

const AGORA = new Date(2026, 8, 15); // 15/09/2026

function montar(inicial: ObjetivoRegistro[] = [], ativos = 0) {
  const estado = [...inicial];
  const repositorio = {
    listar: jest.fn().mockImplementation(async () => estado),
    buscar: jest
      .fn()
      .mockImplementation(async (id: number) => estado.find((o) => o.id === id) ?? null),
    contarAtivos: jest.fn().mockResolvedValue(ativos),
    criar: jest.fn().mockImplementation(async (_u: number, dados: object) => {
      const novo = {
        id: 10,
        criadoEm: '2026-09-15',
        concluidoEm: null,
        aportes: [],
        ...dados,
      } as unknown as ObjetivoRegistro;
      estado.push(novo);
      return novo;
    }),
    atualizar: jest.fn().mockResolvedValue(undefined),
    marcarConcluido: jest.fn().mockImplementation(async (id: number, quando: Date | null) => {
      const o = estado.find((x) => x.id === id);
      if (o) o.concluidoEm = quando ? '2026-09-15' : null;
    }),
    excluir: jest.fn().mockResolvedValue(undefined),
    criarAporte: jest
      .fn()
      .mockImplementation(
        async (id: number, dados: { valor: number; data: string; observacao?: string }) => {
          estado
            .find((o) => o.id === id)
            ?.aportes.unshift({ id: Date.now(), observacao: null, ...dados });
        },
      ),
    buscarAporte: jest.fn().mockImplementation(async (aporteId: number, id: number) => {
      return estado.find((o) => o.id === id)?.aportes.find((a) => a.id === aporteId) ?? null;
    }),
    excluirAporte: jest.fn().mockImplementation(async (aporteId: number) => {
      for (const o of estado) o.aportes = o.aportes.filter((a) => a.id !== aporteId);
    }),
  } as unknown as jest.Mocked<ObjetivoRepository>;
  return { service: new ObjetivoService(repositorio, () => AGORA), repositorio };
}

const novo = { nome: 'Viagem', valorAlvo: 6000, prazoAno: 2027, prazoMes: 3 };

describe('ObjetivoService', () => {
  it('cria com o valor inicial como primeiro aporte e já calcula o progresso', async () => {
    const { service } = montar();

    const objetivo = await service.criar(7, { ...novo, valorInicial: 1200 });

    expect(objetivo.acumulado).toBe(1200);
    expect(objetivo.aportes[0]).toMatchObject({ valor: 1200, observacao: 'Valor inicial' });
    expect(objetivo.percentual).toBe(20);
    expect(objetivo.situacao).toBe('NO_RITMO');
  });

  it('prazo anterior ao mês atual é 400; o mês atual vale', async () => {
    const { service } = montar();

    await expect(service.criar(7, { ...novo, prazoAno: 2026, prazoMes: 8 })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(service.criar(7, { ...novo, prazoAno: 2026, prazoMes: 9 })).resolves.toBeDefined();
  });

  it('limita a 20 objetivos ativos', async () => {
    const { service } = montar([], 20);

    await expect(service.criar(7, novo)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('um aporte que atinge (ou passa) o alvo conclui; desfazê-lo reabre', async () => {
    const { service } = montar();
    const criado = await service.criar(7, { ...novo, valorAlvo: 1000 });

    const concluido = await service.guardar(7, criado.id, { valor: 1200, data: '2026-09-15' });
    expect(concluido.situacao).toBe('CONCLUIDO');
    expect(concluido.concluidoEm).not.toBeNull();
    expect(concluido.percentual).toBe(120);

    const reaberto = await service.desfazerAporte(7, criado.id, concluido.aportes[0].id);
    expect(reaberto.concluidoEm).toBeNull();
    expect(reaberto.acumulado).toBe(0);
  });

  it('"guardar este mês" desconta o que já foi guardado no mês corrente', async () => {
    const { service } = montar();
    const criado = await service.criar(7, { ...novo, prazoAno: 2026, prazoMes: 12 }); // 3 meses, R$ 6.000
    expect(criado.valorMensalNecessario).toBe(2000);

    const depois = await service.guardar(7, criado.id, { valor: 500, data: '2026-09-02' });

    expect(depois.guardarEsteMes).toBe(1333.33); // (6000 − 500) ÷ 3 = 1833,33, menos os 500 do mês
  });

  it('objetivo de outro usuário (ou inexistente) é 404', async () => {
    const { service } = montar();

    await expect(service.excluir(7, 99)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.guardar(7, 99, { valor: 10, data: '2026-09-15' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('o resumo só traz os não concluídos', async () => {
    const { service } = montar();
    const a = await service.criar(7, { ...novo, valorAlvo: 100 });
    await service.guardar(7, a.id, { valor: 100, data: '2026-09-15' });

    expect(await service.resumo(7)).toEqual([]);
  });
});

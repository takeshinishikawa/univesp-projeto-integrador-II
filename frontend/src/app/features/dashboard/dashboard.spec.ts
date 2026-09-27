import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { ApplicationRef, LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-error';
import { EvolucaoMensal, ResumoFinanceiro, TotaisPorCategoria } from '../../core/models/api.models';
import { CRIAR_GRAFICO } from '../../shared/grafico/grafico';
import { escolher } from '../../testing/dom';
import { ContaService } from '../contas/conta.service';
import { MetasService } from '../metas/metas.service';
import { ObjetivoService } from '../objetivos/objetivo.service';
import { RecorrenteService } from '../recorrentes/recorrente.service';
import { Dashboard } from './dashboard';
import { DashboardService } from './dashboard.service';

registerLocaleData(localePt);

const resumoOk: ResumoFinanceiro = {
  totalReceitas: 5000,
  totalDespesas: 1200.5,
  saldoAtual: 3799.5,
  orcamentoLimite: null,
  mesesAcimaDaMeta: [],
  mesesComMeta: 0,
  mesesComCategoriaEstourada: [],
  alertaOrcamentoEstourado: false,
  situacaoOrcamento: 'SEM_META',
};

const evolucao: EvolucaoMensal = {
  ano: 2026,
  meses: Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    totalReceitas: i < 3 ? 1000 : 0,
    totalDespesas: i < 3 ? 400 : 0,
    saldo: i < 3 ? 600 : 0,
    orcamentoLimite: null,
  })),
};

const categoriasDoMes: TotaisPorCategoria = {
  tipo: 'DESPESA',
  total: 400,
  categorias: [{ categoriaId: 1, categoria: 'Alimentação', total: 400, percentual: 100 }],
};

describe('Dashboard', () => {
  const obterResumo = vi.fn();
  const obterEvolucao = vi.fn();
  const obterCategorias = vi.fn();
  const obterCategoriasDoMes = vi.fn();
  const obterInsights = vi.fn();
  const criarGrafico = vi.fn(() => ({
    data: {},
    options: {},
    update: () => undefined,
    destroy: () => undefined,
  }));

  async function criar(resposta: Observable<ResumoFinanceiro>) {
    obterResumo.mockReturnValue(resposta);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' }, // igual ao app.config
        {
          provide: DashboardService,
          useValue: { obterResumo, obterEvolucao, obterCategorias, obterInsights },
        },
        { provide: ContaService, useValue: { listar: () => of([]) } },
        {
          provide: RecorrenteService,
          useValue: {
            listar: () =>
              of({
                recorrencias: [],
                custoMensal: 0,
                custoAnual: 0,
                comprometidoNoMes: { valor: 0, quantidade: 0 },
              }),
          },
        },
        { provide: ObjetivoService, useValue: { resumo: () => of([]) } },
        { provide: CRIAR_GRAFICO, useValue: criarGrafico },
        { provide: MetasService, useValue: { obterCategoriasDoMes } },
      ],
    });
    const fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    obterResumo.mockReset();
    obterEvolucao.mockReset().mockReturnValue(of(evolucao));
    obterInsights.mockReset().mockReturnValue(of([]));
    obterCategorias.mockReset().mockReturnValue(of(categoriasDoMes));
    obterCategoriasDoMes
      .mockReset()
      .mockReturnValue(of({ ano: 2026, mes: 1, comMeta: [], semMeta: [], totalMetas: 0 }));
    criarGrafico.mockClear();
  });

  it('mostra os gráficos de evolução e de categorias abaixo dos cards', async () => {
    const el = await criar(of(resumoOk));

    expect(el.querySelector('app-grafico-evolucao h2')?.textContent).toContain('Evolução mensal');
    expect(el.querySelector('app-grafico-categorias h2')?.textContent).toContain(
      'Despesas por categoria',
    );
    expect(criarGrafico).toHaveBeenCalledTimes(2);
  });

  it('clicar em um mês na tabela do gráfico muda o período dos cards e das categorias', async () => {
    const el = await criar(of(resumoOk));
    const ano = new Date().getFullYear();
    obterResumo.mockClear();
    obterCategorias.mockClear();

    const botaoFevereiro = Array.from(
      el.querySelectorAll<HTMLButtonElement>('app-grafico-evolucao .mes-botao'),
    ).find((b) => b.textContent?.trim() === 'Fevereiro');
    botaoFevereiro?.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(obterResumo).toHaveBeenCalledWith({ mes: 2, ano });
    expect(obterCategorias).toHaveBeenCalledWith({ mes: 2, ano }, 'DESPESA');
    expect(obterEvolucao).toHaveBeenCalledTimes(1); // o ano não mudou: não refaz a evolução
  });

  it('consulta o resumo do mês/ano atuais', async () => {
    await criar(of(resumoOk));
    const hoje = new Date();
    expect(obterResumo).toHaveBeenCalledWith({ mes: hoje.getMonth() + 1, ano: hoje.getFullYear() });
  });

  it('mostra os três cards com valores em reais', async () => {
    const el = await criar(of(resumoOk));
    const texto = el.textContent ?? '';

    expect(texto).toContain('Total de receitas');
    expect(texto).toContain('Total de despesas');
    expect(texto).toContain('Saldo atual');
    expect(texto).toMatch(/R\$\s?5\.000,00/);
    expect(texto).toMatch(/R\$\s?3\.799,50/);
  });

  it('NÃO mostra o alerta quando o orçamento não foi estourado', async () => {
    const el = await criar(of(resumoOk));
    expect(el.querySelector('.alerta-orcamento')).toBeNull();
  });

  const texto = (el: HTMLElement, seletor: string) =>
    (el.querySelector(seletor)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('mostra alerta com texto (não só cor) quando o orçamento estoura', async () => {
    const el = await criar(
      of({ ...resumoOk, orcamentoLimite: 1000, alertaOrcamentoEstourado: true }),
    );
    const alerta = el.querySelector('.alerta-orcamento');

    expect(alerta).not.toBeNull();
    expect(alerta?.textContent).toContain('Orçamento estourado');
    expect(alerta?.querySelector('[aria-hidden="true"]')).not.toBeNull(); // ícone decorativo
    expect(el.querySelector('.card--alerta')).not.toBeNull();
  });

  it('no mês, o alerta diz quanto foi gasto, o mês, a meta e quanto passou', async () => {
    const el = await criar(
      of({
        ...resumoOk,
        totalDespesas: 8731.73,
        orcamentoLimite: 2000,
        alertaOrcamentoEstourado: true,
      }),
    );

    expect(texto(el, '.alerta-orcamento')).toMatch(
      /Você gastou R\$\s?8\.731,73 em \S+ de \d{4}, acima da meta de R\$\s?2\.000,00 para o mês\. Passou R\$\s?6\.731,73\./,
    );
  });

  it('no ano inteiro, o alerta lista os meses que passaram da meta do próprio mês', async () => {
    const el = await criar(of(resumoOk));
    obterResumo.mockReturnValue(
      of({
        ...resumoOk,
        mesesAcimaDaMeta: [1, 3, 8],
        mesesComMeta: 9,
        alertaOrcamentoEstourado: true,
      }),
    );

    escolher(el, '#dashboard-mes', '');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(texto(el, '.alerta-orcamento')).toMatch(
      /Em 3 de 9 meses com meta em \d{4}, as despesas passaram da meta: janeiro, março e agosto\./,
    );
    expect(el.querySelector('.dica-meta')).toBeNull();
  });

  it('a partir de 80% da meta avisa em amarelo, com texto, quanto já foi usado e quanto resta', async () => {
    const el = await criar(
      of({
        ...resumoOk,
        totalDespesas: 840,
        orcamentoLimite: 1000,
        situacaoOrcamento: 'ATENCAO',
      }),
    );

    expect(texto(el, '.atencao-orcamento')).toMatch(
      /Atenção: Você já usou 84% da meta de \S+; restam R\$\s?160,00\./,
    );
    expect(el.querySelector('.atencao-orcamento [aria-hidden="true"]')).not.toBeNull();
    expect(el.querySelector('.atencao-orcamento a')?.getAttribute('href')).toContain('/metas?');
    expect(el.querySelector('.alerta-orcamento')).toBeNull();
  });

  it('dentro da meta (abaixo de 80%) não mostra aviso nenhum', async () => {
    const el = await criar(
      of({ ...resumoOk, totalDespesas: 790, orcamentoLimite: 1000, situacaoOrcamento: 'DENTRO' }),
    );

    expect(el.querySelector('.atencao-orcamento')).toBeNull();
    expect(el.querySelector('.alerta-orcamento')).toBeNull();
  });

  it('estourada: só o alerta vermelho, sem o aviso amarelo', async () => {
    const el = await criar(
      of({
        ...resumoOk,
        totalDespesas: 1200,
        orcamentoLimite: 1000,
        alertaOrcamentoEstourado: true,
        situacaoOrcamento: 'ESTOURADA',
      }),
    );

    expect(el.querySelector('.alerta-orcamento')).not.toBeNull();
    expect(el.querySelector('.atencao-orcamento')).toBeNull();
  });

  it('mostra o card de metas por categoria do mês visto', async () => {
    const el = await criar(of(resumoOk));
    const hoje = new Date();

    expect(el.querySelector('app-metas-categoria h2')?.textContent).toContain(
      'Metas por categoria',
    );
    expect(obterCategoriasDoMes).toHaveBeenCalledWith(hoje.getFullYear(), hoje.getMonth() + 1);
  });

  it('no ano inteiro, o card lista os meses em que alguma categoria passou da meta', async () => {
    const el = await criar(of(resumoOk));
    obterResumo.mockReturnValue(of({ ...resumoOk, mesesComCategoriaEstourada: [2, 5] }));

    escolher(el, '#dashboard-mes', '');
    await TestBed.inject(ApplicationRef).whenStable();

    expect(texto(el, 'app-metas-categoria .atencao-meses')).toContain('fevereiro e maio');
  });

  it('erro nas metas por categoria não derruba o resumo', async () => {
    obterCategoriasDoMes.mockReturnValue(throwError(() => new ApiError(500, 'Falha nas metas')));
    const el = await criar(of(resumoOk));

    expect(el.querySelector('app-metas-categoria [role="alert"]')?.textContent).toContain(
      'Falha nas metas',
    );
    expect(el.textContent).toContain('Total de receitas');
  });

  it('o alerta leva à tela de Metas já no mês visto', async () => {
    const el = await criar(
      of({ ...resumoOk, orcamentoLimite: 1000, alertaOrcamentoEstourado: true }),
    );
    const link = el.querySelector('.alerta-orcamento a');
    const hoje = new Date();

    expect(link?.textContent).toContain('Alterar meta');
    expect(link?.getAttribute('href')).toContain('/metas?');
    expect(link?.getAttribute('href')).toContain(`ano=${hoje.getFullYear()}`);
    expect(link?.getAttribute('href')).toContain(`mes=${hoje.getMonth() + 1}`);
  });

  it('mês sem meta convida a definir uma; com meta dentro do limite não mostra nada', async () => {
    const semMeta = await criar(of(resumoOk));
    expect(texto(semMeta, '.dica-meta')).toMatch(
      /ainda não definiu uma meta de gastos para \S+ de \d{4}/,
    );
    expect(semMeta.querySelector('.dica-meta a')?.getAttribute('href')).toContain('/metas?');
    TestBed.resetTestingModule();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: DashboardService,
          useValue: { obterResumo, obterEvolucao, obterCategorias, obterInsights },
        },
        { provide: ContaService, useValue: { listar: () => of([]) } },
        {
          provide: RecorrenteService,
          useValue: {
            listar: () =>
              of({
                recorrencias: [],
                custoMensal: 0,
                custoAnual: 0,
                comprometidoNoMes: { valor: 0, quantidade: 0 },
              }),
          },
        },
        { provide: ObjetivoService, useValue: { resumo: () => of([]) } },
        { provide: CRIAR_GRAFICO, useValue: criarGrafico },
        { provide: MetasService, useValue: { obterCategoriasDoMes } },
      ],
    });
    obterResumo.mockReturnValue(of({ ...resumoOk, orcamentoLimite: 9999 }));
    const fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    await fixture.whenStable();
    const comMeta = fixture.nativeElement as HTMLElement;

    expect(comMeta.querySelector('.dica-meta')).toBeNull();
    expect(comMeta.querySelector('.alerta-orcamento')).toBeNull();
  });

  it('marca saldo negativo também para leitores de tela', async () => {
    const el = await criar(of({ ...resumoOk, totalDespesas: 6000, saldoAtual: -1000 }));
    expect(el.querySelector('.valor--negativo')?.textContent).toContain('saldo negativo');
  });

  it('a região do resumo é aria-live', async () => {
    const el = await criar(of(resumoOk));
    const regiao = el.querySelector('.resumo');
    expect(regiao?.getAttribute('aria-live')).toBe('polite');
  });

  it('exibe erro da API', async () => {
    const el = await criar(throwError(() => new ApiError(500, 'Erro interno do servidor')));
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Erro interno do servidor');
  });
});

import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-error';
import { Objetivo } from '../../core/models/api.models';
import { digitar } from '../../testing/dom';
import { ObjetivoService } from './objetivo.service';
import { Objetivos } from './objetivos';
import { violacoesDeAcessibilidade } from '../../testing/a11y';

registerLocaleData(localePt);

const objetivo = (extra: Partial<Objetivo>): Objetivo => ({
  id: 1,
  nome: 'Viagem',
  valorAlvo: 6000,
  prazoAno: 2027,
  prazoMes: 12,
  criadoEm: '2026-01-01',
  concluidoEm: null,
  acumulado: 2400,
  percentual: 40,
  mesesRestantes: 15,
  valorMensalNecessario: 240,
  guardarEsteMes: 240,
  situacao: 'NO_RITMO',
  aportes: [{ id: 5, valor: 2400, data: '2026-08-10', observacao: 'Bônus' }],
  ...extra,
});

const OBJETIVOS: Objetivo[] = [
  objetivo({}),
  objetivo({ id: 2, nome: 'Reserva', situacao: 'ATRASADO', aportes: [] }),
  objetivo({
    id: 3,
    nome: 'Notebook',
    acumulado: 3300,
    valorAlvo: 3000,
    percentual: 110,
    situacao: 'CONCLUIDO',
    concluidoEm: '2026-09-01',
    valorMensalNecessario: 0,
  }),
];

describe('Objetivos', () => {
  const listar = vi.fn();
  const criar = vi.fn();
  const atualizar = vi.fn();
  const excluir = vi.fn();
  const guardar = vi.fn();
  const desfazerAporte = vi.fn();

  async function montar() {
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: ObjetivoService,
          useValue: { listar, criar, atualizar, excluir, guardar, desfazerAporte },
        },
      ],
    });
    const fixture = TestBed.createComponent(Objetivos);
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const botao = (el: HTMLElement, rotulo: string) =>
    el.querySelector<HTMLButtonElement>(`button[aria-label="${rotulo}"]`);
  const enviar = (el: HTMLElement, seletor: string) =>
    el.querySelector(seletor)!.dispatchEvent(new Event('submit', { cancelable: true }));

  beforeEach(() => {
    listar.mockReset().mockReturnValue(of(OBJETIVOS));
    criar.mockReset().mockReturnValue(of(objetivo({ id: 9, nome: 'Casa' })));
    atualizar.mockReset().mockReturnValue(of(objetivo({})));
    excluir.mockReset().mockReturnValue(of(undefined));
    guardar.mockReset().mockReturnValue(of(objetivo({})));
    desfazerAporte.mockReset().mockReturnValue(of(objetivo({})));
  });

  it('sem violações de acessibilidade (axe-core) com os dados carregados', async () => {
    const { el } = await montar();

    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });

  it('um cartão por objetivo, com progresso acessível, prazo e quanto guardar por mês', async () => {
    const { el } = await montar();
    const [viagem] = [...el.querySelectorAll('#titulo-ativos ~ ul .objetivo')];

    expect(texto(viagem)).toMatch(/R\$\s?2\.400,00 de R\$\s?6\.000,00 — 40,0%/);
    expect(texto(viagem)).toContain('Prazo: dezembro de 2027');
    expect(texto(viagem)).toMatch(/Guardar por mês: R\$\s?240,00 \(15 meses\)/);
    const barra = viagem.querySelector('progress')!;
    expect(barra.value).toBe(40);
    expect(barra.getAttribute('aria-label')).toBe('Progresso de Viagem: 40,0%');
  });

  it('a situação vem em texto e ícone', async () => {
    const { el } = await montar();
    const selos = [...el.querySelectorAll('.selo')].map((s) => texto(s));

    expect(selos).toEqual(['✓ no ritmo', '⚠ atrasado', '✓ concluído']);
  });

  it('concluídos vão para uma seção própria; a barra para em 100% mas o percentual real aparece', async () => {
    const { el } = await montar();
    const concluido = el.querySelector('#titulo-concluidos ~ ul .objetivo')!;

    expect(texto(concluido)).toContain('110,0%');
    expect(concluido.querySelector('progress')!.value).toBe(100);
    expect(texto(concluido)).not.toContain('Guardar por mês');
  });

  it('sem objetivos, convida a criar o primeiro', async () => {
    listar.mockReturnValue(of([]));
    const { el } = await montar();

    expect(texto(el.querySelector('.vazio'))).toContain('ainda não tem objetivos');
  });

  it('cria um objetivo com valor inicial opcional e avisa', async () => {
    const { fixture, el } = await montar();

    digitar(el, '#objetivo-nome', '  Casa ');
    digitar(el, '#objetivo-valor', '50000');
    digitar(el, '#objetivo-inicial', '1000');
    enviar(el, '#titulo-novo + form');
    await fixture.whenStable();

    const pedido = criar.mock.calls[0][0];
    expect(pedido).toMatchObject({ nome: 'Casa', valorAlvo: 50000, valorInicial: 1000 });
    expect(texto(el.querySelector('[role="status"]'))).toContain('Objetivo "Casa" criado.');
  });

  it('exige nome e valor, sem chamar a API', async () => {
    const { fixture, el } = await montar();

    enviar(el, '#titulo-novo + form');
    await fixture.whenStable();

    expect(criar).not.toHaveBeenCalled();
    expect(el.querySelectorAll('.campo__erro').length).toBeGreaterThanOrEqual(2);
  });

  it('guardar registra o aporte e comemora quando o objetivo é concluído', async () => {
    guardar.mockReturnValue(of(objetivo({ situacao: 'CONCLUIDO', concluidoEm: '2026-09-20' })));
    const { fixture, el } = await montar();

    botao(el, 'Guardar em Viagem')!.click();
    await fixture.whenStable();
    digitar(el, '#aporte-valor', '3600');
    enviar(el, 'dialog form');
    await fixture.whenStable();

    expect(guardar.mock.calls[0][0]).toBe(1);
    expect(guardar.mock.calls[0][1]).toMatchObject({ valor: 3600 });
    expect(texto(el.querySelector('[role="status"]'))).toContain('Parabéns');
  });

  it('desfaz um aporte do histórico', async () => {
    const { fixture, el } = await montar();

    el.querySelector<HTMLButtonElement>('.historico button')!.click();
    await fixture.whenStable();

    expect(desfazerAporte).toHaveBeenCalledWith(1, 5);
  });

  it('edita nome, valor e prazo', async () => {
    const { fixture, el } = await montar();

    botao(el, 'Editar Viagem')!.click();
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('#edicao-nome')?.value).toBe('Viagem');
    digitar(el, '#edicao-valor', '7000');
    enviar(el, 'dialog form');
    await fixture.whenStable();

    expect(atualizar).toHaveBeenCalledWith(1, {
      nome: 'Viagem',
      valorAlvo: 7000,
      prazoMes: 12,
      prazoAno: 2027,
    });
  });

  it('exclui com confirmação (e avisa que os aportes vão junto)', async () => {
    const { fixture, el } = await montar();

    botao(el, 'Excluir Viagem')!.click();
    await fixture.whenStable();
    expect(excluir).not.toHaveBeenCalled();
    expect(texto(el.querySelector('dialog'))).toContain('1 aportes');

    [...el.querySelectorAll<HTMLButtonElement>('dialog button')]
      .find((b) => b.textContent?.trim() === 'Excluir')!
      .click();
    await fixture.whenStable();

    expect(excluir).toHaveBeenCalledWith(1);
  });

  it('mostra o erro da API ao criar', async () => {
    criar.mockReturnValue(
      throwError(() => new ApiError(400, 'O prazo não pode ser anterior ao mês atual')),
    );
    const { fixture, el } = await montar();

    digitar(el, '#objetivo-nome', 'Casa');
    digitar(el, '#objetivo-valor', '100');
    enviar(el, '#titulo-novo + form');
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'O prazo não pode ser anterior',
    );
  });
});

import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-error';
import { Conta } from '../../core/models/api.models';
import { digitar } from '../../testing/dom';
import { Contas } from './contas';
import { ContaService } from './conta.service';

registerLocaleData(localePt);

const conta = (extra: Partial<Conta>): Conta => ({
  id: 1,
  nome: 'Conta principal',
  tipo: 'CONTA_CORRENTE',
  saldoInicial: 0,
  identificadorExterno: null,
  arquivada: false,
  saldo: 1500.5,
  totalTransacoes: 12,
  ...extra,
});

const CONTAS: Conta[] = [
  conta({}),
  conta({ id: 2, nome: 'Cartão Nubank', tipo: 'CARTAO_CREDITO', saldo: -300, totalTransacoes: 3 }),
  conta({ id: 3, nome: 'Antiga', arquivada: true, saldo: 0, totalTransacoes: 0 }),
];

describe('Contas', () => {
  const listar = vi.fn();
  const criar = vi.fn();
  const atualizar = vi.fn();
  const excluir = vi.fn();
  const transferir = vi.fn();

  async function montar() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: ContaService, useValue: { listar, criar, atualizar, excluir, transferir } },
      ],
    });
    const fixture = TestBed.createComponent(Contas);
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const texto = (el: HTMLElement, seletor: string) =>
    (el.querySelector(seletor)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const botao = (el: HTMLElement, rotulo: string) =>
    el.querySelector<HTMLButtonElement>(`button[aria-label="${rotulo}"]`);
  const escolher = (el: HTMLElement, seletor: string, rotulo: string) => {
    const campo = el.querySelector<HTMLSelectElement>(seletor)!;
    campo.selectedIndex = [...campo.options].findIndex((o) => o.textContent?.trim() === rotulo);
    campo.dispatchEvent(new Event('change'));
  };
  const enviar = (el: HTMLElement, seletor: string) =>
    el.querySelector(seletor)!.dispatchEvent(new Event('submit', { cancelable: true }));

  beforeEach(() => {
    listar.mockReset().mockReturnValue(of(CONTAS));
    criar.mockReset().mockReturnValue(of(conta({ id: 9, nome: 'Dinheiro' })));
    atualizar.mockReset().mockReturnValue(of(conta({})));
    excluir.mockReset().mockReturnValue(of(undefined));
    transferir.mockReset().mockReturnValue(of({ transferenciaId: 'abc' }));
  });

  it('lista as contas ativas com o saldo e, no cartão, o valor "a pagar"', async () => {
    const { el } = await montar();
    const cartoes = [...el.querySelectorAll('.contas:not(.contas--arquivadas) .conta')];

    expect(cartoes).toHaveLength(2);
    expect(texto(cartoes[0] as HTMLElement, '.conta__saldo')).toMatch(/R\$\s?1\.500,50/);
    expect(texto(cartoes[1] as HTMLElement, '.conta__saldo')).toMatch(/A pagar: R\$\s?300,00/);
    expect(texto(cartoes[1] as HTMLElement, '.conta__detalhe')).toBe('3 transações');
  });

  it('mostra o total geral das contas ativas (o cartão entra como dívida)', async () => {
    const { el } = await montar();

    expect(texto(el, '.total')).toMatch(/R\$\s?1\.200,50/);
  });

  it('as arquivadas ficam em uma lista à parte, com opção de reativar', async () => {
    const { el } = await montar();

    expect(texto(el, '.contas--arquivadas')).toContain('Antiga');
    expect(botao(el, 'Reativar Antiga')).not.toBeNull();
  });

  it('cada ação tem nome acessível com o nome da conta', async () => {
    const { el } = await montar();

    for (const rotulo of [
      'Editar Conta principal',
      'Arquivar Cartão Nubank',
      'Excluir Conta principal',
    ]) {
      expect(botao(el, rotulo)).not.toBeNull();
    }
    expect(el.querySelector('a[aria-label="Ver transações de Cartão Nubank"]')).not.toBeNull();
  });

  it('cria uma conta, avisa e relê a lista', async () => {
    const { fixture, el } = await montar();

    digitar(el, '#conta-nome', '  Dinheiro ');
    escolher(el, '#conta-tipo', 'Dinheiro');
    digitar(el, '#conta-saldo', '50');
    enviar(el, '#form-nova-conta');
    await fixture.whenStable();

    expect(criar).toHaveBeenCalledWith({ nome: 'Dinheiro', tipo: 'DINHEIRO', saldoInicial: 50 });
    expect(texto(el, '[role="status"]')).toContain('Conta "Dinheiro" criada.');
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('nome vazio não chama a API', async () => {
    const { fixture, el } = await montar();

    enviar(el, '#form-nova-conta');
    await fixture.whenStable();

    expect(criar).not.toHaveBeenCalled();
    expect(el.querySelector('.campo__erro')?.textContent).toContain('Campo obrigatório');
  });

  it('mostra o erro da API (nome repetido)', async () => {
    criar.mockReturnValue(throwError(() => new ApiError(409, 'Já existe uma conta chamada "X"')));
    const { fixture, el } = await montar();

    digitar(el, '#conta-nome', 'X');
    enviar(el, '#form-nova-conta');
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Já existe uma conta');
  });

  it('arquiva uma conta', async () => {
    const { fixture, el } = await montar();

    botao(el, 'Arquivar Cartão Nubank')!.click();
    await fixture.whenStable();

    expect(atualizar).toHaveBeenCalledWith(2, { arquivada: true });
    expect(texto(el, '[role="status"]')).toContain('arquivada');
  });

  it('edita nome, tipo e saldo inicial', async () => {
    const { fixture, el } = await montar();

    botao(el, 'Editar Conta principal')!.click();
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('#edicao-nome')?.value).toBe('Conta principal');
    digitar(el, '#edicao-nome', 'Nubank');
    enviar(el, '#form-edicao-conta');
    await fixture.whenStable();

    expect(atualizar).toHaveBeenCalledWith(1, {
      nome: 'Nubank',
      tipo: 'CONTA_CORRENTE',
      saldoInicial: 0,
    });
    expect(el.querySelector('#form-edicao-conta')).toBeNull();
  });

  it('exclui pedindo confirmação; conta com transações mostra o motivo', async () => {
    const { fixture, el } = await montar();

    botao(el, 'Excluir Conta principal')!.click();
    await fixture.whenStable();
    expect(excluir).not.toHaveBeenCalled();

    excluir.mockReturnValue(
      throwError(
        () =>
          new ApiError(
            409,
            'A conta tem 12 transações. Mova-as para outra conta ou arquive a conta.',
          ),
      ),
    );
    [...el.querySelectorAll<HTMLButtonElement>('dialog button')]
      .find((b) => b.textContent?.trim() === 'Excluir')!
      .click();
    await fixture.whenStable();

    expect(excluir).toHaveBeenCalledWith(1);
    expect(el.querySelector('dialog [role="alert"]')?.textContent).toContain('12 transações');
  });

  describe('transferência', () => {
    it('registra a transferência entre duas contas e avisa que não conta como despesa', async () => {
      const { fixture, el } = await montar();

      escolher(el, '#transf-origem', 'Conta principal');
      escolher(el, '#transf-destino', 'Cartão Nubank');
      digitar(el, '#transf-valor', '300');
      digitar(el, '#transf-data', '2026-09-10');
      enviar(el, '#form-transferencia');
      await fixture.whenStable();

      expect(transferir).toHaveBeenCalledWith({
        contaOrigemId: 1,
        contaDestinoId: 2,
        valor: 300,
        data: '2026-09-10',
      });
      expect(texto(el, '[role="status"]')).toContain('não conta como receita nem despesa');
    });

    it('não deixa origem e destino iguais nem campos vazios', async () => {
      const { fixture, el } = await montar();

      escolher(el, '#transf-origem', 'Conta principal');
      escolher(el, '#transf-destino', 'Conta principal');
      digitar(el, '#transf-valor', '10');
      enviar(el, '#form-transferencia');
      await fixture.whenStable();

      expect(transferir).not.toHaveBeenCalled();
      expect(texto(el, '#form-transferencia')).toContain('devem ser diferentes');
    });
  });

  it('mostra o erro ao carregar', async () => {
    listar.mockReturnValue(throwError(() => new ApiError(500, 'Erro interno do servidor')));
    const { el } = await montar();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Erro interno do servidor');
  });
});

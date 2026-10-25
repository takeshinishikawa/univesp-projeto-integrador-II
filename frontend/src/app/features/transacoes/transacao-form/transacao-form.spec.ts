import { TestBed } from '@angular/core/testing';
import { Categoria, Transacao, TransacaoRequest } from '../../../core/models/api.models';
import { violacoesDeAcessibilidade } from '../../../testing/a11y';
import { digitar, enviarFormulario, escolher, mensagensDeErro } from '../../../testing/dom';
import { TransacaoForm } from './transacao-form';

const categorias: Categoria[] = [
  { id: 1, nome: 'Alimentação', tipo: 'DESPESA', padrao: true },
  { id: 2, nome: 'Moradia', tipo: 'DESPESA', padrao: true },
  { id: 3, nome: 'Salário', tipo: 'RECEITA', padrao: true },
];

describe('TransacaoForm', () => {
  async function criar(transacao: Transacao | null = null) {
    const fixture = TestBed.createComponent(TransacaoForm);
    fixture.componentRef.setInput('categorias', categorias);
    fixture.componentRef.setInput('transacao', transacao);
    const salvar = vi.fn<(dados: TransacaoRequest) => void>();
    fixture.componentInstance.salvar.subscribe(salvar);
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, salvar };
  }

  const opcoesDaCategoria = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('#transacao-categoria option'))
      .map((o) => o.textContent?.trim())
      .filter((t) => t !== 'Selecione…');

  it('lista só as categorias do tipo escolhido e acompanha a troca de tipo', async () => {
    const { fixture, el } = await criar();
    expect(opcoesDaCategoria(el)).toEqual(['Alimentação', 'Moradia']);

    el.querySelector<HTMLInputElement>('#transacao-tipo-receita')!.click();
    await fixture.whenStable();
    await fixture.whenStable();
    expect(opcoesDaCategoria(el)).toEqual(['Salário']);
  });

  it('valida campos obrigatórios e não emite', async () => {
    const { fixture, el, salvar } = await criar();
    enviarFormulario(el);
    await fixture.whenStable();

    // categoria, descrição e valor (data já vem preenchida com hoje)
    expect(mensagensDeErro(el)).toHaveLength(3);
    expect(salvar).not.toHaveBeenCalled();
    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });

  it('começa pelo valor: tipo, valor e data antes de descrição, categoria e conta', async () => {
    const { el } = await criar();
    const ordem = Array.from(el.querySelectorAll('input:not([type="radio"]), select')).map(
      (c) => c.id,
    );

    expect(ordem).toEqual([
      'transacao-valor',
      'transacao-data',
      'transacao-descricao',
      'transacao-categoria',
    ]);
    expect(el.querySelector<HTMLInputElement>('#transacao-tipo-despesa')?.checked).toBe(true);
  });

  it('mostra a data em dd/mm/aaaa e recusa data que não existe', async () => {
    const { fixture, el, salvar } = await criar();
    expect(el.querySelector<HTMLInputElement>('#transacao-data')?.value).toMatch(
      /^\d{2}\/\d{2}\/\d{4}$/,
    );

    digitar(el, '#transacao-data', '31/02/2026');
    enviarFormulario(el);
    await fixture.whenStable();

    expect(mensagensDeErro(el)).toContain('Informe uma data válida no formato dd/mm/aaaa.');
    expect(salvar).not.toHaveBeenCalled();
  });

  it('sem violações de acessibilidade (axe-core) no estado inicial', async () => {
    const { el } = await criar();

    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });

  it('rejeita descrição só com espaços e valor não positivo', async () => {
    const { fixture, el, salvar } = await criar();
    escolher(el, '#transacao-categoria', '0'); // mantém placeholder
    digitar(el, '#transacao-descricao', '   ');
    digitar(el, '#transacao-valor', '0');
    enviarFormulario(el);
    await fixture.whenStable();

    const erros = mensagensDeErro(el);
    expect(erros).toContain('Campo obrigatório.');
    expect(erros.some((e) => e.includes('maior ou igual a 0,01'))).toBe(true);
    expect(salvar).not.toHaveBeenCalled();
  });

  it('emite o payload esperado pela API quando válido', async () => {
    const { fixture, el, salvar } = await criar();
    // escolhe a categoria pelo índice do <option> (ngValue usa "index: valor")
    const select = el.querySelector<HTMLSelectElement>('#transacao-categoria')!;
    select.selectedIndex = 1; // Alimentação (índice 0 é o placeholder)
    select.dispatchEvent(new Event('change'));
    digitar(el, '#transacao-descricao', ' Mercado ');
    digitar(el, '#transacao-valor', '89.9');
    digitar(el, '#transacao-data', '15032026'); // a máscara põe as barras
    enviarFormulario(el);
    await fixture.whenStable();

    expect(salvar).toHaveBeenCalledWith({
      tipo: 'DESPESA',
      categoriaId: 1,
      descricao: 'Mercado',
      valor: 89.9,
      dataTransacao: '2026-03-15',
    });
  });

  it('preenche o formulário ao editar uma transação existente', async () => {
    const { el } = await criar({
      id: 10,
      usuarioId: 1,
      categoriaId: 3,
      descricao: 'Salário de março',
      valor: 4500,
      tipo: 'RECEITA',
      dataTransacao: '2026-03-05',
      contaId: 1,
      createdAt: '2026-03-05T10:00:00.000Z',
    });

    expect(el.querySelector<HTMLInputElement>('#transacao-descricao')?.value).toBe(
      'Salário de março',
    );
    expect(el.querySelector<HTMLInputElement>('#transacao-valor')?.value).toBe('4500.00');
    expect(el.querySelector<HTMLInputElement>('#transacao-data')?.value).toBe('05/03/2026');
    expect(el.querySelector<HTMLInputElement>('#transacao-tipo-receita')?.checked).toBe(true);
  });

  describe('campo Conta', () => {
    const contas = [
      { id: 1, nome: 'Conta principal' },
      { id: 2, nome: 'Cartão' },
    ].map((c) => ({
      ...c,
      tipo: 'CONTA_CORRENTE' as const,
      saldoInicial: 0,
      identificadorExterno: null,
      arquivada: false,
      saldo: 0,
      totalTransacoes: 0,
    }));

    it('só aparece com mais de uma conta, começa na primeira e vai no pedido', async () => {
      const fixture = TestBed.createComponent(TransacaoForm);
      fixture.componentRef.setInput('categorias', categorias);
      fixture.componentRef.setInput('contas', contas);
      const salvar = vi.fn<(dados: TransacaoRequest) => void>();
      fixture.componentInstance.salvar.subscribe(salvar);
      await fixture.whenStable();
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;

      expect(
        el
          .querySelector<HTMLSelectElement>('#transacao-conta')
          ?.selectedOptions[0].textContent?.trim(),
      ).toBe('Conta principal');
      const categoria = el.querySelector<HTMLSelectElement>('#transacao-categoria')!;
      categoria.selectedIndex = 1;
      categoria.dispatchEvent(new Event('change'));
      digitar(el, '#transacao-descricao', 'Mercado');
      digitar(el, '#transacao-valor', '10');
      const conta = el.querySelector<HTMLSelectElement>('#transacao-conta')!;
      conta.selectedIndex = 1;
      conta.dispatchEvent(new Event('change'));
      enviarFormulario(el);
      await fixture.whenStable();

      expect(salvar.mock.calls[0]?.[0]).toMatchObject({ contaId: 2 });
    });

    it('sem várias contas o campo não aparece e o pedido não leva contaId', async () => {
      const { el } = await criar();

      expect(el.querySelector('#transacao-conta')).toBeNull();
    });
  });
});

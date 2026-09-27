import { TestBed } from '@angular/core/testing';
import { Categoria, Transacao, TransacaoRequest } from '../../../core/models/api.models';
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

    escolher(el, '#transacao-tipo', 'RECEITA');
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
    digitar(el, '#transacao-data', '2026-03-15');
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
    expect(el.querySelector<HTMLInputElement>('#transacao-data')?.value).toBe('2026-03-05');
    expect(el.querySelector<HTMLSelectElement>('#transacao-tipo')?.value).toBe('RECEITA');
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

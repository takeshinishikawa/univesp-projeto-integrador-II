import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-error';
import { Categoria, LinhaPreview, PreviewImportacao } from '../../core/models/api.models';
import { violacoesDeAcessibilidade } from '../../testing/a11y';
import { escolher } from '../../testing/dom';
import { CategoriaService } from '../categorias/categoria.service';
import { ContaService } from '../contas/conta.service';
import { ImportacaoService } from './importacao.service';
import { Importacao, TAMANHO_MAX_ARQUIVO_BYTES } from './importacao';

registerLocaleData(localePt);

const categorias: Categoria[] = [
  { id: 1, nome: 'Alimentação', tipo: 'DESPESA', padrao: true },
  { id: 2, nome: 'Transporte', tipo: 'DESPESA', padrao: true },
  { id: 3, nome: 'Outros', tipo: 'DESPESA', padrao: true },
  { id: 4, nome: 'Salário', tipo: 'RECEITA', padrao: true },
];

const linha = (sobrescrever: Partial<LinhaPreview>): LinhaPreview => ({
  idExterno: 'x',
  dataTransacao: '2026-03-10',
  descricao: 'Padaria',
  valor: 10,
  tipo: 'DESPESA',
  categoriaId: 1,
  origemSugestao: 'REGRA_PADRAO',
  termoSugestao: null,
  duplicada: false,
  ignoradaSugerida: false,
  motivoIgnorada: null,
  pagamentoDeFatura: false,
  ...sobrescrever,
});

const preview: PreviewImportacao = {
  origem: 'CONTA',
  identificadorExterno: null,
  contaId: 1,
  contaReconhecida: false,
  nomeContaSugerido: 'Conta corrente',
  tipoContaSugerido: 'CONTA_CORRENTE',
  linhasIgnoradas: 0,
  linhas: [
    linha({ idExterno: 'a', descricao: 'Padaria Pao Quente', valor: 20 }),
    linha({
      idExterno: 'b',
      descricao: 'Salario ACME',
      valor: 5000,
      tipo: 'RECEITA',
      categoriaId: 4,
    }),
    linha({ idExterno: 'c', descricao: 'Ja existia', valor: 7, duplicada: true }),
    linha({
      idExterno: 'd',
      descricao: 'Pagamento de fatura',
      valor: 900,
      categoriaId: 3,
      ignoradaSugerida: true,
      motivoIgnorada: 'possível pagamento de fatura',
    }),
  ],
};

const arquivoOfx = (nome = 'extrato.ofx', tamanho = 100): File =>
  new File([new Uint8Array(tamanho)], nome);

describe('Importacao', () => {
  const enviarArquivo = vi.fn();
  const confirmar = vi.fn();

  async function criar() {
    const fixture = TestBed.createComponent(Importacao);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const pronto = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, el, pronto };
  }

  function enviar(el: HTMLElement, arquivo: File): void {
    const campo = el.querySelector<HTMLInputElement>('#arquivo-ofx');
    if (!campo) throw new Error('Campo de arquivo não encontrado');
    Object.defineProperty(campo, 'files', { value: [arquivo], configurable: true });
    campo.dispatchEvent(new Event('change'));
  }

  const clicarImportar = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>('.rodape app-button button')?.click();

  const caixas = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]'));

  beforeEach(() => {
    enviarArquivo.mockReset().mockReturnValue(of(preview));
    confirmar.mockReset().mockReturnValue(of({ importadas: 2, ignoradasPorDuplicidade: 0 }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: ImportacaoService, useValue: { enviarArquivo, confirmar } },
        { provide: CategoriaService, useValue: { listar: () => of(categorias) } },
        { provide: ContaService, useValue: { listar: () => of([]) } },
      ],
    });
  });

  it('começa na etapa de envio, com instruções e aviso de privacidade', async () => {
    const { el } = await criar();

    const campo = el.querySelector<HTMLInputElement>('#arquivo-ofx');
    expect(campo?.accept).toBe('.ofx');
    expect(el.querySelector('label[for="arquivo-ofx"]')?.textContent).toContain('Escolher arquivo');
    expect(el.querySelector('details summary')?.textContent).toContain('Como exportar');
    expect(el.textContent).toContain('não fica armazenado');
    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });

  it('rejeita arquivo sem extensão .ofx sem chamar a API', async () => {
    const { el, pronto } = await criar();

    enviar(el, arquivoOfx('extrato.csv'));
    await pronto();

    expect(enviarArquivo).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('.ofx');
  });

  it('rejeita arquivo acima de 2 MB sem chamar a API', async () => {
    const { el, pronto } = await criar();

    enviar(el, arquivoOfx('grande.ofx', TAMANHO_MAX_ARQUIVO_BYTES + 1));
    await pronto();

    expect(enviarArquivo).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('2 MB');
  });

  it('envia o arquivo e mostra a tabela de revisão', async () => {
    const { el, pronto } = await criar();
    const arquivo = arquivoOfx('NU_jan.ofx');

    enviar(el, arquivo);
    await pronto();

    expect(enviarArquivo).toHaveBeenCalledWith(arquivo);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(el.textContent).toContain('NU_jan.ofx');
    expect(el.textContent).toContain('extrato da conta');
    expect(el.textContent).toContain('10/03/2026');
    expect(el.textContent).toMatch(/R\$\s?5\.000,00/);
    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });

  it('desabilita a linha já importada e desmarca a de pagamento de fatura', async () => {
    const { el, pronto } = await criar();
    enviar(el, arquivoOfx());
    await pronto();

    const [padaria, salario, duplicada, pagamento] = caixas(el);
    expect([padaria.checked, salario.checked]).toEqual([true, true]);
    expect(duplicada.checked).toBe(false);
    expect(duplicada.disabled).toBe(true);
    expect(pagamento.checked).toBe(false);
    expect(pagamento.disabled).toBe(false);
    expect(el.querySelector('.rotulo')?.textContent).toContain('já importada');
    expect(el.querySelector('.rotulo--aviso')?.textContent).toContain(
      'possível pagamento de fatura',
    );
  });

  it('o select de categoria só oferece as categorias do tipo da linha', async () => {
    const { el, pronto } = await criar();
    enviar(el, arquivoOfx());
    await pronto();

    const selects = el.querySelectorAll<HTMLSelectElement>('tbody select');
    const nomes = (s: HTMLSelectElement) => Array.from(s.options).map((o) => o.textContent?.trim());
    expect(nomes(selects[0])).toEqual(['Alimentação', 'Transporte', 'Outros']);
    expect(nomes(selects[1])).toEqual(['Salário']);
    expect(selects[0].getAttribute('aria-label')).toContain('Padaria Pao Quente');
  });

  it('marca "regra sua" na categoria vinda de regra do usuário, até ele trocá-la', async () => {
    enviarArquivo.mockReturnValue(
      of({
        origem: 'CONTA',
        linhas: [
          linha({
            idExterno: 'a',
            descricao: 'Netflix.com',
            categoriaId: 2,
            origemSugestao: 'REGRA_USUARIO',
            termoSugestao: 'netflix',
          }),
          linha({ idExterno: 'b', descricao: 'Padaria' }),
        ],
      }),
    );
    const { el, pronto } = await criar();
    enviar(el, arquivoOfx());
    await pronto();

    expect(el.querySelectorAll('.rotulo--regra')).toHaveLength(1);
    expect(el.querySelector('.rotulo--regra')?.textContent).toContain('regra sua: netflix');
    expect(el.textContent).toContain('1 categoria veio da sua regra');

    escolher(el, 'tbody select', '1'); // o usuário troca a sugestão da regra
    await pronto();

    expect(el.querySelector('.rotulo--regra')).toBeNull();
  });

  it('sem regras do usuário não mostra o aviso de regra', async () => {
    const { el, pronto } = await criar();
    enviar(el, arquivoOfx());
    await pronto();

    expect(el.querySelector('.rotulo--regra')).toBeNull();
    expect(el.textContent).not.toContain('da sua regra');
  });

  it('resume a seleção e o botão mostra a quantidade', async () => {
    const { el, pronto, fixture } = await criar();
    enviar(el, arquivoOfx());
    await pronto();

    expect(el.querySelector('.resumo-selecao')?.textContent).toMatch(/2\s+transações selecionadas/);
    expect(el.querySelector('.resumo-selecao')?.textContent).toMatch(/R\$\s?5\.000,00 em receitas/);
    expect(el.querySelector('.resumo-selecao')?.textContent).toMatch(/R\$\s?20,00 em despesas/);
    expect(el.querySelector('.rodape app-button')?.textContent).toContain('Importar 2 transações');

    const pagamento = caixas(el)[3];
    pagamento.checked = true;
    pagamento.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(el.querySelector('.rodape app-button')?.textContent).toContain('Importar 3 transações');
    expect(el.querySelector('.resumo-selecao')?.textContent).toMatch(/R\$\s?920,00 em despesas/);
  });

  it('confirma só as linhas marcadas, com a categoria escolhida e sem campos de aviso', async () => {
    const { el, pronto, fixture } = await criar();
    enviar(el, arquivoOfx());
    await pronto();

    escolher(el, 'tbody tr:first-child select', '2'); // Transporte
    fixture.detectChanges();
    clicarImportar(el);
    await pronto();

    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(confirmar.mock.calls[0][0]).toEqual([
      {
        idExterno: 'a',
        categoriaId: 2,
        descricao: 'Padaria Pao Quente',
        valor: 20,
        tipo: 'DESPESA',
        dataTransacao: '2026-03-10',
      },
      {
        idExterno: 'b',
        categoriaId: 4,
        descricao: 'Salario ACME',
        valor: 5000,
        tipo: 'RECEITA',
        dataTransacao: '2026-03-10',
      },
    ]);
  });

  it('desmarcar tudo desabilita o botão de importar', async () => {
    const { el, pronto, fixture } = await criar();
    enviar(el, arquivoOfx());
    await pronto();

    const marcarTodas = el.querySelector<HTMLInputElement>('.marcar-todas input');
    if (!marcarTodas) throw new Error('Checkbox "marcar todas" não encontrado');
    marcarTodas.checked = false;
    marcarTodas.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(caixas(el).every((c) => !c.checked)).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('.rodape app-button button')?.disabled).toBe(true);
    clicarImportar(el);
    expect(confirmar).not.toHaveBeenCalled();

    // "Marcar todas" não liga a linha já importada.
    marcarTodas.checked = true;
    marcarTodas.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(caixas(el).map((c) => c.checked)).toEqual([true, true, false, true]);
  });

  it('mostra o resultado, com links, depois de importar', async () => {
    confirmar.mockReturnValue(of({ importadas: 2, ignoradasPorDuplicidade: 1 }));
    const { el, pronto } = await criar();
    enviar(el, arquivoOfx());
    await pronto();

    clicarImportar(el);
    await pronto();

    expect(el.textContent).toContain('Importação concluída');
    expect(el.textContent).toContain('2 transações importadas com sucesso');
    expect(el.textContent).toContain('1 lançamento já existia');
    expect(el.querySelector('a[href="/transacoes"]')).not.toBeNull();
    expect(el.querySelector('a[href="/dashboard"]')).not.toBeNull();
  });

  it('"Importar outro arquivo" volta para a etapa de envio', async () => {
    const { el, pronto } = await criar();
    enviar(el, arquivoOfx());
    await pronto();
    clicarImportar(el);
    await pronto();

    el.querySelector<HTMLButtonElement>('.sucesso app-button button')?.click();
    await pronto();

    expect(el.querySelector('#arquivo-ofx')).not.toBeNull();
    expect(el.querySelector('table')).toBeNull();
  });

  it('erro da API ao ler o arquivo volta para o envio e mostra a mensagem', async () => {
    enviarArquivo.mockReturnValue(
      throwError(() => new ApiError(400, 'Arquivo inválido: não é um arquivo OFX')),
    );
    const { el, pronto } = await criar();

    enviar(el, arquivoOfx());
    await pronto();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('não é um arquivo OFX');
    expect(el.querySelector('#arquivo-ofx')).not.toBeNull();
  });

  it('erro da API ao confirmar mantém a revisão para tentar de novo', async () => {
    confirmar.mockReturnValue(throwError(() => new ApiError(500, 'Erro interno do servidor')));
    const { el, pronto } = await criar();
    enviar(el, arquivoOfx());
    await pronto();

    clicarImportar(el);
    await pronto();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Erro interno do servidor');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(el.querySelector<HTMLButtonElement>('.rodape app-button button')?.disabled).toBe(false);
  });

  describe('conta de destino e transferência de fatura', () => {
    const umaConta = (id: number, nome: string, tipo: 'CONTA_CORRENTE' | 'CARTAO_CREDITO') => ({
      id,
      nome,
      tipo,
      saldoInicial: 0,
      identificadorExterno: null,
      arquivada: false,
      saldo: 0,
      totalTransacoes: 0,
    });
    const contas = [
      umaConta(1, 'Conta principal', 'CONTA_CORRENTE'),
      umaConta(2, 'Cartão', 'CARTAO_CREDITO'),
    ];

    function comContas(previewDoArquivo: PreviewImportacao) {
      TestBed.resetTestingModule();
      enviarArquivo.mockReturnValue(of(previewDoArquivo));
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: LOCALE_ID, useValue: 'pt-BR' },
          { provide: ImportacaoService, useValue: { enviarArquivo, confirmar } },
          { provide: CategoriaService, useValue: { listar: () => of(categorias) } },
          { provide: ContaService, useValue: { listar: () => of(contas), criar: criarConta } },
        ],
      });
    }
    const criarConta = vi.fn();

    it('conta reconhecida pelo arquivo: avisa e importa nela, guardando o identificador', async () => {
      comContas({
        ...preview,
        contaId: 1,
        contaReconhecida: true,
        identificadorExterno: 'conta:0260:1',
      });
      const { el, pronto } = await criar();
      enviar(el, arquivoOfx());
      await pronto();

      expect(el.querySelector('.conta-destino')?.textContent).toContain(
        'Conta reconhecida pelo arquivo',
      );
      clicarImportar(el);
      await pronto();

      expect(confirmar.mock.calls[0][1]).toEqual({
        contaId: 1,
        identificadorExterno: 'conta:0260:1',
      });
    });

    it('arquivo novo: oferece escolher uma conta ou criar uma, com o nome sugerido', async () => {
      comContas({
        ...preview,
        contaId: 1,
        identificadorExterno: 'cartao:99',
        nomeContaSugerido: 'Cartão de crédito',
        tipoContaSugerido: 'CARTAO_CREDITO',
      });
      criarConta.mockReturnValue(of(umaConta(7, 'Cartão de crédito', 'CARTAO_CREDITO')));
      const { el, pronto } = await criar();
      enviar(el, arquivoOfx());
      await pronto();

      expect(el.querySelector('.conta-destino')?.textContent).toContain(
        'ainda não está ligado a nenhuma conta',
      );
      expect(el.querySelector<HTMLInputElement>('#importacao-nova-conta')?.value).toBe(
        'Cartão de crédito',
      );
      [...el.querySelectorAll<HTMLButtonElement>('.conta-destino button')]
        .find((b) => b.textContent?.includes('Criar conta'))!
        .click();
      await pronto();

      expect(criarConta).toHaveBeenCalledWith({
        nome: 'Cartão de crédito',
        tipo: 'CARTAO_CREDITO',
        identificadorExterno: 'cartao:99',
      });
      expect(enviarArquivo).toHaveBeenLastCalledWith(expect.any(File), 7);
    });

    it('trocar a conta relê o arquivo para achar as duplicatas nela', async () => {
      comContas(preview);
      const { el, pronto } = await criar();
      enviar(el, arquivoOfx());
      await pronto();

      enviarArquivo.mockReturnValue(
        of({
          ...preview,
          contaId: 2,
          linhas: preview.linhas.map((l) => ({ ...l, duplicada: l.idExterno === 'a' })),
        }),
      );
      escolher(el, '#importacao-conta', '2');
      await pronto();

      expect(enviarArquivo).toHaveBeenLastCalledWith(expect.any(File), 2);
      expect(el.querySelectorAll('.linha-desabilitada')).toHaveLength(1);
    });

    it('pagamento de fatura pode virar transferência para a conta do cartão', async () => {
      const comFatura: PreviewImportacao = {
        ...preview,
        linhas: [
          linha({
            idExterno: 'f',
            descricao: 'Pagamento de fatura',
            valor: 900,
            ignoradaSugerida: true,
            motivoIgnorada: 'possível pagamento de fatura',
            pagamentoDeFatura: true,
          }),
        ],
      };
      comContas(comFatura);
      const { el, pronto } = await criar();
      enviar(el, arquivoOfx());
      await pronto();

      const destino = el.querySelector<HTMLSelectElement>('.transferencia-linha select')!;
      expect(destino.selectedOptions[0].textContent).toContain('Cartão'); // sugerida
      expect(caixas(el)[0].checked).toBe(false); // continua desmarcada até o usuário decidir
      caixas(el)[0].click();
      await pronto();
      clicarImportar(el);
      await pronto();

      expect(confirmar.mock.calls[0][0][0]).toMatchObject({ idExterno: 'f', contaDestinoId: 2 });
    });
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Categoria } from '../types';
import { lerOfx } from '../utils/ofx-parser';
import {
  descricaoCasaComTermo,
  ehPagamentoDeFatura,
  ehTransferenciaPropria,
  normalizar,
  resolverCategoriaId,
  sugerirCategoria,
  sugerirIgnorada,
  sugerirNomeCategoria,
} from './categorizacao.service';

const FIXTURES = path.resolve(__dirname, '../../tests/fixtures');

describe('normalizar', () => {
  it('remove acentos, pontuação e caixa', () => {
    expect(normalizar('  Transferência ENVIADA pelo Pix - Açaí* Ltda. ')).toBe(
      'transferencia enviada pelo pix acai ltda',
    );
  });
});

describe('sugerirNomeCategoria (despesa)', () => {
  it.each([
    ['Dl*Uberrides', 'Transporte'],
    ['99*Pop', 'Transporte'],
    ['Auto Posto Central', 'Transporte'],
    ['Entry Park Estacioname', 'Transporte'],
    ['Ifd*Pizzaria Napoli', 'Alimentação'],
    ['SUPERMERCADO ESTRELA', 'Alimentação'],
    ['Cafe e Letras', 'Alimentação'],
    ['Ebanossorvete', 'Alimentação'],
    ['Netflix Entretenimento', 'Lazer'],
    ['Ebn *Spotify', 'Lazer'],
    ['Drogaria Pacheco', 'Saúde'],
    ['Compra no débito - Farmacia Bem Estar', 'Saúde'],
    ['Smart Fit Academia', 'Saúde'],
    ['Pagamento de boleto efetuado - UNIMED SEGUROS SAUDE S.A.', 'Saúde'],
    ['Pagamento de boleto efetuado - CONDOMINIO EDIFICIO ALVORADA', 'Moradia'],
    ['Pagamento de boleto efetuado - ENEL DISTRIBUICAO SAO PAULO', 'Moradia'],
    ['Pagamento de boleto efetuado - SABESP CIA SANEAMENTO BASICO', 'Moradia'],
    ['Conta Vivo', 'Moradia'],
    ['Udemy*Curso Online', 'Educação'],
  ])('%s → %s', (descricao, esperada) => {
    expect(sugerirNomeCategoria(descricao, 'DESPESA')).toBe(esperada);
  });

  it.each([
    'Anthropic* Claude Sub',
    'Mercadolivre*Mercadol',
    'Amazon Marketplace',
    'Enjoei *Vendedor',
  ])('sem regra óbvia cai em Outros: %s', (descricao) => {
    expect(sugerirNomeCategoria(descricao, 'DESPESA')).toBe('Outros');
  });

  it('não confunde "posto" ou "curso" dentro de outras palavras', () => {
    expect(sugerirNomeCategoria('Composto Quimico', 'DESPESA')).toBe('Outros');
    expect(sugerirNomeCategoria('Concurso Cultural', 'DESPESA')).toBe('Outros');
  });

  it('Pix para pessoas vai para Outros (o usuário reclassifica na revisão)', () => {
    expect(
      sugerirNomeCategoria('Transferência enviada pelo Pix - RAFAEL TEIXEIRA ALVES', 'DESPESA'),
    ).toBe('Outros');
  });
});

describe('sugerirNomeCategoria (receita)', () => {
  it.each([
    ['Crédito de salário - ACME', 'Salário'],
    ['Rendimento líquido CDB', 'Investimentos'],
    ['Dividendos recebidos', 'Investimentos'],
    ['Pagamento freelance site', 'Freelance'],
    ['Transferência recebida pelo Pix - FULANO', 'Outros'],
  ])('%s → %s', (descricao, esperada) => {
    expect(sugerirNomeCategoria(descricao, 'RECEITA')).toBe(esperada);
  });
});

describe('resolverCategoriaId', () => {
  const categorias: Categoria[] = [
    { id: 1, nome: 'Alimentação', tipo: 'DESPESA' },
    { id: 2, nome: 'Outros', tipo: 'DESPESA' },
    { id: 3, nome: 'Salário', tipo: 'RECEITA' },
    { id: 4, nome: 'Outros', tipo: 'RECEITA' },
  ];

  it('acha pelo nome dentro do tipo', () => {
    expect(resolverCategoriaId(categorias, 'Alimentação', 'DESPESA')).toBe(1);
    expect(resolverCategoriaId(categorias, 'Salário', 'RECEITA')).toBe(3);
  });

  it('cai em "Outros" do mesmo tipo quando o nome não existe naquele tipo', () => {
    expect(resolverCategoriaId(categorias, 'Alimentação', 'RECEITA')).toBe(4);
    expect(resolverCategoriaId(categorias, 'Inexistente', 'DESPESA')).toBe(2);
  });

  it('devolve null quando nem "Outros" existe', () => {
    expect(resolverCategoriaId([], 'Alimentação', 'DESPESA')).toBeNull();
  });
});

describe('descricaoCasaComTermo', () => {
  it('compara texto normalizado: sem acento, maiúsculas nem pontuação', () => {
    expect(descricaoCasaComTermo('PADARIA PÃO-Quente*SP', 'pao quente sp')).toBe(true);
    expect(descricaoCasaComTermo('Netflix.com', 'netflix')).toBe(true);
    expect(descricaoCasaComTermo('Spotify', 'netflix')).toBe(false);
  });
});

describe('sugerirCategoria (precedência: regra do usuário > regras fixas > Outros)', () => {
  const categorias: Categoria[] = [
    { id: 1, nome: 'Alimentação', tipo: 'DESPESA' },
    { id: 2, nome: 'Lazer', tipo: 'DESPESA' },
    { id: 3, nome: 'Outros', tipo: 'DESPESA' },
    { id: 4, nome: 'Assinaturas', tipo: 'DESPESA', usuarioId: 7 },
    { id: 5, nome: 'Salário', tipo: 'RECEITA' },
    { id: 6, nome: 'Outros', tipo: 'RECEITA' },
  ];

  it('sem regras do usuário, usa a regra fixa e depois "Outros"', () => {
    expect(sugerirCategoria('Padaria Estrela', 'DESPESA', categorias)).toEqual({
      categoriaId: 1,
      origem: 'REGRA_PADRAO',
      termo: null,
    });
    expect(sugerirCategoria('Loja Misteriosa', 'DESPESA', categorias)).toEqual({
      categoriaId: 3,
      origem: 'FALLBACK',
      termo: null,
    });
  });

  it('a regra do usuário vence a regra fixa (netflix seria Lazer)', () => {
    const regras = [{ categoriaId: 4, termo: 'netflix' }];

    expect(sugerirCategoria('NETFLIX.COM', 'DESPESA', categorias, regras)).toEqual({
      categoriaId: 4,
      origem: 'REGRA_USUARIO',
      termo: 'netflix',
    });
  });

  it('com várias regras casando, vence a de termo mais longo', () => {
    const regras = [
      { categoriaId: 2, termo: 'net' },
      { categoriaId: 4, termo: 'netflix com' },
      { categoriaId: 1, termo: 'netflix' },
    ];

    expect(sugerirCategoria('Netflix.com', 'DESPESA', categorias, regras)?.categoriaId).toBe(4);
  });

  it('regra de categoria de despesa não classifica receita', () => {
    const regras = [{ categoriaId: 4, termo: 'acme' }];

    expect(sugerirCategoria('Acme Ltda', 'RECEITA', categorias, regras)).toEqual({
      categoriaId: 6,
      origem: 'FALLBACK',
      termo: null,
    });
  });

  it('regra cujo termo não aparece na descrição é ignorada', () => {
    const regras = [{ categoriaId: 4, termo: 'spotify' }];

    expect(sugerirCategoria('Netflix', 'DESPESA', categorias, regras)?.origem).toBe('REGRA_PADRAO');
  });

  it('devolve null quando nem "Outros" existe', () => {
    expect(sugerirCategoria('Loja Misteriosa', 'DESPESA', [])).toBeNull();
  });
});

describe('detectores de linhas a desmarcar', () => {
  it('reconhece o pagamento de fatura no extrato e na fatura', () => {
    expect(ehPagamentoDeFatura('Pagamento de fatura')).toBe(true);
    expect(ehPagamentoDeFatura('Pagamento recebido')).toBe(true);
    expect(ehPagamentoDeFatura('PAGAMENTO DE FATURA - Nubank')).toBe(true);
  });

  it('não confunde outros pagamentos com pagamento de fatura', () => {
    expect(ehPagamentoDeFatura('Pagamento de boleto efetuado - ENEL')).toBe(false);
    expect(ehPagamentoDeFatura('Compra - Pagamento de fatura de terceiros')).toBe(false);
  });

  it('reconhece Pix com o nome do próprio usuário, ignorando acento e caixa', () => {
    const memo = 'Transferência enviada pelo Pix - USUARIO TESTE';
    expect(ehTransferenciaPropria(memo, 'Usuário Teste')).toBe(true);
    expect(ehTransferenciaPropria(memo, 'usuario teste')).toBe(true);
  });

  it('exige o nome completo: sobrenome diferente ou nome único não casam', () => {
    const memo = 'Transferência recebida pelo Pix - MARIA SILVA SANTOS';
    expect(ehTransferenciaPropria(memo, 'Maria')).toBe(false);
    expect(ehTransferenciaPropria(memo, 'Maria Oliveira')).toBe(false);
    expect(ehTransferenciaPropria(memo, 'Maria Silva')).toBe(true);
  });

  it('ignora partículas como "de" e "da" no nome do usuário', () => {
    expect(ehTransferenciaPropria('Pix - JOAO SILVA', 'João da Silva')).toBe(true);
  });

  it('sugerirIgnorada devolve o motivo em português', () => {
    expect(sugerirIgnorada('Pagamento recebido', 'Usuario Teste')?.motivo).toBe(
      'possível pagamento de fatura',
    );
    expect(sugerirIgnorada('Pix - USUARIO TESTE', 'Usuario Teste')?.motivo).toBe(
      'possível transferência entre suas contas',
    );
    expect(sugerirIgnorada('Compra no débito - Padaria', 'Usuario Teste')).toBeNull();
  });
});

describe('cobertura contra o gabarito dos fixtures', () => {
  const gabarito: Record<string, { categoria: string; ignorada: boolean }> = JSON.parse(
    readFileSync(path.join(FIXTURES, 'gabarito.json'), 'utf-8'),
  );
  const arquivos = [
    ['extratos', 'NU_123456789_01JAN2026_25SET2026.ofx'],
    ...Array.from({ length: 9 }, (_, i) => [
      'faturas',
      `Nubank_2026-${String(i + 2).padStart(2, '0')}-05.ofx`,
    ]),
  ];
  const transacoes = arquivos.flatMap(
    ([pasta, nome]) => lerOfx(readFileSync(path.join(FIXTURES, pasta, nome))).transacoes,
  );
  const unicas = [...new Map(transacoes.map((t) => [t.idExterno, t])).values()];

  it('marca como ignoradas exatamente as 19 linhas do gabarito', () => {
    const marcadas = unicas.filter((t) => sugerirIgnorada(t.descricao, 'Usuario Teste'));
    const esperadas = Object.entries(gabarito)
      .filter(([, g]) => g.ignorada)
      .map(([id]) => id);

    expect(marcadas.map((t) => t.idExterno).sort()).toEqual(esperadas.sort());
    expect(marcadas).toHaveLength(19);
  });

  it('acerta ao menos 80% das categorias das linhas que serão importadas', () => {
    const importaveis = unicas.filter((t) => !gabarito[t.idExterno].ignorada);
    const acertos = importaveis.filter(
      (t) => sugerirNomeCategoria(t.descricao, t.tipo) === gabarito[t.idExterno].categoria,
    );

    expect(importaveis).toHaveLength(481);
    expect(acertos.length / importaveis.length).toBeGreaterThanOrEqual(0.8);
  });
});

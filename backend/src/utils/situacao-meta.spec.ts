import { percentualDaMeta, situacaoDaMeta } from './situacao-meta';

describe('situacaoDaMeta', () => {
  it.each([
    [0, 'DENTRO'],
    [79, 'DENTRO'],
    [79.99, 'DENTRO'],
    [80, 'ATENCAO'],
    [99.99, 'ATENCAO'],
    [100, 'ATENCAO'],
    [100.01, 'ESTOURADA'],
    [101, 'ESTOURADA'],
  ])('R$ %s numa meta de R$ 100 é %s', (gasto, situacao) => {
    expect(situacaoDaMeta(gasto, 100)).toBe(situacao);
  });

  it('não erra o limite por causa de ponto flutuante', () => {
    // 0,1 + 0,2 = 0.30000000000000004 em ponto flutuante
    expect(situacaoDaMeta(0.1 + 0.2, 0.3)).toBe('ATENCAO');
    expect(situacaoDaMeta(0.8 * 1234.56, 1234.56)).toBe('ATENCAO');
  });
});

describe('percentualDaMeta', () => {
  it('arredonda para uma casa decimal e passa de 100 quando estoura', () => {
    expect(percentualDaMeta(980, 1200)).toBe(81.7);
    expect(percentualDaMeta(150, 100)).toBe(150);
    expect(percentualDaMeta(0, 100)).toBe(0);
  });

  it('meta zero não divide por zero', () => {
    expect(percentualDaMeta(10, 0)).toBe(0);
  });
});

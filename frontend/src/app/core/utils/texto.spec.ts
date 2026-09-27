import { normalizar, sugerirTermo } from './texto';

describe('normalizar', () => {
  it('tira acento, caixa e pontuação, como o backend', () => {
    expect(normalizar('  PADARIA Pão-Quente*SP  ')).toBe('padaria pao quente sp');
  });
});

describe('sugerirTermo', () => {
  it('acha a parte comum ignorando números e datas', () => {
    expect(sugerirTermo(['NETFLIX.COM 03/26', 'Netflix.com 04/26', 'netflix.com'])).toBe(
      'netflix com',
    );
  });

  it('escolhe a maior sequência comum', () => {
    expect(
      sugerirTermo(['Compra no débito - Padaria Estrela', 'Compra no débito - Padaria Lua']),
    ).toBe('compra no debito padaria');
  });

  it('com uma só descrição, usa ela inteira (sem os números)', () => {
    expect(sugerirTermo(['Uber *Trip 1234 São Paulo'])).toBe('uber trip');
  });

  it('não junta palavras separadas por número (não casaria na descrição original)', () => {
    expect(sugerirTermo(['IFOOD 123 LOJA', 'IFOOD 456 LOJA'])).toBe('ifood');
  });

  it('descarta ligações nas pontas e exige uma palavra de verdade', () => {
    expect(sugerirTermo(['Pagamento de Netflix', 'Compra de Netflix'])).toBe('netflix');
    expect(sugerirTermo(['de da', 'de da'])).toBeNull();
  });

  it('sem nada em comum, ou termo curto demais, não sugere', () => {
    expect(sugerirTermo(['Netflix', 'Spotify'])).toBeNull();
    expect(sugerirTermo(['ab 12', 'ab 34'])).toBeNull();
    expect(sugerirTermo(['12/03 456', '12/03 456'])).toBeNull();
  });

  it('lista vazia não sugere', () => {
    expect(sugerirTermo([])).toBeNull();
  });

  it('respeita o limite de 100 caracteres do termo', () => {
    const longa = Array.from({ length: 30 }, () => 'palavra').join(' ');
    const termo = sugerirTermo([longa, longa]);
    expect(termo).not.toBeNull();
    expect(termo!.length).toBeLessThanOrEqual(100);
  });
});

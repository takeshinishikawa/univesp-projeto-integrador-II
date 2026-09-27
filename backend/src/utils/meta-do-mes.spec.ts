import { metasDoMes, valoresDasMetas } from './meta-do-mes';

describe('metasDoMes', () => {
  it('soma as metas por categoria de cada mês, em centavos (sem ruído de ponto flutuante)', () => {
    const metas = metasDoMes(new Map(), [
      { mes: 1, valor: 0.1 },
      { mes: 1, valor: 0.2 },
      { mes: 2, valor: 1234.56 },
    ]);

    expect(metas.get(1)).toEqual({ valor: 0.3, origem: 'CATEGORIAS' });
    expect(metas.get(2)).toEqual({ valor: 1234.56, origem: 'CATEGORIAS' });
  });

  it('a meta total antiga só vale no mês sem nenhuma meta por categoria', () => {
    const metas = metasDoMes(
      new Map([
        [1, 5000],
        [2, 700],
      ]),
      [{ mes: 1, valor: 300 }],
    );

    expect(metas.get(1)).toEqual({ valor: 300, origem: 'CATEGORIAS' });
    expect(metas.get(2)).toEqual({ valor: 700, origem: 'ANTIGA' });
  });

  it('mês sem nenhuma das duas não tem meta', () => {
    expect(metasDoMes(new Map(), []).size).toBe(0);
  });

  it('valoresDasMetas devolve só o valor de cada mês', () => {
    const metas = metasDoMes(new Map([[3, 100]]), [{ mes: 4, valor: 50 }]);

    expect([...valoresDasMetas(metas)]).toEqual([
      [4, 50],
      [3, 100],
    ]);
  });
});

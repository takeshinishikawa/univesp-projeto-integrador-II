import { hojeIso, paramsDoFiltro, paramsDoPeriodo } from './data';

describe('data utils', () => {
  it('hojeIso formata a data local com zeros à esquerda', () => {
    expect(hojeIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(hojeIso(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('paramsDoPeriodo inclui apenas os campos informados', () => {
    expect(paramsDoPeriodo().keys()).toEqual([]);
    expect(paramsDoPeriodo({ ano: 2026 }).toString()).toBe('ano=2026');
    expect(paramsDoPeriodo({ mes: 3, ano: 2026 }).toString()).toBe('ano=2026&mes=3');
  });

  it('paramsDoFiltro inclui só os filtros informados (busca vazia não vai)', () => {
    expect(paramsDoFiltro().keys()).toEqual([]);
    expect(paramsDoFiltro({ busca: '' }).keys()).toEqual([]);
    expect(
      paramsDoFiltro({
        ano: 2026,
        busca: 'pix',
        categoriaId: 4,
        tipo: 'DESPESA',
        valorMin: 0,
        valorMax: 99.9,
      }).toString(),
    ).toBe('ano=2026&busca=pix&categoriaId=4&tipo=DESPESA&valorMin=0&valorMax=99.9');
  });
});

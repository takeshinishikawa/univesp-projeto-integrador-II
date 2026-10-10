import { somarMeses } from './datas';

describe('somarMeses', () => {
  it('avança meses mantendo o dia', () => {
    expect(somarMeses('2026-01-15', 1)).toBe('2026-02-15');
    expect(somarMeses('2026-09-25', 4)).toBe('2027-01-25');
  });

  it('limita ao último dia do mês de destino', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2027-12-31', 2)).toBe('2028-02-29');
  });

  it('volta meses com n negativo e não mexe com n = 0', () => {
    expect(somarMeses('2026-03-31', -1)).toBe('2026-02-28');
    expect(somarMeses('2026-01-10', -1)).toBe('2025-12-10');
    expect(somarMeses('2026-05-05', 0)).toBe('2026-05-05');
  });
});

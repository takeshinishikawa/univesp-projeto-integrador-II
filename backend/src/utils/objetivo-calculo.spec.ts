import { calcularProgresso } from './objetivo-calculo';

const base = {
  valorAlvo: 6000,
  prazoAno: 2027,
  prazoMes: 3,
  criadoEm: '2026-09-01',
  hoje: '2026-09-15',
};

describe('calcularProgresso', () => {
  it('no mês da criação, sem aportes, está no ritmo e mostra o valor mensal necessário', () => {
    const p = calcularProgresso({ ...base, acumulado: 0 });

    expect(p.situacao).toBe('NO_RITMO');
    expect(p.percentual).toBe(0);
    expect(p.mesesRestantes).toBe(6);
    expect(p.valorMensalNecessario).toBe(1000);
  });

  it('o valor mensal considera só o que falta', () => {
    const p = calcularProgresso({ ...base, acumulado: 2400 });

    expect(p.percentual).toBe(40);
    expect(p.valorMensalNecessario).toBe(600);
  });

  it('atrasado quando o acumulado fica abaixo da linha reta entre a criação e o prazo', () => {
    // criado em set/26, prazo mar/27 = 6 meses; em dez/26 já se esperava 3/6 = R$ 3.000
    const hoje = '2026-12-10';

    expect(calcularProgresso({ ...base, hoje, acumulado: 2999 }).situacao).toBe('ATRASADO');
    expect(calcularProgresso({ ...base, hoje, acumulado: 3000 }).situacao).toBe('NO_RITMO');
  });

  it('concluído ao atingir o alvo, mesmo passando dele (a barra é limitada na tela, o valor é real)', () => {
    const p = calcularProgresso({ ...base, acumulado: 6500 });

    expect(p.situacao).toBe('CONCLUIDO');
    expect(p.percentual).toBe(108.3);
    expect(p.valorMensalNecessario).toBe(0);
  });

  it('vencido quando passou do prazo sem atingir o alvo', () => {
    const p = calcularProgresso({ ...base, hoje: '2027-04-02', acumulado: 5000 });

    expect(p.situacao).toBe('VENCIDO');
    expect(p.mesesRestantes).toBe(1);
  });

  it('prazo no mês corrente: no mínimo 1 mês restante', () => {
    const p = calcularProgresso({ ...base, prazoAno: 2026, prazoMes: 9, acumulado: 1000 });

    expect(p.mesesRestantes).toBe(1);
    expect(p.valorMensalNecessario).toBe(5000);
  });

  it('atravessa a virada do ano', () => {
    const p = calcularProgresso({
      ...base,
      hoje: '2026-11-20',
      prazoAno: 2027,
      prazoMes: 2,
      acumulado: 0,
    });

    expect(p.mesesRestantes).toBe(3);
  });
});

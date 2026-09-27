import { SituacaoObjetivo } from '../types/novas-features';
import { mesesEntre } from './datas';

export interface EntradaProgresso {
  valorAlvo: number;
  prazoAno: number;
  prazoMes: number;
  criadoEm: string; // YYYY-MM-DD
  acumulado: number;
  hoje: string; // YYYY-MM-DD
}

export interface Progresso {
  percentual: number;
  mesesRestantes: number;
  valorMensalNecessario: number;
  situacao: SituacaoObjetivo;
}

const centavos = (valor: number): number => Math.round(valor * 100);
const anoMes = (iso: string): [number, number] => [
  Number(iso.slice(0, 4)),
  Number(iso.slice(5, 7)),
];

/**
 * Progresso de um objetivo: quanto falta guardar por mês e se está no ritmo. O ritmo esperado é uma
 * linha reta do mês de criação até o mês do prazo; passou do prazo sem atingir, está vencido.
 */
export function calcularProgresso(entrada: EntradaProgresso): Progresso {
  const { valorAlvo, prazoAno, prazoMes, criadoEm, acumulado, hoje } = entrada;
  const [anoHoje, mesHoje] = anoMes(hoje);
  const [anoCriado, mesCriado] = anoMes(criadoEm);

  const alvo = centavos(valorAlvo);
  const guardado = centavos(acumulado);
  const concluido = guardado >= alvo;
  const mesesRestantes = Math.max(1, mesesEntre(anoHoje, mesHoje, prazoAno, prazoMes));

  let situacao: SituacaoObjetivo;
  if (concluido) {
    situacao = 'CONCLUIDO';
  } else if (mesesEntre(anoHoje, mesHoje, prazoAno, prazoMes) < 0) {
    situacao = 'VENCIDO';
  } else {
    const total = Math.max(1, mesesEntre(anoCriado, mesCriado, prazoAno, prazoMes));
    const decorridos = Math.min(
      total,
      Math.max(0, mesesEntre(anoCriado, mesCriado, anoHoje, mesHoje)),
    );
    situacao = guardado >= (alvo * decorridos) / total ? 'NO_RITMO' : 'ATRASADO';
  }

  return {
    percentual: alvo === 0 ? 0 : Math.round((guardado / alvo) * 1000) / 10,
    mesesRestantes,
    valorMensalNecessario: concluido ? 0 : Math.round((alvo - guardado) / mesesRestantes) / 100,
    situacao,
  };
}

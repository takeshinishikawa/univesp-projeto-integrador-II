import axe from 'axe-core';

/**
 * Roda o axe-core contra o DOM já renderizado e devolve um relatório em texto das violações
 * (vazio se não houver nenhuma). Pensado para `expect(await violacoesDeAcessibilidade(el)).toBe('')`:
 * a string formatada aparece inteira no diff do teste quando falha, sem precisar inspecionar objeto.
 *
 * Regras que dependem de layout real (ex. `color-contrast`) o jsdom não consegue avaliar; o
 * axe-core já trata isso sozinho, classificando como "incomplete" em vez de "violation" — por
 * isso só `violations` entra no relatório. Contraste de cor é conferido à parte, nos próprios
 * comentários de `styles.scss` (proporções calculadas manualmente contra os tokens de cor).
 */
export async function violacoesDeAcessibilidade(elemento: Element): Promise<string> {
  const resultado = await axe.run(elemento);
  if (resultado.violations.length === 0) return '';

  return resultado.violations
    .map((v) => {
      const alvos = v.nodes.map((n) => `    - ${n.target.join(' ')}`).join('\n');
      return `[${v.impact}] ${v.id}: ${v.help}\n${alvos}\n    ${v.helpUrl}`;
    })
    .join('\n\n');
}

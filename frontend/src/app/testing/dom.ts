/** Helpers de DOM para os testes de componente. */

export function digitar(raiz: HTMLElement, seletor: string, valor: string): void {
  const campo = raiz.querySelector<HTMLInputElement>(seletor);
  if (!campo) throw new Error(`Campo não encontrado: ${seletor}`);
  campo.value = valor;
  campo.dispatchEvent(new Event('input'));
}

export function escolher(raiz: HTMLElement, seletor: string, valor: string): void {
  const campo = raiz.querySelector<HTMLSelectElement>(seletor);
  if (!campo) throw new Error(`Select não encontrado: ${seletor}`);
  campo.value = valor;
  campo.dispatchEvent(new Event('change'));
}

export function enviarFormulario(raiz: HTMLElement): void {
  const form = raiz.querySelector('form');
  if (!form) throw new Error('Formulário não encontrado');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
}

export function mensagensDeErro(raiz: HTMLElement): string[] {
  return Array.from(raiz.querySelectorAll('.campo__erro')).map((e) => e.textContent?.trim() ?? '');
}

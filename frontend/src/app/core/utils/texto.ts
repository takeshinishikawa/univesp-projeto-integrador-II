/** Mesmo texto normalizado do backend: minúsculas, sem acento e sem pontuação. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const TERMO_MINIMO = 3;
const TERMO_MAXIMO = 100;
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'para', 'por']);

const soNumeros = (palavra: string): boolean => /^\d+$/.test(palavra);

/** Trechos de palavras seguidas, sem números (que separam os trechos: datas, parcelas, códigos). */
function trechos(texto: string): string[][] {
  const resultado: string[][] = [];
  let atual: string[] = [];
  for (const palavra of normalizar(texto).split(' ')) {
    if (palavra === '' || soNumeros(palavra)) {
      if (atual.length > 0) resultado.push(atual);
      atual = [];
    } else {
      atual.push(palavra);
    }
  }
  if (atual.length > 0) resultado.push(atual);
  return resultado;
}

function aparar(palavras: string[]): string[] {
  let inicio = 0;
  let fim = palavras.length;
  while (inicio < fim && LIGACOES.has(palavras[inicio])) inicio += 1;
  while (fim > inicio && LIGACOES.has(palavras[fim - 1])) fim -= 1;
  return palavras.slice(inicio, fim);
}

/**
 * Maior sequência de palavras comum a todas as descrições, ignorando números e datas
 * ("NETFLIX.COM 03/26" e "Netflix.com 04/26" → "netflix com"). Devolve `null` se não houver
 * um termo aproveitável (ao menos 3 caracteres e uma palavra que não seja só ligação).
 */
export function sugerirTermo(descricoes: readonly string[]): string | null {
  if (descricoes.length === 0) return null;
  const textos = descricoes.map((d) => ` ${normalizar(d)} `);

  let melhor: string | null = null;
  for (const trecho of trechos(descricoes[0])) {
    for (let inicio = 0; inicio < trecho.length; inicio += 1) {
      for (let fim = trecho.length; fim > inicio; fim -= 1) {
        const palavras = aparar(trecho.slice(inicio, fim));
        const candidato = palavras.join(' ');
        if (
          candidato.length < TERMO_MINIMO ||
          candidato.length > TERMO_MAXIMO ||
          (melhor !== null && candidato.length <= melhor.length)
        ) {
          continue;
        }
        if (textos.every((texto) => texto.includes(` ${candidato} `))) melhor = candidato;
      }
    }
  }
  return melhor;
}

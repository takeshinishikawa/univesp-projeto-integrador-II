import { Directive, ElementRef, forwardRef, inject } from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';

const formato = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1234.5 -> "1.234,50" */
export function formatarMoeda(valor: number): string {
  return formato.format(valor);
}

/**
 * Lê o que a pessoa digitou como valor em reais e devolve o número arredondado aos centavos:
 * "1.234,56", "1234,56", "35" e "R$ 35,00" valem; "89.9" (ponto com até dois dígitos depois)
 * também, como decimal. Texto vazio vira `null`; texto que não é número vira `NaN`.
 */
export function lerMoeda(texto: string): number | null {
  let t = texto.replace(/R\$/gi, '').replace(/\s/g, '');
  if (t === '') return null;
  if (!/^-?[\d.,]+$/.test(t)) return NaN;
  if (t.includes(',')) {
    if (t.indexOf(',') !== t.lastIndexOf(',')) return NaN;
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (!/^-?\d*\.\d{1,2}$/.test(t)) {
    t = t.replace(/\./g, ''); // pontos como separador de milhar: "1.500" = 1500
  }
  const numero = Number(t);
  return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : NaN;
}

/**
 * Campo de valor em reais no formato brasileiro ("35,00", "1.500,00"). Formata ao sair do campo e
 * quando o valor é preenchido pelo código (editar, limpar); enquanto a pessoa digita, não mexe no
 * texto. O valor do formulário continua um número, e texto que não é número gera o erro `moeda`.
 */
@Directive({
  selector: 'input[appMoeda]',
  host: {
    '(input)': 'aoDigitar()',
    '(blur)': 'aoSair()',
  },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Moeda), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => Moeda), multi: true },
  ],
})
export class Moeda implements ControlValueAccessor, Validator {
  private readonly campo = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private aoMudar: (valor: number | null) => void = () => undefined;
  private aoSerTocado: () => void = () => undefined;

  writeValue(valor: number | null): void {
    this.campo.value =
      typeof valor === 'number' && Number.isFinite(valor) ? formatarMoeda(valor) : '';
  }

  registerOnChange(fn: (valor: number | null) => void): void {
    this.aoMudar = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.aoSerTocado = fn;
  }

  setDisabledState(desabilitado: boolean): void {
    this.campo.disabled = desabilitado;
  }

  validate(controle: AbstractControl): ValidationErrors | null {
    return Number.isNaN(controle.value) ? { moeda: true } : null;
  }

  protected aoDigitar(): void {
    this.aoMudar(lerMoeda(this.campo.value));
  }

  protected aoSair(): void {
    const valor = lerMoeda(this.campo.value);
    if (valor !== null && !Number.isNaN(valor)) this.campo.value = formatarMoeda(valor);
    this.aoSerTocado();
  }
}

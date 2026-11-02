import { Directive, ElementRef, forwardRef, inject } from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `true` se `YYYY-MM-DD` é uma data que existe no calendário (recusa 31/02, 29/02 fora de bissexto...). */
export function isoValida(iso: string): boolean {
  const m = ISO.exec(iso);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(ano, mes - 1, dia);
  return (
    ano >= 1900 &&
    data.getFullYear() === ano &&
    data.getMonth() === mes - 1 &&
    data.getDate() === dia
  );
}

/** `2026-09-28` -> `28/09/2026`; texto que não é ISO volta como veio. */
export function isoParaBr(iso: string): string {
  const m = ISO.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Só os dígitos, com as barras de dd/mm/aaaa no lugar: "28092026" -> "28/09/2026". */
export function mascararData(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** `28/09/2026` -> `2026-09-28`; `null` se o texto ainda não é uma data completa. */
export function brParaIso(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Campo de data em dd/mm/aaaa, igual em qualquer navegador. O `<input type="date">` mostra o
 * formato do idioma do navegador (09/28/2026 num navegador em inglês), por isso o campo é texto
 * com máscara. O valor do formulário continua `YYYY-MM-DD`, que é o que a API recebe; enquanto a
 * data está incompleta ou não existe, o controle fica com o erro `dataInvalida`.
 */
@Directive({
  selector: 'input[appDataBr]',
  host: {
    inputmode: 'numeric',
    autocomplete: 'off',
    maxlength: '10',
    placeholder: 'dd/mm/aaaa',
    '(input)': 'aoDigitar()',
    '(blur)': 'aoTocar()',
  },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DataBr), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DataBr), multi: true },
  ],
})
export class DataBr implements ControlValueAccessor, Validator {
  private readonly campo = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private aoMudar: (valor: string) => void = () => undefined;
  private aoSerTocado: () => void = () => undefined;

  writeValue(valor: string | null): void {
    this.campo.value = valor ? isoParaBr(valor) : '';
  }

  registerOnChange(fn: (valor: string) => void): void {
    this.aoMudar = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.aoSerTocado = fn;
  }

  setDisabledState(desabilitado: boolean): void {
    this.campo.disabled = desabilitado;
  }

  validate(controle: AbstractControl): ValidationErrors | null {
    const valor = controle.value as string | null;
    if (!valor) return null; // vazio é com o `Validators.required`
    return isoValida(valor) ? null : { dataInvalida: true };
  }

  protected aoDigitar(): void {
    const texto = mascararData(this.campo.value);
    this.campo.value = texto;
    // Incompleta, o controle guarda o próprio texto: não é ISO, então o validador recusa.
    this.aoMudar(brParaIso(texto) ?? texto);
  }

  protected aoTocar(): void {
    this.aoSerTocado();
  }
}

import { afterNextRender, DestroyRef, Directive, ElementRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgControl } from '@angular/forms';

/**
 * Campo de valor em reais: mostra sempre os centavos ("3000" vira "3000.00"). Formata ao sair do
 * campo e quando o valor é preenchido pelo código (editar, limpar); enquanto a pessoa digita, não
 * mexe no texto. O valor do formulário continua um número.
 */
@Directive({
  selector: 'input[appMoeda]',
  host: { '(blur)': 'formatar()' },
})
export class Moeda implements OnInit {
  private readonly campo = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private readonly controle = inject(NgControl, { optional: true, self: true });

  constructor() {
    afterNextRender(() => this.formatar());
  }

  ngOnInit(): void {
    // O valor pode mudar por código (setValue, reset): reformata, exceto durante a digitação.
    this.controle?.valueChanges?.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (document.activeElement !== this.campo) this.formatar();
    });
  }

  protected formatar(): void {
    if (this.campo.value === '') return;
    const numero = Number(this.campo.value);
    if (Number.isFinite(numero)) this.campo.value = numero.toFixed(2);
  }
}

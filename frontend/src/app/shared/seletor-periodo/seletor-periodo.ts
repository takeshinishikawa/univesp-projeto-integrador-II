import { Component, computed, input, model } from '@angular/core';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Filtro por mês/ano. `mes = null` significa "todos os meses" do ano. */
@Component({
  selector: 'app-seletor-periodo',
  template: `
    <fieldset class="periodo" [disabled]="desabilitado()">
      <legend class="sr-only">Período</legend>
      <div class="periodo__campo">
        <label [for]="prefixo() + '-mes'">Mês</label>
        <select [id]="prefixo() + '-mes'" (change)="aoMudarMes($event)">
          @if (permitirTodos()) {
            <option value="" [selected]="mes() === null">Todos os meses</option>
          }
          @for (nome of meses; track $index) {
            <option [value]="$index + 1" [selected]="mes() === $index + 1">{{ nome }}</option>
          }
        </select>
      </div>
      <div class="periodo__campo">
        <label [for]="prefixo() + '-ano'">Ano</label>
        <select [id]="prefixo() + '-ano'" (change)="aoMudarAno($event)">
          @for (opcao of anos(); track opcao) {
            <option [value]="opcao" [selected]="ano() === opcao">{{ opcao }}</option>
          }
        </select>
      </div>
    </fieldset>
  `,
  styles: `
    .periodo {
      display: flex;
      flex-wrap: wrap;
      gap: var(--espaco-3);
      padding: 0;
      margin: 0;
      border: 0;
    }

    .periodo__campo {
      min-width: 10rem;
    }

    label {
      display: block;
      margin-bottom: var(--espaco-1);
      font-weight: 600;
    }
  `,
})
export class SeletorPeriodo {
  /** Prefixo dos ids (evita colisão quando há mais de um seletor na mesma página). */
  readonly prefixo = input.required<string>();
  /** `false` esconde "Todos os meses" (telas em que o mês é obrigatório, como Metas). */
  readonly permitirTodos = input(true);
  /** Desabilita os dois campos (por exemplo, quando o período é ignorado por outro filtro). */
  readonly desabilitado = input(false);
  readonly mes = model<number | null>(null);
  readonly ano = model.required<number>();

  protected readonly meses = MESES;
  // Ano atual e 4 anteriores, mais o ano selecionado caso esteja fora da faixa.
  protected readonly anos = computed(() => {
    const atual = new Date().getFullYear();
    const lista = Array.from({ length: 5 }, (_, i) => atual - i);
    return lista.includes(this.ano()) ? lista : [this.ano(), ...lista];
  });

  protected aoMudarMes(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.mes.set(valor === '' ? null : Number(valor));
  }

  protected aoMudarAno(evento: Event): void {
    this.ano.set(Number((evento.target as HTMLSelectElement).value));
  }
}

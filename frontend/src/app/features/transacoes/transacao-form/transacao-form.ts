import { Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  Categoria,
  Conta,
  TipoTransacao,
  Transacao,
  TransacaoRequest,
} from '../../../core/models/api.models';
import { hojeIso } from '../../../core/utils/data';
import { Button } from '../../../shared/button/button';
import { Moeda } from '../../../shared/moeda/moeda';
import { FormField } from '../../../shared/form-field/form-field';

/** Rejeita texto formado só por espaços (o backend faz `trim` e exige ao menos 1 caractere). */
export function naoVazio(controle: AbstractControl): ValidationErrors | null {
  const valor = controle.value;
  return typeof valor === 'string' && valor.trim() === '' ? { required: true } : null;
}

/** O select usa 0 como "nenhuma categoria escolhida". */
export function categoriaEscolhida(controle: AbstractControl): ValidationErrors | null {
  return Number(controle.value) >= 1 ? null : { required: true };
}

@Component({
  selector: 'app-transacao-form',
  imports: [Moeda, ReactiveFormsModule, Button, FormField],
  templateUrl: './transacao-form.html',
  styleUrl: './transacao-form.scss',
})
export class TransacaoForm {
  /** Transação em edição; `null` = novo lançamento. */
  readonly transacao = input<Transacao | null>(null);
  readonly categorias = input.required<Categoria[]>();
  /** Contas ativas; sem elas (ou com uma só) o campo "Conta" não aparece e vale a principal. */
  readonly contas = input<Conta[]>([]);
  readonly salvando = input(false);
  readonly erro = input<string | null>(null);

  readonly salvar = output<TransacaoRequest>();
  readonly cancelar = output<void>();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    tipo: ['DESPESA' as TipoTransacao, [Validators.required]],
    categoriaId: [0, [categoriaEscolhida]],
    contaId: [0],
    descricao: ['', [Validators.required, naoVazio, Validators.maxLength(150)]],
    valor: [
      null as number | null,
      [Validators.required, Validators.min(0.01), Validators.max(99999999.99)],
    ],
    dataTransacao: [hojeIso(), [Validators.required]],
  });

  private readonly tipoSelecionado = toSignal(this.form.controls.tipo.valueChanges, {
    initialValue: this.form.controls.tipo.value,
  });

  /** O select de categoria só mostra as do tipo escolhido (receita ou despesa). */
  protected readonly categoriasDoTipo = computed(() =>
    this.categorias().filter((c) => c.tipo === this.tipoSelecionado()),
  );

  constructor() {
    effect(() => {
      const t = this.transacao();
      untracked(() => {
        if (t) {
          this.form.setValue({
            tipo: t.tipo,
            categoriaId: t.categoriaId,
            contaId: t.contaId ?? 0,
            descricao: t.descricao,
            valor: t.valor,
            dataTransacao: t.dataTransacao,
          });
        }
      });
    });

    // Transação nova começa na primeira conta ativa.
    effect(() => {
      const contas = this.contas();
      untracked(() => {
        const campo = this.form.controls.contaId;
        if (!this.transacao() && campo.value === 0 && contas.length > 0)
          campo.setValue(contas[0].id);
      });
    });

    // Trocar o tipo invalida a categoria escolhida se ela pertencer ao outro tipo.
    effect(() => {
      const validas = this.categoriasDoTipo();
      untracked(() => {
        const atual = this.form.controls.categoriaId;
        if (!validas.some((c) => c.id === atual.value)) atual.setValue(0);
      });
    });
  }

  protected enviar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { tipo, categoriaId, contaId, descricao, valor, dataTransacao } = this.form.getRawValue();
    this.salvar.emit({
      tipo,
      categoriaId,
      ...(this.contas().length > 1 && contaId >= 1 && { contaId }),
      descricao: descricao.trim(),
      valor: valor as number,
      dataTransacao,
    });
  }
}

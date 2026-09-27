import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { descreverErro } from '../../core/models/api-error';
import { Categoria, Regra } from '../../core/models/api.models';
import { Button } from '../../shared/button/button';
import { FormField } from '../../shared/form-field/form-field';
import { Modal } from '../../shared/modal/modal';
import { RegraService } from './regra.service';

// O select começa em "Selecione…" (0); 0 é "não escolheu" e mostra "Campo obrigatório.".
function categoriaEscolhida(controle: AbstractControl<number>): ValidationErrors | null {
  return controle.value >= 1 ? null : { required: true };
}

const plural = (n: number, singular: string, mais: string): string =>
  `${n} ${n === 1 ? singular : mais}`;

/** Regras "descrição contém X → categoria Y": o que o app aprendeu com as correções do usuário. */
@Component({
  selector: 'app-regras-categoria',
  imports: [ReactiveFormsModule, Button, FormField, Modal],
  templateUrl: './regras-categoria.html',
  styleUrl: './regras-categoria.scss',
})
export class RegrasCategoria {
  private readonly service = inject(RegraService);

  /** Vem da tela Categorias; quando muda (criou, renomeou, excluiu), as regras são relidas. */
  readonly categorias = input.required<readonly Categoria[]>();

  // Limites espelham o backend (criarRegraSchema).
  protected readonly form = inject(FormBuilder).nonNullable.group({
    termo: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    categoriaId: [0, [categoriaEscolhida]],
  });
  protected readonly termoEdicao = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(100)],
  });
  protected readonly categoriaEdicao = new FormControl(0, { nonNullable: true });

  protected readonly regras = signal<Regra[]>([]);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly aplicandoId = signal<number | null>(null);
  protected readonly erro = signal<string | null>(null); // falha ao carregar
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly erroModal = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly editandoId = signal<number | null>(null);
  protected readonly excluindo = signal<Regra | null>(null);

  protected readonly nomes = computed(() => new Map(this.categorias().map((c) => [c.id, c.nome])));
  protected readonly despesas = computed(() =>
    this.categorias().filter((c) => c.tipo === 'DESPESA'),
  );
  protected readonly receitas = computed(() =>
    this.categorias().filter((c) => c.tipo === 'RECEITA'),
  );

  constructor() {
    effect(() => {
      this.categorias();
      untracked(() => this.carregar());
    });
  }

  protected nomeDaCategoria(regra: Regra): string {
    return this.nomes().get(regra.categoriaId) ?? 'categoria removida';
  }

  protected adicionar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { termo, categoriaId } = this.form.getRawValue();
    this.iniciarAcao();
    this.service.criar({ termo: termo.trim(), categoriaId }).subscribe({
      next: (regra) => {
        this.form.reset({ termo: '', categoriaId });
        this.aviso.set(
          `Regra criada: descrições com "${regra.termo}" vão para ${this.nomeDaCategoria(regra)}.`,
        );
        this.salvando.set(false);
        this.carregar();
      },
      error: (e: unknown) => this.falhar(e),
    });
  }

  protected iniciarEdicao(regra: Regra): void {
    this.limparMensagens();
    this.termoEdicao.reset(regra.termo);
    this.categoriaEdicao.setValue(regra.categoriaId);
    this.editandoId.set(regra.id);
  }

  protected cancelarEdicao(): void {
    this.editandoId.set(null);
    this.erroAcao.set(null);
  }

  protected salvarEdicao(regra: Regra): void {
    this.termoEdicao.markAsTouched();
    if (this.termoEdicao.invalid) {
      this.erroAcao.set('Informe um termo de 3 a 100 caracteres.');
      return;
    }
    this.iniciarAcao();
    this.editandoId.set(regra.id); // iniciarAcao limpa mensagens, não a edição
    this.service
      .atualizar(regra.id, {
        termo: this.termoEdicao.value.trim(),
        categoriaId: this.categoriaEdicao.value,
      })
      .subscribe({
        next: () => {
          this.editandoId.set(null);
          this.aviso.set('Regra atualizada. Ela vale para as próximas importações.');
          this.salvando.set(false);
          this.carregar();
        },
        error: (e: unknown) => this.falhar(e),
      });
  }

  protected pedirExclusao(regra: Regra): void {
    this.erroModal.set(null);
    this.excluindo.set(regra);
  }

  protected cancelarExclusao(): void {
    this.excluindo.set(null);
  }

  protected confirmarExclusao(): void {
    const regra = this.excluindo();
    if (!regra) return;
    this.salvando.set(true);
    this.erroModal.set(null);
    this.service.excluir(regra.id).subscribe({
      next: () => {
        this.excluindo.set(null);
        this.aviso.set(
          `Regra "${regra.termo}" excluída. As transações já classificadas não mudam.`,
        );
        this.salvando.set(false);
        this.carregar();
      },
      error: (e: unknown) => {
        this.erroModal.set(descreverErro(e));
        this.salvando.set(false);
      },
    });
  }

  protected aplicar(regra: Regra): void {
    this.limparMensagens();
    this.aplicandoId.set(regra.id);
    this.service.aplicar(regra.id).subscribe({
      next: ({ afetadas }) => {
        this.aplicandoId.set(null);
        this.aviso.set(
          afetadas === 0
            ? `Nenhuma transação precisou mudar para "${regra.termo}".`
            : `${plural(afetadas, 'transação movida', 'transações movidas')} para ${this.nomeDaCategoria(regra)}.`,
        );
      },
      error: (e: unknown) => {
        this.aplicandoId.set(null);
        this.erroAcao.set(descreverErro(e));
      },
    });
  }

  private limparMensagens(): void {
    this.erroAcao.set(null);
    this.aviso.set(null);
  }

  private iniciarAcao(): void {
    this.limparMensagens();
    this.salvando.set(true);
  }

  private falhar(e: unknown): void {
    this.erroAcao.set(descreverErro(e));
    this.salvando.set(false);
  }

  private carregar(): void {
    this.service.listar().subscribe({
      next: (lista) => {
        this.regras.set(lista);
        this.erro.set(null);
        this.carregando.set(false);
      },
      error: (e: unknown) => {
        this.erro.set(descreverErro(e));
        this.carregando.set(false);
      },
    });
  }
}

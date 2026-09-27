import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { descreverErro } from '../../core/models/api-error';
import { Categoria, TipoTransacao } from '../../core/models/api.models';
import { Button } from '../../shared/button/button';
import { FormField } from '../../shared/form-field/form-field';
import { Modal } from '../../shared/modal/modal';
import { RegrasCategoria } from '../regras/regras-categoria';
import { CategoriaService } from './categoria.service';

// `required` deixa passar "   "; o nome é gravado sem espaços nas pontas, então vale o texto aparado.
function nomeNaoVazio(controle: AbstractControl<string>): ValidationErrors | null {
  return controle.value.trim() ? null : { required: true };
}

@Component({
  selector: 'app-categorias',
  imports: [ReactiveFormsModule, Button, FormField, Modal, RegrasCategoria],
  templateUrl: './categorias.html',
  styleUrl: './categorias.scss',
})
export class Categorias {
  private readonly categoriaService = inject(CategoriaService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  // Limites espelham o backend (criarCategoriaSchema).
  protected readonly form = inject(FormBuilder).nonNullable.group({
    nome: ['', [nomeNaoVazio, Validators.maxLength(50)]],
    tipo: ['DESPESA' as TipoTransacao],
  });
  protected readonly nomeEdicao = new FormControl('', {
    nonNullable: true,
    validators: [nomeNaoVazio, Validators.maxLength(50)],
  });

  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null); // falha ao carregar a lista
  protected readonly erroAcao = signal<string | null>(null); // criar / renomear
  protected readonly erroModal = signal<string | null>(null); // excluir
  protected readonly aviso = signal<string | null>(null);
  protected readonly editandoId = signal<number | null>(null);
  protected readonly excluindo = signal<Categoria | null>(null);

  protected readonly grupos = computed(() => [
    { tipo: 'RECEITA' as const, titulo: 'Receitas', itens: this.doTipo('RECEITA') },
    { tipo: 'DESPESA' as const, titulo: 'Despesas', itens: this.doTipo('DESPESA') },
  ]);

  constructor() {
    this.carregar();
  }

  protected adicionar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { nome, tipo } = this.form.getRawValue();
    this.iniciarAcao();
    this.categoriaService.criar({ nome: nome.trim(), tipo }).subscribe({
      next: (criada) => {
        this.form.controls.nome.reset('');
        this.aviso.set(`Categoria "${criada.nome}" criada.`);
        this.salvando.set(false);
        this.carregar();
      },
      error: (e: unknown) => this.falhar(e),
    });
  }

  protected iniciarEdicao(categoria: Categoria): void {
    this.limparMensagens();
    this.nomeEdicao.setValue(categoria.nome);
    this.editandoId.set(categoria.id);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLInputElement>('#categoria-edicao')?.select(),
      { injector: this.injector },
    );
  }

  protected cancelarEdicao(): void {
    this.editandoId.set(null);
    this.erroAcao.set(null);
  }

  protected salvarEdicao(categoria: Categoria): void {
    if (this.nomeEdicao.invalid) {
      this.nomeEdicao.markAsTouched();
      this.erroAcao.set('Informe um nome de até 50 caracteres.');
      return;
    }
    const nome = this.nomeEdicao.value.trim();
    this.iniciarAcao();
    this.editandoId.set(categoria.id); // iniciarAcao limpa mensagens, não a edição
    this.categoriaService.renomear(categoria.id, nome).subscribe({
      next: (renomeada) => {
        this.editandoId.set(null);
        this.aviso.set(`Categoria renomeada para "${renomeada.nome}".`);
        this.salvando.set(false);
        this.carregar();
      },
      error: (e: unknown) => this.falhar(e),
    });
  }

  protected pedirExclusao(categoria: Categoria): void {
    this.erroModal.set(null);
    this.excluindo.set(categoria);
  }

  protected cancelarExclusao(): void {
    this.excluindo.set(null);
  }

  protected confirmarExclusao(): void {
    const categoria = this.excluindo();
    if (!categoria) return;
    this.salvando.set(true);
    this.erroModal.set(null);
    this.categoriaService.excluir(categoria.id).subscribe({
      next: () => {
        this.excluindo.set(null);
        this.aviso.set(`Categoria "${categoria.nome}" excluída.`);
        this.salvando.set(false);
        this.carregar();
      },
      error: (e: unknown) => {
        this.erroModal.set(descreverErro(e));
        this.salvando.set(false);
      },
    });
  }

  private doTipo(tipo: TipoTransacao): Categoria[] {
    return this.categorias().filter((c) => c.tipo === tipo);
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
    this.categoriaService.listar().subscribe({
      next: (lista) => {
        this.categorias.set(lista);
        this.carregando.set(false);
      },
      error: (e: unknown) => {
        this.erro.set(descreverErro(e));
        this.carregando.set(false);
      },
    });
  }
}

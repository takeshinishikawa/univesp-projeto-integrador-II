import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { descreverErro } from '../../core/models/api-error';
import { Conta, TipoConta } from '../../core/models/api.models';
import { hojeIso } from '../../core/utils/data';
import { formatarMoeda } from '../../core/utils/formato';
import { Button } from '../../shared/button/button';
import { Moeda } from '../../shared/moeda/moeda';
import { FormField } from '../../shared/form-field/form-field';
import { Modal } from '../../shared/modal/modal';
import { categoriaEscolhida, naoVazio } from '../transacoes/transacao-form/transacao-form';
import { ContaService } from './conta.service';

export const ROTULO_TIPO_CONTA: Record<TipoConta, string> = {
  CONTA_CORRENTE: 'Conta corrente',
  CARTAO_CREDITO: 'Cartão de crédito',
  DINHEIRO: 'Dinheiro',
  OUTRA: 'Outra',
};

const TIPOS: TipoConta[] = ['CONTA_CORRENTE', 'CARTAO_CREDITO', 'DINHEIRO', 'OUTRA'];

/** A origem e o destino de uma transferência precisam ser contas diferentes. */
function contasDiferentes(grupo: AbstractControl): ValidationErrors | null {
  const { contaOrigemId, contaDestinoId } = grupo.value as {
    contaOrigemId: number;
    contaDestinoId: number;
  };
  return contaOrigemId >= 1 && contaOrigemId === contaDestinoId ? { mesmaConta: true } : null;
}

const plural = (n: number, singular: string, mais: string): string =>
  `${n} ${n === 1 ? singular : mais}`;

@Component({
  selector: 'app-contas',
  imports: [Moeda, ReactiveFormsModule, RouterLink, Button, FormField, Modal],
  templateUrl: './contas.html',
  styleUrl: './contas.scss',
})
export class Contas {
  private readonly service = inject(ContaService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly tipos = TIPOS.map((valor) => ({ valor, rotulo: ROTULO_TIPO_CONTA[valor] }));

  protected readonly contas = signal<Conta[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal('');
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly salvando = signal(false);

  protected readonly ativas = computed(() => this.contas().filter((c) => !c.arquivada));
  protected readonly arquivadas = computed(() => this.contas().filter((c) => c.arquivada));
  /** Soma dos saldos das contas ativas (o cartão entra negativo: é dívida). */
  protected readonly totalGeral = computed(
    () => Math.round(this.ativas().reduce((soma, c) => soma + c.saldo, 0) * 100) / 100,
  );

  protected readonly totalGeralTexto = computed(() => formatarMoeda(this.totalGeral()));

  protected readonly novaForm = this.fb.group({
    nome: ['', [Validators.required, naoVazio, Validators.maxLength(60)]],
    tipo: ['CONTA_CORRENTE' as TipoConta, [Validators.required]],
    saldoInicial: [0, [Validators.min(-99999999.99), Validators.max(99999999.99)]],
  });

  protected readonly edicaoForm = this.fb.group({
    nome: ['', [Validators.required, naoVazio, Validators.maxLength(60)]],
    tipo: ['CONTA_CORRENTE' as TipoConta, [Validators.required]],
    saldoInicial: [0, [Validators.min(-99999999.99), Validators.max(99999999.99)]],
  });
  protected readonly emEdicao = signal<Conta | null>(null);
  protected readonly excluindo = signal<Conta | null>(null);

  protected readonly transferenciaForm = this.fb.group(
    {
      contaOrigemId: [0, [categoriaEscolhida]],
      contaDestinoId: [0, [categoriaEscolhida]],
      valor: [
        null as number | null,
        [Validators.required, Validators.min(0.01), Validators.max(99999999.99)],
      ],
      data: [hojeIso(), [Validators.required]],
      descricao: ['', [Validators.maxLength(150)]],
    },
    { validators: [contasDiferentes] },
  );

  constructor() {
    this.carregar();
  }

  private carregar(): void {
    this.service.listar().subscribe({
      next: (contas) => {
        this.contas.set(contas);
        this.carregando.set(false);
      },
      error: (e: unknown) => {
        this.erro.set(descreverErro(e));
        this.carregando.set(false);
      },
    });
  }

  protected rotuloTipo(tipo: TipoConta): string {
    return ROTULO_TIPO_CONTA[tipo];
  }

  /** No cartão o saldo negativo é o valor "a pagar". */
  protected saldoTexto(conta: Conta): string {
    if (conta.tipo !== 'CARTAO_CREDITO') return formatarMoeda(conta.saldo);
    if (conta.saldo < 0) return `A pagar: ${formatarMoeda(-conta.saldo)}`;
    return conta.saldo > 0 ? `Crédito de ${formatarMoeda(conta.saldo)}` : 'Nada a pagar';
  }

  private concluir(mensagem: string): void {
    this.salvando.set(false);
    this.erroAcao.set(null);
    this.aviso.set(mensagem);
    this.carregar();
  }

  private falhar(e: unknown): void {
    this.salvando.set(false);
    this.erroAcao.set(descreverErro(e));
  }

  // ---- criar
  protected criar(): void {
    if (this.novaForm.invalid) {
      this.novaForm.markAllAsTouched();
      return;
    }
    const { nome, tipo, saldoInicial } = this.novaForm.getRawValue();
    this.salvando.set(true);
    this.aviso.set('');
    this.service.criar({ nome: nome.trim(), tipo, saldoInicial: saldoInicial ?? 0 }).subscribe({
      next: (conta) => {
        this.novaForm.reset();
        this.concluir(`Conta "${conta.nome}" criada.`);
      },
      error: (e: unknown) => this.falhar(e),
    });
  }

  // ---- editar
  protected abrirEdicao(conta: Conta): void {
    this.erroAcao.set(null);
    this.edicaoForm.reset({ nome: conta.nome, tipo: conta.tipo, saldoInicial: conta.saldoInicial });
    this.emEdicao.set(conta);
  }

  protected salvarEdicao(): void {
    const conta = this.emEdicao();
    if (!conta) return;
    if (this.edicaoForm.invalid) {
      this.edicaoForm.markAllAsTouched();
      return;
    }
    const { nome, tipo, saldoInicial } = this.edicaoForm.getRawValue();
    this.salvando.set(true);
    this.service
      .atualizar(conta.id, { nome: nome.trim(), tipo, saldoInicial: saldoInicial ?? 0 })
      .subscribe({
        next: () => {
          this.emEdicao.set(null);
          this.concluir(`Conta "${nome.trim()}" atualizada.`);
        },
        error: (e: unknown) => this.falhar(e),
      });
  }

  // ---- arquivar / reativar / excluir
  protected alternarArquivo(conta: Conta): void {
    this.aviso.set('');
    this.service.atualizar(conta.id, { arquivada: !conta.arquivada }).subscribe({
      next: () =>
        this.concluir(
          conta.arquivada ? `Conta "${conta.nome}" reativada.` : `Conta "${conta.nome}" arquivada.`,
        ),
      error: (e: unknown) => this.falhar(e),
    });
  }

  protected pedirExclusao(conta: Conta): void {
    this.erroAcao.set(null);
    this.excluindo.set(conta);
  }

  protected confirmarExclusao(): void {
    const conta = this.excluindo();
    if (!conta) return;
    this.salvando.set(true);
    this.service.excluir(conta.id).subscribe({
      next: () => {
        this.excluindo.set(null);
        this.concluir(`Conta "${conta.nome}" excluída.`);
      },
      error: (e: unknown) => this.falhar(e),
    });
  }

  // ---- transferência
  protected transferir(): void {
    if (this.transferenciaForm.invalid) {
      this.transferenciaForm.markAllAsTouched();
      return;
    }
    const { contaOrigemId, contaDestinoId, valor, data, descricao } =
      this.transferenciaForm.getRawValue();
    this.salvando.set(true);
    this.aviso.set('');
    this.service
      .transferir({
        contaOrigemId,
        contaDestinoId,
        valor: valor as number,
        data,
        ...(descricao.trim() && { descricao: descricao.trim() }),
      })
      .subscribe({
        next: () => {
          this.transferenciaForm.reset({
            contaOrigemId: 0,
            contaDestinoId: 0,
            valor: null,
            data: hojeIso(),
            descricao: '',
          });
          this.concluir(
            `Transferência de ${formatarMoeda(valor as number)} registrada. Ela muda o saldo das duas contas, mas não conta como receita nem despesa.`,
          );
        },
        error: (e: unknown) => this.falhar(e),
      });
  }

  protected textoQuantidade(conta: Conta): string {
    return plural(conta.totalTransacoes, 'transação', 'transações');
  }
}

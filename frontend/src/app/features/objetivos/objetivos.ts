import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { descreverErro } from '../../core/models/api-error';
import { Objetivo, SituacaoObjetivo } from '../../core/models/api.models';
import { hojeIso } from '../../core/utils/data';
import {
  formatarMoeda,
  formatarPercentual,
  NOMES_MESES,
  nomeDoMes,
} from '../../core/utils/formato';
import { Button } from '../../shared/button/button';
import { Moeda } from '../../shared/moeda/moeda';
import { FormField } from '../../shared/form-field/form-field';
import { Modal } from '../../shared/modal/modal';
import { naoVazio } from '../transacoes/transacao-form/transacao-form';
import { ObjetivoService } from './objetivo.service';

interface RotuloSituacao {
  icone: string;
  texto: string;
  tom: 'bom' | 'atencao' | 'ruim';
}

export const ROTULO_SITUACAO_OBJETIVO: Record<SituacaoObjetivo, RotuloSituacao> = {
  NO_RITMO: { icone: '✓', texto: 'no ritmo', tom: 'bom' },
  ATRASADO: { icone: '⚠', texto: 'atrasado', tom: 'atencao' },
  CONCLUIDO: { icone: '✓', texto: 'concluído', tom: 'bom' },
  VENCIDO: { icone: '✕', texto: 'vencido', tom: 'ruim' },
};

/** Limites espelham o backend (criarObjetivoSchema). */
const VALOR_MAXIMO = 99999999.99;

@Component({
  selector: 'app-objetivos',
  imports: [
    Moeda,
    CurrencyPipe,
    DatePipe,
    NgTemplateOutlet,
    ReactiveFormsModule,
    Button,
    FormField,
    Modal,
  ],
  templateUrl: './objetivos.html',
  styleUrl: './objetivos.scss',
})
export class Objetivos {
  private readonly service = inject(ObjetivoService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly meses = NOMES_MESES.map((nome, i) => ({
    valor: i + 1,
    rotulo: nome.charAt(0).toUpperCase() + nome.slice(1),
  }));
  protected readonly anos = Array.from({ length: 16 }, (_, i) => new Date().getFullYear() + i);

  protected readonly objetivos = signal<Objetivo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal('');
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly salvando = signal(false);

  protected readonly ativos = computed(() =>
    this.objetivos().filter((o) => o.concluidoEm === null),
  );
  protected readonly concluidos = computed(() =>
    this.objetivos().filter((o) => o.concluidoEm !== null),
  );

  private readonly hoje = new Date();
  protected readonly novoForm = this.fb.group({
    nome: ['', [Validators.required, naoVazio, Validators.maxLength(60)]],
    valorAlvo: [
      null as number | null,
      [Validators.required, Validators.min(0.01), Validators.max(VALOR_MAXIMO)],
    ],
    prazoMes: [this.hoje.getMonth() + 1],
    prazoAno: [this.hoje.getFullYear() + 1],
    valorInicial: [null as number | null, [Validators.min(0), Validators.max(VALOR_MAXIMO)]],
  });

  protected readonly edicaoForm = this.fb.group({
    nome: ['', [Validators.required, naoVazio, Validators.maxLength(60)]],
    valorAlvo: [
      null as number | null,
      [Validators.required, Validators.min(0.01), Validators.max(VALOR_MAXIMO)],
    ],
    prazoMes: [1],
    prazoAno: [this.hoje.getFullYear()],
  });
  protected readonly emEdicao = signal<Objetivo | null>(null);

  protected readonly aporteForm = this.fb.group({
    valor: [
      null as number | null,
      [Validators.required, Validators.min(0.01), Validators.max(VALOR_MAXIMO)],
    ],
    data: [hojeIso(), [Validators.required]],
    observacao: ['', [Validators.maxLength(150)]],
  });
  protected readonly guardandoEm = signal<Objetivo | null>(null);
  protected readonly excluindo = signal<Objetivo | null>(null);

  constructor() {
    this.carregar();
  }

  private carregar(): void {
    this.service.listar().subscribe({
      next: (objetivos) => {
        this.objetivos.set(objetivos);
        this.carregando.set(false);
      },
      error: (e: unknown) => {
        this.erro.set(descreverErro(e));
        this.carregando.set(false);
      },
    });
  }

  protected rotulo(situacao: SituacaoObjetivo): RotuloSituacao {
    return ROTULO_SITUACAO_OBJETIVO[situacao];
  }

  protected prazoTexto(objetivo: Objetivo): string {
    return `${nomeDoMes(objetivo.prazoMes)} de ${objetivo.prazoAno}`;
  }

  protected percentualTexto(objetivo: Objetivo): string {
    return formatarPercentual(objetivo.percentual);
  }

  /** A barra para em 100%; o percentual real (ex.: 108%) aparece no texto. */
  protected valorDaBarra(objetivo: Objetivo): number {
    return Math.min(100, objetivo.percentual);
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

  private mensagemDeConclusao(objetivo: Objetivo, base: string): string {
    return objetivo.situacao === 'CONCLUIDO'
      ? `${base} Parabéns, você atingiu o objetivo "${objetivo.nome}"!`
      : base;
  }

  // ---- criar
  protected criar(): void {
    if (this.novoForm.invalid) {
      this.novoForm.markAllAsTouched();
      return;
    }
    const { nome, valorAlvo, prazoMes, prazoAno, valorInicial } = this.novoForm.getRawValue();
    this.salvando.set(true);
    this.aviso.set('');
    this.service
      .criar({
        nome: nome.trim(),
        valorAlvo: valorAlvo as number,
        prazoMes,
        prazoAno,
        ...(valorInicial && { valorInicial }),
      })
      .subscribe({
        next: (objetivo) => {
          this.novoForm.reset({
            nome: '',
            valorAlvo: null,
            prazoMes: this.hoje.getMonth() + 1,
            prazoAno: this.hoje.getFullYear() + 1,
            valorInicial: null,
          });
          this.concluir(this.mensagemDeConclusao(objetivo, `Objetivo "${objetivo.nome}" criado.`));
        },
        error: (e: unknown) => this.falhar(e),
      });
  }

  // ---- editar
  protected abrirEdicao(objetivo: Objetivo): void {
    this.erroAcao.set(null);
    this.edicaoForm.reset({
      nome: objetivo.nome,
      valorAlvo: objetivo.valorAlvo,
      prazoMes: objetivo.prazoMes,
      prazoAno: objetivo.prazoAno,
    });
    this.emEdicao.set(objetivo);
  }

  protected salvarEdicao(): void {
    const objetivo = this.emEdicao();
    if (!objetivo) return;
    if (this.edicaoForm.invalid) {
      this.edicaoForm.markAllAsTouched();
      return;
    }
    const { nome, valorAlvo, prazoMes, prazoAno } = this.edicaoForm.getRawValue();
    this.salvando.set(true);
    this.service
      .atualizar(objetivo.id, {
        nome: nome.trim(),
        valorAlvo: valorAlvo as number,
        prazoMes,
        prazoAno,
      })
      .subscribe({
        next: (atualizado) => {
          this.emEdicao.set(null);
          this.concluir(
            this.mensagemDeConclusao(atualizado, `Objetivo "${atualizado.nome}" atualizado.`),
          );
        },
        error: (e: unknown) => this.falhar(e),
      });
  }

  // ---- guardar (aporte)
  protected abrirAporte(objetivo: Objetivo): void {
    this.erroAcao.set(null);
    this.aporteForm.reset({ valor: null, data: hojeIso(), observacao: '' });
    this.guardandoEm.set(objetivo);
  }

  protected salvarAporte(): void {
    const objetivo = this.guardandoEm();
    if (!objetivo) return;
    if (this.aporteForm.invalid) {
      this.aporteForm.markAllAsTouched();
      return;
    }
    const { valor, data, observacao } = this.aporteForm.getRawValue();
    this.salvando.set(true);
    this.service
      .guardar(objetivo.id, {
        valor: valor as number,
        data,
        ...(observacao.trim() && { observacao: observacao.trim() }),
      })
      .subscribe({
        next: (atualizado) => {
          this.guardandoEm.set(null);
          this.concluir(
            this.mensagemDeConclusao(
              atualizado,
              `${formatarMoeda(valor as number)} guardados em "${atualizado.nome}".`,
            ),
          );
        },
        error: (e: unknown) => this.falhar(e),
      });
  }

  protected desfazerAporte(objetivo: Objetivo, aporteId: number): void {
    this.erroAcao.set(null);
    this.service.desfazerAporte(objetivo.id, aporteId).subscribe({
      next: () => this.concluir(`Aporte de "${objetivo.nome}" desfeito.`),
      error: (e: unknown) => this.falhar(e),
    });
  }

  // ---- excluir
  protected pedirExclusao(objetivo: Objetivo): void {
    this.erroAcao.set(null);
    this.excluindo.set(objetivo);
  }

  protected confirmarExclusao(): void {
    const objetivo = this.excluindo();
    if (!objetivo) return;
    this.salvando.set(true);
    this.service.excluir(objetivo.id).subscribe({
      next: () => {
        this.excluindo.set(null);
        this.concluir(`Objetivo "${objetivo.nome}" excluído, com os aportes dele.`);
      },
      error: (e: unknown) => this.falhar(e),
    });
  }
}

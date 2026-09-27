import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { descreverErro } from '../../core/models/api-error';
import {
  Categoria,
  Conta,
  LinhaImportacaoRequest,
  LinhaPreview,
  OrigemImportacao,
  PreviewImportacao,
  ResultadoImportacao,
  TipoConta,
} from '../../core/models/api.models';
import { Button } from '../../shared/button/button';
import { Table } from '../../shared/table/table';
import { CategoriaService } from '../categorias/categoria.service';
import { ContaService } from '../contas/conta.service';
import { ImportacaoService } from './importacao.service';

export const TAMANHO_MAX_ARQUIVO_BYTES = 2 * 1024 * 1024;

type Etapa = 'envio' | 'lendo' | 'revisao' | 'importando' | 'concluido';

/** Linha do preview + as escolhas do usuário na revisão. */
interface LinhaRevisao extends LinhaPreview {
  selecionada: boolean;
  /** Categoria que o app sugeriu; se o usuário trocar, o aviso "regra sua" deixa de valer. */
  categoriaSugeridaId: number;
  /** Pagamento de fatura: conta que recebe a outra ponta da transferência (`null` = não é transferência). */
  contaDestinoId: number | null;
}

@Component({
  selector: 'app-importacao',
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink, Button, Table],
  templateUrl: './importacao.html',
  styleUrl: './importacao.scss',
})
export class Importacao {
  private readonly service = inject(ImportacaoService);
  private readonly categoriaService = inject(CategoriaService);
  private readonly contaService = inject(ContaService);
  private arquivo: File | null = null;

  protected readonly categorias = toSignal(this.categoriaService.listar(), {
    initialValue: [] as Categoria[],
  });

  // Sem as contas a importação segue funcionando (vale a conta principal): só some a escolha.
  protected readonly contas = signal<Conta[]>([]);
  protected readonly contasAtivas = computed(() => this.contas().filter((c) => !c.arquivada));
  protected readonly contaId = signal<number | null>(null);
  protected readonly contaReconhecida = signal(false);
  protected readonly identificadorExterno = signal<string | null>(null);
  protected readonly tipoContaSugerido = signal<TipoConta>('CONTA_CORRENTE');
  protected readonly nomeNovaConta = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(60)],
  });
  protected readonly erroConta = signal<string | null>(null);
  protected readonly criandoConta = signal(false);
  /** Contas que podem receber o pagamento de fatura: todas, menos a de destino da importação. */
  protected readonly contasParaTransferencia = computed(() =>
    this.contasAtivas().filter((c) => c.id !== this.contaId()),
  );

  protected readonly etapa = signal<Etapa>('envio');
  protected readonly arrastando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly nomeArquivo = signal('');
  protected readonly origem = signal<OrigemImportacao | null>(null);
  protected readonly linhas = signal<LinhaRevisao[]>([]);
  protected readonly resultado = signal<ResultadoImportacao | null>(null);

  protected readonly categoriasPorTipo = computed(() => ({
    RECEITA: this.categorias().filter((c) => c.tipo === 'RECEITA'),
    DESPESA: this.categorias().filter((c) => c.tipo === 'DESPESA'),
  }));

  protected readonly selecionadas = computed(() => this.linhas().filter((l) => l.selecionada));
  protected readonly totais = computed(() => {
    let receitas = 0;
    let despesas = 0;
    for (const linha of this.selecionadas()) {
      if (linha.tipo === 'RECEITA') receitas += linha.valor;
      else despesas += linha.valor;
    }
    return { receitas, despesas };
  });

  protected readonly quantidadePorRegraDoUsuario = computed(
    () => this.linhas().filter((l) => l.origemSugestao === 'REGRA_USUARIO' && !l.duplicada).length,
  );
  protected readonly quantidadeDuplicadas = computed(
    () => this.linhas().filter((l) => l.duplicada).length,
  );
  protected readonly quantidadeDesmarcadas = computed(
    () => this.linhas().filter((l) => l.ignoradaSugerida && !l.duplicada).length,
  );
  private readonly selecionaveis = computed(() => this.linhas().filter((l) => !l.duplicada));
  protected readonly todasMarcadas = computed(
    () => this.selecionaveis().length > 0 && this.selecionaveis().every((l) => l.selecionada),
  );
  protected readonly algumaMarcada = computed(() => this.selecionadas().length > 0);

  protected readonly descricaoOrigem = computed(() =>
    this.origem() === 'CARTAO' ? 'fatura do cartão' : 'extrato da conta',
  );

  constructor() {
    this.contaService.listar().subscribe({
      next: (contas) => this.contas.set(contas),
      error: () => this.contas.set([]),
    });
  }

  protected aoEscolherArquivo(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const arquivo = campo.files?.[0];
    campo.value = ''; // permite escolher o mesmo arquivo de novo depois de trocar
    if (arquivo) this.processar(arquivo);
  }

  protected aoArrastar(evento: DragEvent): void {
    evento.preventDefault(); // sem isso o navegador não aceita o "soltar"
    this.arrastando.set(true);
  }

  protected aoSoltar(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastando.set(false);
    const arquivo = evento.dataTransfer?.files?.[0];
    if (arquivo) this.processar(arquivo);
  }

  private processar(arquivo: File): void {
    const mensagem = this.validarArquivo(arquivo);
    if (mensagem) {
      this.erro.set(mensagem);
      return;
    }

    this.erro.set(null);
    this.nomeArquivo.set(arquivo.name);
    this.arquivo = arquivo;
    this.etapa.set('lendo');
    this.service.enviarArquivo(arquivo).subscribe({
      next: (preview) => {
        this.origem.set(preview.origem);
        this.guardarConta(preview);
        const cartao = this.contasAtivas().find(
          (c) => c.tipo === 'CARTAO_CREDITO' && c.id !== preview.contaId,
        );
        this.linhas.set(
          preview.linhas.map((linha) => ({
            ...linha,
            categoriaSugeridaId: linha.categoriaId,
            selecionada: !linha.duplicada && !linha.ignoradaSugerida,
            // Sugestão: pagamento de fatura vira transferência para a conta do cartão.
            contaDestinoId: linha.pagamentoDeFatura && cartao ? cartao.id : null,
          })),
        );
        this.etapa.set('revisao');
      },
      error: (e: unknown) => {
        this.erro.set(descreverErro(e));
        this.etapa.set('envio');
      },
    });
  }

  private guardarConta(preview: PreviewImportacao): void {
    this.contaId.set(preview.contaId);
    this.contaReconhecida.set(preview.contaReconhecida);
    this.identificadorExterno.set(preview.identificadorExterno);
    this.tipoContaSugerido.set(preview.tipoContaSugerido);
    this.nomeNovaConta.reset(preview.nomeContaSugerido);
    this.erroConta.set(null);
  }

  /** Trocar a conta muda onde as duplicatas são procuradas: relê o arquivo (nada é gravado). */
  protected aoEscolherConta(evento: Event): void {
    const contaId = Number((evento.target as HTMLSelectElement).value);
    const arquivo = this.arquivo;
    if (contaId < 1 || !arquivo) return;
    this.erroConta.set(null);
    this.service.enviarArquivo(arquivo, contaId).subscribe({
      next: (preview) => {
        const duplicadas = new Map(preview.linhas.map((l) => [l.idExterno, l.duplicada]));
        this.contaId.set(preview.contaId);
        this.contaReconhecida.set(preview.contaReconhecida);
        this.linhas.update((linhas) =>
          linhas.map((linha) => {
            const duplicada = duplicadas.get(linha.idExterno) ?? linha.duplicada;
            return {
              ...linha,
              duplicada,
              selecionada: duplicada
                ? false
                : linha.duplicada
                  ? !linha.ignoradaSugerida
                  : linha.selecionada,
              contaDestinoId:
                linha.contaDestinoId === preview.contaId ? null : linha.contaDestinoId,
            };
          }),
        );
      },
      error: (e: unknown) => this.erroConta.set(descreverErro(e)),
    });
  }

  /** Arquivo de uma conta que o app ainda não conhece: cria a conta já ligada ao banco/conta do OFX. */
  protected criarContaNova(): void {
    this.nomeNovaConta.markAsTouched();
    if (this.nomeNovaConta.invalid) return;
    this.criandoConta.set(true);
    this.erroConta.set(null);
    this.contaService
      .criar({
        nome: this.nomeNovaConta.value.trim(),
        tipo: this.tipoContaSugerido(),
        identificadorExterno: this.identificadorExterno(),
      })
      .subscribe({
        next: (conta) => {
          this.criandoConta.set(false);
          this.contas.update((atuais) => [...atuais, conta]);
          this.aoEscolherConta({ target: { value: String(conta.id) } } as unknown as Event);
        },
        error: (e: unknown) => {
          this.criandoConta.set(false);
          this.erroConta.set(descreverErro(e));
        },
      });
  }

  protected aoEscolherDestinoDaFatura(idExterno: string, evento: Event): void {
    const valor = Number((evento.target as HTMLSelectElement).value);
    this.atualizarLinha(idExterno, {
      contaDestinoId: valor >= 1 ? valor : null,
      // Escolher a conta do cartão é a intenção de importar a linha.
      ...(valor >= 1 && { selecionada: true }),
    });
  }

  private validarArquivo(arquivo: File): string | null {
    if (!arquivo.name.toLowerCase().endsWith('.ofx')) {
      return 'Escolha um arquivo com extensão .ofx.';
    }
    if (arquivo.size > TAMANHO_MAX_ARQUIVO_BYTES) {
      return 'O arquivo é maior que 2 MB. Exporte um período menor.';
    }
    return null;
  }

  protected aoMarcarLinha(idExterno: string, evento: Event): void {
    this.atualizarLinha(idExterno, { selecionada: (evento.target as HTMLInputElement).checked });
  }

  protected aoMarcarTodas(evento: Event): void {
    const marcar = (evento.target as HTMLInputElement).checked;
    this.linhas.update((linhas) =>
      linhas.map((linha) => (linha.duplicada ? linha : { ...linha, selecionada: marcar })),
    );
  }

  protected aoMudarCategoria(idExterno: string, evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.atualizarLinha(idExterno, { categoriaId: Number(valor) });
  }

  private atualizarLinha(idExterno: string, mudanca: Partial<LinhaRevisao>): void {
    this.linhas.update((linhas) =>
      linhas.map((linha) => (linha.idExterno === idExterno ? { ...linha, ...mudanca } : linha)),
    );
  }

  protected confirmar(): void {
    const transacoes: LinhaImportacaoRequest[] = this.selecionadas().map((linha) => ({
      idExterno: linha.idExterno,
      categoriaId: linha.categoriaId,
      descricao: linha.descricao,
      valor: linha.valor,
      tipo: linha.tipo,
      dataTransacao: linha.dataTransacao,
      ...(linha.contaDestinoId !== null && { contaDestinoId: linha.contaDestinoId }),
    }));
    if (transacoes.length === 0) return;

    this.erro.set(null);
    this.etapa.set('importando');
    const contaId = this.contaId();
    const identificador = this.identificadorExterno();
    this.service
      .confirmar(transacoes, {
        ...(contaId !== null && { contaId }),
        ...(identificador && { identificadorExterno: identificador }),
      })
      .subscribe({
        next: (resultado) => {
          this.resultado.set(resultado);
          this.etapa.set('concluido');
        },
        error: (e: unknown) => {
          this.erro.set(descreverErro(e));
          this.etapa.set('revisao');
        },
      });
  }

  protected recomecar(): void {
    this.linhas.set([]);
    this.resultado.set(null);
    this.origem.set(null);
    this.nomeArquivo.set('');
    this.arquivo = null;
    this.contaId.set(null);
    this.contaReconhecida.set(false);
    this.identificadorExterno.set(null);
    this.erroConta.set(null);
    this.erro.set(null);
    this.etapa.set('envio');
  }
}

import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { catchError, EMPTY, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { descreverErro } from '../../core/models/api-error';
import {
  Categoria,
  Conta,
  FiltroTransacoes,
  TipoTransacao,
  Transacao,
  TransacaoRequest,
} from '../../core/models/api.models';
import { sugerirTermo } from '../../core/utils/texto';
import { Button } from '../../shared/button/button';
import { Moeda } from '../../shared/moeda/moeda';
import { FormField } from '../../shared/form-field/form-field';
import { Modal } from '../../shared/modal/modal';
import { SeletorPeriodo } from '../../shared/seletor-periodo/seletor-periodo';
import { Table } from '../../shared/table/table';
import { CategoriaService } from '../categorias/categoria.service';
import { ContaService } from '../contas/conta.service';
import { RegraService } from '../regras/regra.service';
import { TransacaoForm } from './transacao-form/transacao-form';
import { TransacaoService } from './transacao.service';

/** `'novo'` = criar; uma `Transacao` = editar; `null` = modal fechado. */
type EstadoFormulario = 'novo' | Transacao | null;

/** Filtros além do período (o período vem do seletor e de "Todo o histórico"). */
type FiltrosAplicados = Omit<FiltroTransacoes, 'mes' | 'ano'>;

/** Oferta, depois de mover transações, de lembrar a escolha para as próximas importações. */
interface PropostaRegra {
  categoriaId: number;
  categoriaNome: string;
}

const plural = (n: number, singular: string, mais: string): string =>
  `${n} ${n === 1 ? singular : mais}`;

const inteiro = (bruto: string | null, min: number, max: number): number | null => {
  const valor = Number(bruto);
  return bruto !== null && Number.isInteger(valor) && valor >= min && valor <= max ? valor : null;
};

@Component({
  selector: 'app-transacoes',
  imports: [
    Moeda,
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    Button,
    FormField,
    Modal,
    SeletorPeriodo,
    Table,
    TransacaoForm,
  ],
  templateUrl: './transacoes.html',
  styleUrl: './transacoes.scss',
})
export class Transacoes {
  private readonly transacaoService = inject(TransacaoService);
  private readonly categoriaService = inject(CategoriaService);
  private readonly regraService = inject(RegraService);
  private readonly contaService = inject(ContaService);
  private readonly consultaDaUrl = inject(ActivatedRoute).snapshot.queryParamMap;

  protected readonly mes = signal<number | null>(new Date().getMonth() + 1);
  protected readonly ano = signal(new Date().getFullYear());
  protected readonly todoHistorico = signal(false);
  private readonly filtros = signal<FiltrosAplicados>({});
  private readonly atualizacoes = signal(0);

  // Campos do painel de filtros; só valem depois de "Filtrar" (evita uma consulta a cada tecla).
  protected readonly filtroForm = inject(FormBuilder).nonNullable.group({
    busca: ['', [Validators.maxLength(150)]],
    categoriaId: [0], // 0 = todas
    contaId: [0], // 0 = todas
    tipo: ['' as '' | TipoTransacao],
    valorMin: [null as number | null, [Validators.min(0)]],
    valorMax: [null as number | null, [Validators.min(0)]],
  });
  protected readonly erroFiltro = signal<string | null>(null);

  protected readonly transacoes = signal<Transacao[]>([]);
  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly contas = signal<Conta[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal('');

  protected readonly formulario = signal<EstadoFormulario>(null);
  protected readonly excluindo = signal<Transacao | null>(null);
  protected readonly salvando = signal(false);
  protected readonly erroModal = signal<string | null>(null);

  // Edição em massa
  protected readonly selecionadas = signal<ReadonlySet<number>>(new Set());
  protected readonly categoriaDestino = signal(0);
  protected readonly excluindoSelecionadas = signal(false);
  protected readonly erroSelecao = signal<string | null>(null);

  // Mover para outra conta e marcar como transferência
  protected readonly contaDestino = signal(0);
  protected readonly marcandoTransferencia = signal<Transacao | null>(null);
  protected readonly contaDaTransferencia = signal(0);

  // Proposta de regra (opcional; não bloqueia o fluxo). Limites espelham o backend (criarRegraSchema).
  protected readonly propostaRegra = signal<PropostaRegra | null>(null);
  protected readonly termoRegra = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(3), Validators.maxLength(100)],
  });
  protected readonly aplicarNoHistorico = signal(false);
  protected readonly salvandoRegra = signal(false);
  protected readonly erroRegra = signal<string | null>(null);

  protected readonly nomesDasCategorias = computed(
    () => new Map(this.categorias().map((c) => [c.id, c.nome])),
  );
  protected readonly nomesDasContas = computed(
    () => new Map(this.contas().map((c) => [c.id, c.nome])),
  );
  protected readonly contasAtivas = computed(() => this.contas().filter((c) => !c.arquivada));
  /** Com uma conta só, as colunas e ações de conta não fazem sentido e ficam escondidas. */
  protected readonly variasContas = computed(() => this.contasAtivas().length > 1);
  protected readonly categoriasDespesa = computed(() =>
    this.categorias().filter((c) => c.tipo === 'DESPESA'),
  );
  protected readonly categoriasReceita = computed(() =>
    this.categorias().filter((c) => c.tipo === 'RECEITA'),
  );
  protected readonly emEdicao = computed(() => {
    const estado = this.formulario();
    return estado !== null && estado !== 'novo' ? estado : null;
  });

  protected readonly filtrando = computed(() => Object.keys(this.filtros()).length > 0);
  protected readonly resumo = computed(() => {
    const lista = this.transacoes();
    const soma = (tipo: TipoTransacao) =>
      lista.filter((t) => t.tipo === tipo).reduce((total, t) => total + t.valor, 0);
    return {
      quantidade: lista.length,
      textoQuantidade: plural(lista.length, 'transação encontrada', 'transações encontradas'),
      receitas: soma('RECEITA'),
      despesas: soma('DESPESA'),
    };
  });

  protected readonly transacoesSelecionadas = computed(() => {
    const ids = this.selecionadas();
    return this.transacoes().filter((t) => ids.has(t.id));
  });
  protected readonly quantidadeSelecionada = computed(() => this.transacoesSelecionadas().length);
  protected readonly todasSelecionadas = computed(
    () => this.transacoes().length > 0 && this.quantidadeSelecionada() === this.transacoes().length,
  );
  protected readonly algumasSelecionadas = computed(
    () => this.quantidadeSelecionada() > 0 && !this.todasSelecionadas(),
  );
  /** Tipo comum da seleção; `'MISTO'` quando há receitas e despesas juntas. */
  protected readonly tipoDaSelecao = computed<TipoTransacao | 'MISTO' | null>(() => {
    const tipos = new Set(this.transacoesSelecionadas().map((t) => t.tipo));
    if (tipos.size === 0) return null;
    return tipos.size > 1 ? 'MISTO' : [...tipos][0];
  });
  /** Uma categoria só aceita transações do próprio tipo, então a lista depende da seleção. */
  protected readonly categoriasDeDestino = computed(() => {
    const tipo = this.tipoDaSelecao();
    return tipo === 'MISTO' || tipo === null
      ? []
      : this.categorias().filter((c) => c.tipo === tipo);
  });

  constructor() {
    this.aplicarConsultaDaUrl();

    const consulta = computed(() => ({
      filtro: {
        ...(this.todoHistorico() ? {} : { mes: this.mes() ?? undefined, ano: this.ano() }),
        ...this.filtros(),
      } satisfies FiltroTransacoes,
      rodada: this.atualizacoes(),
    }));

    toObservable(consulta)
      .pipe(
        tap(() => {
          this.carregando.set(true);
          this.erro.set(null);
        }),
        switchMap(({ filtro }) =>
          // Falha nas categorias não impede a listagem.
          forkJoin({
            transacoes: this.transacaoService.listar(filtro),
            categorias: this.categoriaService
              .listar()
              .pipe(catchError(() => of([] as Categoria[]))),
            contas: this.contaService.listar().pipe(catchError(() => of([] as Conta[]))),
          }).pipe(
            catchError((e: unknown) => {
              this.erro.set(descreverErro(e));
              this.carregando.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ transacoes, categorias, contas }) => {
        this.transacoes.set(transacoes);
        this.categorias.set(categorias);
        this.contas.set(contas);
        // Mantém marcadas só as que continuam na lista (a lista muda com filtros e após ações).
        const ids = new Set(transacoes.map((t) => t.id));
        this.selecionadas.update((atuais) => new Set([...atuais].filter((id) => ids.has(id))));
        this.carregando.set(false);
      });
  }

  // ---- filtros

  /**
   * Abre já filtrada quando vem de um link (insight, recorrente, conta): `mes`, `ano`, `categoriaId`,
   * `tipo`, `busca`, `contaId` e `historico=1` (todo o histórico). Valores inválidos são ignorados.
   */
  private aplicarConsultaDaUrl(): void {
    const url = this.consultaDaUrl;
    const ano = inteiro(url.get('ano'), 1970, 9999);
    const mes = inteiro(url.get('mes'), 1, 12);
    if (ano !== null) {
      this.ano.set(ano);
      if (mes !== null) this.mes.set(mes);
    }
    if (url.get('historico') === '1') this.todoHistorico.set(true);

    const categoriaId = inteiro(url.get('categoriaId'), 1, 2 ** 31 - 1);
    const contaId = inteiro(url.get('contaId'), 1, 2 ** 31 - 1);
    const tipoBruto = url.get('tipo');
    const tipo = tipoBruto === 'RECEITA' || tipoBruto === 'DESPESA' ? tipoBruto : null;
    const busca = (url.get('busca') ?? '').trim().slice(0, 150);

    const filtros: FiltrosAplicados = {
      ...(busca && { busca }),
      ...(categoriaId !== null && { categoriaId }),
      ...(contaId !== null && { contaId }),
      ...(tipo && { tipo }),
    };
    if (Object.keys(filtros).length === 0) return;
    this.filtros.set(filtros);
    this.filtroForm.patchValue({
      busca,
      categoriaId: categoriaId ?? 0,
      contaId: contaId ?? 0,
      tipo: tipo ?? '',
    });
  }

  protected aplicarFiltros(): void {
    this.erroFiltro.set(null);
    this.filtroForm.markAllAsTouched();
    if (this.filtroForm.invalid) return;

    const { busca, categoriaId, contaId, tipo, valorMin, valorMax } = this.filtroForm.getRawValue();
    if (valorMin !== null && valorMax !== null && valorMin > valorMax) {
      this.erroFiltro.set('O valor mínimo não pode ser maior que o máximo.');
      return;
    }

    const filtros: FiltrosAplicados = {
      ...(busca.trim() && { busca: busca.trim() }),
      ...(categoriaId >= 1 && { categoriaId }),
      ...(contaId >= 1 && { contaId }),
      ...(tipo && { tipo }),
      ...(valorMin !== null && { valorMin }),
      ...(valorMax !== null && { valorMax }),
    };
    this.filtros.set(filtros);
  }

  protected limparFiltros(): void {
    this.filtroForm.reset();
    this.erroFiltro.set(null);
    this.filtros.set({});
  }

  protected alternarTodoHistorico(evento: Event): void {
    this.todoHistorico.set((evento.target as HTMLInputElement).checked);
  }

  // ---- seleção e ações em massa

  protected estaSelecionada(id: number): boolean {
    return this.selecionadas().has(id);
  }

  protected alternarSelecao(id: number): void {
    this.selecionadas.update((atuais) => {
      const novas = new Set(atuais);
      if (!novas.delete(id)) novas.add(id);
      return novas;
    });
    this.limparMensagensDaSelecao();
  }

  protected alternarTodas(): void {
    this.selecionadas.set(
      this.todasSelecionadas() ? new Set() : new Set(this.transacoes().map((t) => t.id)),
    );
    this.limparMensagensDaSelecao();
  }

  protected limparSelecao(): void {
    this.selecionadas.set(new Set());
    this.limparMensagensDaSelecao();
  }

  protected aoEscolherDestino(evento: Event): void {
    this.categoriaDestino.set(Number((evento.target as HTMLSelectElement).value));
  }

  protected moverSelecionadas(): void {
    const categoriaId = this.categoriaDestino();
    const selecionadas = this.transacoesSelecionadas();
    const ids = selecionadas.map((t) => t.id);
    if (categoriaId < 1 || ids.length === 0) return;
    const termoSugerido = sugerirTermo(selecionadas.map((t) => t.descricao));

    this.salvando.set(true);
    this.erroSelecao.set(null);
    this.transacaoService.recategorizar(ids, categoriaId).subscribe({
      next: ({ afetadas }) => {
        const nome = this.nomesDasCategorias().get(categoriaId) ?? 'a categoria escolhida';
        this.salvando.set(false);
        this.categoriaDestino.set(0);
        this.selecionadas.set(new Set());
        this.aviso.set(
          `${plural(afetadas, 'transação movida', 'transações movidas')} para ${nome}.`,
        );
        this.proporRegra(termoSugerido, categoriaId, nome);
        this.recarregar();
      },
      error: (e: unknown) => {
        this.salvando.set(false);
        this.erroSelecao.set(descreverErro(e));
      },
    });
  }

  protected aoEscolherContaDestino(evento: Event): void {
    this.contaDestino.set(Number((evento.target as HTMLSelectElement).value));
  }

  protected moverSelecionadasParaConta(): void {
    const contaId = this.contaDestino();
    const ids = this.transacoesSelecionadas().map((t) => t.id);
    if (contaId < 1 || ids.length === 0) return;

    this.salvando.set(true);
    this.erroSelecao.set(null);
    this.transacaoService.moverParaConta(ids, contaId).subscribe({
      next: ({ afetadas }) => {
        const nome = this.nomesDasContas().get(contaId) ?? 'a conta escolhida';
        this.salvando.set(false);
        this.contaDestino.set(0);
        this.selecionadas.set(new Set());
        this.aviso.set(
          `${plural(afetadas, 'transação movida', 'transações movidas')} para ${nome}.`,
        );
        this.recarregar();
      },
      error: (e: unknown) => {
        this.salvando.set(false);
        this.erroSelecao.set(descreverErro(e));
      },
    });
  }

  protected pedirExclusaoDasSelecionadas(): void {
    this.erroModal.set(null);
    this.excluindoSelecionadas.set(true);
  }

  protected cancelarExclusaoDasSelecionadas(): void {
    this.excluindoSelecionadas.set(false);
  }

  protected confirmarExclusaoDasSelecionadas(): void {
    const ids = this.transacoesSelecionadas().map((t) => t.id);
    if (ids.length === 0) return;

    this.salvando.set(true);
    this.erroModal.set(null);
    this.transacaoService.excluirVarias(ids).subscribe({
      next: ({ afetadas }) => {
        this.salvando.set(false);
        this.excluindoSelecionadas.set(false);
        this.selecionadas.set(new Set());
        this.aviso.set(`${plural(afetadas, 'transação excluída', 'transações excluídas')}.`);
        this.recarregar();
      },
      error: (e: unknown) => {
        this.salvando.set(false);
        this.erroModal.set(descreverErro(e));
      },
    });
  }

  // ---- regra "sempre usar esta categoria" (categorização que aprende)

  // Mover para "Outros" não ensina nada: é o que a importação já faz quando não reconhece.
  private proporRegra(termo: string | null, categoriaId: number, categoriaNome: string): void {
    const ehOutros = this.categorias().some(
      (c) => c.id === categoriaId && c.padrao && c.nome === 'Outros',
    );
    this.erroRegra.set(null);
    if (termo === null || ehOutros) {
      this.propostaRegra.set(null);
      return;
    }
    this.termoRegra.reset(termo);
    this.aplicarNoHistorico.set(false);
    this.propostaRegra.set({ categoriaId, categoriaNome });
  }

  protected alternarAplicarNoHistorico(evento: Event): void {
    this.aplicarNoHistorico.set((evento.target as HTMLInputElement).checked);
  }

  protected dispensarRegra(): void {
    this.propostaRegra.set(null);
    this.erroRegra.set(null);
  }

  protected criarRegra(): void {
    const proposta = this.propostaRegra();
    if (!proposta) return;
    this.termoRegra.markAsTouched();
    if (this.termoRegra.invalid) return;

    const aplicar = this.aplicarNoHistorico();
    this.salvandoRegra.set(true);
    this.erroRegra.set(null);
    this.regraService
      .criar({ termo: this.termoRegra.value.trim(), categoriaId: proposta.categoriaId })
      .pipe(
        switchMap((regra) =>
          aplicar
            ? this.regraService.aplicar(regra.id).pipe(map(({ afetadas }) => ({ regra, afetadas })))
            : of({ regra, afetadas: null }),
        ),
      )
      .subscribe({
        next: ({ regra, afetadas }) => {
          this.salvandoRegra.set(false);
          this.propostaRegra.set(null);
          const base = `Regra criada: descrições com "${regra.termo}" vão para ${proposta.categoriaNome} nas próximas importações.`;
          this.aviso.set(
            afetadas === null
              ? base
              : `${base} ${plural(afetadas, 'transação movida', 'transações movidas')} no histórico.`,
          );
          if (afetadas) this.recarregar();
        },
        error: (e: unknown) => {
          this.salvandoRegra.set(false);
          this.erroRegra.set(descreverErro(e));
        },
      });
  }

  private limparMensagensDaSelecao(): void {
    this.erroSelecao.set(null);
    this.aviso.set('');
  }

  // ---- transferência (pagamento de fatura e similares)

  protected pedirTransferencia(transacao: Transacao): void {
    this.erroModal.set(null);
    this.contaDaTransferencia.set(0);
    this.marcandoTransferencia.set(transacao);
  }

  protected aoEscolherContaDaTransferencia(evento: Event): void {
    this.contaDaTransferencia.set(Number((evento.target as HTMLSelectElement).value));
  }

  /** Contas que podem receber a outra ponta: todas as ativas, menos a da própria transação. */
  protected contasParaTransferir(transacao: Transacao): Conta[] {
    return this.contasAtivas().filter((c) => c.id !== transacao.contaId);
  }

  protected confirmarTransferencia(): void {
    const alvo = this.marcandoTransferencia();
    const contaDestinoId = this.contaDaTransferencia();
    if (!alvo || contaDestinoId < 1) return;

    this.salvando.set(true);
    this.erroModal.set(null);
    this.transacaoService.marcarComoTransferencia(alvo.id, contaDestinoId).subscribe({
      next: () => {
        this.salvando.set(false);
        this.marcandoTransferencia.set(null);
        this.aviso.set(
          `"${alvo.descricao}" agora é uma transferência: não conta mais como receita nem despesa.`,
        );
        this.recarregar();
      },
      error: (e: unknown) => {
        this.salvando.set(false);
        this.erroModal.set(descreverErro(e));
      },
    });
  }

  // ---- transação individual

  protected abrirNovo(): void {
    this.erroModal.set(null);
    this.formulario.set('novo');
  }

  protected abrirEdicao(transacao: Transacao): void {
    this.erroModal.set(null);
    this.formulario.set(transacao);
  }

  protected fecharFormulario(): void {
    this.formulario.set(null);
  }

  protected pedirExclusao(transacao: Transacao): void {
    this.erroModal.set(null);
    this.excluindo.set(transacao);
  }

  protected cancelarExclusao(): void {
    this.excluindo.set(null);
  }

  protected salvar(dados: TransacaoRequest): void {
    const alvo = this.emEdicao();
    const requisicao = alvo
      ? this.transacaoService.atualizar(alvo.id, dados)
      : this.transacaoService.criar(dados);

    this.salvando.set(true);
    this.erroModal.set(null);
    requisicao.subscribe({
      next: () => {
        this.salvando.set(false);
        this.formulario.set(null);
        this.aviso.set(alvo ? 'Transação atualizada.' : 'Transação registrada.');
        this.recarregar();
      },
      error: (e: unknown) => {
        this.salvando.set(false);
        this.erroModal.set(descreverErro(e));
      },
    });
  }

  protected confirmarExclusao(): void {
    const alvo = this.excluindo();
    if (!alvo) return;

    this.salvando.set(true);
    this.erroModal.set(null);
    this.transacaoService.deletar(alvo.id).subscribe({
      next: () => {
        this.salvando.set(false);
        this.excluindo.set(null);
        this.aviso.set('Transação excluída.');
        this.recarregar();
      },
      error: (e: unknown) => {
        this.salvando.set(false);
        this.erroModal.set(descreverErro(e));
      },
    });
  }

  private recarregar(): void {
    this.atualizacoes.update((n) => n + 1);
  }
}

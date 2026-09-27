import { CurrencyPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { catchError, EMPTY, map, switchMap, tap } from 'rxjs';
import { descreverErro } from '../../core/models/api-error';
import {
  MesDoAno,
  MetasCategoriaDoMes,
  MetaMes,
  MetasDoAno,
  ResultadoCopiaMetas,
  SituacaoMeta,
} from '../../core/models/api.models';
import { formatarMoeda, formatarPercentual, nomeDoMes } from '../../core/utils/formato';
import { Button } from '../../shared/button/button';
import { Moeda } from '../../shared/moeda/moeda';
import { SeletorPeriodo } from '../../shared/seletor-periodo/seletor-periodo';
import { MetasService } from './metas.service';

/** Lê `?ano=2026&mes=3` (vem do link "Alterar meta" do dashboard); valores inválidos são ignorados. */
function inteiroDaQuery(bruto: string | null, min: number, max: number): number | null {
  const valor = Number(bruto);
  return bruto !== null && Number.isInteger(valor) && valor >= min && valor <= max ? valor : null;
}

/** Uma categoria de despesa na lista de metas: com ou sem meta no mês. */
interface LinhaMetaCategoria {
  categoriaId: number;
  categoria: string;
  meta: number | null;
  gasto: number;
  percentual: number | null;
  situacao: SituacaoMeta | null;
}

const ROTULO_SITUACAO: Record<SituacaoMeta, string> = {
  DENTRO: 'dentro da meta',
  ATENCAO: 'atenção: perto do limite',
  ESTOURADA: 'meta estourada',
};

const chaveDoMes = ({ ano, mes }: MesDoAno): string => `${ano}-${mes}`;

const plural = (n: number, singular: string, mais: string): string =>
  `${n} ${n === 1 ? singular : mais}`;

@Component({
  selector: 'app-metas',
  imports: [Moeda, CurrencyPipe, ReactiveFormsModule, Button, SeletorPeriodo],
  templateUrl: './metas.html',
  styleUrl: './metas.scss',
})
export class Metas {
  private readonly service = inject(MetasService);

  protected readonly mes = signal<number | null>(1);
  protected readonly ano = signal(new Date().getFullYear());

  protected readonly metasDoAno = signal<MetasDoAno | null>(null);
  protected readonly carregando = signal(true);
  protected readonly removendoAntiga = signal(false);
  protected readonly erroCarga = signal<string | null>(null); // falha ao carregar o ano
  protected readonly erro = signal<string | null>(null); // falha ao remover a meta antiga
  protected readonly aviso = signal<string | null>(null);

  protected readonly mesAtual = computed(() => this.mes() ?? 1);
  protected readonly periodoTexto = computed(
    () => `${nomeDoMes(this.mesAtual())} de ${this.ano()}`,
  );

  /** Meta do mês escolhido: a soma das metas por categoria (`orcamentoLimite` é `null` sem meta). */
  protected readonly metaDoMes = computed<MetaMes | null>(
    () => this.metasDoAno()?.meses.find((m) => m.mes === this.mesAtual()) ?? null,
  );

  // ---- metas por categoria
  private readonly rodadaAno = signal(0);
  private readonly rodadaCategorias = signal(0);
  protected readonly categoriasDoMes = signal<MetasCategoriaDoMes | null>(null);
  protected readonly carregandoCategorias = signal(true);
  protected readonly erroCategorias = signal<string | null>(null);
  protected readonly salvandoCategoriaId = signal<number | null>(null);
  protected readonly erroCategoria = signal<string | null>(null);
  protected readonly avisoCategoria = signal<string | null>(null);
  // Os campos sobrevivem à releitura da lista: o que o usuário digitou em outra linha não se perde.
  private readonly controles = new Map<number, FormControl<number | null>>();
  private chaveCarregada = '';

  /** Todas as categorias de despesa, em ordem alfabética, com a meta e o gasto do mês. */
  protected readonly linhasCategoria = computed<LinhaMetaCategoria[]>(() => {
    const dados = this.categoriasDoMes();
    if (!dados) return [];
    return [
      ...dados.comMeta.map((c) => ({ ...c, meta: c.meta as number | null })),
      ...dados.semMeta.map((c) => ({ ...c, meta: null, percentual: null, situacao: null })),
    ].sort((a, b) => a.categoria.localeCompare(b.categoria, 'pt-BR'));
  });

  /** Explica de onde vem a meta do mês quando ela é a soma das categorias. */
  protected readonly textoDaSoma = computed(() => {
    const quantidade = this.categoriasDoMes()?.comMeta.length;
    return quantidade === undefined
      ? 'Soma das metas por categoria.'
      : `Soma das metas de ${plural(quantidade, 'categoria', 'categorias')}.`;
  });

  /** Quanto já foi gasto no mês, com ou sem meta. */
  protected readonly gastoDoMes = computed(() => {
    const dados = this.categoriasDoMes();
    if (!dados) return null;
    const soma = [...dados.comMeta, ...dados.semMeta].reduce((total, c) => total + c.gasto, 0);
    return Math.round(soma * 100) / 100;
  });

  // ---- copiar para os próximos meses
  protected readonly ateEscolhido = signal<string | null>(null);
  protected readonly sobrescrever = signal(false);
  protected readonly copiando = signal(false);
  protected readonly erroCopia = signal<string | null>(null);
  protected readonly resultadoCopia = signal<string | null>(null);

  /** Os 12 meses depois do mês visto (passando para o ano seguinte se preciso). */
  protected readonly mesesDeDestino = computed(() =>
    Array.from({ length: 12 }, (_, i) => {
      const indice = this.mesAtual() + i; // base 0: o 1º destino é o mês seguinte ao visto
      const ano = this.ano() + Math.floor(indice / 12);
      const mes = (indice % 12) + 1;
      return { ano, mes, valor: chaveDoMes({ ano, mes }), rotulo: `${nomeDoMes(mes)} de ${ano}` };
    }),
  );
  // Padrão: até dezembro do ano visto (ou o mês seguinte, se já é dezembro).
  protected readonly ateEfetivo = computed(() => {
    const opcoes = this.mesesDeDestino();
    const escolhido = this.ateEscolhido();
    if (escolhido !== null && opcoes.some((o) => o.valor === escolhido)) return escolhido;
    return (opcoes.find((o) => o.mes === 12 && o.ano === this.ano()) ?? opcoes[0]).valor;
  });

  constructor() {
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    const hoje = new Date();
    const anoInicial = inteiroDaQuery(query.get('ano'), 1970, 9999) ?? hoje.getFullYear();
    this.ano.set(anoInicial);
    this.mes.set(
      inteiroDaQuery(query.get('mes'), 1, 12) ??
        (anoInicial === hoje.getFullYear() ? hoje.getMonth() + 1 : 1),
    );

    // Ao trocar de ano, carrega as 12 metas; trocar de mês só muda o que o formulário mostra.
    toObservable(computed(() => ({ ano: this.ano(), rodada: this.rodadaAno() })))
      .pipe(
        map(({ ano }) => ano),
        tap(() => {
          this.carregando.set(true);
          this.erroCarga.set(null);
        }),
        switchMap((ano) =>
          this.service.obterAno(ano).pipe(
            catchError((e: unknown) => {
              this.erroCarga.set(descreverErro(e));
              this.carregando.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((metas) => {
        this.metasDoAno.set(metas);
        this.carregando.set(false);
      });

    // Metas por categoria do mês escolhido (e do que foi alterado depois).
    toObservable(
      computed(() => ({ ano: this.ano(), mes: this.mesAtual(), rodada: this.rodadaCategorias() })),
    )
      .pipe(
        tap(({ ano, mes }) => {
          // Outro mês: começa do zero (campos e lista); a mesma tela relida mantém o que foi digitado.
          const chave = chaveDoMes({ ano, mes });
          if (chave !== this.chaveCarregada) {
            this.chaveCarregada = chave;
            this.controles.clear();
            this.categoriasDoMes.set(null);
          }
          this.carregandoCategorias.set(true);
          this.erroCategorias.set(null);
        }),
        switchMap(({ ano, mes }) =>
          this.service.obterCategoriasDoMes(ano, mes).pipe(
            catchError((e: unknown) => {
              this.erroCategorias.set(descreverErro(e));
              this.carregandoCategorias.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((dados) => {
        const atuais: [number, number | null][] = [
          ...dados.comMeta.map((c): [number, number | null] => [c.categoriaId, c.meta]),
          ...dados.semMeta.map((c): [number, number | null] => [c.categoriaId, null]),
        ];
        for (const [categoriaId, meta] of atuais) {
          const controle = this.controle(categoriaId);
          if (!controle.dirty) controle.reset(meta);
        }
        this.categoriasDoMes.set(dados);
        this.carregandoCategorias.set(false);
      });

    // Mensagens de um mês não valem para outro, nem os campos das categorias.
    effect(() => {
      this.mes();
      this.ano();
      untracked(() => {
        this.aviso.set(null);
        this.erro.set(null);
        this.avisoCategoria.set(null);
        this.erroCategoria.set(null);
        this.resultadoCopia.set(null);
        this.erroCopia.set(null);
      });
    });
  }

  protected escolherMes(mes: number): void {
    this.mes.set(mes);
  }

  /** Descarta a meta total de antes das metas por categoria (o backend a mantém só até lá). */
  protected removerMetaAntiga(): void {
    const [ano, mes, periodo] = [this.ano(), this.mesAtual(), this.periodoTexto()];
    this.removendoAntiga.set(true);
    this.erro.set(null);
    this.aviso.set(null);

    this.service.definir({ ano, mes, orcamentoLimite: null }).subscribe({
      next: () => {
        this.aviso.set(`Meta antiga de ${periodo} removida.`);
        this.removendoAntiga.set(false);
        this.rodadaAno.update((n) => n + 1);
      },
      error: (e: unknown) => {
        this.erro.set(descreverErro(e));
        this.removendoAntiga.set(false);
      },
    });
  }

  protected controle(categoriaId: number): FormControl<number | null> {
    let controle = this.controles.get(categoriaId);
    if (!controle) {
      controle = new FormControl<number | null>(null, [
        Validators.min(0.01),
        Validators.max(99999999.99),
      ]);
      this.controles.set(categoriaId, controle);
    }
    return controle;
  }

  protected rotuloSituacao(situacao: SituacaoMeta): string {
    return ROTULO_SITUACAO[situacao];
  }

  protected percentualTexto(percentual: number): string {
    return formatarPercentual(percentual);
  }

  protected salvarCategoria(linha: LinhaMetaCategoria): void {
    const controle = this.controle(linha.categoriaId);
    controle.markAsTouched();
    if (controle.invalid) return;
    if (controle.value === null) {
      this.erroCategoria.set(`Informe o valor da meta de ${linha.categoria}.`);
      return;
    }
    this.gravarCategoria(linha, controle.value);
  }

  protected removerCategoria(linha: LinhaMetaCategoria): void {
    this.gravarCategoria(linha, null);
  }

  private gravarCategoria(linha: LinhaMetaCategoria, valor: number | null): void {
    const [ano, mes, periodo] = [this.ano(), this.mesAtual(), this.periodoTexto()];
    this.salvandoCategoriaId.set(linha.categoriaId);
    this.erroCategoria.set(null);
    this.avisoCategoria.set(null);

    this.service.definirCategoria({ ano, mes, categoriaId: linha.categoriaId, valor }).subscribe({
      next: (meta) => {
        // Se o usuário mudou de mês enquanto salvava, a resposta não vale para a tela atual.
        if (ano !== this.ano() || mes !== this.mesAtual()) return;
        const controle = this.controle(linha.categoriaId);
        controle.reset(meta.valor);
        this.avisoCategoria.set(
          meta.valor === null
            ? `Meta de ${linha.categoria} em ${periodo} removida.`
            : `Meta de ${linha.categoria} em ${periodo} salva: ${formatarMoeda(meta.valor)}.`,
        );
        this.salvandoCategoriaId.set(null);
        this.rodadaCategorias.update((n) => n + 1);
        this.rodadaAno.update((n) => n + 1); // a meta do mês é a soma das categorias
      },
      error: (e: unknown) => {
        this.erroCategoria.set(descreverErro(e));
        this.salvandoCategoriaId.set(null);
      },
    });
  }

  protected aoEscolherAte(evento: Event): void {
    this.ateEscolhido.set((evento.target as HTMLSelectElement).value);
  }

  protected alternarSobrescrever(evento: Event): void {
    this.sobrescrever.set((evento.target as HTMLInputElement).checked);
  }

  protected copiar(): void {
    const opcoes = this.mesesDeDestino();
    const fim = opcoes.findIndex((o) => o.valor === this.ateEfetivo());
    const destino: MesDoAno[] = opcoes.slice(0, fim + 1).map(({ ano, mes }) => ({ ano, mes }));
    const origem = { ano: this.ano(), mes: this.mesAtual() };

    this.copiando.set(true);
    this.erroCopia.set(null);
    this.resultadoCopia.set(null);
    this.service
      .copiar({
        origem,
        destino,
        incluir: 'CATEGORIAS', // o total do mês é a soma delas
        sobrescrever: this.sobrescrever(),
      })
      .subscribe({
        next: (resultado) => {
          this.copiando.set(false);
          this.resultadoCopia.set(this.textoDaCopia(resultado));
          this.rodadaAno.update((n) => n + 1);
          this.rodadaCategorias.update((n) => n + 1);
        },
        error: (e: unknown) => {
          this.copiando.set(false);
          this.erroCopia.set(descreverErro(e));
        },
      });
  }

  private textoDaCopia(resultado: ResultadoCopiaMetas): string {
    const copiadas = plural(resultado.copiadas, 'meta copiada', 'metas copiadas');
    if (resultado.puladas === 0) return `${copiadas}.`;
    const meses = resultado.mesesPulados.map((m) => `${nomeDoMes(m.mes)} de ${m.ano}`).join(', ');
    const puladas = plural(
      resultado.puladas,
      'meta que já existia foi mantida',
      'metas que já existiam foram mantidas',
    );
    return `${copiadas}; ${puladas} (${meses}). Marque "Substituir metas que já existem" para trocá-las.`;
  }

  protected nomeCapitalizado(mes: number): string {
    const nome = nomeDoMes(mes);
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }
}

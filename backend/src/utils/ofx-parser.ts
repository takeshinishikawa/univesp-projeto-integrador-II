import { TipoTransacao } from '../types';
import { AppError } from './app-error';

export type OrigemOfx = 'CONTA' | 'CARTAO';

export interface TransacaoOfx {
  idExterno: string;
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number; // sempre em módulo
  tipo: TipoTransacao;
}

export interface ArquivoOfx {
  origem: OrigemOfx;
  /** Banco + conta (ou cartão) do arquivo, para reconhecer a conta nas próximas importações. */
  identificadorExterno: string | null;
  transacoes: TransacaoOfx[];
}

const TAMANHO_MAX_DESCRICAO = 150;
const TAMANHO_MAX_FITID = 100;

// O Nubank usa UTF-8 no extrato (CHARSET:NONE) e windows-1252 na fatura (CHARSET:1252).
function decodificar(buffer: Buffer): string {
  const cabecalho = buffer.subarray(0, 512).toString('latin1');
  const charset = /^CHARSET:(\S+)/im.exec(cabecalho)?.[1];
  const codificacao = charset === '1252' ? 'windows-1252' : 'utf-8';
  return new TextDecoder(codificacao).decode(buffer);
}

const ENTIDADES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
};

function decodificarEntidades(texto: string): string {
  return texto.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entidade) => ENTIDADES[entidade]);
}

// Funciona com tag fechada (<MEMO>x</MEMO>) e com SGML puro (<MEMO>x até o fim da linha).
function campo(bloco: string, tag: string): string | undefined {
  const valor = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(bloco)?.[1];
  return valor === undefined ? undefined : decodificarEntidades(valor).trim();
}

function extrairBlocos(conteudo: string): string[] {
  return conteudo
    .split(/<STMTTRN>/i)
    .slice(1)
    .map((parte) => parte.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0]);
}

function dataValida(texto: string): string | null {
  const digitos = /^(\d{4})(\d{2})(\d{2})/.exec(texto);
  if (!digitos) return null;
  // Só AAAAMMDD: ignora hora e fuso (20260908000000[-3:BRT]) para não voltar um dia.
  const iso = `${digitos[1]}-${digitos[2]}-${digitos[3]}`;
  const data = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== iso ? null : iso;
}

function converterValor(texto: string): number | null {
  let normalizado = texto.replace(/\s/g, '');
  if (normalizado.includes(',')) {
    // "1.234,56" (vírgula decimal) ou "12,5"
    normalizado = normalizado.replace(/\./g, '').replace(',', '.');
  }
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalizado)) return null;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

const DOCUMENTO =
  /\s*-\s*(?:[•*]{3}\.\d{3}\.\d{3}-[•*]{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/;

// Remove CPF/CNPJ (mascarado ou não), banco, agência e conta, que vêm no MEMO do Pix.
export function higienizarDescricao(memo: string): string {
  let texto = memo.replace(/\s+/g, ' ').trim();

  const documento = DOCUMENTO.exec(texto);
  if (documento) {
    // Depois do documento só há banco, agência e conta.
    texto = texto.slice(0, documento.index);
  } else {
    texto = texto.replace(/\s*-\s*[^-]*\(\d{3,4}\)\s*Agência:.*$/i, '');
  }
  texto = texto.replace(/\s*Agência:\s*\S+(\s*Conta:\s*\S+)?/gi, '').trim();

  return texto.slice(0, TAMANHO_MAX_DESCRICAO);
}

function converterBloco(bloco: string, posicao: number): TransacaoOfx {
  const referencia = `transação ${posicao}`;
  const fitid = campo(bloco, 'FITID');
  if (!fitid || fitid.length > TAMANHO_MAX_FITID) {
    throw new AppError(422, `Arquivo OFX inválido: FITID ausente ou inválido na ${referencia}`);
  }

  const data = dataValida(campo(bloco, 'DTPOSTED') ?? '');
  if (!data) {
    throw new AppError(422, `Arquivo OFX inválido: data inválida na ${referencia}`);
  }

  const valor = converterValor(campo(bloco, 'TRNAMT') ?? '');
  if (valor === null || valor === 0) {
    throw new AppError(422, `Arquivo OFX inválido: valor inválido na ${referencia}`);
  }

  const descricao = higienizarDescricao(campo(bloco, 'MEMO') || campo(bloco, 'NAME') || '');

  return {
    idExterno: fitid,
    data,
    descricao: descricao || 'Sem descrição',
    valor: Math.round(Math.abs(valor) * 100) / 100,
    // O sinal manda: o TRNTYPE varia entre bancos (o pagamento de fatura é CREDIT).
    tipo: valor < 0 ? 'DESPESA' : 'RECEITA',
  };
}

// Só vale se o arquivo traz o número da conta; o prefixo separa conta de cartão com o mesmo número.
function identificarConta(conteudo: string, origem: OrigemOfx): string | null {
  const conta = campo(conteudo, 'ACCTID');
  if (!conta) return null;
  const banco = campo(conteudo, 'BANKID');
  const partes = [origem === 'CARTAO' ? 'cartao' : 'conta', banco, conta].filter(Boolean);
  return partes.join(':').slice(0, 100);
}

export function lerOfx(buffer: Buffer): ArquivoOfx {
  const conteudo = decodificar(buffer);
  if (!/<OFX>/i.test(conteudo)) {
    throw new AppError(400, 'Arquivo inválido: não é um arquivo OFX');
  }

  const origem: OrigemOfx = /<CCSTMTRS>/i.test(conteudo) ? 'CARTAO' : 'CONTA';
  const identificadorExterno = identificarConta(conteudo, origem);
  const transacoes = extrairBlocos(conteudo).map((bloco, indice) =>
    converterBloco(bloco, indice + 1),
  );

  if (transacoes.length === 0) {
    throw new AppError(422, 'O arquivo OFX não contém nenhuma transação');
  }
  return { origem, identificadorExterno, transacoes };
}

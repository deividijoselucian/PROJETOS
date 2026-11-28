'use strict';
/* Dados de cada sistema (data/<id>.json, com uma cópia por dia) e os arquivos
   (data/arquivos/<id>/, os apagados ficam 30 dias em data/lixeira/<id>/), mais a carga
   inicial de um sistema que ainda não tem dados. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ID_OK = /^[A-Za-z0-9_.~:@+-]{1,120}$/;
const ID_ARQ = /^arq-[0-9a-f]{32}$/;
const COPIAS_GUARDADAS = 30;
const DIAS_NA_LIXEIRA = 30;
const ESPERA_GRAVAR = 250; // junta as gravações que chegam juntas: grava no máximo 250 ms depois da primeira
const FUNDO_MAX = 64; // um registro do sistema tem 3 ou 4 níveis; mais de 64 é erro ou ataque
const TIPOS_ARQ = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'image/gif': 1, 'application/pdf': 1 };
const LIMITE_ARQ = 15 * 1024 * 1024;

/* Só a falta do arquivo dá o padrão. Arquivo cortado, ilegível ou com outro formato é erro: quem
   chama não pode seguir como se estivesse vazio, senão a próxima gravação apaga o que havia. */
function lerJSON(arq, padrao) {
  let txt, obj;
  try { txt = fs.readFileSync(arq, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return padrao;
    throw arquivoComDefeito(arq, e.message);
  }
  try { obj = JSON.parse(txt); } catch (e) { throw arquivoComDefeito(arq, e.message); }
  if (Array.isArray(padrao) && !Array.isArray(obj)) throw arquivoComDefeito(arq, 'devia ser uma lista');
  if (padrao && typeof padrao === 'object' && !Array.isArray(padrao) && (!obj || typeof obj !== 'object' || Array.isArray(obj))) throw arquivoComDefeito(arq, 'devia ser um objeto');
  return obj;
}
function arquivoComDefeito(arq, motivo) {
  const e = new Error(`o arquivo ${arq} está com defeito (${motivo})`);
  e.arquivoComDefeito = arq;
  return e;
}
/* Grava num temporário, força a ida ao disco (fsync) e só então troca pelo arquivo de verdade:
   numa queda de energia fica o arquivo velho inteiro ou o novo inteiro, nunca um pedaço. */
function gravarJSON(arq, obj) {
  const tmp = arq + '.tmp';
  const txt = JSON.stringify(obj);
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeFileSync(fd, txt); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, arq);
}
// conta os níveis sem recursão, para um registro com milhares de níveis não estourar a pilha
function fundoDemais(obj) {
  const pilha = [[obj, 1]];
  while (pilha.length) {
    const [v, n] = pilha.pop();
    if (n > FUNDO_MAX) return true;
    for (const k in v) { const x = v[k]; if (x && typeof x === 'object') pilha.push([x, n + 1]); }
  }
  return false;
}

function criarBanco(pastaDados, sistema) {
  const arq = path.join(pastaDados, sistema.id + '.json');
  const pastaCopias = path.join(pastaDados, 'copias');
  fs.mkdirSync(pastaCopias, { recursive: true, mode: 0o700 });
  const existia = fs.existsSync(arq);
  const dados = lerJSON(arq, {});
  sistema.cols.forEach(c => { if (!dados[c] || typeof dados[c] !== 'object' || Array.isArray(dados[c])) dados[c] = {}; });
  let timer = null;
  let esperando = []; // quem espera a próxima gravação para responder
  let desfazer = []; // como voltar a memória ao que está no disco, se a gravação falhar

  function copiaDoDia() {
    const prefixo = sistema.id + '-';
    const destino = path.join(pastaCopias, prefixo + new Date().toISOString().slice(0, 10) + '.json');
    if (fs.existsSync(destino)) return;
    fs.copyFileSync(arq, destino);
    const nomes = fs.readdirSync(pastaCopias).filter(n => n.startsWith(prefixo) && /^\d{4}-\d{2}-\d{2}\.json$/.test(n.slice(prefixo.length))).sort();
    nomes.slice(0, Math.max(0, nomes.length - COPIAS_GUARDADAS)).forEach(n => fs.unlinkSync(path.join(pastaCopias, n)));
  }
  function descartar() {
    for (let i = desfazer.length - 1; i >= 0; i--) desfazer[i]();
    desfazer = [];
  }
  function gravarAgora() {
    clearTimeout(timer);
    timer = null;
    const quem = esperando;
    esperando = [];
    try { gravarJSON(arq, dados); } catch (e) {
      descartar(); // não foi para o disco: a memória volta a ser o que está no disco
      quem.forEach(p => p.falha(e));
      throw e;
    }
    desfazer = [];
    quem.forEach(p => p.ok());
    try { copiaDoDia(); } catch (e) { console.error('Não consegui fazer a cópia do dia de ' + sistema.id + ':', e.message); }
  }
  // Promessa que se cumpre quando o que já mudou na memória estiver no disco (ou falha com o erro da gravação).
  function salvar() {
    return new Promise((ok, falha) => {
      esperando.push({ ok, falha });
      if (!timer) timer = setTimeout(() => { try { gravarAgora(); } catch (e) { console.error('Não consegui gravar ' + sistema.id + ':', e.message); } }, ESPERA_GRAVAR);
    });
  }
  function validar(op) {
    if (!op || !sistema.cols.includes(op.col)) return null;
    if (op.tipo === 'set') {
      const obj = op.obj;
      if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !ID_OK.test(String(obj.id || ''))) return null;
      if (fundoDemais(obj)) return null;
      try { JSON.stringify(obj); } catch (e) { return null; }
      return { tipo: 'set', col: op.col, obj };
    }
    if (op.tipo === 'del') return ID_OK.test(String(op.id || '')) ? { tipo: 'del', col: op.col, id: op.id } : null;
    return null;
  }
  function executar(v) {
    const col = dados[v.col], id = v.tipo === 'set' ? v.obj.id : v.id;
    const tinha = Object.prototype.hasOwnProperty.call(col, id), antes = col[id];
    desfazer.push(() => { if (tinha) col[id] = antes; else delete col[id]; });
    if (v.tipo === 'set') col[id] = v.obj;
    else delete col[id];
    return v;
  }
  return {
    existia,
    todos() { const out = {}; sistema.cols.forEach(c => { out[c] = Object.values(dados[c]); }); return out; },
    conferir: op => !!validar(op),
    aplicar(op) { const v = validar(op); return v ? executar(v) : null; },
    aplicarLote(ops) { const vs = ops.map(validar); if (vs.some(x => !x)) return null; return vs.map(executar); },
    salvar,
    gravarAgora,
    descartar,
    pendente: () => !!timer,
  };
}

function criarArquivos(pastaDados, sistemaId) {
  const pasta = path.join(pastaDados, 'arquivos', sistemaId);
  const lixeira = path.join(pastaDados, 'lixeira', sistemaId);
  fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
  fs.mkdirSync(lixeira, { recursive: true, mode: 0o700 });
  return {
    guardar(buffer, { nome, tipo }) {
      const id = 'arq-' + crypto.randomBytes(16).toString('hex');
      const limpo = String(nome || 'documento').replace(/[\\/\u0000-\u001f]/g, ' ').trim().slice(0, 150) || 'documento';
      fs.writeFileSync(path.join(pasta, id), buffer, { mode: 0o600 });
      fs.writeFileSync(path.join(pasta, id + '.json'), JSON.stringify({ nome: limpo, tipo }), { mode: 0o600 });
      return { id, nome: limpo, tipo, tamanho: buffer.length, onde: 'servidor' };
    },
    abrir(id) {
      if (!ID_ARQ.test(String(id))) return null;
      const caminho = path.join(pasta, id);
      if (!fs.existsSync(caminho)) return null;
      let meta = {};
      try { meta = lerJSON(caminho + '.json', {}); } catch (e) { /* sem nome nem tipo: sai como arquivo qualquer */ }
      return { caminho, tipo: meta.tipo || 'application/octet-stream', nome: meta.nome || id };
    },
    // Vai para a lixeira (some de vez depois de 30 dias): uma cópia antiga dos dados ainda acha o PDF lá.
    apagar(id) {
      if (!ID_ARQ.test(String(id))) return false;
      const agora = new Date();
      for (const f of [id, id + '.json']) {
        try {
          fs.renameSync(path.join(pasta, f), path.join(lixeira, f));
          fs.utimesSync(path.join(lixeira, f), agora, agora); // os 30 dias contam de hoje, não de quando foi enviado
        } catch (e) { if (e.code !== 'ENOENT') throw e; /* já não estava */ }
      }
      return true;
    },
    // Só para desfazer uma carga que não entrou: esses arquivos nunca chegaram a ser usados.
    apagarDeVez(id) {
      if (!ID_ARQ.test(String(id))) return;
      for (const f of [id, id + '.json']) { try { fs.unlinkSync(path.join(pasta, f)); } catch (e) { /* já não estava */ } }
    },
    limparLixeira() {
      const limite = Date.now() - DIAS_NA_LIXEIRA * 86400000;
      let nomes = [];
      try { nomes = fs.readdirSync(lixeira); } catch (e) { return; }
      for (const n of nomes) {
        try { if (fs.statSync(path.join(lixeira, n)).mtimeMs < limite) fs.unlinkSync(path.join(lixeira, n)); } catch (e) { console.error('Não consegui tirar ' + n + ' da lixeira:', e.message); }
      }
    },
  };
}

/* Carga inicial: uma cópia salva pelo sistema (.json com "dados" e, se tiver, "arquivos" em base64).
   Os arquivos embutidos vão para o servidor e o registro passa a apontar para eles.
   Entra tudo ou nada: primeiro confere e prepara tudo; se algo falhar depois, desfaz o que já fez. */
function importarCarga(arqCarga, sistema, banco, arquivos) {
  const carga = lerJSON(arqCarga, null);
  if (!carga || !carga.dados || typeof carga.dados !== 'object') throw new Error('o arquivo não tem os dados do sistema');
  const emb = carga.arquivos && typeof carga.arquivos === 'object' ? carga.arquivos : {};
  const ops = [], novos = [];
  for (const col of sistema.cols) {
    const lista = Array.isArray(carga.dados[col]) ? carga.dados[col] : [];
    lista.forEach((x, i) => {
      const obj = Object.assign({}, x);
      const qual = `${col} nº ${i + 1}${obj.id ? ' (' + obj.id + ')' : ''}`;
      const a = obj.arquivo;
      if (a && a.id && a.onde !== 'nuvem') {
        const e = emb[a.id];
        const tipo = a.tipo || (e && e.tipo);
        if (arquivos && e && e.dados && TIPOS_ARQ[tipo]) {
          if (typeof e.dados !== 'string') throw new Error(`o arquivo ${a.id}, de ${qual}, está com defeito`);
          novos.push({ obj, buffer: Buffer.from(e.dados, 'base64'), nome: a.nome || e.nome, tipo });
        } else obj.arquivo = null;
      }
      const op = { tipo: 'set', col, obj };
      if (!banco.conferir(op)) throw new Error(`o registro ${qual} está com defeito`);
      ops.push(op);
    });
  }
  const gravados = [];
  try {
    for (const n of novos) { n.obj.arquivo = arquivos.guardar(n.buffer, n); gravados.push(n.obj.arquivo.id); }
    if (!banco.aplicarLote(ops)) throw new Error('algum registro está com defeito');
    banco.gravarAgora();
  } catch (e) {
    banco.descartar();
    gravados.forEach(id => arquivos.apagarDeVez(id));
    throw e;
  }
  return { registros: ops.length, arquivos: gravados.length };
}

module.exports = { criarBanco, criarArquivos, importarCarga, lerJSON, gravarJSON, TIPOS_ARQ, LIMITE_ARQ };

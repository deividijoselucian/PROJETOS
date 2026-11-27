'use strict';
/* Dados de cada sistema (data/<id>.json, com uma cópia por dia) e os arquivos
   (data/arquivos/<id>/), mais a carga inicial de um sistema que ainda não tem dados. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ID_OK = /^[A-Za-z0-9_.~:@+-]{1,120}$/;
const ID_ARQ = /^arq-[0-9a-f]{32}$/;
const COPIAS_GUARDADAS = 30;
const TIPOS_ARQ = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'image/gif': 1, 'application/pdf': 1 };
const LIMITE_ARQ = 15 * 1024 * 1024;

function lerJSON(arq, padrao) {
  try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { return padrao; }
}
function gravarJSON(arq, obj) {
  const tmp = arq + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  fs.renameSync(tmp, arq);
}

function criarBanco(pastaDados, sistema) {
  const arq = path.join(pastaDados, sistema.id + '.json');
  const pastaCopias = path.join(pastaDados, 'copias');
  fs.mkdirSync(pastaCopias, { recursive: true, mode: 0o700 });
  const existia = fs.existsSync(arq);
  const dados = lerJSON(arq, {});
  sistema.cols.forEach(c => { if (!dados[c] || typeof dados[c] !== 'object' || Array.isArray(dados[c])) dados[c] = {}; });
  let timer = null;

  function copiaDoDia() {
    const prefixo = sistema.id + '-';
    const destino = path.join(pastaCopias, prefixo + new Date().toISOString().slice(0, 10) + '.json');
    if (fs.existsSync(destino)) return;
    fs.copyFileSync(arq, destino);
    const nomes = fs.readdirSync(pastaCopias).filter(n => n.startsWith(prefixo) && /^\d{4}-\d{2}-\d{2}\.json$/.test(n.slice(prefixo.length))).sort();
    nomes.slice(0, Math.max(0, nomes.length - COPIAS_GUARDADAS)).forEach(n => fs.unlinkSync(path.join(pastaCopias, n)));
  }
  function gravarAgora() {
    clearTimeout(timer);
    timer = null;
    gravarJSON(arq, dados);
    copiaDoDia();
  }
  function salvar() {
    clearTimeout(timer);
    timer = setTimeout(() => { try { gravarAgora(); } catch (e) { console.error('Não consegui gravar ' + sistema.id + ':', e.message); } }, 250);
  }
  function validar(op) {
    if (!op || !sistema.cols.includes(op.col)) return null;
    if (op.tipo === 'set') {
      const obj = op.obj;
      if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !ID_OK.test(String(obj.id || ''))) return null;
      return { tipo: 'set', col: op.col, obj };
    }
    if (op.tipo === 'del') return ID_OK.test(String(op.id || '')) ? { tipo: 'del', col: op.col, id: op.id } : null;
    return null;
  }
  function executar(v) {
    if (v.tipo === 'set') dados[v.col][v.obj.id] = v.obj;
    else delete dados[v.col][v.id];
    return v;
  }
  return {
    existia,
    todos() { const out = {}; sistema.cols.forEach(c => { out[c] = Object.values(dados[c]); }); return out; },
    aplicar(op) { const v = validar(op); return v ? executar(v) : null; },
    aplicarLote(ops) { const vs = ops.map(validar); if (vs.some(x => !x)) return null; return vs.map(executar); },
    salvar,
    gravarAgora,
    pendente: () => !!timer,
  };
}

function criarArquivos(pastaDados, sistemaId) {
  const pasta = path.join(pastaDados, 'arquivos', sistemaId);
  fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
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
      const meta = lerJSON(caminho + '.json', {});
      return { caminho, tipo: meta.tipo || 'application/octet-stream', nome: meta.nome || id };
    },
    apagar(id) {
      if (!ID_ARQ.test(String(id))) return false;
      for (const f of [id, id + '.json']) { try { fs.unlinkSync(path.join(pasta, f)); } catch (e) { /* já não estava */ } }
      return true;
    },
  };
}

/* Carga inicial: uma cópia salva pelo sistema (.json com "dados" e, se tiver, "arquivos" em base64).
   Os arquivos embutidos vão para o servidor e o registro passa a apontar para eles. */
function importarCarga(arqCarga, sistema, banco, arquivos) {
  const carga = lerJSON(arqCarga, null);
  if (!carga || typeof carga.dados !== 'object') throw new Error('carga inválida: ' + arqCarga);
  const emb = carga.arquivos && typeof carga.arquivos === 'object' ? carga.arquivos : {};
  let registros = 0, arquivosGravados = 0;
  for (const col of sistema.cols) {
    for (const x of (Array.isArray(carga.dados[col]) ? carga.dados[col] : [])) {
      if (!x || !ID_OK.test(String(x.id || ''))) continue;
      const obj = Object.assign({}, x);
      const a = obj.arquivo;
      if (a && a.id && a.onde !== 'nuvem') {
        const e = emb[a.id];
        const tipo = a.tipo || (e && e.tipo);
        if (arquivos && e && e.dados && TIPOS_ARQ[tipo]) {
          obj.arquivo = arquivos.guardar(Buffer.from(e.dados, 'base64'), { nome: a.nome || e.nome, tipo });
          arquivosGravados++;
        } else obj.arquivo = null;
      }
      if (banco.aplicar({ tipo: 'set', col, obj })) registros++;
    }
  }
  banco.gravarAgora();
  return { registros, arquivos: arquivosGravados };
}

module.exports = { criarBanco, criarArquivos, importarCarga, lerJSON, gravarJSON, TIPOS_ARQ, LIMITE_ARQ };

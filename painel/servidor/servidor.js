'use strict';
/* ====================================================================
   Painel Deconto no servidor (fase 1).
   Login (usuário admin), tela inicial com os sistemas e cada sistema no seu
   endereço (/frota/, /operacao/), com os dados de cada um separados, avisos ao
   vivo (Server-Sent Events) e os arquivos do DECONTO guardados no disco.
   Não usa nenhum pacote: só o Node.js 18 ou mais novo.
   ==================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SISTEMAS = require('./sistemas');
const { criarBanco, criarArquivos, importarCarga, lerJSON, gravarJSON, TIPOS_ARQ, LIMITE_ARQ } = require('./banco');
const { paginaEntrar, paginaInicial, paginaSistema } = require('./paginas');

const PASTA = __dirname;
lerEnv(path.join(PASTA, '.env'));
const PORTA = Number(process.env.PORTA || 3200);
const HOST = process.env.HOST || '127.0.0.1';
const DADOS = process.env.PASTA_DADOS || path.join(PASTA, 'data');
const PUBLICO = process.env.PASTA_PUBLICO || path.join(PASTA, 'publico');
const CARGA = process.env.PASTA_CARGA || path.join(PASTA, 'carga');
const DIAS_SESSAO = 30;

function lerEnv(arq) {
  let txt = '';
  try { txt = fs.readFileSync(arq, 'utf8'); } catch (e) { return; }
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}
fs.mkdirSync(DADOS, { recursive: true, mode: 0o700 });

/* ---------- sistemas: dados, arquivos e carga inicial ---------- */
const prontos = SISTEMAS.filter(s => s.pronto);
const bancos = {}, arquivosDe = {}, ouvintes = {};
for (const s of prontos) {
  bancos[s.id] = criarBanco(DADOS, s);
  if (s.arquivos) arquivosDe[s.id] = criarArquivos(DADOS, s.id);
  ouvintes[s.id] = new Set();
  const arqCarga = path.join(CARGA, s.id + '.json');
  if (fs.existsSync(arqCarga)) {
    if (bancos[s.id].existia) console.log(`Carga de ${s.nome} ignorada: o sistema já tem dados. (${arqCarga})`);
    else {
      try {
        const r = importarCarga(arqCarga, s, bancos[s.id], arquivosDe[s.id]);
        const guardada = path.join(DADOS, `carga-importada-${s.id}-${new Date().toISOString().slice(0, 10)}.json`);
        fs.copyFileSync(arqCarga, guardada);
        fs.chmodSync(guardada, 0o600);
        fs.unlinkSync(arqCarga);
        console.log(`Carga de ${s.nome}: ${r.registros} registros e ${r.arquivos} arquivos.`);
      } catch (e) { console.error(`Carga de ${s.nome} não entrou: ${e.message}`); }
    }
  }
}
const sistemaPorId = id => prontos.find(s => s.id === id);

/* ---------- usuário e entradas ---------- */
const ARQ_USU = path.join(DADOS, 'usuarios.json');
const ARQ_SES = path.join(DADOS, 'sessoes.json');
let usuarios = lerJSON(ARQ_USU, []);
let sessoes = lerJSON(ARQ_SES, {});
const hashSenha = (senha, sal) => crypto.scryptSync(String(senha), sal, 32).toString('hex');
function novaSenha(u, senha) { u.sal = crypto.randomBytes(16).toString('hex'); u.hash = hashSenha(senha, u.sal); }
function senhaConfere(u, senha) {
  const a = Buffer.from(hashSenha(senha, u.sal), 'hex'), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
if (!usuarios.length) {
  const senha = process.env.PAINEL_SENHA || crypto.randomBytes(9).toString('base64url');
  const admin = { usuario: 'admin', nome: 'Administrador', admin: true, criadoEm: new Date().toISOString() };
  novaSenha(admin, senha);
  usuarios.push(admin);
  gravarJSON(ARQ_USU, usuarios);
  if (!process.env.PAINEL_SENHA) console.log('Usuário admin criado. Senha: ' + senha);
}
const chaveSessao = tok => crypto.createHash('sha256').update(tok).digest('hex');
function cookies(req) {
  const out = {};
  for (const parte of String(req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0) out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return out;
}
function sessaoDe(req) {
  const tok = cookies(req).painel;
  if (!tok) return null;
  const s = sessoes[chaveSessao(tok)];
  if (!s || s.ate < Date.now()) return null;
  const u = usuarios.find(x => x.usuario === s.usuario);
  return u ? { tok, u } : null;
}
const viaHttps = req => String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
const cookieSessao = (req, tok, maxAge) => `painel=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${viaHttps(req) ? '; Secure' : ''}`;
// atrás do nginx vale o endereço que o próprio nginx mandou; o que o navegador escreve nesses cabeçalhos não conta
function ipDe(req) {
  const direto = req.socket.remoteAddress || '';
  if (!/^(::1|127\.|::ffff:127\.)/.test(direto)) return direto;
  const real = String(req.headers['x-real-ip'] || '').trim();
  if (real) return real;
  const lista = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  return lista.length ? lista[lista.length - 1] : direto;
}
const tentativas = new Map(); // no máximo 8 senhas erradas a cada 15 minutos por endereço

/* ---------- avisos ao vivo ---------- */
function avisar(sisId, msg) {
  const linha = 'data: ' + JSON.stringify(msg) + '\n\n';
  for (const res of ouvintes[sisId]) { try { res.write(linha); } catch (e) { ouvintes[sisId].delete(res); } }
}
setInterval(() => { for (const id in ouvintes) for (const res of ouvintes[id]) { try { res.write(': ping\n\n'); } catch (e) { ouvintes[id].delete(res); } } }, 25000).unref();

/* ---------- respostas ---------- */
const SEGURANCA = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' };
function enviar(res, status, corpo, tipo, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': tipo, 'Cache-Control': 'no-store' }, SEGURANCA, extra || {}));
  res.end(corpo);
}
const json = (res, status, obj, extra) => enviar(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', extra);
const redirecionar = (res, para, status = 302) => { res.writeHead(status, Object.assign({ Location: para, 'Cache-Control': 'no-store' }, SEGURANCA)); res.end(); };
const html = (res, status, corpo) => enviar(res, status, corpo, 'text/html; charset=utf-8');
function lerBruto(req, limite) {
  return new Promise((ok, falha) => {
    let tam = 0, parou = false;
    const partes = [];
    req.on('data', c => { if (parou) return; tam += c.length; if (tam > limite) { parou = true; falha({ status: 413 }); } else partes.push(c); });
    req.on('end', () => { if (!parou) ok(Buffer.concat(partes)); });
    req.on('error', () => { if (!parou) falha({ status: 400 }); });
  });
}
async function lerJSONCorpo(req, limite) {
  const buf = await lerBruto(req, limite);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch (e) { throw { status: 400 }; }
}
const PAGINA_404 = '<!doctype html><meta charset="utf-8"><title>Não encontrado</title><p style="font-family:system-ui;padding:24px">Não encontrado. <a href="/">Voltar ao Painel Deconto</a></p>';

/* ---------- rotas ---------- */
async function rotear(req, res) {
  const url = new URL(req.url, 'http://x');
  const rota = url.pathname;
  const metodo = req.method;
  const ehJSON = String(req.headers['content-type'] || '').startsWith('application/json');

  if (rota === '/entrar' && metodo === 'GET') return html(res, 200, paginaEntrar());
  if (rota === '/api/entrar' && metodo === 'POST') {
    if (!ehJSON) return json(res, 415, { erro: 'Formato inválido.' });
    const ip = ipDe(req), agora = Date.now();
    const t = tentativas.get(ip);
    if (t && t.ate > agora && t.n >= 8) return json(res, 429, { erro: 'Muitas tentativas erradas. Espere 15 minutos.' });
    const corpo = await lerJSONCorpo(req, 10000);
    const u = usuarios.find(x => x.usuario === String(corpo.usuario || '').trim().toLowerCase());
    if (!u || !senhaConfere(u, corpo.senha || '')) {
      tentativas.set(ip, { n: t && t.ate > agora ? t.n + 1 : 1, ate: agora + 15 * 60000 });
      return json(res, 401, { erro: 'Usuário ou senha errados.' });
    }
    tentativas.delete(ip);
    const tok = crypto.randomBytes(32).toString('base64url');
    for (const [k, x] of Object.entries(sessoes)) if (!x || x.ate < agora) delete sessoes[k];
    sessoes[chaveSessao(tok)] = { usuario: u.usuario, ate: agora + DIAS_SESSAO * 86400000 };
    gravarJSON(ARQ_SES, sessoes);
    return json(res, 200, { ok: true, nome: u.nome }, { 'Set-Cookie': cookieSessao(req, tok, DIAS_SESSAO * 86400) });
  }

  const s = sessaoDe(req);
  const partes = rota.split('/').filter(Boolean);
  const ehApi = rota.startsWith('/api/') || partes[1] === 'api';
  if (!s) {
    if (ehApi) return json(res, 401, { erro: 'Entre de novo.' });
    return redirecionar(res, '/entrar');
  }
  const u = s.u;
  // gravações só em JSON ou arquivo: um formulário de outro site não consegue mandar nenhum dos dois
  if (ehApi && (metodo === 'POST' || metodo === 'PUT') && !ehJSON && !(partes[2] === 'arquivos' && metodo === 'POST')) return json(res, 415, { erro: 'Formato inválido.' });

  // ----- painel -----
  if (rota === '/' && metodo === 'GET') return html(res, 200, paginaInicial(u, SISTEMAS));
  if (rota === '/api/sair' && metodo === 'POST') {
    delete sessoes[chaveSessao(s.tok)];
    gravarJSON(ARQ_SES, sessoes);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookieSessao(req, '', 0) });
  }
  if (rota === '/api/eu' && metodo === 'GET') return json(res, 200, { usuario: u.usuario, nome: u.nome, admin: !!u.admin, sistemas: prontos.map(x => x.id) });
  if (rota === '/api/minha-senha' && metodo === 'POST') {
    const corpo = await lerJSONCorpo(req, 10000);
    if (!senhaConfere(u, corpo.atual || '')) return json(res, 400, { erro: 'A senha atual não confere.' });
    if (String(corpo.nova || '').length < 6) return json(res, 400, { erro: 'A senha nova precisa ter pelo menos 6 letras ou números.' });
    novaSenha(u, corpo.nova);
    gravarJSON(ARQ_USU, usuarios);
    const esta = chaveSessao(s.tok);
    for (const [k, x] of Object.entries(sessoes)) if (x.usuario === u.usuario && k !== esta) delete sessoes[k];
    gravarJSON(ARQ_SES, sessoes);
    return json(res, 200, { ok: true });
  }

  // ----- cada sistema -----
  const sis = sistemaPorId(partes[0]);
  if (!sis) return ehApi ? json(res, 404, { erro: 'Não encontrado.' }) : html(res, 404, PAGINA_404);
  if (partes.length === 1 && !rota.endsWith('/')) return redirecionar(res, '/' + sis.id + '/', 301);
  if (partes.length === 1 && metodo === 'GET') {
    return html(res, 200, paginaSistema(fs.readFileSync(path.join(PUBLICO, sis.pagina), 'utf8'), u, sis));
  }
  if (partes.length === 2 && metodo === 'GET' && sis.extras.includes(partes[1])) {
    return enviar(res, 200, fs.readFileSync(path.join(PUBLICO, partes[1])), 'application/json; charset=utf-8', { 'Cache-Control': 'private, max-age=86400' });
  }
  if (partes[1] !== 'api') return html(res, 404, PAGINA_404);
  const banco = bancos[sis.id];
  const resto = partes.slice(2);

  if (resto[0] === 'dados' && resto.length === 1 && metodo === 'GET') return json(res, 200, banco.todos());
  if (resto[0] === 'dados' && resto.length === 3) {
    const col = resto[1], id = decodeURIComponent(resto[2]);
    if (metodo === 'PUT') {
      const obj = await lerJSONCorpo(req, 2e6);
      const op = banco.aplicar({ tipo: 'set', col, obj: Object.assign({}, obj, { id }) });
      if (!op) return json(res, 400, { erro: 'Registro inválido.' });
      banco.salvar(); avisar(sis.id, op);
      return json(res, 200, { ok: true });
    }
    if (metodo === 'DELETE') {
      const op = banco.aplicar({ tipo: 'del', col, id });
      if (!op) return json(res, 400, { erro: 'Registro inválido.' });
      banco.salvar(); avisar(sis.id, op);
      return json(res, 200, { ok: true });
    }
  }
  if (resto[0] === 'lote' && resto.length === 1 && metodo === 'POST') {
    const corpo = await lerJSONCorpo(req, 20e6);
    const ops = Array.isArray(corpo.ops) ? corpo.ops : [];
    if (!ops.length || ops.length > 20000) return json(res, 400, { erro: 'Lote inválido.' });
    const feitas = banco.aplicarLote(ops);
    if (!feitas) return json(res, 400, { erro: 'Algum registro do lote é inválido. Nada foi gravado.' });
    banco.salvar(); avisar(sis.id, { tipo: 'lote', ops: feitas });
    return json(res, 200, { ok: true, n: feitas.length });
  }
  if (resto[0] === 'eventos' && resto.length === 1 && metodo === 'GET') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }, SEGURANCA));
    res.write('retry: 3000\n\n');
    ouvintes[sis.id].add(res);
    req.on('close', () => ouvintes[sis.id].delete(res));
    return;
  }
  if (resto[0] === 'arquivos') {
    const arquivos = arquivosDe[sis.id];
    if (!arquivos) return json(res, 404, { erro: 'Este sistema não guarda arquivos.' });
    if (resto.length === 1 && metodo === 'POST') {
      const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!TIPOS_ARQ[tipo]) { req.resume(); return json(res, 415, { erro: 'Esse tipo de arquivo não dá. Use foto (JPG ou PNG) ou PDF.' }); }
      if (Number(req.headers['content-length'] || 0) > LIMITE_ARQ) { req.resume(); return json(res, 413, { erro: 'O arquivo passa de 15 MB.' }); }
      let nome = 'documento';
      try { nome = decodeURIComponent(String(req.headers['x-nome-arquivo'] || 'documento')); } catch (e) { /* nome estranho: fica "documento" */ }
      const buf = await lerBruto(req, LIMITE_ARQ).catch(e => { if (e && e.status === 413) return null; throw e; });
      if (!buf) return json(res, 413, { erro: 'O arquivo passa de 15 MB.' });
      if (!buf.length) return json(res, 400, { erro: 'Arquivo vazio.' });
      return json(res, 200, arquivos.guardar(buf, { nome, tipo }));
    }
    if (resto.length === 2 && metodo === 'GET') {
      const a = arquivos.abrir(resto[1]);
      if (!a) return json(res, 404, { erro: 'Arquivo não encontrado.' });
      res.writeHead(200, Object.assign({ 'Content-Type': a.tipo, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`, 'Cache-Control': 'private, max-age=86400' }, SEGURANCA));
      return fs.createReadStream(a.caminho).pipe(res);
    }
    if (resto.length === 2 && metodo === 'DELETE') {
      if (!arquivos.abrir(resto[1])) return json(res, 404, { erro: 'Arquivo não encontrado.' });
      arquivos.apagar(resto[1]);
      return json(res, 200, { ok: true });
    }
  }
  return json(res, 404, { erro: 'Não encontrado.' });
}

const servidor = http.createServer((req, res) => {
  rotear(req, res).catch(e => {
    const status = e && e.status ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) json(res, status, { erro: status === 413 ? 'Grande demais.' : status === 400 ? 'Pedido inválido.' : 'Erro no servidor.' });
  });
});
servidor.listen(PORTA, HOST, () => console.log(`Painel Deconto em http://${HOST}:${PORTA}`));
function desligar() {
  for (const id in bancos) if (bancos[id].pendente()) { try { bancos[id].gravarAgora(); } catch (e) { console.error(e.message); } }
  process.exit(0);
}
process.on('SIGTERM', desligar);
process.on('SIGINT', desligar);

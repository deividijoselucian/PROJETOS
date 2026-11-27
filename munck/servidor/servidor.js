'use strict';
/* ====================================================================
   Controle Munck no servidor.
   Entrega o sistema (publico/munck.html) só para quem entrou com usuário
   e senha, guarda os dados em data/munck.json (com uma cópia por dia em
   data/copias) e avisa os outros navegadores abertos quando alguém muda
   alguma coisa (Server-Sent Events).
   Não usa nenhum pacote: só o Node.js 18 ou mais novo.
   ==================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PASTA = __dirname;
lerEnv(path.join(PASTA, '.env'));
const PORTA = Number(process.env.PORTA || 3200);
const HOST = process.env.HOST || '127.0.0.1';
const DADOS = process.env.PASTA_DADOS || path.join(PASTA, 'data');
const PUBLICO = path.join(PASTA, 'publico');
const COLS = ['caminhoes', 'motoristas', 'obras', 'agenda', 'km', 'manutencoes', 'config'];
const ID_OK = /^[A-Za-z0-9_.~:@+-]{1,120}$/;
const USUARIO_OK = /^[a-z0-9._-]{2,30}$/;
const DIAS_SESSAO = 30;
const COPIAS_GUARDADAS = 30;

function lerEnv(arq) {
  let txt = '';
  try { txt = fs.readFileSync(arq, 'utf8'); } catch (e) { return; }
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}
function lerJSON(arq, padrao) {
  try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { return padrao; }
}
function gravarJSON(arq, obj) {
  const tmp = arq + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  fs.renameSync(tmp, arq);
}

fs.mkdirSync(path.join(DADOS, 'copias'), { recursive: true, mode: 0o700 });

/* ---------- dados ---------- */
const ARQ_DADOS = path.join(DADOS, 'munck.json');
const banco = lerJSON(ARQ_DADOS, {});
COLS.forEach(c => { if (!banco[c] || typeof banco[c] !== 'object' || Array.isArray(banco[c])) banco[c] = {}; });
let timerGravar = null;
function salvarDados() {
  clearTimeout(timerGravar);
  timerGravar = setTimeout(gravarDadosAgora, 250);
}
function gravarDadosAgora() {
  clearTimeout(timerGravar);
  timerGravar = null;
  try {
    gravarJSON(ARQ_DADOS, banco);
    copiaDoDia();
  } catch (e) { console.error('Não consegui gravar os dados:', e.message); }
}
function copiaDoDia() {
  const pasta = path.join(DADOS, 'copias');
  const destino = path.join(pasta, 'munck-' + new Date().toISOString().slice(0, 10) + '.json');
  if (fs.existsSync(destino)) return;
  fs.copyFileSync(ARQ_DADOS, destino);
  const antigas = fs.readdirSync(pasta).filter(n => /^munck-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
  antigas.slice(0, Math.max(0, antigas.length - COPIAS_GUARDADAS)).forEach(n => fs.unlinkSync(path.join(pasta, n)));
}
function aplicar(op) {
  if (!op || !COLS.includes(op.col)) return null;
  if (op.tipo === 'set') {
    const obj = op.obj;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !ID_OK.test(String(obj.id || ''))) return null;
    banco[op.col][obj.id] = obj;
    return { tipo: 'set', col: op.col, obj };
  }
  if (op.tipo === 'del') {
    if (!ID_OK.test(String(op.id || ''))) return null;
    delete banco[op.col][op.id];
    return { tipo: 'del', col: op.col, id: op.id };
  }
  return null;
}

/* ---------- usuários e entradas ---------- */
const ARQ_USU = path.join(DADOS, 'usuarios.json');
const ARQ_SES = path.join(DADOS, 'sessoes.json');
let usuarios = lerJSON(ARQ_USU, []);
let sessoes = lerJSON(ARQ_SES, {});
const hashSenha = (senha, sal) => crypto.scryptSync(String(senha), sal, 32).toString('hex');
function novoUsuario(usuario, nome, senha, admin) {
  const sal = crypto.randomBytes(16).toString('hex');
  return { usuario, nome: nome || '', sal, hash: hashSenha(senha, sal), admin: !!admin, criadoEm: new Date().toISOString() };
}
function senhaConfere(u, senha) {
  const a = Buffer.from(hashSenha(senha, u.sal), 'hex'), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
if (!usuarios.length) {
  const senha = process.env.PAINEL_SENHA || crypto.randomBytes(9).toString('base64url');
  usuarios.push(novoUsuario('admin', 'Administrador', senha, true));
  gravarJSON(ARQ_USU, usuarios);
  if (!process.env.PAINEL_SENHA) console.log('Usuário admin criado. Senha: ' + senha);
}
const listaUsuarios = () => usuarios.map(u => ({ usuario: u.usuario, nome: u.nome, admin: u.admin }));
const chaveSessao = tok => crypto.createHash('sha256').update(tok).digest('hex');
function limparSessoes() {
  const agora = Date.now();
  for (const [k, s] of Object.entries(sessoes)) if (!s || s.ate < agora || !usuarios.some(u => u.usuario === s.usuario)) delete sessoes[k];
}
function cookies(req) {
  const out = {};
  for (const parte of String(req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0) out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return out;
}
function sessaoDe(req) {
  const tok = cookies(req).munck;
  if (!tok) return null;
  const s = sessoes[chaveSessao(tok)];
  if (!s || s.ate < Date.now()) return null;
  const u = usuarios.find(x => x.usuario === s.usuario);
  return u ? { tok, u } : null;
}
const https = req => String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
function cookieSessao(req, tok, maxAge) {
  return `munck=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https(req) ? '; Secure' : ''}`;
}
// tentativas erradas de senha por endereço: no máximo 8 a cada 15 minutos
const tentativas = new Map();
// atrás do nginx, vale o endereço que o próprio nginx mandou (X-Real-IP, ou o último do
// X-Forwarded-For); o que o navegador escreve nesses cabeçalhos não conta
function ipDe(req) {
  const direto = req.socket.remoteAddress || '';
  if (!/^(::1|127\.|::ffff:127\.)/.test(direto)) return direto;
  const real = String(req.headers['x-real-ip'] || '').trim();
  if (real) return real;
  const lista = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  return lista.length ? lista[lista.length - 1] : direto;
}

/* ---------- avisos ao vivo ---------- */
const ouvintes = new Set();
function avisar(msg) {
  const linha = 'data: ' + JSON.stringify(msg) + '\n\n';
  for (const res of ouvintes) { try { res.write(linha); } catch (e) { ouvintes.delete(res); } }
}
setInterval(() => { for (const res of ouvintes) { try { res.write(': ping\n\n'); } catch (e) { ouvintes.delete(res); } } }, 25000).unref();

/* ---------- páginas ---------- */
const RESET = '*,*::before,*::after{box-sizing:border-box}body{margin:0}img{max-width:100%}[hidden]{display:none!important}';
function paginaSistema(u) {
  const pagina = fs.readFileSync(path.join(PUBLICO, 'munck.html'), 'utf8');
  // título, metas e fontes vão para o <head>; o resto vai para o <body>
  const cab = [];
  const corpo = pagina.replace(/<title>[\s\S]*?<\/title>\n?|<meta name="claude:[^>]*>\n?|<link rel="(?:preconnect|stylesheet)"[^>]*>\n?/g, m => { if (!m.includes('claude:')) cab.push(m.trim()); return ''; });
  const quem = JSON.stringify({ usuario: u.usuario, nome: u.nome, admin: u.admin }).replace(/</g, '\\u003c');
  return '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    + cab.join('\n') + `\n<style>${RESET}</style>\n<script>window.MUNCK_SERVIDOR = ${quem};</script>\n</head>\n<body>\n` + corpo + '\n</body>\n</html>\n';
}
const PAGINA_ENTRAR = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Controle Munck · Entrar</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@700&display=swap">
<style>
:root { --bg: #F1F0F6; --surface: #FFFFFF; --ink: #17151F; --muted: #575366; --line: #D8D5E3; --accent: #5B3FD6; --accent-hover: #4A30B8; --bad: #BA2E29; --barra: #1B1824; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #100F15; --surface: #18161F; --ink: #ECEAF2; --muted: #A39EB3; --line: #2F2B3B; --accent: #B3A4FF; --accent-hover: #CCC2FF; --bad: #FF8F87; --barra: #0B0A10; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--ink); font: 16px/1.5 Barlow, system-ui, "Segoe UI", sans-serif; padding: 16px; }
main { width: 100%; max-width: 380px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 26px 22px; display: flex; flex-direction: column; gap: 16px; }
.marca { display: flex; align-items: center; gap: 10px; }
.marca strong { font: 700 1.6rem/1.1 "Barlow Condensed", "Arial Narrow", sans-serif; }
.marca span { display: block; font-size: 0.85rem; color: var(--muted); }
label { display: flex; flex-direction: column; gap: 5px; font-weight: 600; font-size: 0.92rem; }
input { font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; min-height: 46px; }
input:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
button { font: 700 1rem Barlow, system-ui, sans-serif; color: #FFFFFF; background: var(--accent); border: 0; border-radius: 9px; min-height: 46px; cursor: pointer; }
@media (prefers-color-scheme: dark) { button { color: #100F15; } }
button:hover { background: var(--accent-hover); }
button:disabled { opacity: 0.6; cursor: wait; }
#msg { min-height: 1.4em; color: var(--bad); font-weight: 600; font-size: 0.92rem; }
</style>
</head>
<body>
<main>
  <div class="marca">
    <svg width="40" height="40" viewBox="0 0 34 34" aria-hidden="true"><rect x="0.5" y="0.5" width="33" height="33" rx="7" fill="#5B3FD6"/><rect x="4" y="18" width="16" height="5" rx="1" fill="#FFFFFF"/><path d="M21 14.5h4.4l3.6 4.2v4.3h-8z" fill="#FFFFFF"/><path d="M8 18V14.5L24.5 7" stroke="#F2C230" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M24.5 7v5" stroke="#FFFFFF" stroke-width="1.3"/><circle cx="9.5" cy="25.5" r="2.5" fill="#F2C230"/><circle cx="24.5" cy="25.5" r="2.5" fill="#F2C230"/></svg>
    <div><strong>Controle Munck</strong><span>Entre com o seu usuário e senha</span></div>
  </div>
  <form id="f" novalidate>
    <div style="display:flex;flex-direction:column;gap:12px">
      <label>Usuário <input id="usuario" autocomplete="username" autocapitalize="none" autofocus></label>
      <label>Senha <input id="senha" type="password" autocomplete="current-password"></label>
      <button id="ir" type="submit">Entrar</button>
      <p id="msg" role="status"></p>
    </div>
  </form>
</main>
<script>
document.getElementById('f').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = document.getElementById('msg'), ir = document.getElementById('ir');
  msg.textContent = ''; ir.disabled = true;
  try {
    const r = await fetch('api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ usuario: document.getElementById('usuario').value, senha: document.getElementById('senha').value }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { location.href = './'; return; }
    msg.textContent = d.erro || 'Não consegui entrar. Tente de novo.';
  } catch (er) { msg.textContent = 'O servidor não respondeu. Confira a internet.'; }
  ir.disabled = false;
});
</script>
</body>
</html>
`;

/* ---------- respostas ---------- */
const SEGURANCA = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' };
function enviar(res, status, corpo, tipo, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': tipo, 'Cache-Control': 'no-store' }, SEGURANCA, extra || {}));
  res.end(corpo);
}
const json = (res, status, obj, extra) => enviar(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', extra);
function lerCorpo(req, limite) {
  return new Promise((ok, falha) => {
    let tam = 0;
    const partes = [];
    req.on('data', c => { tam += c.length; if (tam > limite) { falha({ status: 413 }); req.destroy(); } else partes.push(c); });
    req.on('end', () => {
      const txt = Buffer.concat(partes).toString('utf8');
      if (!txt) return ok({});
      try { ok(JSON.parse(txt)); } catch (e) { falha({ status: 400 }); }
    });
    req.on('error', () => falha({ status: 400 }));
  });
}

/* ---------- rotas ---------- */
async function rotear(req, res) {
  const url = new URL(req.url, 'http://x');
  const rota = url.pathname;
  const metodo = req.method;
  const ehJSON = String(req.headers['content-type'] || '').startsWith('application/json');

  if (rota === '/entrar' && metodo === 'GET') return enviar(res, 200, PAGINA_ENTRAR, 'text/html; charset=utf-8');
  if (rota === '/api/entrar' && metodo === 'POST') {
    if (!ehJSON) return json(res, 415, { erro: 'Formato inválido.' });
    const ip = ipDe(req), agora = Date.now();
    const t = tentativas.get(ip);
    if (t && t.ate > agora && t.n >= 8) return json(res, 429, { erro: 'Muitas tentativas erradas. Espere 15 minutos.' });
    const corpo = await lerCorpo(req, 10000);
    const u = usuarios.find(x => x.usuario === String(corpo.usuario || '').trim().toLowerCase());
    if (!u || !senhaConfere(u, corpo.senha || '')) {
      const n = t && t.ate > agora ? t.n + 1 : 1;
      tentativas.set(ip, { n, ate: agora + 15 * 60000 });
      return json(res, 401, { erro: 'Usuário ou senha errados.' });
    }
    tentativas.delete(ip);
    const tok = crypto.randomBytes(32).toString('base64url');
    limparSessoes();
    sessoes[chaveSessao(tok)] = { usuario: u.usuario, ate: agora + DIAS_SESSAO * 86400000 };
    gravarJSON(ARQ_SES, sessoes);
    return json(res, 200, { ok: true, nome: u.nome }, { 'Set-Cookie': cookieSessao(req, tok, DIAS_SESSAO * 86400) });
  }

  const s = sessaoDe(req);
  if (!s) {
    if (rota.startsWith('/api/')) return json(res, 401, { erro: 'Entre de novo.' });
    res.writeHead(302, Object.assign({ Location: rota === '/' ? 'entrar' : '/entrar', 'Cache-Control': 'no-store' }, SEGURANCA));
    return res.end();
  }
  const u = s.u;
  // gravações só em JSON: um formulário de outro site não consegue mandar
  if (rota.startsWith('/api/') && ['POST', 'PUT', 'DELETE'].includes(metodo) && metodo !== 'DELETE' && !ehJSON) return json(res, 415, { erro: 'Formato inválido.' });

  if ((rota === '/' || rota === '/index.html') && metodo === 'GET') return enviar(res, 200, paginaSistema(u), 'text/html; charset=utf-8');
  if (rota === '/mapa-sul.json' && metodo === 'GET') {
    return enviar(res, 200, fs.readFileSync(path.join(PUBLICO, 'mapa-sul.json')), 'application/json; charset=utf-8', { 'Cache-Control': 'private, max-age=86400' });
  }
  if (rota === '/api/sair' && metodo === 'POST') {
    delete sessoes[chaveSessao(s.tok)];
    gravarJSON(ARQ_SES, sessoes);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookieSessao(req, '', 0) });
  }
  if (rota === '/api/dados' && metodo === 'GET') {
    const out = {};
    COLS.forEach(c => { out[c] = Object.values(banco[c]); });
    return json(res, 200, out);
  }
  const mDado = rota.match(/^\/api\/dados\/([a-z]+)\/([^/]+)$/);
  if (mDado) {
    const col = mDado[1], id = decodeURIComponent(mDado[2]);
    if (!COLS.includes(col) || !ID_OK.test(id)) return json(res, 400, { erro: 'Registro inválido.' });
    if (metodo === 'PUT') {
      const obj = await lerCorpo(req, 2e6);
      const op = aplicar({ tipo: 'set', col, obj: Object.assign({}, obj, { id }) });
      if (!op) return json(res, 400, { erro: 'Registro inválido.' });
      salvarDados(); avisar(op);
      return json(res, 200, { ok: true });
    }
    if (metodo === 'DELETE') {
      const op = aplicar({ tipo: 'del', col, id });
      salvarDados(); avisar(op);
      return json(res, 200, { ok: true });
    }
  }
  if (rota === '/api/lote' && metodo === 'POST') {
    const corpo = await lerCorpo(req, 20e6);
    const ops = Array.isArray(corpo.ops) ? corpo.ops : [];
    if (!ops.length || ops.length > 20000) return json(res, 400, { erro: 'Lote inválido.' });
    const feitas = ops.map(aplicar);
    if (feitas.some(x => !x)) return json(res, 400, { erro: 'Algum registro do lote é inválido.' });
    salvarDados(); avisar({ tipo: 'lote', ops: feitas });
    return json(res, 200, { ok: true, n: feitas.length });
  }
  if (rota === '/api/eventos' && metodo === 'GET') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }, SEGURANCA));
    res.write('retry: 3000\n\n');
    ouvintes.add(res);
    req.on('close', () => ouvintes.delete(res));
    return;
  }
  if (rota === '/api/minha-senha' && metodo === 'POST') {
    const corpo = await lerCorpo(req, 10000);
    if (!senhaConfere(u, corpo.atual || '')) return json(res, 400, { erro: 'A senha atual não confere.' });
    if (String(corpo.nova || '').length < 6) return json(res, 400, { erro: 'A senha nova precisa ter pelo menos 6 letras ou números.' });
    Object.assign(u, novoUsuario(u.usuario, u.nome, corpo.nova, u.admin), { criadoEm: u.criadoEm });
    gravarJSON(ARQ_USU, usuarios);
    // as outras entradas desse usuário saem
    for (const [k, x] of Object.entries(sessoes)) if (x.usuario === u.usuario && k !== chaveSessao(s.tok)) delete sessoes[k];
    gravarJSON(ARQ_SES, sessoes);
    return json(res, 200, { ok: true });
  }
  if (rota === '/api/usuarios' || rota.startsWith('/api/usuarios/')) {
    if (!u.admin) return json(res, 403, { erro: 'Só um administrador pode mexer nos acessos.' });
    if (rota === '/api/usuarios' && metodo === 'GET') return json(res, 200, listaUsuarios());
    if (rota === '/api/usuarios' && metodo === 'POST') {
      const corpo = await lerCorpo(req, 10000);
      const usuario = String(corpo.usuario || '').trim().toLowerCase();
      if (!USUARIO_OK.test(usuario)) return json(res, 400, { erro: 'O usuário tem de 2 a 30 letras sem acento, números, ponto ou traço.' });
      if (usuarios.some(x => x.usuario === usuario)) return json(res, 400, { erro: 'Já existe esse usuário.' });
      if (String(corpo.senha || '').length < 6) return json(res, 400, { erro: 'A senha precisa ter pelo menos 6 letras ou números.' });
      usuarios.push(novoUsuario(usuario, String(corpo.nome || '').trim().slice(0, 80), corpo.senha, !!corpo.admin));
      gravarJSON(ARQ_USU, usuarios);
      return json(res, 200, listaUsuarios());
    }
    const mU = rota.match(/^\/api\/usuarios\/([^/]+)$/);
    if (mU && metodo === 'DELETE') {
      const alvo = decodeURIComponent(mU[1]);
      if (alvo === u.usuario) return json(res, 400, { erro: 'Você não pode tirar o seu próprio acesso.' });
      usuarios = usuarios.filter(x => x.usuario !== alvo);
      limparSessoes();
      gravarJSON(ARQ_USU, usuarios);
      gravarJSON(ARQ_SES, sessoes);
      return json(res, 200, listaUsuarios());
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
servidor.listen(PORTA, HOST, () => console.log(`Controle Munck em http://${HOST}:${PORTA}`));
function desligar() { if (timerGravar) gravarDadosAgora(); process.exit(0); }
process.on('SIGTERM', desligar);
process.on('SIGINT', desligar);

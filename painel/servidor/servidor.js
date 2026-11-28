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
const { paginaEntrar, paginaInicial, paginaSistema, paginaPonto, paginaPontoNaoVale } = require('./paginas');

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

/* Arquivo com defeito (cortado, ilegível): o painel não sobe. Subir vazio apagaria os dados na
   primeira gravação e, com o usuarios.json, faria a senha inicial voltar a valer. */
function semDefeito(ler) {
  try { return ler(); } catch (e) {
    if (!e.arquivoComDefeito) throw e;
    const nome = path.basename(e.arquivoComDefeito);
    console.error(`O Painel Deconto NÃO subiu: ${e.message}.`);
    console.error(`Nada foi gravado e o arquivo ficou como estava. Os dados de cada sistema têm uma cópia por dia em ${path.join(DADOS, 'copias')}: conserte o arquivo ou ponha no lugar dele a cópia mais nova e reinicie o painel.`);
    if (nome === 'usuarios.json') console.error('Se o usuarios.json não tiver conserto, apague-o: o admin volta com a PAINEL_SENHA do .env (ou com uma senha nova, mostrada aqui no log).');
    if (nome === 'sessoes.json') console.error('O sessoes.json só guarda quem está com o painel aberto: pode apagá-lo, e todo mundo entra de novo.');
    process.exit(1);
  }
}

/* ---------- sistemas: dados e arquivos ---------- */
const prontos = SISTEMAS.filter(s => s.pronto);
const bancos = {}, arquivosDe = {}, ouvintes = {}; // ouvintes: resposta aberta → chave da sessão dela
for (const s of prontos) {
  bancos[s.id] = semDefeito(() => criarBanco(DADOS, s));
  if (s.arquivos) arquivosDe[s.id] = criarArquivos(DADOS, s.id);
  ouvintes[s.id] = new Map();
}
const sistemaPorId = id => prontos.find(s => s.id === id);

/* ---------- usuário e entradas ---------- */
const ARQ_USU = path.join(DADOS, 'usuarios.json');
const ARQ_SES = path.join(DADOS, 'sessoes.json');
let usuarios = semDefeito(() => lerJSON(ARQ_USU, []));
let sessoes = semDefeito(() => lerJSON(ARQ_SES, {}));
// scrypt assíncrono: conferir uma senha não trava o servidor para os outros
const hashSenha = (senha, sal) => new Promise((ok, falha) => crypto.scrypt(String(senha), sal, 32, (e, b) => e ? falha(e) : ok(b.toString('hex'))));
async function novaSenha(u, senha) { const sal = crypto.randomBytes(16).toString('hex'); u.hash = await hashSenha(senha, sal); u.sal = sal; }
async function senhaConfere(u, senha) {
  const a = Buffer.from(await hashSenha(senha, u.sal), 'hex'), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- carga inicial (só depois de ler tudo: com um arquivo com defeito, nada é gravado) ---------- */
for (const s of prontos) {
  const arqCarga = path.join(CARGA, s.id + '.json');
  if (!fs.existsSync(arqCarga)) continue;
  if (bancos[s.id].existia) { console.log(`Carga de ${s.nome} ignorada: o sistema já tem dados. (${arqCarga})`); continue; }
  let r;
  try { r = importarCarga(arqCarga, s, bancos[s.id], arquivosDe[s.id]); } catch (e) {
    console.error(`Carga de ${s.nome} não entrou: ${e.message}. Nada dela foi gravado; o arquivo continua em ${arqCarga}. Conserte e reinicie o painel.`);
    continue;
  }
  console.log(`Carga de ${s.nome}: ${r.registros} registros e ${r.arquivos} arquivos.`);
  try {
    const guardada = path.join(DADOS, `carga-importada-${s.id}-${new Date().toISOString().slice(0, 10)}.json`);
    fs.copyFileSync(arqCarga, guardada);
    fs.chmodSync(guardada, 0o600);
    fs.unlinkSync(arqCarga);
  } catch (e) { console.error(`A carga de ${s.nome} entrou, mas não consegui tirá-la de ${arqCarga}: ${e.message}`); }
}
function limparLixeiras() { for (const id in arquivosDe) arquivosDe[id].limparLixeira(); }
limparLixeiras();
setInterval(limparLixeiras, 86400000).unref();

if (!usuarios.length) {
  const senha = process.env.PAINEL_SENHA || crypto.randomBytes(9).toString('base64url');
  const admin = { usuario: 'admin', nome: 'Administrador', admin: true, criadoEm: new Date().toISOString() };
  admin.sal = crypto.randomBytes(16).toString('hex');
  admin.hash = crypto.scryptSync(String(senha), admin.sal, 32).toString('hex'); // na subida, antes de abrir a porta
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
const sessaoValida = chave => { const x = sessoes[chave]; return !!x && x.ate >= Date.now(); };
function avisar(sisId, msg) {
  const linha = 'data: ' + JSON.stringify(msg) + '\n\n';
  for (const [res, chave] of ouvintes[sisId]) {
    if (!sessaoValida(chave)) { ouvintes[sisId].delete(res); res.end(); continue; } // a entrada saiu ou venceu
    try { res.write(linha); } catch (e) { ouvintes[sisId].delete(res); }
  }
}
// quem sai (ou é derrubado pela troca de senha) para de receber na hora
function fecharOuvintes(chaves) {
  for (const id in ouvintes) for (const [res, chave] of ouvintes[id]) if (chaves.has(chave)) { ouvintes[id].delete(res); res.end(); }
}
setInterval(() => { for (const id in ouvintes) for (const res of ouvintes[id].keys()) { try { res.write(': ping\n\n'); } catch (e) { ouvintes[id].delete(res); } } }, 25000).unref();

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
// O arquivo só ganha o cabeçalho 200 depois de aberto e conferido; se der erro antes disso
// (apagado nesse meio tempo, pasta no lugar), é 404; se der no meio do envio, corta a resposta.
function mandarArquivo(res, a) {
  const leitor = fs.createReadStream(a.caminho);
  leitor.on('error', () => { if (!res.headersSent) json(res, 404, { erro: 'Arquivo não encontrado.' }); else res.destroy(); });
  leitor.on('open', fd => fs.fstat(fd, (e, info) => {
    if (leitor.destroyed || res.headersSent) return;
    if (e || !info.isFile()) return leitor.destroy(e || new Error('não é um arquivo'));
    res.writeHead(200, Object.assign({ 'Content-Type': a.tipo, 'Content-Length': info.size, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`, 'Cache-Control': 'private, max-age=86400' }, SEGURANCA));
    leitor.pipe(res);
  }));
  res.on('close', () => leitor.destroy());
}
const PAGINA_404 = '<!doctype html><meta charset="utf-8"><title>Não encontrado</title><p style="font-family:system-ui;padding:24px">Não encontrado. <a href="/">Voltar ao Painel Deconto</a></p>';

// Só responde 200 depois que os dados estão no disco. Se a gravação falhar (o banco já escreveu o
// erro no log), a memória já voltou ao que está no disco.
const NAO_GRAVOU = { erro: 'O servidor não conseguiu gravar. Nada foi gravado; tente de novo.' };
async function gravou(banco) {
  try { await banco.salvar(); return true; } catch (e) { return false; }
}

/* ---------- RH: ponto ---------- */
// O dia e a hora do ponto são os de Xanxerê, qualquer que seja o fuso da VM.
const FUSO_PONTO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function noFuso(d) {
  const p = Object.fromEntries(FUSO_PONTO.formatToParts(d).map(x => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}
const dataOk = s => { const d = new Date(String(s) + 'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(d) && d.toISOString().slice(0, 10) === s; };
const horaOk = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));
const idPonto = () => 'pt-' + crypto.randomBytes(12).toString('hex');
/* Correção ou inclusão feita pelo RH: o original não muda; o registro novo aponta para ele (substitui)
   e guarda a justificativa, quem fez e quando. Devolve { ponto } ou { status, erro }. */
function correcaoDoRH(banco, corpo, u) {
  const justificativa = String(corpo.justificativa || '').trim().slice(0, 500);
  if (!justificativa) return { status: 400, erro: 'Escreva a justificativa.' };
  let alvo = null;
  if (corpo.substitui != null) {
    alvo = banco.pegar('pontos', String(corpo.substitui));
    if (!alvo) return { status: 404, erro: 'Registro não encontrado.' };
    if (banco.lista('pontos').some(p => p.substitui === alvo.id)) return { status: 409, erro: 'Esse registro já foi corrigido. Corrija o registro mais novo.' };
  }
  const funcionarioId = alvo ? alvo.funcionarioId : String(corpo.funcionarioId || '');
  if (!banco.pegar('funcionarios', funcionarioId)) return { status: 404, erro: 'Funcionário não encontrado.' };
  const ponto = { id: idPonto(), funcionarioId, origem: 'rh', justificativa, por: u.usuario, alteradoEm: new Date().toISOString() };
  if (alvo) ponto.substitui = alvo.id;
  if (alvo && corpo.anulado === true) ponto.anulado = true;
  else {
    if (!['entrada', 'saida'].includes(corpo.tipo) || !dataOk(corpo.data) || !horaOk(corpo.hora)) return { status: 400, erro: 'Confira se é entrada ou saída, a data e a hora.' };
    Object.assign(ponto, { tipo: corpo.tipo, data: corpo.data, hora: corpo.hora });
    // a foto e o local continuam sendo os do toque no celular
    if (alvo) for (const k of ['foto', 'lat', 'lon', 'precisao']) if (alvo[k] != null) ponto[k] = alvo[k];
  }
  return { ponto };
}
// registros que valem: sem os que foram corrigidos (outro aponta para eles) e sem os anulados
function pontosQueValem(pontos) {
  const trocados = new Set(pontos.map(p => p.substitui).filter(Boolean));
  return pontos.filter(p => !trocados.has(p.id) && !p.anulado);
}
const ordemPonto = (a, b) => (a.data + a.hora).localeCompare(b.data + b.hora) || String(a.em || a.alteradoEm).localeCompare(String(b.em || b.alteradoEm));
function funcionarioDoLink(token) {
  const rh = bancos.rh;
  const l = rh && rh.lista('links').find(x => x.token === token);
  const f = l && rh.pegar('funcionarios', l.id);
  return f && f.situacao !== 'desligado' ? f : null;
}
// o botão alterna sozinho: depois de uma entrada de hoje vem a saída; esqueceu a saída ontem, hoje começa com entrada
function estadoPonto(f) {
  const hoje = noFuso(new Date()).data; // um registro do RH com data no futuro não conta
  const meus = pontosQueValem(bancos.rh.lista('pontos')).filter(p => p.funcionarioId === f.id && p.data <= hoje).sort(ordemPonto);
  const ult = meus[meus.length - 1] || null;
  return { nome: f.nome, ultimo: ult && { tipo: ult.tipo, data: ult.data, hora: ult.hora }, proximo: ult && ult.tipo === 'entrada' && ult.data === hoje ? 'saida' : 'entrada', agora: Date.now() };
}
// Dois toques em menos de 1 minuto (outra aba, resposta perdida no 3G) não viram entrada e saída.
// PONTO_INTERVALO_S só existe para os testes baterem entrada e saída seguidas.
const INTERVALO_PONTO = Number(process.env.PONTO_INTERVALO_S || 60) * 1000;
const PONTOS_POR_DIA = 12; // um link vazado não enche o disco com fotos
const LIMITE_FOTO = 3 * 1024 * 1024;
const PNG_INICIO = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const FOTO_OK = { 'image/jpeg': b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF, 'image/png': b => b.subarray(0, 8).equals(PNG_INICIO) };
const numeroAte = (v, max) => { const s = String(v == null ? '' : v).trim(), n = Number(s); return s && Number.isFinite(n) && Math.abs(n) <= max ? n : null; };
const LINK_NAO_VALE = 'Este link de ponto não vale mais. Peça o link novo ao RH.';
/* /ponto/<token> e /ponto/<token>/registrar, sem login: o link só registra o ponto do próprio funcionário. */
async function rotaPonto(req, res, partes, metodo) {
  const f = partes.length === 2 || partes.length === 3 ? funcionarioDoLink(partes[1]) : null;
  if (f && partes.length === 2 && metodo === 'GET') return html(res, 200, paginaPonto(estadoPonto(f)));
  if (!f || partes[2] !== 'registrar' || metodo !== 'POST') {
    req.resume();
    return metodo === 'GET' ? html(res, 404, paginaPontoNaoVale(LINK_NAO_VALE)) : json(res, 404, { erro: LINK_NAO_VALE });
  }
  const tipoFoto = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const lat = numeroAte(req.headers['x-lat'], 90), lon = numeroAte(req.headers['x-lon'], 180), precisao = numeroAte(req.headers['x-precisao'], 1e7);
  if (!FOTO_OK[tipoFoto]) { req.resume(); return json(res, 415, { erro: 'A foto precisa ser JPG ou PNG.' }); }
  if (Number(req.headers['content-length'] || 0) > LIMITE_FOTO) { req.resume(); return json(res, 413, { erro: 'A foto passa de 3 MB.' }); }
  if (lat == null || lon == null) { req.resume(); return json(res, 400, { erro: 'Sem a localização o ponto não é registrado. Permita a localização e tente de novo.' }); }
  const buf = await lerBruto(req, LIMITE_FOTO).catch(e => { if (e && e.status === 413) return null; throw e; });
  if (!buf) return json(res, 413, { erro: 'A foto passa de 3 MB.' });
  if (!buf.length) return json(res, 400, { erro: 'Sem a foto o ponto não é registrado. Tire a foto e tente de novo.' });
  if (!FOTO_OK[tipoFoto](buf)) return json(res, 415, { erro: 'Esse arquivo não é uma foto JPG ou PNG.' });
  // daqui até aplicar não há await: o segundo de dois toques ao mesmo tempo já vê o primeiro
  const agora = new Date(), { data, hora } = noFuso(agora), est = estadoPonto(f), tipo = est.proximo;
  const doCelular = bancos.rh.lista('pontos').filter(p => p.funcionarioId === f.id && p.origem === 'celular');
  const ult = doCelular.reduce((a, p) => (!a || p.em > a.em ? p : a), null);
  if (ult && agora - Date.parse(ult.em) < INTERVALO_PONTO) {
    return json(res, 409, { erro: `Você já registrou ${ult.tipo === 'saida' ? 'saída' : 'entrada'} às ${ult.hora}. Para registrar de novo, espere um minuto.`, ultimo: est.ultimo, proximo: est.proximo });
  }
  if (doCelular.filter(p => p.data === data).length >= PONTOS_POR_DIA) return json(res, 429, { erro: 'Hoje já são muitos registros por este link. Fale com o RH.' });
  const foto = arquivosDe.rh.guardar(buf, { nome: `ponto-${data}-${hora.replace(':', 'h')}.${tipoFoto === 'image/png' ? 'png' : 'jpg'}`, tipo: tipoFoto });
  const ponto = { id: idPonto(), funcionarioId: f.id, tipo, data, hora, em: agora.toISOString(), lat, lon, precisao: precisao == null || precisao < 0 ? null : Math.round(precisao), foto, origem: 'celular' };
  const op = bancos.rh.aplicar({ tipo: 'set', col: 'pontos', obj: ponto });
  if (!(await gravou(bancos.rh))) { arquivosDe.rh.apagarDeVez(foto.id); return json(res, 500, NAO_GRAVOU); }
  avisar('rh', op);
  return json(res, 200, { ok: true, tipo, data, hora, nome: f.nome, proximo: tipo === 'entrada' ? 'saida' : 'entrada' });
}

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
    let t = tentativas.get(ip);
    if (!t || t.ate <= agora) { t = { n: 0, ate: 0 }; tentativas.set(ip, t); }
    if (t.n >= 8) return json(res, 429, { erro: 'Muitas tentativas erradas. Espere 15 minutos.' });
    // a tentativa conta já aqui, antes de esperar o corpo e o scrypt: pedidos ao mesmo tempo não passam do limite
    t.n++;
    t.ate = agora + 15 * 60000;
    const corpo = await lerJSONCorpo(req, 10000);
    const u = usuarios.find(x => x.usuario === String(corpo.usuario || '').trim().toLowerCase());
    if (!u || !(await senhaConfere(u, corpo.senha || ''))) return json(res, 401, { erro: 'Usuário ou senha errados.' });
    tentativas.delete(ip);
    const tok = crypto.randomBytes(32).toString('base64url');
    for (const [k, x] of Object.entries(sessoes)) if (!x || x.ate < agora) delete sessoes[k];
    sessoes[chaveSessao(tok)] = { usuario: u.usuario, ate: agora + DIAS_SESSAO * 86400000 };
    gravarJSON(ARQ_SES, sessoes);
    return json(res, 200, { ok: true, nome: u.nome }, { 'Set-Cookie': cookieSessao(req, tok, DIAS_SESSAO * 86400) });
  }

  const partes = rota.split('/').filter(Boolean);
  if (partes[0] === 'ponto' && bancos.rh) return rotaPonto(req, res, partes, metodo);
  const s = sessaoDe(req);
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
    const chave = chaveSessao(s.tok);
    delete sessoes[chave];
    gravarJSON(ARQ_SES, sessoes);
    fecharOuvintes(new Set([chave]));
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookieSessao(req, '', 0) });
  }
  if (rota === '/api/eu' && metodo === 'GET') return json(res, 200, { usuario: u.usuario, nome: u.nome, admin: !!u.admin, sistemas: prontos.map(x => x.id) });
  if (rota === '/api/minha-senha' && metodo === 'POST') {
    const corpo = await lerJSONCorpo(req, 10000);
    if (!(await senhaConfere(u, corpo.atual || ''))) return json(res, 400, { erro: 'A senha atual não confere.' });
    if (String(corpo.nova || '').length < 6) return json(res, 400, { erro: 'A senha nova precisa ter pelo menos 6 letras ou números.' });
    await novaSenha(u, corpo.nova);
    gravarJSON(ARQ_USU, usuarios);
    const esta = chaveSessao(s.tok), derrubadas = new Set();
    for (const [k, x] of Object.entries(sessoes)) if (x.usuario === u.usuario && k !== esta) { delete sessoes[k]; derrubadas.add(k); }
    gravarJSON(ARQ_SES, sessoes);
    fecharOuvintes(derrubadas);
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
  const soServidor = col => (sis.soServidor || []).includes(col);
  const SO_SERVIDOR = { erro: 'Esses registros só o servidor grava.' };

  if (sis.id === 'rh' && metodo === 'POST' && resto[0] === 'link' && resto.length === 2) {
    req.resume();
    const fid = decodeURIComponent(resto[1]);
    if (!banco.pegar('funcionarios', fid)) return json(res, 404, { erro: 'Funcionário não encontrado.' });
    const op = banco.aplicar({ tipo: 'set', col: 'links', obj: { id: fid, token: crypto.randomBytes(24).toString('base64url'), criadoEm: new Date().toISOString() } });
    if (!op) return json(res, 400, { erro: 'Funcionário inválido.' });
    if (!(await gravou(banco))) return json(res, 500, NAO_GRAVOU);
    avisar(sis.id, op);
    return json(res, 200, { ok: true, token: op.obj.token });
  }
  if (sis.id === 'rh' && metodo === 'POST' && resto[0] === 'pontos' && resto.length === 1) {
    const r = correcaoDoRH(banco, await lerJSONCorpo(req, 10000), u);
    if (r.erro) return json(res, r.status, { erro: r.erro });
    const op = banco.aplicar({ tipo: 'set', col: 'pontos', obj: r.ponto });
    if (!(await gravou(banco))) return json(res, 500, NAO_GRAVOU);
    avisar(sis.id, op);
    return json(res, 200, { ok: true, ponto: r.ponto });
  }

  if (resto[0] === 'dados' && resto.length === 1 && metodo === 'GET') return json(res, 200, banco.todos());
  if (resto[0] === 'dados' && resto.length === 3) {
    const col = resto[1], id = decodeURIComponent(resto[2]);
    if ((metodo === 'PUT' || metodo === 'DELETE') && soServidor(col)) { req.resume(); return json(res, 403, SO_SERVIDOR); }
    if (metodo === 'PUT') {
      const obj = await lerJSONCorpo(req, 2e6);
      const op = banco.aplicar({ tipo: 'set', col, obj: Object.assign({}, obj, { id }) });
      if (!op) return json(res, 400, { erro: 'Registro inválido.' });
      if (!(await gravou(banco))) return json(res, 500, NAO_GRAVOU);
      avisar(sis.id, op);
      return json(res, 200, { ok: true });
    }
    if (metodo === 'DELETE') {
      const op = banco.aplicar({ tipo: 'del', col, id });
      if (!op) return json(res, 400, { erro: 'Registro inválido.' });
      if (!(await gravou(banco))) return json(res, 500, NAO_GRAVOU);
      avisar(sis.id, op);
      return json(res, 200, { ok: true });
    }
  }
  if (resto[0] === 'lote' && resto.length === 1 && metodo === 'POST') {
    const corpo = await lerJSONCorpo(req, 20e6);
    const ops = Array.isArray(corpo.ops) ? corpo.ops : [];
    if (!ops.length || ops.length > 20000) return json(res, 400, { erro: 'Lote inválido.' });
    if (ops.some(o => o && soServidor(o.col))) return json(res, 403, SO_SERVIDOR);
    const feitas = banco.aplicarLote(ops);
    if (!feitas) return json(res, 400, { erro: 'Algum registro do lote é inválido. Nada foi gravado.' });
    if (!(await gravou(banco))) return json(res, 500, NAO_GRAVOU);
    avisar(sis.id, { tipo: 'lote', ops: feitas });
    return json(res, 200, { ok: true, n: feitas.length });
  }
  if (resto[0] === 'eventos' && resto.length === 1 && metodo === 'GET') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }, SEGURANCA));
    res.write('retry: 3000\n\n');
    ouvintes[sis.id].set(res, chaveSessao(s.tok));
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
      return mandarArquivo(res, a);
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
function gravarPendentes() {
  for (const id in bancos) if (bancos[id].pendente()) { try { bancos[id].gravarAgora(); } catch (e) { console.error(e.message); } }
}
function desligar() {
  gravarPendentes();
  process.exit(0);
}
process.on('SIGTERM', desligar);
process.on('SIGINT', desligar);
// erro que ninguém tratou: grava o que estiver pendente e sai com erro; o PM2 sobe o painel de novo
process.on('uncaughtException', e => {
  console.error('Erro inesperado; o painel vai reiniciar:', e);
  gravarPendentes();
  process.exit(1);
});

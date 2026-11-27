'use strict';
/* Testes do servidor do Painel Deconto (fase 1). Rodar: node --test painel/testes/servidor.test.js
   Sobe o servidor num processo filho, com pastas temporárias e páginas de teste. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORTA = 3399;
const BASE = `http://127.0.0.1:${PORTA}`;
const SERVIDOR = path.join(__dirname, '..', 'servidor', 'servidor.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-teste-'));
const DADOS = path.join(tmp, 'data');
const PUBLICO = path.join(tmp, 'publico');
const CARGA = path.join(tmp, 'carga');
let proc = null;
let cookie = '';

fs.mkdirSync(PUBLICO, { recursive: true });
fs.mkdirSync(CARGA, { recursive: true });
fs.writeFileSync(path.join(PUBLICO, 'frota.html'), '<title>DECONT</title>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow">\n<p>pagina da frota</p>');
fs.writeFileSync(path.join(PUBLICO, 'operacao.html'), '<title>Controle de Operação</title>\n<p>pagina da operacao</p>');
fs.writeFileSync(path.join(PUBLICO, 'mapa-sul.json'), '{"ok":true}');
// carga inicial da frota: um documento com PDF embutido e um caminhão
const PDF = Buffer.from('%PDF-1.4\n% teste\n');
fs.writeFileSync(path.join(CARGA, 'frota.json'), JSON.stringify({
  app: 'sistema-carlise', versao: 1,
  dados: {
    caminhoes: [{ id: 'cam-tst1a00', placa: 'TST1A00' }],
    documentos: [{ id: 'doc-1', veiculoTipo: 'caminhao', veiculoId: 'cam-tst1a00', tipo: 'CRLV (licenciamento)', arquivo: { id: 'arq-x', nome: 'CRLV-TST1A00.pdf', tipo: 'application/pdf', tamanho: PDF.length, onde: 'local' } }],
  },
  arquivos: { 'arq-x': { tipo: 'application/pdf', nome: 'CRLV-TST1A00.pdf', dados: PDF.toString('base64') } },
}));

function subir() {
  return new Promise((ok, falha) => {
    proc = spawn(process.execPath, [SERVIDOR], { env: Object.assign({}, process.env, { PORTA: String(PORTA), HOST: '127.0.0.1', PAINEL_SENHA: 'senhaTeste1', PASTA_DADOS: DADOS, PASTA_PUBLICO: PUBLICO, PASTA_CARGA: CARGA }), stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    proc.stdout.on('data', c => { saida += c; if (saida.includes('Painel Deconto em')) ok(); });
    proc.stderr.on('data', c => { saida += c; });
    proc.on('exit', code => falha(new Error('servidor saiu: ' + code + '\n' + saida)));
    setTimeout(() => falha(new Error('servidor não subiu:\n' + saida)), 8000);
  });
}
function descer() { return new Promise(ok => { if (!proc) return ok(); proc.removeAllListeners('exit'); proc.on('exit', () => ok()); proc.kill('SIGTERM'); }); }
const pedir = (rota, opc = {}) => fetch(BASE + rota, Object.assign({ redirect: 'manual' }, opc, { headers: Object.assign({ cookie }, opc.headers || {}) }));
const json = (metodo, rota, corpo) => pedir(rota, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });

before(subir);
after(async () => { await descer(); fs.rmSync(tmp, { recursive: true, force: true }); });

// ---------- Task 1: login e tela inicial ----------
test('sem login, / manda para /entrar', async () => {
  const r = await fetch(BASE + '/', { redirect: 'manual' });
  assert.strictEqual(r.status, 302);
  assert.match(r.headers.get('location'), /entrar$/);
});
test('sem login, página, API, arquivo e mapa não saem', async () => {
  assert.strictEqual((await fetch(BASE + '/frota/', { redirect: 'manual' })).status, 302);
  assert.strictEqual((await fetch(BASE + '/frota/api/dados')).status, 401);
  assert.strictEqual((await fetch(BASE + '/frota/api/arquivos/arq-' + '0'.repeat(32))).status, 401);
  assert.strictEqual((await fetch(BASE + '/operacao/mapa-sul.json', { redirect: 'manual' })).status, 302);
});
test('login só aceita JSON (415)', async () => {
  const r = await fetch(BASE + '/api/entrar', { method: 'POST', body: 'usuario=admin&senha=senhaTeste1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.strictEqual(r.status, 415);
});
test('login errado dá 401 e certo dá cookie HttpOnly', async () => {
  let r = await fetch(BASE + '/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'admin', senha: 'errada' }) });
  assert.strictEqual(r.status, 401);
  r = await fetch(BASE + '/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'admin', senha: 'senhaTeste1' }) });
  assert.strictEqual(r.status, 200);
  const c = r.headers.get('set-cookie');
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  cookie = c.split(';')[0];
});
test('tela inicial mostra os sistemas na ordem, com os futuros em desenvolvimento', async () => {
  const r = await pedir('/');
  assert.strictEqual(r.status, 200);
  const html = await r.text();
  const ordem = ['DECONT', 'Controle de Operação', 'RH', 'Financeiro', 'Cargas'].map(n => html.indexOf(n));
  assert.ok(ordem.every(i => i > 0), 'todos os nomes aparecem');
  assert.deepStrictEqual([...ordem].sort((a, b) => a - b), ordem, 'na ordem 1 a 5');
  assert.match(html, /href="\/frota\/"/);
  assert.match(html, /href="\/operacao\/"/);
  assert.match(html, /Em desenvolvimento/);
});
test('/frota sem barra vai para /frota/ e a página traz window.PAINEL', async () => {
  const r1 = await pedir('/frota');
  assert.strictEqual(r1.status, 301);
  assert.strictEqual(r1.headers.get('location'), '/frota/');
  const html = await (await pedir('/frota/')).text();
  assert.match(html, /window\.PAINEL = \{[^<]*"sistema":"frota"/);
  assert.match(html, /<head>[\s\S]*<title>DECONT<\/title>[\s\S]*<\/head>/);
  assert.match(html, /pagina da frota/);
});
test('sistema em desenvolvimento ou desconhecido dá 404', async () => {
  assert.strictEqual((await pedir('/rh/')).status, 404);
  assert.strictEqual((await pedir('/xyz/')).status, 404);
});
test('mapa sai para quem entrou', async () => {
  const r = await pedir('/operacao/mapa-sul.json');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { ok: true });
});

// ---------- Task 2: dados e avisos ao vivo ----------
test('gravar em frota não aparece em operacao', async () => {
  let r = await json('PUT', '/frota/api/dados/caminhoes/cam-1', { placa: 'ABC1D23' });
  assert.strictEqual(r.status, 200);
  const f = await (await pedir('/frota/api/dados')).json();
  assert.ok(f.caminhoes.some(c => c.id === 'cam-1' && c.placa === 'ABC1D23'));
  const o = await (await pedir('/operacao/api/dados')).json();
  assert.ok(!o.caminhoes.some(c => c.id === 'cam-1'));
});
test('coleção que não é do sistema dá 400', async () => {
  assert.strictEqual((await json('PUT', '/operacao/api/dados/documentos/d1', { a: 1 })).status, 400);
});
test('lote com um item inválido não grava nada', async () => {
  const r = await json('POST', '/frota/api/lote', { ops: [{ tipo: 'set', col: 'motoristas', obj: { id: 'm1', nome: 'A' } }, { tipo: 'set', col: 'naoexiste', obj: { id: 'x' } }] });
  assert.strictEqual(r.status, 400);
  const f = await (await pedir('/frota/api/dados')).json();
  assert.ok(!f.motoristas.some(m => m.id === 'm1'));
});
test('evento chega para quem ouve o mesmo sistema e não para o outro', async () => {
  const ouvir = async rota => {
    const ctl = new AbortController();
    const r = await pedir(rota, { signal: ctl.signal });
    const leitor = r.body.getReader();
    let txt = '';
    const lido = (async () => { try { for (;;) { const { value, done } = await leitor.read(); if (done) break; txt += Buffer.from(value).toString(); } } catch (e) { /* fechado */ } })();
    return { fim: async () => { ctl.abort(); await lido; return txt; } };
  };
  const a = await ouvir('/frota/api/eventos'), b = await ouvir('/operacao/api/eventos');
  await json('PUT', '/frota/api/dados/motoristas/m2', { nome: 'Beto' });
  await new Promise(r => setTimeout(r, 300));
  assert.match(await a.fim(), /"nome":"Beto"/);
  assert.doesNotMatch(await b.fim(), /Beto/);
});
test('depois de reiniciar o servidor, os dados continuam e existe a cópia do dia', async () => {
  await json('PUT', '/frota/api/dados/motoristas/m3', { nome: 'Caio' });
  await descer();
  await subir();
  const f = await (await pedir('/frota/api/dados')).json();
  assert.ok(f.motoristas.some(m => m.nome === 'Caio'));
  const hoje = new Date().toISOString().slice(0, 10);
  assert.ok(fs.existsSync(path.join(DADOS, 'copias', 'frota-' + hoje + '.json')));
});

// ---------- Task 3: arquivos e carga inicial ----------
const subirArquivo = (sis, corpo, tipo, nome) => pedir(`/${sis}/api/arquivos`, { method: 'POST', headers: { 'Content-Type': tipo, 'X-Nome-Arquivo': encodeURIComponent(nome) }, body: corpo });
test('PDF com acento e espaço grava e volta igual', async () => {
  const pdf = Buffer.from('%PDF-1.4\nconteudo de teste\n');
  const r = await subirArquivo('frota', pdf, 'application/pdf', 'CRLV São José.pdf');
  assert.strictEqual(r.status, 200);
  const meta = await r.json();
  assert.match(meta.id, /^arq-[0-9a-f]{32}$/);
  assert.strictEqual(meta.onde, 'servidor');
  assert.strictEqual(meta.nome, 'CRLV São José.pdf');
  const b = await pedir('/frota/api/arquivos/' + meta.id);
  assert.strictEqual(b.status, 200);
  assert.strictEqual(b.headers.get('content-type'), 'application/pdf');
  assert.match(b.headers.get('content-disposition'), /filename\*=UTF-8''CRLV%20S%C3%A3o%20Jos%C3%A9\.pdf/);
  assert.ok(Buffer.from(await b.arrayBuffer()).equals(pdf));
  assert.strictEqual((await pedir('/frota/api/arquivos/' + meta.id, { method: 'DELETE' })).status, 200);
  assert.strictEqual((await pedir('/frota/api/arquivos/' + meta.id)).status, 404);
});
test('SVG e HTML são recusados (415) e mais de 15 MB também (413)', async () => {
  assert.strictEqual((await subirArquivo('frota', Buffer.from('<svg/>'), 'image/svg+xml', 'a.svg')).status, 415);
  assert.strictEqual((await subirArquivo('frota', Buffer.from('<p>'), 'text/html', 'a.html')).status, 415);
  assert.strictEqual((await subirArquivo('frota', Buffer.alloc(16 * 1024 * 1024), 'application/pdf', 'grande.pdf')).status, 413);
});
test('o Controle de Operação não aceita arquivos (404)', async () => {
  assert.strictEqual((await subirArquivo('operacao', Buffer.from('%PDF'), 'application/pdf', 'a.pdf')).status, 404);
});
test('a carga inicial entrou com o PDF guardado no servidor', async () => {
  const f = await (await pedir('/frota/api/dados')).json();
  assert.ok(f.caminhoes.some(c => c.placa === 'TST1A00'));
  const d = f.documentos.find(x => x.id === 'doc-1');
  assert.strictEqual(d.arquivo.onde, 'servidor');
  assert.match(d.arquivo.id, /^arq-[0-9a-f]{32}$/);
  const b = await pedir('/frota/api/arquivos/' + d.arquivo.id);
  assert.ok(Buffer.from(await b.arrayBuffer()).equals(PDF));
  assert.ok(!fs.existsSync(path.join(CARGA, 'frota.json')), 'a carga sai da pasta depois de entrar');
});

// ---------- troca de senha ----------
test('troca de senha: a antiga deixa de entrar e as outras entradas saem', async () => {
  const outra = await fetch(BASE + '/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'admin', senha: 'senhaTeste1' }) });
  const cookieOutra = outra.headers.get('set-cookie').split(';')[0];
  assert.strictEqual((await json('POST', '/api/minha-senha', { atual: 'senhaTeste1', nova: 'novaSenha9' })).status, 200);
  const velha = await fetch(BASE + '/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'admin', senha: 'senhaTeste1' }) });
  assert.strictEqual(velha.status, 401);
  assert.strictEqual((await fetch(BASE + '/frota/api/dados', { headers: { cookie: cookieOutra } })).status, 401);
  assert.strictEqual((await pedir('/frota/api/dados')).status, 200, 'esta entrada continua');
});
test('oito senhas erradas bloqueiam (429)', async () => {
  let ultimo = 0;
  for (let i = 0; i < 9; i++) ultimo = (await fetch(BASE + '/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': '9.9.9.9' }, body: JSON.stringify({ usuario: 'admin', senha: 'x' + i }) })).status;
  assert.strictEqual(ultimo, 429);
});

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
fs.writeFileSync(path.join(PUBLICO, 'frota.html'), '<title>DECONTO</title>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow">\n<p>pagina da frota</p>');
fs.writeFileSync(path.join(PUBLICO, 'operacao.html'), '<title>Controle de Operação</title>\n<p>pagina da operacao</p>');
fs.writeFileSync(path.join(PUBLICO, 'rh.html'), '<title>RH</title>\n<p>pagina do rh</p>');
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

// PONTO_INTERVALO_S=0: entrada e saída seguidas nos testes; o teste do intervalo sobe um servidor com o padrão (60 s)
const ambiente = (pastas = {}) => Object.assign({}, process.env, { PORTA: String(PORTA), HOST: '127.0.0.1', PAINEL_SENHA: 'senhaTeste1', PASTA_DADOS: DADOS, PASTA_PUBLICO: PUBLICO, PASTA_CARGA: CARGA, PONTO_INTERVALO_S: '0' }, pastas);
function subir() {
  return new Promise((ok, falha) => {
    proc = spawn(process.execPath, [SERVIDOR], { env: ambiente(), stdio: ['ignore', 'pipe', 'pipe'] });
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
const esperar = ms => new Promise(r => setTimeout(r, ms));
let senhaAdmin = 'senhaTeste1'; // muda quando um teste troca a senha
async function entrar(senha = senhaAdmin) {
  const r = await fetch(BASE + '/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'admin', senha }) });
  assert.strictEqual(r.status, 200, 'entrou com a senha ' + senha);
  return r.headers.get('set-cookie').split(';')[0];
}
// Abre os avisos ao vivo e vai juntando o que chega. terminou(ms) diz se o servidor fechou a conexão nesse tempo.
async function ouvir(rota, comCookie = cookie) {
  const ctl = new AbortController();
  const r = await fetch(BASE + rota, { headers: { cookie: comCookie }, signal: ctl.signal });
  const leitor = r.body.getReader();
  let txt = '', fechou = false;
  const lido = (async () => { try { for (;;) { const { value, done } = await leitor.read(); if (done) { fechou = true; break; } txt += Buffer.from(value).toString(); } } catch (e) { /* fechado daqui */ } })();
  return {
    status: r.status,
    texto: () => txt,
    terminou: ms => Promise.race([lido.then(() => fechou), esperar(ms).then(() => false)]),
    fim: async () => { ctl.abort(); await lido; return txt; },
  };
}
const lerDisco = sis => JSON.parse(fs.readFileSync(path.join(DADOS, sis + '.json'), 'utf8'));
// Servidor à parte, com pastas de dados e de carga só dele, na mesma porta: o principal desce antes e sobe de novo no fim.
function rodarAParte(pastas) {
  return new Promise(ok => {
    const p = spawn(process.execPath, [SERVIDOR], { env: ambiente(pastas), stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '', pronto = false;
    const acabar = r => { if (pronto) return; pronto = true; clearTimeout(limite); ok(Object.assign({ proc: p, saida: () => saida }, r)); };
    p.stdout.on('data', c => { saida += c; if (saida.includes('Painel Deconto em')) acabar({ subiu: true }); });
    p.stderr.on('data', c => { saida += c; });
    p.on('close', code => acabar({ subiu: false, code }));
    const limite = setTimeout(() => acabar({ subiu: false, code: null }), 8000);
  });
}
const matar = p => new Promise(ok => { if (p.exitCode !== null || p.signalCode !== null) return ok(); p.on('close', () => ok()); p.kill('SIGTERM'); });
async function comServidorAParte(nome, preparar, conferir) {
  const raiz = path.join(tmp, nome);
  const pastas = { PASTA_DADOS: path.join(raiz, 'data'), PASTA_CARGA: path.join(raiz, 'carga') };
  fs.mkdirSync(pastas.PASTA_DADOS, { recursive: true });
  fs.mkdirSync(pastas.PASTA_CARGA, { recursive: true });
  preparar(pastas);
  await descer();
  const r = await rodarAParte(pastas);
  try { await conferir(r, pastas); } finally { await matar(r.proc); await subir(); }
}

before(subir);
after(async () => { await descer(); fs.rmSync(tmp, { recursive: true, force: true }); });

// ---------- Task 1: login e tela inicial ----------
test('sem login, / manda para /entrar', async () => {
  const r = await fetch(BASE + '/', { redirect: 'manual' });
  assert.strictEqual(r.status, 302);
  assert.match(r.headers.get('location'), /entrar$/);
});
test('sem login, página, API e arquivo não saem', async () => {
  assert.strictEqual((await fetch(BASE + '/frota/', { redirect: 'manual' })).status, 302);
  assert.strictEqual((await fetch(BASE + '/frota/api/dados')).status, 401);
  assert.strictEqual((await fetch(BASE + '/frota/api/arquivos/arq-' + '0'.repeat(32))).status, 401);
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
  const ordem = ['DECONTO', 'Controle de Operação', 'RH', 'Financeiro', 'Cargas'].map(n => html.indexOf(n));
  assert.ok(ordem.every(i => i > 0), 'todos os nomes aparecem');
  assert.deepStrictEqual([...ordem].sort((a, b) => a - b), ordem, 'na ordem 1 a 5');
  assert.match(html, /href="\/frota\/"/);
  assert.match(html, /href="\/operacao\/"/);
  assert.match(html, /Em desenvolvimento/);
  assert.ok(html.indexOf('Monitoramento de Frota') > html.indexOf('Cargas'), 'Monitoramento de Frota depois de Cargas');
  assert.ok(!/href="\/monitoramento\/"/.test(html), 'Monitoramento de Frota ainda não abre');
});
test('/frota sem barra vai para /frota/ e a página traz window.PAINEL', async () => {
  const r1 = await pedir('/frota');
  assert.strictEqual(r1.status, 301);
  assert.strictEqual(r1.headers.get('location'), '/frota/');
  const html = await (await pedir('/frota/')).text();
  assert.match(html, /window\.PAINEL = \{[^<]*"sistema":"frota"/);
  assert.match(html, /<head>[\s\S]*<title>DECONTO<\/title>[\s\S]*<\/head>/);
  assert.match(html, /pagina da frota/);
});
test('sistema em desenvolvimento ou desconhecido dá 404', async () => {
  assert.strictEqual((await pedir('/financeiro/')).status, 404);
  assert.strictEqual((await pedir('/xyz/')).status, 404);
});
test('o Controle não tem mais mapa', async () => {
  assert.strictEqual((await pedir('/operacao/mapa-sul.json')).status, 404);
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
  assert.strictEqual((await json('PUT', '/operacao/api/dados/abastecimentos/d1', { a: 1 })).status, 400);
});
test('o Controle guarda documentos', async () => {
  assert.strictEqual((await json('PUT', '/operacao/api/dados/documentos/doc-1', { caminhaoId: 'c1', numero: '123' })).status, 200);
  const o = await (await pedir('/operacao/api/dados')).json();
  assert.ok(o.documentos.some(d => d.id === 'doc-1' && d.numero === '123'));
});
test('lote com um item inválido não grava nada', async () => {
  const r = await json('POST', '/frota/api/lote', { ops: [{ tipo: 'set', col: 'motoristas', obj: { id: 'm1', nome: 'A' } }, { tipo: 'set', col: 'naoexiste', obj: { id: 'x' } }] });
  assert.strictEqual(r.status, 400);
  const f = await (await pedir('/frota/api/dados')).json();
  assert.ok(!f.motoristas.some(m => m.id === 'm1'));
});
test('evento chega para quem ouve o mesmo sistema e não para o outro', async () => {
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
  senhaAdmin = 'novaSenha9';
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

// ---------- revisão de segurança: cada teste reproduz um achado ----------
test('achado 11: a página real do DECONTO sai com o JavaScript inteiro', async () => {
  const real = fs.readFileSync(path.join(__dirname, '..', '..', 'sistema-carlise', 'frota.html'), 'utf8');
  const titulo = real.match(/^<title>.*<\/title>$/m)[0];
  const linhas = real.split('\n').filter(l => l.includes('<title>${') || l.includes('<link rel="stylesheet" href="${'));
  assert.ok(linhas.length >= 2, 'o frota.html tem as linhas que o teste procura');
  const falsa = fs.readFileSync(path.join(PUBLICO, 'frota.html'));
  fs.writeFileSync(path.join(PUBLICO, 'frota.html'), real);
  try {
    const html = await (await pedir('/frota/')).text();
    for (const l of linhas) assert.ok(html.includes(l), 'a linha do JavaScript saiu igual: ' + l.trim());
    const cabeca = html.slice(0, html.indexOf('</head>'));
    assert.ok(cabeca.includes(titulo), 'o <head> tem o título da página');
    assert.doesNotMatch(cabeca, /\$\{/, 'nada do JavaScript foi parar no <head>');
  } finally { fs.writeFileSync(path.join(PUBLICO, 'frota.html'), falsa); }
});

test('achado 4: PUT, lote e DELETE só respondem depois que os dados estão no disco', async () => {
  let r = await json('PUT', '/frota/api/dados/caminhoes/cam-disco', { placa: 'DSC1A00' });
  assert.strictEqual(r.status, 200);
  const c = lerDisco('frota').caminhoes['cam-disco'];
  assert.ok(c, 'o caminhão já está no disco quando chega a resposta');
  assert.strictEqual(c.placa, 'DSC1A00');
  r = await json('POST', '/frota/api/lote', { ops: [{ tipo: 'set', col: 'motoristas', obj: { id: 'm-lote-disco', nome: 'Lote' } }] });
  assert.strictEqual(r.status, 200);
  assert.ok(lerDisco('frota').motoristas['m-lote-disco'], 'o lote já está no disco quando chega a resposta');
  r = await json('DELETE', '/frota/api/dados/caminhoes/cam-disco');
  assert.strictEqual(r.status, 200);
  assert.ok(!lerDisco('frota').caminhoes['cam-disco'], 'o caminhão já saiu do disco quando chega a resposta');
});
test('achado 4: com um PUT a cada 150 ms, o arquivo no disco acompanha', async () => {
  const respondidos = [], problemas = [], pedidos = [];
  for (let i = 0; i < 13; i++) {
    const id = 'dia-seq-' + i;
    pedidos.push(json('PUT', '/frota/api/dados/dias/' + id, { data: '2026-11-27', km: i }).then(r => {
      assert.strictEqual(r.status, 200);
      respondidos.push(id);
      const dias = lerDisco('frota').dias;
      const faltam = respondidos.filter(x => !dias[x]);
      if (faltam.length) problemas.push(`na resposta de ${id}, faltavam no disco: ${faltam.join(', ')}`);
    }));
    await esperar(150);
  }
  await Promise.all(pedidos);
  assert.deepStrictEqual(problemas, []);
});
test('achado 4: se não consegue gravar no disco, responde 500 e não fica com o registro', async () => {
  const tmpArq = path.join(DADOS, 'frota.json.tmp');
  fs.mkdirSync(tmpArq); // uma pasta no lugar do arquivo temporário: a gravação falha
  try {
    const r = await json('PUT', '/frota/api/dados/caminhoes/cam-sem-disco', { placa: 'SDS1A00' });
    assert.strictEqual(r.status, 500);
    assert.ok((await r.json()).erro);
    const f = await (await pedir('/frota/api/dados')).json();
    assert.ok(!f.caminhoes.some(x => x.id === 'cam-sem-disco'), 'o registro que não foi para o disco não fica na memória');
  } finally { fs.rmSync(tmpArq, { recursive: true, force: true }); }
  assert.strictEqual((await json('PUT', '/frota/api/dados/caminhoes/cam-com-disco', { placa: 'CDS1A00' })).status, 200);
  assert.ok(lerDisco('frota').caminhoes['cam-com-disco'], 'depois disso volta a gravar');
});

test('achado 2: registro aninhado demais dá 400 e não trava as gravações', async () => {
  const d = 200000;
  const fundo = '{"a":' + '['.repeat(d) + ']'.repeat(d) + '}';
  const r = await pedir('/frota/api/dados/caminhoes/cam-fundo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: fundo });
  assert.strictEqual(r.status, 400);
  const l = await pedir('/frota/api/lote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"ops":[{"tipo":"set","col":"caminhoes","obj":{"id":"cam-fundo2","a":' + '['.repeat(d) + ']'.repeat(d) + '}}]}' });
  assert.strictEqual(l.status, 400);
  assert.strictEqual((await json('PUT', '/frota/api/dados/caminhoes/cam-normal', { placa: 'NRM1A00' })).status, 200);
  const g = await pedir('/frota/api/dados');
  assert.strictEqual(g.status, 200);
  const f = await g.json();
  assert.ok(!f.caminhoes.some(x => x.id === 'cam-fundo' || x.id === 'cam-fundo2'), 'o registro aninhado não entrou');
  let noDisco = false;
  for (let i = 0; i < 20 && !noDisco; i++) { noDisco = !!lerDisco('frota').caminhoes['cam-normal']; if (!noDisco) await esperar(100); }
  assert.ok(noDisco, 'o registro normal chegou ao disco');
});

test('achado 3: uma pasta no lugar do arquivo dá 404 e o servidor continua de pé', async () => {
  const id = 'arq-' + 'ab'.repeat(16);
  const pasta = path.join(DADOS, 'arquivos', 'frota');
  fs.mkdirSync(path.join(pasta, id));
  fs.writeFileSync(path.join(pasta, id + '.json'), JSON.stringify({ nome: 'pasta.pdf', tipo: 'application/pdf' }));
  try {
    const r = await pedir('/frota/api/arquivos/' + id).catch(() => null);
    if (r) await r.arrayBuffer().catch(() => null);
    const eu = await pedir('/api/eu').catch(() => null);
    assert.ok(eu && eu.status === 200, 'o servidor continua respondendo');
    assert.strictEqual(r && r.status, 404);
  } finally { fs.rmSync(path.join(pasta, id), { recursive: true, force: true }); fs.rmSync(path.join(pasta, id + '.json'), { force: true }); }
});

test('achado 10: o arquivo apagado vai para a lixeira, contando os 30 dias a partir de agora', async () => {
  const pdf = Buffer.from('%PDF-1.4\nlixeira\n');
  const meta = await (await subirArquivo('frota', pdf, 'application/pdf', 'lixeira.pdf')).json();
  const velho = new Date(Date.now() - 40 * 86400000); // enviado há 40 dias
  fs.utimesSync(path.join(DADOS, 'arquivos', 'frota', meta.id), velho, velho);
  assert.strictEqual((await pedir('/frota/api/arquivos/' + meta.id, { method: 'DELETE' })).status, 200);
  assert.strictEqual((await pedir('/frota/api/arquivos/' + meta.id)).status, 404);
  const lixeira = path.join(DADOS, 'lixeira', 'frota');
  assert.ok(fs.existsSync(path.join(lixeira, meta.id)), 'o arquivo está na lixeira');
  assert.ok(fs.readFileSync(path.join(lixeira, meta.id)).equals(pdf));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(lixeira, meta.id + '.json'), 'utf8')), { nome: 'lixeira.pdf', tipo: 'application/pdf' });
  assert.ok(!fs.existsSync(path.join(DADOS, 'arquivos', 'frota', meta.id)));
  assert.ok(Date.now() - fs.statSync(path.join(lixeira, meta.id)).mtimeMs < 60000, 'os 30 dias contam da hora em que foi apagado');
});
test('achado 10: ao subir, a lixeira perde o que tem mais de 30 dias e guarda o resto', async () => {
  await descer();
  const lixeira = path.join(DADOS, 'lixeira', 'frota');
  fs.mkdirSync(lixeira, { recursive: true });
  const velho = 'arq-' + '1'.repeat(32), novo = 'arq-' + '2'.repeat(32);
  for (const [id, dias] of [[velho, 31], [novo, 1]]) {
    for (const f of [id, id + '.json']) {
      fs.writeFileSync(path.join(lixeira, f), f.endsWith('.json') ? '{"nome":"a.pdf","tipo":"application/pdf"}' : '%PDF');
      const t = new Date(Date.now() - dias * 86400000);
      fs.utimesSync(path.join(lixeira, f), t, t);
    }
  }
  await subir();
  assert.ok(!fs.existsSync(path.join(lixeira, velho)) && !fs.existsSync(path.join(lixeira, velho + '.json')), 'o de 31 dias saiu');
  assert.ok(fs.existsSync(path.join(lixeira, novo)) && fs.existsSync(path.join(lixeira, novo + '.json')), 'o de 1 dia ficou');
});

test('achado 6: depois de "Sair", a conexão de avisos ao vivo fecha e não recebe mais nada', async () => {
  const x = await entrar();
  const sse = await ouvir('/frota/api/eventos', x);
  try {
    assert.strictEqual(sse.status, 200);
    const r = await fetch(BASE + '/api/sair', { method: 'POST', headers: { cookie: x, 'Content-Type': 'application/json' }, body: '{}' });
    assert.strictEqual(r.status, 200);
    assert.ok(await sse.terminou(2000), 'a conexão de avisos fechou');
    await json('PUT', '/frota/api/dados/motoristas/m-depois-sair', { nome: 'Depois do Sair' });
    await esperar(300);
    assert.doesNotMatch(sse.texto(), /Depois do Sair/);
  } finally { await sse.fim(); }
});
test('achado 6: quando outra entrada troca a senha, a conexão de avisos ao vivo das outras fecha', async () => {
  const x = await entrar();
  const sse = await ouvir('/frota/api/eventos', x);
  try {
    assert.strictEqual(sse.status, 200);
    const nova = 'terceiraSenha7';
    assert.strictEqual((await json('POST', '/api/minha-senha', { atual: senhaAdmin, nova })).status, 200);
    senhaAdmin = nova;
    assert.ok(await sse.terminou(2000), 'a conexão de avisos fechou');
    await json('PUT', '/frota/api/dados/motoristas/m-depois-troca', { nome: 'Depois da Troca' });
    await esperar(300);
    assert.doesNotMatch(sse.texto(), /Depois da Troca/);
  } finally { await sse.fim(); }
});

test('achado 5: 30 senhas erradas ao mesmo tempo não passam do limite de 8', async () => {
  // como o lento.js da revisão: os 30 cabeçalhos vão juntos e os corpos só depois, para todos os pedidos chegarem ao mesmo tempo
  const net = require('node:net');
  const status = await new Promise(ok => {
    const lista = [], conexoes = [];
    let faltam = 30;
    for (let i = 0; i < 30; i++) {
      const corpo = JSON.stringify({ usuario: 'admin', senha: 'errada-junta-' + i });
      const s = net.connect(PORTA, '127.0.0.1');
      let out = '';
      s.on('data', d => { out += d; });
      s.on('error', () => { /* o servidor já respondeu e fechou */ });
      s.on('close', () => { lista.push(out.split(' ')[1] || 'nada'); if (--faltam === 0) ok(lista); });
      s.write(`POST /api/entrar HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nX-Real-IP: 7.7.7.7\r\nContent-Length: ${Buffer.byteLength(corpo)}\r\nConnection: close\r\n\r\n`);
      conexoes.push([s, corpo]);
    }
    setTimeout(() => conexoes.forEach(([s, c]) => { if (!s.destroyed) s.write(c); }), 500);
  });
  const conta = {};
  status.forEach(x => { conta[x] = (conta[x] || 0) + 1; });
  assert.ok((conta['401'] || 0) <= 8, 'no máximo 8 senhas erradas conferidas: ' + JSON.stringify(conta));
  assert.strictEqual((conta['401'] || 0) + (conta['429'] || 0), 30, JSON.stringify(conta));
});

test('achado 1: com o frota.json cortado, o servidor não sobe e não mexe no arquivo', async () => {
  let antes;
  await comServidorAParte('frota-cortado', ({ PASTA_DADOS }) => {
    const inteiro = JSON.stringify({ caminhoes: { 'cam-a': { id: 'cam-a', placa: 'AAA1A11' }, 'cam-b': { id: 'cam-b', placa: 'BBB1B22' }, 'cam-c': { id: 'cam-c', placa: 'CCC1C33' } } });
    antes = Buffer.from(inteiro).subarray(0, 60);
    fs.writeFileSync(path.join(PASTA_DADOS, 'frota.json'), antes);
  }, async (r, { PASTA_DADOS }) => {
    assert.strictEqual(r.subiu, false, 'o servidor não pode subir com o frota.json cortado');
    assert.ok(typeof r.code === 'number' && r.code !== 0, 'sai com código diferente de 0: ' + r.code);
    assert.ok(fs.readFileSync(path.join(PASTA_DADOS, 'frota.json')).equals(antes), 'o frota.json ficou como estava');
    assert.match(r.saida(), /frota\.json/);
    assert.match(r.saida(), /copias/);
  });
});
test('achado 1: com o usuarios.json cortado, o servidor não sobe e a senha inicial não volta', async () => {
  const antes = Buffer.from('[{"usuario":"admin"');
  await comServidorAParte('usuarios-cortado', ({ PASTA_DADOS }) => {
    fs.writeFileSync(path.join(PASTA_DADOS, 'usuarios.json'), antes);
  }, async (r, { PASTA_DADOS }) => {
    assert.strictEqual(r.subiu, false, 'o servidor não pode subir com o usuarios.json cortado');
    assert.ok(typeof r.code === 'number' && r.code !== 0, 'sai com código diferente de 0: ' + r.code);
    assert.ok(fs.readFileSync(path.join(PASTA_DADOS, 'usuarios.json')).equals(antes), 'o usuarios.json ficou como estava');
    assert.match(r.saida(), /usuarios\.json/);
    assert.match(r.saida(), /copias/);
  });
});

test('achado 7: carga com defeito no meio não deixa nada e continua na pasta da carga', async () => {
  await comServidorAParte('carga-com-defeito', ({ PASTA_CARGA }) => {
    const documentos = [], arquivos = {};
    for (let i = 1; i <= 5; i++) {
      documentos.push({ id: 'doc-c' + i, veiculoTipo: 'caminhao', veiculoId: 'cam-c1', tipo: 'CRLV (licenciamento)', arquivo: { id: 'arq-c' + i, nome: `doc${i}.pdf`, tipo: 'application/pdf', onde: 'local' } });
      arquivos['arq-c' + i] = { tipo: 'application/pdf', nome: `doc${i}.pdf`, dados: i === 4 ? 123 : Buffer.from('%PDF-1.4\n% doc ' + i + '\n').toString('base64') };
    }
    fs.writeFileSync(path.join(PASTA_CARGA, 'frota.json'), JSON.stringify({
      app: 'sistema-carlise', versao: 1,
      dados: { caminhoes: [{ id: 'cam-c1', placa: 'CRG1A01' }, { id: 'cam-c2', placa: 'CRG1A02' }], documentos },
      arquivos,
    }));
  }, async (r, { PASTA_DADOS, PASTA_CARGA }) => {
    assert.ok(r.subiu, 'o servidor sobe mesmo com a carga com defeito:\n' + r.saida());
    const c = await entrar('senhaTeste1');
    const f = await (await fetch(BASE + '/frota/api/dados', { headers: { cookie: c } })).json();
    assert.strictEqual(f.caminhoes.length, 0, 'nenhum caminhão');
    assert.strictEqual(f.documentos.length, 0, 'nenhum documento');
    const pastaArq = path.join(PASTA_DADOS, 'arquivos', 'frota');
    assert.deepStrictEqual(fs.existsSync(pastaArq) ? fs.readdirSync(pastaArq) : [], [], 'nenhum arquivo gravado');
    const arqDados = path.join(PASTA_DADOS, 'frota.json');
    if (fs.existsSync(arqDados)) {
      const d = JSON.parse(fs.readFileSync(arqDados, 'utf8'));
      assert.strictEqual(Object.keys(d.caminhoes || {}).length + Object.keys(d.documentos || {}).length, 0, 'nada no frota.json');
    }
    assert.ok(fs.existsSync(path.join(PASTA_CARGA, 'frota.json')), 'a carga continua em carga/');
    assert.match(r.saida(), /não entrou/);
  });
});

// ---------- RH: funcionários, link do ponto e correção ----------
const lerRH = async () => (await pedir('/rh/api/dados')).json();
async function funcionario(id, extra = {}) {
  const r = await json('PUT', '/rh/api/dados/funcionarios/' + id, Object.assign({ nome: 'Func ' + id, cpf: '12345678901', cargo: 'Motorista', jornadaMin: 528, situacao: 'ativo' }, extra));
  assert.strictEqual(r.status, 200);
  const l = await json('POST', '/rh/api/link/' + id, {});
  assert.strictEqual(l.status, 200);
  return (await l.json()).token;
}
test('RH: abre com login e a API do RH sem login dá 401', async () => {
  const p = await pedir('/rh/');
  assert.strictEqual(p.status, 200);
  assert.match(await p.text(), /"sistema":"rh"/);
  for (const [metodo, rota] of [['GET', '/rh/api/dados'], ['POST', '/rh/api/link/f1'], ['POST', '/rh/api/pontos'], ['GET', '/rh/api/arquivos/arq-' + '0'.repeat(32)]]) {
    const r = await fetch(BASE + rota, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: metodo === 'GET' ? undefined : '{}' });
    assert.strictEqual(r.status, 401, metodo + ' ' + rota);
  }
});
test('RH: pontos e links só o servidor grava (403 pela API de dados e pelo lote)', async () => {
  for (const col of ['pontos', 'links']) {
    assert.strictEqual((await json('PUT', `/rh/api/dados/${col}/x1`, { a: 1 })).status, 403, 'PUT ' + col);
    assert.strictEqual((await json('DELETE', `/rh/api/dados/${col}/x1`)).status, 403, 'DELETE ' + col);
    assert.strictEqual((await json('POST', '/rh/api/lote', { ops: [{ tipo: 'set', col: 'funcionarios', obj: { id: 'f-lote' } }, { tipo: 'set', col, obj: { id: 'x1' } }] })).status, 403, 'lote ' + col);
  }
  const d = await lerRH();
  assert.ok(!d.funcionarios.some(f => f.id === 'f-lote'), 'o lote recusado não gravou nada');
});
test('RH: gerar link novo troca o token', async () => {
  const t1 = await funcionario('f-link');
  assert.match(t1, /^[A-Za-z0-9_-]{32}$/);
  const t2 = (await (await json('POST', '/rh/api/link/f-link', {})).json()).token;
  assert.match(t2, /^[A-Za-z0-9_-]{32}$/);
  assert.notStrictEqual(t1, t2);
  assert.strictEqual((await lerRH()).links.find(l => l.id === 'f-link').token, t2);
  assert.strictEqual((await json('POST', '/rh/api/link/nao-existe', {})).status, 404);
});
test('RH: inclusão e correção pedem justificativa, guardam quem e quando, e o original continua', async () => {
  await funcionario('f-cor');
  const base = { funcionarioId: 'f-cor', tipo: 'entrada', data: '2026-10-05', hora: '08:00' };
  const com = extra => Object.assign({}, base, extra);
  assert.strictEqual((await json('POST', '/rh/api/pontos', base)).status, 400, 'sem justificativa');
  assert.strictEqual((await json('POST', '/rh/api/pontos', com({ justificativa: '   ' }))).status, 400, 'justificativa em branco');
  assert.strictEqual((await json('POST', '/rh/api/pontos', com({ hora: '25:00', justificativa: 'x' }))).status, 400, 'hora errada');
  assert.strictEqual((await json('POST', '/rh/api/pontos', com({ tipo: 'almoco', justificativa: 'x' }))).status, 400, 'tipo errado');
  assert.strictEqual((await json('POST', '/rh/api/pontos', com({ data: '2026-02-30', justificativa: 'x' }))).status, 400, 'data errada');
  assert.strictEqual((await json('POST', '/rh/api/pontos', com({ funcionarioId: 'nao-existe', justificativa: 'x' }))).status, 404);
  let r = await json('POST', '/rh/api/pontos', com({ justificativa: 'Esqueceu de bater', por: 'outro', alteradoEm: '2000-01-01T00:00:00Z', origem: 'celular' }));
  assert.strictEqual(r.status, 200);
  const inc = (await r.json()).ponto;
  assert.strictEqual(inc.origem, 'rh');
  assert.strictEqual(inc.por, 'admin', 'quem mudou é quem está logado');
  assert.ok(Math.abs(Date.now() - Date.parse(inc.alteradoEm)) < 60000, 'quando mudou é a hora do servidor');
  assert.strictEqual(inc.justificativa, 'Esqueceu de bater');
  r = await json('POST', '/rh/api/pontos', { substitui: inc.id, tipo: 'entrada', data: '2026-10-05', hora: '07:55', justificativa: 'Chegou antes' });
  assert.strictEqual(r.status, 200);
  const cor = (await r.json()).ponto;
  assert.strictEqual(cor.substitui, inc.id);
  assert.strictEqual(cor.funcionarioId, 'f-cor');
  assert.strictEqual(cor.hora, '07:55');
  assert.deepStrictEqual((await lerRH()).pontos.find(p => p.id === inc.id), inc, 'o original continua igual');
  assert.strictEqual((await json('POST', '/rh/api/pontos', { substitui: inc.id, anulado: true, justificativa: 'de novo' })).status, 409, 'o original já foi corrigido');
  assert.strictEqual((await json('POST', '/rh/api/pontos', { substitui: 'pt-nao-existe', anulado: true, justificativa: 'x' })).status, 404);
  r = await json('POST', '/rh/api/pontos', { substitui: cor.id, anulado: true, justificativa: 'Registro duplicado' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).ponto.anulado, true);
});

// ---------- RH: ponto pelo celular (sem login, só com o link pessoal) ----------
const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(200, 7), Buffer.from([0xFF, 0xD9])]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(100, 3)]);
const LOCAL = { 'X-Lat': '-26.8766', 'X-Lon': '-52.4036', 'X-Precisao': '12' };
// fetch sem cookie: o ponto não usa login
const registrar = (token, foto = JPEG, tipo = 'image/jpeg', cab = LOCAL) => fetch(`${BASE}/ponto/${token}/registrar`, { method: 'POST', headers: Object.assign({ 'Content-Type': tipo }, cab), body: foto });
const fotosNoDisco = () => { const p = path.join(DADOS, 'arquivos', 'rh'); return fs.existsSync(p) ? fs.readdirSync(p).length : 0; };
const pontosDe = async fid => (await lerRH()).pontos.filter(p => p.funcionarioId === fid);
const diaNoFuso = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

test('Ponto: token válido registra entrada e depois saída, com a hora do servidor', async () => {
  const tok = await funcionario('f-ponto', { nome: 'Ana <Souza>' });
  const pg = await fetch(`${BASE}/ponto/${tok}`);
  assert.strictEqual(pg.status, 200);
  const html = await pg.text();
  assert.ok(html.includes('Ana &lt;Souza&gt;'), 'o nome aparece como texto');
  assert.ok(!html.includes('<Souza>'), 'o nome não vira HTML');
  assert.match(html, /capture="user"/);
  assert.match(html, /"proximo":"entrada"/);
  const antes = Date.now();
  // a hora que o celular mandar não conta
  let r = await registrar(tok, JPEG, 'image/jpeg', Object.assign({ 'X-Hora': '2000-01-01T03:00:00Z', Date: 'Sat, 01 Jan 2000 03:00:00 GMT' }, LOCAL));
  assert.strictEqual(r.status, 200);
  const c1 = await r.json();
  assert.strictEqual(c1.tipo, 'entrada');
  assert.strictEqual(c1.proximo, 'saida');
  assert.strictEqual(c1.nome, 'Ana <Souza>');
  assert.match(c1.hora, /^\d{2}:\d{2}$/);
  r = await registrar(tok, PNG, 'image/png');
  assert.strictEqual(r.status, 200);
  const c2 = await r.json();
  assert.strictEqual(c2.tipo, 'saida');
  assert.strictEqual(c2.proximo, 'entrada');
  const depois = Date.now();
  const meus = await pontosDe('f-ponto');
  assert.deepStrictEqual(meus.map(p => p.tipo), ['entrada', 'saida']);
  for (const [p, foto, tipo] of [[meus[0], JPEG, 'image/jpeg'], [meus[1], PNG, 'image/png']]) {
    const t = Date.parse(p.em);
    assert.ok(t >= antes - 1000 && t <= depois + 1000, 'hora do servidor: ' + p.em);
    assert.strictEqual(p.data, diaNoFuso(p.em), 'o dia é o de Xanxerê');
    assert.strictEqual(p.origem, 'celular');
    assert.strictEqual(p.lat, -26.8766);
    assert.strictEqual(p.lon, -52.4036);
    assert.strictEqual(p.precisao, 12);
    const b = await pedir('/rh/api/arquivos/' + p.foto.id);
    assert.strictEqual(b.status, 200);
    assert.strictEqual(b.headers.get('content-type'), tipo);
    assert.ok(Buffer.from(await b.arrayBuffer()).equals(foto), 'a foto guardada é a enviada');
  }
  assert.match(await (await fetch(`${BASE}/ponto/${tok}`)).text(), /"proximo":"entrada"/);
});
test('Ponto: token inválido dá 404', async () => {
  for (const tok of ['nao-vale', 'A'.repeat(32)]) {
    assert.strictEqual((await fetch(`${BASE}/ponto/${tok}`)).status, 404, 'página ' + tok);
    assert.strictEqual((await registrar(tok)).status, 404, 'registrar ' + tok);
  }
  assert.strictEqual((await fetch(`${BASE}/ponto/`, { redirect: 'manual' })).status, 404);
});
test('Ponto: link trocado faz o antigo parar de valer', async () => {
  const velho = await funcionario('f-troca');
  assert.strictEqual((await fetch(`${BASE}/ponto/${velho}`)).status, 200);
  const novo = (await (await json('POST', '/rh/api/link/f-troca', {})).json()).token;
  assert.strictEqual((await fetch(`${BASE}/ponto/${velho}`)).status, 404);
  assert.strictEqual((await registrar(velho)).status, 404);
  assert.strictEqual((await fetch(`${BASE}/ponto/${novo}`)).status, 200);
  assert.deepStrictEqual(await pontosDe('f-troca'), []);
});
test('Ponto: funcionário desligado dá 404', async () => {
  const tok = await funcionario('f-desl');
  assert.strictEqual((await json('PUT', '/rh/api/dados/funcionarios/f-desl', { nome: 'Func f-desl', situacao: 'desligado' })).status, 200);
  assert.strictEqual((await fetch(`${BASE}/ponto/${tok}`)).status, 404);
  assert.strictEqual((await registrar(tok)).status, 404);
});
test('Ponto: foto grande demais, de outro tipo ou vazia é recusada e nada fica gravado', async () => {
  const tok = await funcionario('f-foto');
  const fotos = fotosNoDisco();
  const grande = Buffer.concat([JPEG.subarray(0, 4), Buffer.alloc(3 * 1024 * 1024)]);
  assert.strictEqual((await registrar(tok, grande)).status, 413, 'mais de 3 MB');
  assert.strictEqual((await registrar(tok, Buffer.from('GIF89a' + 'x'.repeat(50)), 'image/gif')).status, 415, 'GIF');
  assert.strictEqual((await registrar(tok, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')).status, 415, 'SVG');
  assert.strictEqual((await registrar(tok, Buffer.from('<html>não é foto</html>'), 'image/jpeg')).status, 415, 'diz que é JPEG e não é');
  assert.strictEqual((await registrar(tok, PNG, 'image/jpeg')).status, 415, 'PNG dizendo que é JPEG');
  const vazia = await registrar(tok, Buffer.alloc(0));
  assert.strictEqual(vazia.status, 400, 'sem foto');
  assert.match((await vazia.json()).erro, /foto/i);
  assert.deepStrictEqual(await pontosDe('f-foto'), []);
  assert.strictEqual(fotosNoDisco(), fotos, 'nenhuma foto ficou no disco');
});
test('Ponto: sem localização não registra e explica', async () => {
  const tok = await funcionario('f-local');
  const fotos = fotosNoDisco();
  for (const cab of [{}, { 'X-Lat': '', 'X-Lon': '' }, { 'X-Lat': 'abc', 'X-Lon': '-52.4' }, { 'X-Lat': '-95', 'X-Lon': '-52.4' }, { 'X-Lat': '-26.8', 'X-Lon': '181' }, { 'X-Lat': '-26.8' }]) {
    const r = await registrar(tok, JPEG, 'image/jpeg', cab);
    assert.strictEqual(r.status, 400, JSON.stringify(cab));
    assert.match((await r.json()).erro, /localiza/i);
  }
  assert.deepStrictEqual(await pontosDe('f-local'), []);
  assert.strictEqual(fotosNoDisco(), fotos);
});
test('Ponto: a rota do ponto não lê nem grava outras coleções', async () => {
  const tok = await funcionario('f-iso', { cpf: '98765432100' });
  const tokOutro = await funcionario('f-outro', { nome: 'Outro Funcionário Secreto' });
  const disco = sis => fs.readFileSync(path.join(DADOS, sis + '.json'));
  const frota = disco('frota'), operacao = disco('operacao');
  const antes = await lerRH();
  for (const rota of [`/ponto/${tok}/dados`, `/ponto/${tok}/api/dados`, `/ponto/${tok}/registrar`, `/ponto/${tok}/x/registrar`, `/ponto/${tok}/../rh/api/dados`]) {
    const r = await fetch(BASE + rota, { redirect: 'manual' });
    assert.ok(r.status === 404 || r.status === 401, rota + ' dá ' + r.status);
    assert.doesNotMatch(await r.text(), /Outro Funcionário|98765432100|f-outro/, rota);
  }
  const html = await (await fetch(`${BASE}/ponto/${tok}`)).text();
  for (const x of ['Outro Funcionário Secreto', '98765432100', tokOutro, 'f-outro', 'Motorista']) assert.ok(!html.includes(x), 'a página não traz ' + x);
  // não dá para mandar outro funcionário nem outra coleção pelo corpo
  assert.strictEqual((await fetch(`${BASE}/ponto/${tok}/registrar`, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, LOCAL), body: JSON.stringify({ funcionarioId: 'f-outro', col: 'funcionarios' }) })).status, 415);
  const r = await registrar(tok, JPEG, 'image/jpeg', Object.assign({ 'X-Funcionario': 'f-outro' }, LOCAL));
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(Object.keys(await r.json()).sort(), ['data', 'hora', 'nome', 'ok', 'proximo', 'tipo'], 'o comprovante não traz mais nada');
  const depois = await lerRH();
  assert.deepStrictEqual(depois.funcionarios, antes.funcionarios, 'funcionários iguais');
  assert.deepStrictEqual(depois.links, antes.links, 'links iguais');
  const novos = depois.pontos.filter(p => !antes.pontos.some(a => a.id === p.id));
  assert.strictEqual(novos.length, 1);
  assert.strictEqual(novos[0].funcionarioId, 'f-iso');
  assert.ok(disco('frota').equals(frota), 'frota.json igual');
  assert.ok(disco('operacao').equals(operacao), 'operacao.json igual');
});
test('Ponto: registro do RH com data no futuro não muda o botão de hoje', async () => {
  const tok = await funcionario('f-futuro');
  assert.strictEqual((await json('POST', '/rh/api/pontos', { funcionarioId: 'f-futuro', tipo: 'entrada', data: '2099-01-01', hora: '08:00', justificativa: 'data digitada errada' })).status, 200);
  assert.match(await (await fetch(`${BASE}/ponto/${tok}`)).text(), /"ultimo":null/, 'o último registro é o de hoje ou de antes');
  assert.strictEqual((await (await registrar(tok)).json()).tipo, 'entrada');
  assert.strictEqual((await (await registrar(tok)).json()).tipo, 'saida');
});
test('Ponto: dois toques seguidos ou ao mesmo tempo viram um registro só, e o celular tem limite por dia', async () => {
  const hoje = diaNoFuso(new Date().toISOString());
  const TOK_DUP = 'D'.repeat(32), TOK_CAP = 'C'.repeat(32);
  const pontos = {};
  for (let i = 0; i < 12; i++) pontos['pt-cap' + i] = { id: 'pt-cap' + i, funcionarioId: 'f-cap', tipo: i % 2 ? 'saida' : 'entrada', data: hoje, hora: '00:' + String(i).padStart(2, '0'), em: new Date(Date.now() - 600000).toISOString(), origem: 'celular' };
  await comServidorAParte('ponto-intervalo', pastas => {
    pastas.PONTO_INTERVALO_S = ''; // o padrão do servidor
    fs.writeFileSync(path.join(pastas.PASTA_DADOS, 'rh.json'), JSON.stringify({
      funcionarios: { 'f-dup': { id: 'f-dup', nome: 'Dup', situacao: 'ativo' }, 'f-cap': { id: 'f-cap', nome: 'Cap', situacao: 'ativo' } },
      links: { 'f-dup': { id: 'f-dup', token: TOK_DUP }, 'f-cap': { id: 'f-cap', token: TOK_CAP } },
      pontos,
    }));
  }, async (r, { PASTA_DADOS }) => {
    assert.ok(r.subiu, r.saida());
    const st = (await Promise.all([registrar(TOK_DUP), registrar(TOK_DUP)])).map(x => x.status).sort();
    assert.deepStrictEqual(st, [200, 409], 'ao mesmo tempo');
    const outro = await registrar(TOK_DUP);
    assert.strictEqual(outro.status, 409, 'logo depois');
    const d = await outro.json();
    assert.match(d.erro, /já registrou entrada às \d{2}:\d{2}/);
    assert.strictEqual(d.proximo, 'saida');
    const noDisco = JSON.parse(fs.readFileSync(path.join(PASTA_DADOS, 'rh.json'), 'utf8')).pontos;
    assert.strictEqual(Object.values(noDisco).filter(p => p.funcionarioId === 'f-dup').length, 1);
    const fotos = fs.readdirSync(path.join(PASTA_DADOS, 'arquivos', 'rh')).length;
    assert.strictEqual((await registrar(TOK_CAP)).status, 429, 'mais de 12 pelo celular no dia');
    assert.strictEqual(fs.readdirSync(path.join(PASTA_DADOS, 'arquivos', 'rh')).length, fotos, 'a foto recusada não fica no disco');
  });
});

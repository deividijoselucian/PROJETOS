'use strict';
/* Testes de tela do Painel Deconto (Playwright). Rodar: node --test painel/testes/telas.test.js
   Sobe o servidor num processo filho, com pastas temporárias e as páginas de verdade
   (DECONTO e Controle de Operação), e usa o Chromium do Playwright. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const PORTA = Number(process.env.PORTA_TESTE) || 3398; // outra porta quando duas cópias rodam ao mesmo tempo
const BASE = `http://127.0.0.1:${PORTA}`;
const RAIZ = path.join(__dirname, '..', '..');
const SERVIDOR = path.join(__dirname, '..', 'servidor', 'servidor.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-telas-'));
const DADOS = path.join(tmp, 'data');
const PUBLICO = path.join(tmp, 'publico');
const CARGA = path.join(tmp, 'carga');
const ARQS_FROTA = path.join(DADOS, 'arquivos', 'frota');
const SENHA = 'senhaTeste1';

fs.mkdirSync(PUBLICO, { recursive: true });
fs.mkdirSync(CARGA, { recursive: true });
fs.copyFileSync(path.join(RAIZ, 'sistema-carlise', 'frota.html'), path.join(PUBLICO, 'frota.html'));
fs.copyFileSync(path.join(RAIZ, 'munck', 'munck.html'), path.join(PUBLICO, 'operacao.html'));
fs.copyFileSync(path.join(RAIZ, 'rh', 'rh.html'), path.join(PUBLICO, 'rh.html'));

/* PDF mínimo, com um texto para cada um ficar diferente */
function pdfMinimo(texto) {
  return Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\n% ${texto}\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
}
const PDF_TELA = pdfMinimo('documento da tela');
const ARQ_PDF = path.join(tmp, 'CRLV-teste.pdf');
fs.writeFileSync(ARQ_PDF, PDF_TELA);

let proc = null;
let navegador = null;
let testeAtual = '';
const errosDePagina = [];
const abertos = [];

function subir() {
  return new Promise((ok, falha) => {
    proc = spawn(process.execPath, [SERVIDOR], { env: Object.assign({}, process.env, { PORTA: String(PORTA), HOST: '127.0.0.1', PAINEL_SENHA: SENHA, PASTA_DADOS: DADOS, PASTA_PUBLICO: PUBLICO, PASTA_CARGA: CARGA, PONTO_INTERVALO_S: '0' }), stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    proc.stdout.on('data', c => { saida += c; if (saida.includes('Painel Deconto em')) ok(); });
    proc.stderr.on('data', c => { saida += c; });
    proc.on('exit', code => falha(new Error('servidor saiu: ' + code + '\n' + saida)));
    setTimeout(() => falha(new Error('servidor não subiu:\n' + saida)), 15000);
  });
}
function descer() { return new Promise(ok => { if (!proc) return ok(); proc.removeAllListeners('exit'); proc.on('exit', () => ok()); proc.kill('SIGTERM'); }); }
/* reinício do Node (como numa atualização): os dados e as sessões ficam no disco */
async function reiniciar() { await descer(); proc = null; await subir(); }

before(async () => {
  await subir();
  navegador = await chromium.launch(process.env.PW_CANAL ? { channel: process.env.PW_CANAL } : {});
});
after(async () => {
  if (navegador) await navegador.close().catch(() => {});
  await descer();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* cada teste abre os seus navegadores (contextos) e eles fecham no fim do teste */
function teste(nome, fn) {
  test(nome, { timeout: 180000 }, async t => {
    testeAtual = nome;
    try { await fn(t); } finally { for (const c of abertos.splice(0)) await c.close().catch(() => {}); }
  });
}
async function contexto(opc = {}) {
  const ctx = await navegador.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }, opc));
  abertos.push(ctx);
  // só o servidor de teste: fontes e qualquer outro endereço de fora não carregam
  await ctx.route(u => /^https?:$/.test(u.protocol) && u.host !== `127.0.0.1:${PORTA}`, r => r.abort());
  ctx.on('page', p => p.on('pageerror', e => errosDePagina.push(`[${testeAtual}] ${p.url()}: ${e.message}`)));
  return ctx;
}
/* contexto já com login (pela API de login, que guarda o cookie no contexto) */
async function logado(opc) {
  const ctx = await contexto(opc);
  const r = await ctx.request.post(BASE + '/api/entrar', { data: { usuario: 'admin', senha: SENHA } });
  assert.strictEqual(r.status(), 200, 'login pela API');
  return ctx;
}
async function abrir(ctx, rota) {
  const p = await ctx.newPage();
  await p.goto(BASE + rota);
  return p;
}
const esperarServidor = (p, timeout = 15000) => p.waitForFunction(() => { const e = document.querySelector('#estado'); return !!e && e.textContent.trim() === 'Salvo no servidor'; }, null, { timeout });
const limparToast = p => p.evaluate(() => { const t = document.querySelector('#toast'); if (t) t.textContent = ''; });
const esperarToast = (p, trecho, timeout = 15000) => p.waitForFunction(x => { const t = document.querySelector('#toast'); return !!t && t.textContent.includes(x); }, trecho, { timeout });
const textoToast = p => p.evaluate(() => (document.querySelector('#toast') || {}).textContent || '');
async function dados(ctx, sis) {
  const r = await ctx.request.get(`${BASE}/${sis}/api/dados`);
  assert.strictEqual(r.status(), 200);
  return r.json();
}
const arquivosNoDisco = () => (fs.existsSync(ARQS_FROTA) ? fs.readdirSync(ARQS_FROTA).filter(n => !n.endsWith('.json')).length : 0);
const larguraDaPagina = p => p.evaluate(() => document.documentElement.scrollWidth);

// ---------- 1. login, tela inicial e DECONTO pelo cartão ----------
teste('login e tela inicial mostram os 6 cartões; DECONTO abre pelo cartão e mostra "Salvo no servidor"', async () => {
  const ctx = await contexto();
  const p = await ctx.newPage();
  await p.goto(BASE + '/');
  assert.match(p.url(), /\/entrar$/, 'sem login vai para /entrar');
  await p.fill('#usuario', 'admin');
  await p.fill('#senha', SENHA);
  await p.click('#ir');
  await p.waitForURL(BASE + '/');
  const nomes = await p.$$eval('.cartao h2', hs => hs.map(h => h.textContent.trim()));
  assert.deepStrictEqual(nomes, ['DECONTO', 'Controle de Operação', 'RH', 'Financeiro', 'Cargas', 'Monitoramento de Frota', 'Estoque']);
  assert.strictEqual(await p.locator('a.cartao[href="/estoque/"]').count(), 1);
  assert.strictEqual(await p.locator('a.cartao[href="/frota/"]').count(), 1);
  assert.strictEqual(await p.locator('a.cartao[href="/operacao/"]').count(), 1);
  assert.strictEqual(await p.locator('a.cartao[href="/rh/"]').count(), 1);
  const breves = await p.$$eval('.cartao.breve', cs => cs.map(c => c.querySelector('h2').textContent.trim() + ': ' + c.textContent));
  assert.strictEqual(breves.length, 3);
  for (const [i, nome] of ['Financeiro', 'Cargas', 'Monitoramento de Frota'].entries()) {
    assert.ok(breves[i].startsWith(nome + ':'), 'cartão em desenvolvimento: ' + nome);
    assert.match(breves[i], /Em desenvolvimento/);
  }
  await p.click('a.cartao[href="/frota/"]');
  await p.waitForURL(BASE + '/frota/');
  await esperarServidor(p);
  assert.strictEqual(await p.evaluate(() => window.PAINEL && window.PAINEL.sistema), 'frota');
  assert.strictEqual(await p.title(), 'DECONTO');
});

// ---------- 2. caminhão pela tela e o outro navegador vê ----------
teste('DECONTO: cadastrar caminhão pela tela e outro navegador vê em até 2 s sem recarregar', async () => {
  const a = await abrir(await logado(), '/frota/#frota');
  const b = await abrir(await logado(), '/frota/#frota');
  await esperarServidor(a);
  await esperarServidor(b);
  await b.evaluate(() => { window.__semRecarregar = 'sim'; });
  assert.ok(!(await b.textContent('#t-cam')).includes('TST2B34'));
  await a.click('#v-frota [data-acao="abrir-form"][data-form="f-cam"]');
  await a.fill('#cam-placa', 'tst2b34');
  await a.fill('#cam-modelo', 'FH 460');
  await a.click('#f-cam button[type="submit"]');
  const t0 = Date.now();
  await b.waitForFunction(() => document.querySelector('#t-cam').textContent.includes('TST2B34'), null, { timeout: 2000 });
  const ms = Date.now() - t0;
  assert.ok(ms <= 2000, 'o outro navegador viu em ' + ms + ' ms');
  assert.strictEqual(await b.evaluate(() => window.__semRecarregar), 'sim', 'o outro navegador não recarregou');
  await esperarToast(a, 'TST2B34');
  // a tela redesenha no quadro seguinte (requestAnimationFrame), logo depois do aviso
  await a.waitForFunction(() => document.querySelector('#t-cam').textContent.includes('TST2B34'), null, { timeout: 2000 });
  const f = await dados(a.context(), 'frota');
  assert.ok(f.caminhoes.some(c => c.placa === 'TST2B34' && c.modelo === 'FH 460'), 'gravado no servidor');
});

// ---------- 3. documento com PDF ----------
teste('DECONTO: documento com PDF anexado fica com o arquivo no servidor e a API devolve os mesmos bytes', async () => {
  const ctx = await logado();
  const p = await abrir(ctx, '/frota/#documentos');
  await esperarServidor(p);
  const cam = (await dados(ctx, 'frota')).caminhoes.find(c => c.placa === 'TST2B34');
  assert.ok(cam, 'o caminhão do teste anterior existe');
  await p.selectOption('#doc-veic', 'caminhao:' + cam.id);
  await p.selectOption('#doc-tipo', 'CRLV (licenciamento)');
  await p.fill('#doc-num', '123456');
  await p.fill('#doc-venc', '2027-06-30');
  await p.setInputFiles('#doc-arquivo', ARQ_PDF);
  await limparToast(p);
  await p.click('#f-doc button[type="submit"]');
  await esperarToast(p, 'salvo');
  const docs = (await dados(ctx, 'frota')).documentos.filter(d => d.veiculoId === cam.id);
  assert.strictEqual(docs.length, 1);
  const a = docs[0].arquivo;
  assert.ok(a, 'o documento tem arquivo');
  assert.strictEqual(a.onde, 'servidor');
  assert.match(a.id, /^arq-[0-9a-f]{32}$/);
  assert.strictEqual(a.nome, 'CRLV-teste.pdf');
  const r = await ctx.request.get(`${BASE}/frota/api/arquivos/${a.id}`);
  assert.strictEqual(r.status(), 200);
  assert.strictEqual(r.headers()['content-type'], 'application/pdf');
  assert.ok((await r.body()).equals(PDF_TELA), 'mesmos bytes');
});

// ---------- 4. carregar uma cópia com 20 documentos e PDFs embutidos ----------
function copiaInventada() {
  const caminhoes = [], documentos = [], arquivos = {};
  for (let i = 0; i < 20; i++) {
    const n = String(i).padStart(2, '0');
    const placa = 'TST1A' + n;
    const pdf = pdfMinimo('CRLV ' + placa);
    caminhoes.push({ id: 'cam-tst1a' + n, placa, tipo: 'Truck', situacao: 'ativo', criadoEm: '2026-11-01T10:00:00.000Z' });
    documentos.push({ id: 'doc-tst-' + n, veiculoTipo: 'caminhao', veiculoId: 'cam-tst1a' + n, tipo: 'CRLV (licenciamento)', numero: '9' + n, vencimento: '2027-10-31',
      arquivo: { id: 'arq-local-' + n, nome: 'CRLV-' + placa + '.pdf', tipo: 'application/pdf', tamanho: pdf.length, onde: 'local' }, criadoEm: '2026-11-01T10:00:00.000Z' });
    arquivos['arq-local-' + n] = { tipo: 'application/pdf', nome: 'CRLV-' + placa + '.pdf', dados: pdf.toString('base64') };
  }
  return { app: 'sistema-carlise', versao: 1, salvoEm: '2026-11-01T10:00:00.000Z', dados: { caminhoes, semirreboques: [], motoristas: [], dias: [], abastecimentos: [], manutencoes: [], trocas: [], documentos, config: [] }, arquivos };
}
teste('DECONTO: "Carregar uma cópia" com 20 documentos e PDFs guarda os 20 no servidor, e carregar de novo não cria arquivos', async () => {
  const ctx = await logado();
  const p = await abrir(ctx, '/frota/#frota');
  await esperarServidor(p);
  const copia = copiaInventada();
  const buffer = Buffer.from(JSON.stringify(copia));
  const doTeste = f => f.documentos.filter(d => d.id.startsWith('doc-tst-'));
  const antes = arquivosNoDisco();

  await limparToast(p);
  await p.setInputFiles('#arquivo-copia', { name: 'copia-teste.json', mimeType: 'application/json', buffer });
  await esperarToast(p, 'Cópia carregada', 60000);
  const toast1 = await textoToast(p);
  assert.doesNotMatch(toast1, /não pude|não puderam/, 'todos os arquivos guardados: ' + toast1);
  let docs = doTeste(await dados(ctx, 'frota'));
  assert.strictEqual(docs.length, 20);
  const semServidor = docs.filter(d => !d.arquivo || d.arquivo.onde !== 'servidor' || !/^arq-[0-9a-f]{32}$/.test(d.arquivo.id));
  assert.deepStrictEqual(semServidor.map(d => d.id), [], 'todos com arquivo no servidor');
  assert.strictEqual(arquivosNoDisco(), antes + 20, '20 arquivos novos no disco');
  const d07 = docs.find(d => d.id === 'doc-tst-07');
  const r = await ctx.request.get(`${BASE}/frota/api/arquivos/${d07.arquivo.id}`);
  assert.ok((await r.body()).equals(Buffer.from(copia.arquivos['arq-local-07'].dados, 'base64')), 'o PDF do doc 07 é o da cópia');
  const ids1 = Object.fromEntries(docs.map(d => [d.id, d.arquivo.id]));
  assert.strictEqual(await p.evaluate(() => todos('documentos').filter(d => d.id.startsWith('doc-tst-') && d.arquivo && d.arquivo.onde === 'servidor').length), 20, 'a tela também tem os 20');

  // de novo, a mesma cópia
  await limparToast(p);
  await p.setInputFiles('#arquivo-copia', { name: 'copia-teste.json', mimeType: 'application/json', buffer });
  await esperarToast(p, 'Cópia carregada', 60000);
  await p.waitForTimeout(500);
  docs = doTeste(await dados(ctx, 'frota'));
  assert.strictEqual(docs.length, 20, 'continua com 20 documentos');
  assert.ok(docs.every(d => d.arquivo && d.arquivo.onde === 'servidor'), 'todos continuam com arquivo no servidor');
  assert.deepStrictEqual(Object.fromEntries(docs.map(d => [d.id, d.arquivo.id])), ids1, 'os documentos apontam para os mesmos arquivos');
  assert.strictEqual(arquivosNoDisco(), antes + 20, 'nenhum arquivo novo no disco');
});

// ---------- 5. salvar cópia de tudo ----------
teste('DECONTO: "Salvar cópia de tudo" no modo servidor gera um .json com os arquivos embutidos', async () => {
  const ctx = await logado();
  const p = await abrir(ctx, '/frota/#frota');
  await esperarServidor(p);
  const [baixado] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#sec-dados [data-acao="backup"]')]);
  assert.match(baixado.suggestedFilename(), /^sistema-carlise-copia-\d{4}-\d{2}-\d{2}\.json$/);
  const copia = JSON.parse(fs.readFileSync(await baixado.path(), 'utf8'));
  assert.strictEqual(copia.app, 'sistema-carlise');
  const f = await dados(ctx, 'frota');
  assert.strictEqual(copia.dados.documentos.length, f.documentos.length);
  assert.strictEqual(copia.dados.caminhoes.length, f.caminhoes.length);
  const comArquivo = f.documentos.filter(d => d.arquivo && d.arquivo.onde === 'servidor');
  assert.ok(comArquivo.length >= 21, 'documentos com arquivo: ' + comArquivo.length);
  for (const d of comArquivo) {
    const e = copia.arquivos && copia.arquivos[d.arquivo.id];
    assert.ok(e && e.dados, 'arquivo embutido para ' + d.id);
    const r = await ctx.request.get(`${BASE}/frota/api/arquivos/${d.arquivo.id}`);
    assert.ok(Buffer.from(e.dados, 'base64').equals(await r.body()), 'mesmos bytes do servidor para ' + d.id);
  }
});

// ---------- 6. voltar ao painel e sair ----------
teste('"← Painel Deconto" volta para a tela inicial e "Sair" leva para /entrar, e depois a API dá 401', async () => {
  for (const sis of ['frota', 'operacao']) {
    const ctx = await logado();
    const p = await abrir(ctx, `/${sis}/`);
    await esperarServidor(p);
    const link = p.locator('#quem a', { hasText: '← Painel Deconto' });
    assert.ok(await link.isVisible(), 'link visível em ' + sis);
    assert.strictEqual(await link.getAttribute('href'), '/');
    await link.click();
    await p.waitForURL(BASE + '/');
    assert.strictEqual(await p.locator('.cartao').count(), 7, 'tela inicial depois de ' + sis);
    await p.goto(`${BASE}/${sis}/`);
    await esperarServidor(p);
    await p.click('#quem [data-acao="sair"]');
    await p.waitForURL(BASE + '/entrar');
    const r = await ctx.request.get(`${BASE}/${sis}/api/dados`);
    assert.strictEqual(r.status(), 401, 'depois de sair de ' + sis);
    const r2 = await ctx.request.get(`${BASE}/frota/api/dados`);
    assert.strictEqual(r2.status(), 401, '/frota/api/dados depois de sair de ' + sis);
  }
});

// ---------- 7. Controle de Operação ----------
teste('Controle de Operação: abre pelo cartão, agenda pelo quadro e o outro navegador vê, sem Mapa e Obras, e carrega cópia "controle-munck"', async () => {
  const ctxA = await logado();
  const a = await abrir(ctxA, '/');
  await a.click('a.cartao[href="/operacao/"]');
  await a.waitForURL(BASE + '/operacao/');
  assert.strictEqual(await a.title(), 'Controle de Operação');
  await esperarServidor(a);
  assert.strictEqual(await a.evaluate(() => window.PAINEL && window.PAINEL.sistema), 'operacao');
  assert.ok(!(await (await ctxA.request.get(BASE + '/operacao/')).text()).includes('cadastre as obras'), 'sem texto mandando cadastrar obras');

  // caminhão para o quadro (pelas funções da página)
  await a.evaluate(async () => {
    const agora = new Date().toISOString();
    await gravar('caminhoes', { id: 'cam-op-1', placa: 'OPR1A23', apelido: 'Munck 1', situacao: 'ativo', criadoEm: agora });
  });
  const b = await abrir(await logado(), '/operacao/#agenda');
  await esperarServidor(b);
  await b.evaluate(() => { window.__semRecarregar = 'sim'; });
  await b.waitForFunction(() => document.querySelector('#quadro').textContent.includes('OPR1A23'), null, { timeout: 5000 });

  await a.evaluate(() => { location.hash = 'agenda'; });
  const hoje = await a.evaluate(() => hojeISO());
  await a.click(`#quadro .add[data-cam="cam-op-1"][data-dia="${hoje}"]`);
  assert.ok(await a.isVisible('#f-ag'), 'formulário do agendamento aberto');
  assert.strictEqual(await a.inputValue('#ag-data'), hoje);
  assert.strictEqual(await a.inputValue('#ag-cam'), 'cam-op-1');
  await a.fill('#ag-cliente', 'Cliente X');
  await a.fill('#ag-dest-a', 'Chapecó');
  await a.fill('#ag-dest-b', 'Xanxerê');
  await a.fill('#ag-hora', '08:00');
  await a.fill('#ag-serv', 'Içar poste');
  await limparToast(a);
  await a.click('#f-ag button[type="submit"]');
  const t0 = Date.now();
  await b.waitForFunction(() => document.querySelector('#quadro').textContent.includes('Cliente X'), null, { timeout: 2000 });
  assert.ok(Date.now() - t0 <= 2000);
  assert.strictEqual(await b.evaluate(() => window.__semRecarregar), 'sim', 'o outro navegador não recarregou');
  await esperarToast(a, 'Agendado');
  const o = await dados(ctxA, 'operacao');
  assert.ok(o.agenda.some(x => x.caminhaoId === 'cam-op-1' && x.cliente === 'Cliente X' && x.destinoA === 'Chapecó' && x.destinoB === 'Xanxerê' && x.data === hoje && x.servico === 'Içar poste'), 'agendamento no servidor');

  // sem as abas Mapa e Obras
  assert.strictEqual(await a.locator('.aba[data-aba="mapa"], .aba[data-aba="obras"]').count(), 0, 'sem abas Mapa e Obras');

  // cópia antiga, ainda com o nome "controle-munck"
  await a.click('.aba[data-aba="cadastro"]');
  const antiga = { app: 'controle-munck', versao: 1, salvoEm: '2026-10-01T10:00:00.000Z', dados: {
    caminhoes: [{ id: 'cam-antigo-1', placa: 'MUN1C99', apelido: 'Munck antigo', situacao: 'ativo' }],
    motoristas: [{ id: 'mot-antigo-1', nome: 'Motorista Antigo', situacao: 'ativo' }],
    obras: [{ id: 'ob-antiga-1', nome: 'Obra Antiga', cidade: 'Xanxerê', situacao: 'andamento', etapas: [] }],
    agenda: [], km: [], manutencoes: [], config: [],
  } };
  await limparToast(a);
  await a.setInputFiles('#arquivo-copia', { name: 'controle-munck-copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(antiga)) });
  await esperarToast(a, 'Cópia carregada', 15000);
  const o2 = await dados(ctxA, 'operacao');
  assert.ok(o2.caminhoes.some(c => c.id === 'cam-antigo-1' && c.placa === 'MUN1C99'));
  assert.ok(o2.motoristas.some(m => m.id === 'mot-antigo-1'));
  assert.ok(o2.obras.some(x => x.id === 'ob-antiga-1'));
  await a.waitForFunction(() => document.querySelector('#t-cam').textContent.includes('MUN1C99'), null, { timeout: 3000 });
});

// ---------- Controle: Operação e Agenda de operação ----------
const semEspaco = t => String(t || '').replace(/\s+/g, ' ');
async function caminhoesDeTeste(p) {
  await p.evaluate(async () => {
    const agora = new Date().toISOString();
    await gravar('caminhoes', { id: 'cam-mk', placa: 'MKA1B23', apelido: 'Munck A', munck: 'Madal MD 45.000', situacao: 'ativo', criadoEm: agora });
    await gravar('caminhoes', { id: 'cam-sem', placa: 'SEM1B23', apelido: 'Toco', munck: '', situacao: 'ativo', criadoEm: agora });
    await gravar('motoristas', { id: 'mot-op', nome: 'João Operador', situacao: 'ativo', criadoEm: agora });
  });
}

teste('Operação: lança com cliente, destinos, valor e pago; horímetro quando usou o munck', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/operacao/#operacao');
  await esperarServidor(a);
  await caminhoesDeTeste(a);
  assert.strictEqual(semEspaco(await a.textContent('.aba[data-aba="operacao"]')).trim(), 'Operação');
  await a.selectOption('#km-cam', 'cam-sem');
  assert.strictEqual(await a.isVisible('#km-hor-ini'), false, 'sem "Usou o munck?", sem horímetro');
  await a.selectOption('#km-cam', 'cam-mk');
  await a.selectOption('#km-munck', 'sim');
  assert.strictEqual(await a.isVisible('#km-hor-ini'), true, 'usou o munck: tem horímetro');
  const hoje = await a.evaluate(() => hojeISO());
  await a.fill('#km-data', hoje);
  await a.fill('#km-cliente', 'Cliente Y');
  await a.fill('#km-dest-a', 'Chapecó');
  await a.fill('#km-dest-b', 'Concórdia');
  await a.fill('#km-ini', '1000');
  await a.fill('#km-fin', '1080');
  await a.fill('#km-hor-ini', '100');
  await a.fill('#km-hor-fin', '106,5');
  await a.fill('#km-valor', 'abc');
  await a.click('#f-km button[type="submit"]');
  await a.waitForSelector('#km-valor[aria-invalid="true"]');
  assert.ok(!(await dados(ctx, 'operacao')).km.some(r => r.cliente === 'Cliente Y'), 'valor inválido não grava');
  await a.fill('#km-valor', '1.500,00');
  await a.selectOption('#km-pago', 'nao');
  await limparToast(a);
  await a.click('#f-km button[type="submit"]');
  await esperarToast(a, 'Operação salva');
  const r = (await dados(ctx, 'operacao')).km.find(x => x.cliente === 'Cliente Y');
  assert.ok(r, 'operação no servidor');
  assert.strictEqual(r.valor, 1500);
  assert.strictEqual(r.pago, false);
  assert.strictEqual(r.destinoA, 'Chapecó');
  assert.strictEqual(r.destinoB, 'Concórdia');
  assert.strictEqual(r.horimetroInicial, 100);
  assert.strictEqual(r.horimetroFinal, 106.5);
  await a.waitForFunction(() => document.querySelector('#km-resumo').textContent.replace(/\s+/g, ' ').includes('R$ 1.500,00 a receber'), null, { timeout: 5000 });
  assert.match(semEspaco(await a.textContent('#t-km')), /Cliente Y · Chapecó → Concórdia/);
  // editar: marcar como pago tira do "a receber" e mantém o valor
  await a.click(`#t-km [data-acao="editar"][data-alvo="km:${r.id}"]`);
  assert.strictEqual(await a.inputValue('#km-valor'), '1.500,00');
  await a.selectOption('#km-pago', 'sim');
  await limparToast(a);
  await a.click('#f-km button[type="submit"]');
  await esperarToast(a, 'Operação salva');
  const r2 = (await dados(ctx, 'operacao')).km.find(x => x.id === r.id);
  assert.strictEqual(r2.pago, true);
  assert.strictEqual(r2.valor, 1500);
  await a.waitForFunction(() => !document.querySelector('#km-resumo').textContent.includes('a receber'), null, { timeout: 5000 });
  // caminhão sem munck: horímetro não é gravado
  await a.selectOption('#km-cam', 'cam-sem');
  await a.fill('#km-data', hoje);
  await a.fill('#km-cliente', 'Cliente Z');
  await a.fill('#km-ini', '500');
  await a.fill('#km-fin', '520');
  await a.fill('#km-valor', '1500');
  await limparToast(a);
  await a.click('#f-km button[type="submit"]');
  await esperarToast(a, 'Operação salva');
  const r3 = (await dados(ctx, 'operacao')).km.find(x => x.cliente === 'Cliente Z');
  assert.strictEqual(r3.valor, 1500);
  assert.ok(r3.horimetroInicial == null && r3.horimetroFinal == null, 'sem horímetro no caminhão sem munck');
});

teste('Operação: "Usou o munck?" mostra o horímetro em qualquer caminhão e grava as horas', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/operacao/#operacao');
  await esperarServidor(a);
  await caminhoesDeTeste(a);
  const hoje = await a.evaluate(() => hojeISO());
  // caminhão sem munck no cadastro também pode lançar horímetro
  await a.selectOption('#km-cam', 'cam-sem');
  assert.strictEqual(await a.inputValue('#km-munck'), 'nao', 'começa em Não');
  assert.strictEqual(await a.isVisible('#km-hor-ini'), false, 'com Não, sem horímetro');
  await a.selectOption('#km-munck', 'sim');
  assert.strictEqual(await a.isVisible('#km-hor-ini'), true, 'com Sim, aparece o horímetro');
  await a.fill('#km-data', hoje);
  await a.fill('#km-cliente', 'Cliente Munck');
  await a.fill('#km-ini', '700');
  await a.fill('#km-fin', '720');
  await a.fill('#km-valor', '900');
  await a.fill('#km-hor-ini', '50');
  await a.fill('#km-hor-fin', '');
  // Sim sem o horímetro final não grava
  await a.click('#f-km button[type="submit"]');
  await a.waitForSelector('#km-hor-fin[aria-invalid="true"]');
  assert.ok(!(await dados(ctx, 'operacao')).km.some(r => r.cliente === 'Cliente Munck'), 'sem horímetro final não grava');
  await a.fill('#km-hor-fin', '53,5');
  await a.waitForFunction(() => document.querySelector('#km-calc').textContent.includes('3,5 h de munck'), null, { timeout: 5000 });
  await limparToast(a);
  await a.click('#f-km button[type="submit"]');
  await esperarToast(a, 'Operação salva');
  const r = (await dados(ctx, 'operacao')).km.find(x => x.cliente === 'Cliente Munck');
  assert.ok(r, 'operação no servidor');
  assert.strictEqual(r.usouMunck, true);
  assert.strictEqual(r.horimetroInicial, 50);
  assert.strictEqual(r.horimetroFinal, 53.5);
  assert.strictEqual(await a.inputValue('#km-munck'), 'nao', 'formulário volta para Não');
  // editar mantém o Sim; trocar para Não apaga o horímetro
  await a.click(`#t-km [data-acao="editar"][data-alvo="km:${r.id}"]`);
  assert.strictEqual(await a.inputValue('#km-munck'), 'sim');
  assert.strictEqual(await a.isVisible('#km-hor-ini'), true);
  await a.selectOption('#km-munck', 'nao');
  await limparToast(a);
  await a.click('#f-km button[type="submit"]');
  await esperarToast(a, 'Operação salva');
  const r2 = (await dados(ctx, 'operacao')).km.find(x => x.id === r.id);
  assert.strictEqual(r2.usouMunck, false);
  assert.ok(r2.horimetroInicial == null && r2.horimetroFinal == null, 'com Não, sem horímetro');
});

teste('Agenda de operação preenche a Operação do dia e vira Feito', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/operacao/#operacao');
  await esperarServidor(a);
  await caminhoesDeTeste(a);
  const hoje = await a.evaluate(() => hojeISO());
  await a.evaluate(async h => {
    await gravar('agenda', { id: 'ag-op-1', data: h, hora: '07:30', caminhaoId: 'cam-mk', motoristaId: 'mot-op', cliente: 'Cliente Agenda', destinoA: 'Xaxim', destinoB: 'Seara', servico: 'Içar caixa', situacao: 'agendado', criadoEm: new Date().toISOString() });
  }, hoje);
  await a.fill('#km-data', hoje);
  await a.selectOption('#km-cam', 'cam-mk');
  await a.waitForFunction(() => document.querySelector('#km-cliente').value === 'Cliente Agenda', null, { timeout: 5000 });
  assert.strictEqual(await a.inputValue('#km-dest-a'), 'Xaxim');
  assert.strictEqual(await a.inputValue('#km-dest-b'), 'Seara');
  assert.strictEqual(await a.inputValue('#km-mot'), 'mot-op');
  await a.fill('#km-ini', '2000');
  await a.fill('#km-fin', '2040');
  await limparToast(a);
  await a.click('#f-km button[type="submit"]');
  await esperarToast(a, 'Operação salva');
  const o = await dados(ctx, 'operacao');
  assert.strictEqual(o.agenda.find(x => x.id === 'ag-op-1').situacao, 'feito');
  assert.ok(o.km.some(r => r.cliente === 'Cliente Agenda' && r.destinoB === 'Seara'));
});

teste('Operação: com dois agendamentos no dia só o do cliente lançado vira Feito; vários dias só no último', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/operacao/#operacao');
  await esperarServidor(a);
  await caminhoesDeTeste(a);
  const hoje = await a.evaluate(() => hojeISO());
  const ontem = await a.evaluate(h => somaDias(h, -1), hoje);
  await a.evaluate(async h => {
    const agora = new Date().toISOString();
    await gravar('caminhoes', { id: 'cam-dois', placa: 'DOI1S23', apelido: 'Munck B', munck: 'Argos 30', situacao: 'ativo', criadoEm: agora });
    await gravar('caminhoes', { id: 'cam-livre', placa: 'LIV1R23', apelido: 'Livre', situacao: 'ativo', criadoEm: agora });
    await gravar('caminhoes', { id: 'cam-longo', placa: 'LON1G23', apelido: 'Longo', situacao: 'ativo', criadoEm: agora });
    await gravar('agenda', { id: 'ag-dois-a', data: h, hora: '08:00', caminhaoId: 'cam-dois', cliente: 'Cliente Manhã', destinoA: 'A1', destinoB: 'B1', situacao: 'agendado', criadoEm: agora });
    await gravar('agenda', { id: 'ag-dois-b', data: h, hora: '14:00', caminhaoId: 'cam-dois', cliente: 'Cliente Tarde', destinoA: 'A2', destinoB: 'B2', situacao: 'agendado', criadoEm: agora });
    await gravar('agenda', { id: 'ag-longo', data: somaDias(h, -1), dataFim: somaDias(h, 1), caminhaoId: 'cam-longo', cliente: 'Cliente Longo', situacao: 'agendado', criadoEm: agora });
  }, hoje);
  await a.fill('#km-data', hoje);
  await a.selectOption('#km-cam', 'cam-dois');
  await a.waitForFunction(() => document.querySelector('#km-cliente').value === 'Cliente Manhã', null, { timeout: 5000 });
  // trocar para um caminhão sem agendamento tira o cliente sugerido
  await a.selectOption('#km-cam', 'cam-livre');
  await a.waitForFunction(() => document.querySelector('#km-cliente').value === '' && document.querySelector('#km-dest-a').value === '', null, { timeout: 5000 });
  await a.selectOption('#km-cam', 'cam-dois');
  await a.waitForFunction(() => document.querySelector('#km-cliente').value === 'Cliente Manhã', null, { timeout: 5000 });
  await a.fill('#km-ini', '100');
  await a.fill('#km-fin', '120');
  await limparToast(a);
  await a.click('#f-km button[type="submit"]');
  await esperarToast(a, 'Operação salva');
  let o = await dados(ctx, 'operacao');
  assert.strictEqual(o.agenda.find(x => x.id === 'ag-dois-a').situacao, 'feito');
  assert.strictEqual(o.agenda.find(x => x.id === 'ag-dois-b').situacao, 'agendado', 'o serviço da tarde continua agendado');
  // a próxima operação do dia vem com o cliente da tarde
  await a.selectOption('#km-cam', 'cam-dois');
  await a.waitForFunction(() => document.querySelector('#km-cliente').value === 'Cliente Tarde', null, { timeout: 5000 });
  // agendamento de vários dias: a operação de ontem não fecha o agendamento
  await a.fill('#km-data', ontem);
  await a.selectOption('#km-cam', 'cam-longo');
  await a.waitForFunction(() => document.querySelector('#km-cliente').value === 'Cliente Longo', null, { timeout: 5000 });
  await a.fill('#km-ini', '300');
  await a.fill('#km-fin', '340');
  await limparToast(a);
  await a.click('#f-km button[type="submit"]');
  await esperarToast(a, 'Operação salva');
  o = await dados(ctx, 'operacao');
  assert.strictEqual(o.agenda.find(x => x.id === 'ag-longo').situacao, 'agendado', 'agendamento de vários dias continua aberto');
});

teste('Operação: registro antigo com obra aparece com o nome da obra e as horas', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/operacao/#operacao');
  await esperarServidor(a);
  await caminhoesDeTeste(a);
  await a.evaluate(async () => {
    const agora = new Date().toISOString();
    await gravar('obras', { id: 'ob-velha', nome: 'Obra Velha', cliente: '', situacao: 'andamento', etapas: [], criadoEm: agora });
    await gravar('km', { id: 'km-velho', data: '2026-11-03', caminhaoId: 'cam-mk', obraId: 'ob-velha', etapa: 'Postes', kmInicial: 10, kmFinal: 30, horas: 3, criadoEm: agora });
  });
  await a.selectOption('#fk-mes', 'todos');
  await a.waitForFunction(() => document.querySelector('#t-km').textContent.includes('Obra Velha'), null, { timeout: 5000 });
  assert.match(semEspaco(await a.textContent('#t-km')), /3 h/);
});

teste('Destino: puxa a cidade sem acento; destinos já usados vêm primeiro; Enter não envia', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/operacao/#operacao');
  await esperarServidor(a);
  await caminhoesDeTeste(a);
  await a.evaluate(async () => { await gravar('km', { id: 'km-dest-usado', data: '2025-02-01', caminhaoId: 'cam-sem', cliente: 'C', destinoA: 'Pátio Deconto - Xanxerê', destinoB: '<b>x</b> & y', kmInicial: 1, kmFinal: 2, criadoEm: new Date().toISOString() }); });
  const itens = () => a.$$eval('#sug-destino li', l => l.map(x => x.textContent));
  await a.fill('#km-dest-a', 'x');
  assert.strictEqual(await a.isVisible('#sug-destino'), false, '1 letra não abre');
  await a.fill('#km-dest-a', 'xanx');
  await a.waitForSelector('#sug-destino li');
  const l1 = await itens();
  assert.ok(l1.includes('Pátio Deconto - Xanxerê') && l1.indexOf('Pátio Deconto - Xanxerê') < l1.indexOf('Xanxerê - SC'), 'usado antes das cidades');
  assert.ok(l1.includes('Xanxerê - SC'));
  assert.ok(l1.length <= 8);
  await a.fill('#km-dest-a', 'sao d');
  await a.waitForFunction(() => [...document.querySelectorAll('#sug-destino li')].some(x => x.textContent === 'São Domingos - SC'));
  await a.evaluate(() => { window.__envios = 0; document.addEventListener('submit', () => { window.__envios++; }, true); });
  await a.press('#km-dest-a', 'ArrowDown');
  await a.press('#km-dest-a', 'Enter');
  assert.match(await a.inputValue('#km-dest-a'), / - (PR|SC|RS)$/, 'Enter escolheu uma cidade');
  assert.strictEqual(await a.isVisible('#sug-destino'), false, 'lista fecha ao escolher');
  assert.strictEqual(await a.evaluate(() => window.__envios), 0, 'Enter não enviou o formulário');
  await a.fill('#km-dest-b', '<b');
  await a.waitForSelector('#sug-destino li');
  assert.ok((await itens()).includes('<b>x</b> & y'), 'texto, não HTML');
  await a.press('#km-dest-b', 'Escape');
  assert.strictEqual(await a.isVisible('#sug-destino'), false, 'Esc fecha');
  // Agenda: clique escolhe
  await a.evaluate(() => { location.hash = 'agenda'; });
  const hoje = await a.evaluate(() => hojeISO());
  await a.click(`#quadro .add[data-cam="cam-sem"][data-dia="${hoje}"]`);
  await a.fill('#ag-dest-b', 'chapec');
  await a.click('#sug-destino li:has-text("Chapecó - SC")');
  assert.strictEqual(await a.inputValue('#ag-dest-b'), 'Chapecó - SC');
});

teste('Destino: leitor de tela; usados que começam e mais recentes primeiro, sem repetir, no máximo 5', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/operacao/#operacao');
  await esperarServidor(a);
  await caminhoesDeTeste(a);
  await a.evaluate(async () => {
    const agora = new Date().toISOString();
    for (let i = 1; i <= 9; i++) await gravar('km', { id: 'km-xanx-' + i, data: '2025-03-0' + i, caminhaoId: 'cam-sem', cliente: 'C', destinoA: 'Obra ' + i + ' - Ipumirim', kmInicial: i, kmFinal: i + 1, criadoEm: agora });
    await gravar('km', { id: 'km-xanx-dup', data: '2025-01-01', caminhaoId: 'cam-sem', cliente: 'C', destinoA: 'OBRA 9 - IPUMIRIM', kmInicial: 1, kmFinal: 2, criadoEm: agora });
    await gravar('km', { id: 'km-xanx-pat', data: '2024-06-01', caminhaoId: 'cam-sem', cliente: 'C', destinoB: 'Ipumirim - Pátio', kmInicial: 1, kmFinal: 2, criadoEm: agora });
  });
  const campo = '#km-dest-a';
  assert.strictEqual(await a.getAttribute(campo, 'role'), 'combobox');
  assert.strictEqual(await a.getAttribute(campo, 'aria-expanded'), 'false');
  await a.fill(campo, 'ipumi');
  await a.waitForSelector('#sug-destino li');
  const l = await a.$$eval('#sug-destino li', x => x.map(y => y.textContent));
  assert.strictEqual(l[0], 'Ipumirim - Pátio', 'usado que começa com o texto vem antes');
  assert.strictEqual(l[1], 'Obra 9 - Ipumirim', 'depois o mais recente');
  assert.ok(!l.includes('OBRA 9 - IPUMIRIM'), 'sem repetir por acento ou maiúscula');
  assert.ok(l.filter(x => x !== 'Ipumirim - SC').length <= 5, 'no máximo 5 usados');
  assert.ok(l.includes('Ipumirim - SC'), 'a cidade sempre aparece');
  assert.strictEqual(await a.getAttribute(campo, 'aria-expanded'), 'true');
  await a.press(campo, 'ArrowDown');
  const ativo = await a.getAttribute(campo, 'aria-activedescendant');
  assert.ok(ativo, 'aria-activedescendant aponta o item marcado');
  assert.strictEqual(await a.$eval('#' + ativo, li => li.getAttribute('aria-selected')), 'true');
  await a.press(campo, 'Escape');
  assert.strictEqual(await a.getAttribute(campo, 'aria-expanded'), 'false');
  assert.strictEqual(await a.getAttribute(campo, 'aria-activedescendant'), null);
});

teste('Destino: sugestoesDestino ordena quem começa antes de quem contém', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/operacao/#operacao');
  await esperarServidor(a);
  const r = await a.evaluate(() => ({ n: CIDADES.length, flor: sugestoesDestino('flor'), oeste: sugestoesDestino('oeste'), smo: sugestoesDestino('miguel do oe'), conc: sugestoesDestino('concordia'), um: sugestoesDestino('c') }));
  const sa = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  assert.strictEqual(r.n, 1191);
  assert.ok(r.flor.length > 0 && r.flor.length <= 8 && r.flor.every(x => sa(x).startsWith('flor')), 'flor: só quem começa');
  assert.ok(r.oeste.length === 8 && r.oeste.every(x => sa(x).includes('oeste')), 'oeste: no máximo 8, todos contêm');
  assert.ok(r.smo.includes('São Miguel do Oeste - SC'));
  assert.ok(r.conc.includes('Concórdia - SC'));
  assert.deepStrictEqual(r.um, []);
});

teste('Documento: um por caminhão, seguro só com sim, vencido avisa no Painel', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/operacao/#documento');
  await esperarServidor(a);
  await a.evaluate(async () => {
    const agora = new Date().toISOString();
    await gravar('caminhoes', { id: 'cam-doc', placa: 'DOC1A23', apelido: 'Doc', situacao: 'ativo', criadoEm: agora });
    await gravar('caminhoes', { id: 'cam-fora', placa: 'FOR1A23', apelido: 'Fora', situacao: 'fora', criadoEm: agora });
  });
  await a.waitForFunction(() => document.querySelector('#t-doc').textContent.includes('DOC1A23'), null, { timeout: 5000 });
  assert.ok(!(await a.textContent('#t-doc')).includes('FOR1A23'), 'caminhão fora da frota não aparece');
  await a.click('#t-doc [data-acao="doc-preencher"][data-cam="cam-doc"]');
  assert.strictEqual(await a.inputValue('#doc-cam'), 'cam-doc');
  await a.fill('#doc-num', '123456');
  await a.selectOption('#doc-seguro', 'sim');
  assert.strictEqual(await a.isVisible('#doc-venc-seg'), true, 'com seguro pede o vencimento');
  await a.selectOption('#doc-seguro', 'nao');
  assert.strictEqual(await a.isVisible('#doc-venc-seg'), false, 'sem seguro não pede o vencimento');
  const ontem = await a.evaluate(() => somaDias(hojeISO(), -1));
  await a.fill('#doc-venc-doc', ontem);
  await limparToast(a);
  await a.click('#f-doc button[type="submit"]');
  await esperarToast(a, 'Documento salvo');
  await a.waitForFunction(() => document.querySelector('#t-doc').textContent.includes('Vencido'), null, { timeout: 5000 });
  // um segundo documento para o mesmo caminhão não entra
  await a.evaluate(() => abrirForm('f-doc', { caminhaoId: 'cam-doc' }));
  await a.fill('#doc-num', '999');
  await a.click('#f-doc button[type="submit"]');
  await a.waitForFunction(() => document.querySelector('#f-doc .f-msg').textContent.includes('Esse caminhão já tem documento'), null, { timeout: 5000 });
  const o = await dados(ctx, 'operacao');
  const docs = o.documentos.filter(d => d.caminhaoId === 'cam-doc');
  assert.strictEqual(docs.length, 1, 'um documento por caminhão');
  assert.strictEqual(docs[0].numero, '123456');
  assert.strictEqual(docs[0].temSeguro, false);
  assert.strictEqual(docs[0].vencSeguro, '');
  assert.ok(!o.documentos.some(d => d.caminhaoId === 'cam-fora'));
  // o Painel avisa o documento vencido
  await a.evaluate(() => { location.hash = 'painel'; });
  await a.waitForFunction(() => { const t = document.querySelector('#painel-alertas').textContent; return /documento/i.test(t) && t.includes('DOC1A23'); }, null, { timeout: 5000 });
});

teste('Relatório: faturado, a receber e por cliente; Excel com Operações e Documentos', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/operacao/#painel');
  await esperarServidor(a);
  await caminhoesDeTeste(a);
  const aReceberNoPainel = () => a.evaluate(() => {
    const k = [...document.querySelectorAll('#painel-kpis .kpi')].find(x => x.querySelector('.kpi-rot').textContent.trim() === 'A receber');
    return k ? Number(k.querySelector('.kpi-val').textContent.replace(/[^\d,]/g, '').replace(',', '.')) : null;
  });
  const antes = await aReceberNoPainel();
  assert.ok(antes != null, 'indicador "A receber" no Painel');
  await a.evaluate(async () => {
    const agora = new Date().toISOString();
    await gravar('km', { id: 'km-rel-a', data: '2025-01-15', caminhaoId: 'cam-mk', cliente: 'Cliente Rel A', destinoA: 'X', destinoB: 'Y', valor: 1000, pago: true, kmInicial: 100, kmFinal: 150, horimetroInicial: 10, horimetroFinal: 14, criadoEm: agora });
    await gravar('km', { id: 'km-rel-b', data: '2025-01-16', caminhaoId: 'cam-sem', cliente: 'Cliente Rel B', valor: 500, pago: false, kmInicial: 10, kmFinal: 30, criadoEm: agora });
  });
  await a.waitForFunction(x => {
    const k = [...document.querySelectorAll('#painel-kpis .kpi')].find(y => y.querySelector('.kpi-rot').textContent.trim() === 'A receber');
    return k && Number(k.querySelector('.kpi-val').textContent.replace(/[^\d,]/g, '').replace(',', '.')) === x;
  }, antes + 500, { timeout: 5000 });
  // relatório de janeiro de 2025: só as duas operações acima
  await a.evaluate(() => { location.hash = 'relatorio'; });
  await a.click('[data-periodo="datas"]');
  await a.fill('#p-ini', '2025-01-01');
  await a.locator('#p-ini').dispatchEvent('change');
  await a.fill('#p-fim', '2025-01-31');
  await a.locator('#p-fim').dispatchEvent('change');
  await a.waitForFunction(() => { const t = document.querySelector('#t-rel-cli'); return !!t && t.textContent.includes('Cliente Rel B'); }, null, { timeout: 5000 });
  const kpis = await a.evaluate(() => Object.fromEntries([...document.querySelectorAll('#rel-conteudo .kpi')].map(k => [k.querySelector('.kpi-rot').textContent.trim(), k.querySelector('.kpi-val').textContent.replace(/\s+/g, ' ').trim()])));
  assert.strictEqual(kpis['Faturado'], 'R$ 1.500,00');
  assert.strictEqual(kpis['A receber'], 'R$ 500,00');
  const cli = semEspaco(await a.textContent('#t-rel-cli'));
  assert.match(cli, /Cliente Rel A/);
  assert.match(cli, /R\$ 1\.000,00/);
  // Excel com tudo
  const xml = await a.evaluate(async () => { const x = planilhaTudo(); return x instanceof Blob ? await x.text() : new TextDecoder().decode(x); });
  assert.ok(xml.includes('name="Operações"'), 'aba Operações');
  assert.ok(xml.includes('name="Documentos"'), 'aba Documentos');
  assert.ok(!xml.includes('name="Obras"'), 'sem aba Obras');
  assert.ok(xml.includes('Cliente Rel B'), 'operação no Excel');
  // Excel do relatório e extrato de um caminhão
  const xmlRel = await a.evaluate(async () => { const x = planilhaRel(); return x instanceof Blob ? await x.text() : new TextDecoder().decode(x); });
  assert.ok(xmlRel.includes('name="Por cliente"') && xmlRel.includes('name="Operações"'), 'Excel do relatório por cliente');
  await a.selectOption('#rel-cam', 'cam-mk');
  await a.waitForFunction(() => { const t = document.querySelector('#t-extrato'); return !!t && t.textContent.includes('Cliente Rel A'); }, null, { timeout: 5000 });
  assert.match(semEspaco(await a.textContent('#t-extrato')), /4 h/);
});

// ---------- 8. celular ----------
teste('celular 390px: tela inicial e DECONTO sem rolagem para o lado', async () => {
  const ctx = await logado({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await abrir(ctx, '/');
  await p.waitForSelector('.cartao');
  const larguras = { inicial: await larguraDaPagina(p) };
  await p.goto(BASE + '/frota/');
  await esperarServidor(p);
  larguras['DECONTO painel'] = await larguraDaPagina(p);
  for (const aba of ['frota', 'documentos']) {
    await p.evaluate(x => { location.hash = x; }, aba);
    await p.waitForFunction(x => { const v = document.querySelector('#v-' + x); return !!v && !v.hidden; }, aba);
    await p.waitForTimeout(300);
    larguras['DECONTO #' + aba] = await larguraDaPagina(p);
  }
  const largas = Object.entries(larguras).filter(([, w]) => w > 390);
  assert.deepStrictEqual(largas, [], 'larguras: ' + JSON.stringify(larguras));
});

// ---------- 10. Controle de Operação no celular ----------
teste('celular 390px e 360px: Controle de Operação sem rolagem para o lado', async () => {
  const larguras = {};
  for (const w of [390, 360]) {
    const ctx = await logado({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await abrir(ctx, '/operacao/');
    await esperarServidor(p);
    larguras[w] = await larguraDaPagina(p);
  }
  assert.ok(larguras[390] <= 390 && larguras[360] <= 360, 'larguras: ' + JSON.stringify(larguras));
});

// ---------- 11. gravação de outra pessoa enquanto a página abre ----------
teste('gravação feita por outro navegador enquanto a página abre aparece sem recarregar (DECONTO e Controle)', async () => {
  const outro = await logado();
  for (const [sis, col, obj, chave] of [['frota', 'caminhoes', { placa: 'CRR1D00' }, 'cam-corrida'], ['operacao', 'obras', { nome: 'Obra da corrida', situacao: 'andamento', etapas: [] }, 'ob-corrida']]) {
    const ctx = await logado();
    // os avisos ao vivo demoram a ligar (internet lenta): a gravação acontece nesse intervalo
    await ctx.route(`**/${sis}/api/eventos`, async r => { await new Promise(x => setTimeout(x, 2500)); await r.continue().catch(() => {}); });
    const p = await abrir(ctx, `/${sis}/`);
    await p.waitForFunction(() => { const e = document.querySelector('#estado'); return !!e && /Salvo no servidor/.test(e.textContent); }, null, { timeout: 15000 }).catch(() => {});
    const r = await outro.request.put(`${BASE}/${sis}/api/dados/${col}/${chave}`, { data: obj });
    assert.strictEqual(r.status(), 200);
    const viu = await p.waitForFunction(([c, k]) => D[c].has(k), [col, chave], { timeout: 6000 }).then(() => true, () => false);
    assert.ok(viu, `${sis}: o registro gravado durante a abertura apareceu`);
  }
});

// ---------- 12. avisos ao vivo depois de um 502 (nginx enquanto o Node reinicia) ----------
teste('avisos ao vivo: com 502 enquanto o servidor reinicia (nginx), a página reconecta sozinha e vê o que outro gravou (DECONTO e Controle)', async () => {
  const outro = await logado();
  for (const [sis, col, obj, chave] of [['frota', 'caminhoes', { placa: 'RNC1A00' }, 'cam-reinicio'], ['operacao', 'obras', { nome: 'Obra do reinício', situacao: 'andamento', etapas: [] }, 'ob-reinicio']]) {
    const ctx = await logado();
    // o "nginx": enquanto quebrado, tudo da API deste sistema volta 502
    let quebrado = false, falhas = 0, passaram = 0;
    await ctx.route(`**/${sis}/api/**`, async r => {
      const ehEventos = new URL(r.request().url()).pathname.endsWith('/api/eventos');
      if (quebrado) { if (ehEventos) falhas++; await r.fulfill({ status: 502, contentType: 'text/html', body: '<h1>502 Bad Gateway</h1>' }); return; }
      if (ehEventos) passaram++;
      await r.fallback();
    });
    const p = await abrir(ctx, `/${sis}/`);
    await esperarServidor(p);
    // o Node reinicia: a conexão cai e a reconexão do navegador (3 s depois) recebe 502
    quebrado = true;
    await reiniciar();
    await p.waitForTimeout(4000);
    assert.ok(falhas >= 1, `${sis}: a reconexão recebeu 502 (${falhas})`);
    // outra pessoa grava com a página ainda sem conexão
    const r = await outro.request.put(`${BASE}/${sis}/api/dados/${col}/${chave}`, { data: obj });
    assert.strictEqual(r.status(), 200);
    await p.waitForTimeout(2000);
    // o nginx volta a passar os pedidos para o Node
    quebrado = false;
    const passaramAntes = passaram;
    const viu = await p.waitForFunction(([c, k]) => D[c].has(k), [col, chave], { timeout: 15000 }).then(() => true, () => false);
    assert.ok(viu, `${sis}: depois do 502 a página reconectou e viu a gravação nova (estado: ${await p.textContent('#estado')})`);
    await esperarServidor(p, 5000);
    await p.waitForTimeout(1500);
    assert.strictEqual(passaram - passaramAntes, 1, `${sis}: uma conexão de avisos só, depois que o servidor voltou`);
    assert.ok(falhas <= 4, `${sis}: sem laço apertado, ${falhas} tentativas durante o 502`);
    assert.strictEqual((await p.textContent('#estado')).trim(), 'Salvo no servidor');
  }
});

// ---------- 13. sessão encerrada enquanto a conexão de avisos estava caída ----------
teste('avisos ao vivo: se a sessão acabou enquanto a conexão caiu, a página vai para /entrar (DECONTO e Controle)', async () => {
  for (const sis of ['frota', 'operacao']) {
    const ctx = await logado();
    const p = await abrir(ctx, `/${sis}/`);
    await esperarServidor(p);
    // saiu por outra aba (a sessão some do servidor) e o Node reinicia: a reconexão recebe 401
    const r = await ctx.request.post(BASE + '/api/sair', { data: {} });
    assert.strictEqual(r.status(), 200);
    await reiniciar();
    const foi = await p.waitForURL(BASE + '/entrar', { timeout: 15000 }).then(() => true, () => false);
    assert.ok(foi, `${sis}: foi para /entrar (está em ${p.url()}, estado: ${await p.textContent('#estado').catch(() => '?')})`);
  }
});

// ---------- 14. cópia do painel carregada no modo local (file://, como no .exe) ----------
teste('DECONTO local (file://): cópia feita no painel fica com os PDFs neste computador, o PDF abre e a cópia seguinte leva o PDF', async () => {
  // 1) no painel: um documento com PDF e a cópia baixada por "Salvar cópia de tudo"
  const ctxP = await logado();
  const painel = await abrir(ctxP, '/frota/#frota');
  await esperarServidor(painel);
  const pdf = pdfMinimo('CRLV do painel para o computador');
  const idArq = await painel.evaluate(async b64 => {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const arq = await Arquivos.guardar(new File([bytes], 'CRLV-PNL1A23.pdf', { type: 'application/pdf' }));
    await gravar('caminhoes', { id: 'cam-pnl-1', placa: 'PNL1A23', tipo: 'Truck', situacao: 'ativo', criadoEm: new Date().toISOString() });
    await gravar('documentos', { id: 'doc-pnl-1', veiculoTipo: 'caminhao', veiculoId: 'cam-pnl-1', tipo: 'CRLV (licenciamento)', numero: '555', vencimento: '2027-10-31', arquivo: arq, criadoEm: new Date().toISOString() });
    return arq.id;
  }, pdf.toString('base64'));
  const [baixado] = await Promise.all([painel.waitForEvent('download', { timeout: 30000 }), painel.click('#sec-dados [data-acao="backup"]')]);
  const copiaPainel = JSON.parse(fs.readFileSync(await baixado.path(), 'utf8'));
  const docPainel = copiaPainel.dados.documentos.find(d => d.id === 'doc-pnl-1');
  assert.strictEqual(docPainel.arquivo.onde, 'servidor', 'na cópia do painel o arquivo é do servidor');
  assert.ok(copiaPainel.arquivos[idArq] && copiaPainel.arquivos[idArq].dados, 'a cópia do painel leva o PDF embutido');
  const comArquivo = copiaPainel.dados.documentos.filter(d => d.arquivo && d.arquivo.onde === 'servidor' && copiaPainel.arquivos[d.arquivo.id]);

  // 2) o DECONTO aberto direto do arquivo (file://, sem servidor): modo local
  const ctxL = await contexto();
  const l = await ctxL.newPage();
  await l.goto(pathToFileURL(path.join(RAIZ, 'sistema-carlise', 'frota.html')).href + '#frota');
  await l.waitForFunction(() => Armazem.modo === 'local');
  await limparToast(l);
  await l.setInputFiles('#arquivo-copia', { name: 'sistema-carlise-copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(copiaPainel)) });
  await esperarToast(l, 'Cópia carregada', 60000);
  const toast = await textoToast(l);
  assert.doesNotMatch(toast, /não pôde|não puderam/, 'todos os arquivos guardados: ' + toast);
  const ler = () => l.evaluate(async id => {
    const d = D.documentos.get(id);
    let bytes = null, erro = null;
    try { bytes = Array.from(new Uint8Array(await (await Arquivos.ler(d.arquivo)).arrayBuffer())); } catch (e) { erro = String(e && e.message || e); }
    return { onde: d.arquivo.onde, id: d.arquivo.id, bytes, erro };
  }, 'doc-pnl-1');
  let r = await ler();
  assert.strictEqual(r.onde, 'local', 'o documento diz que o arquivo está neste computador');
  assert.strictEqual(r.id, idArq);
  assert.ok(r.bytes && Buffer.from(r.bytes).equals(pdf), 'o PDF abre com os mesmos bytes: ' + r.erro);
  const foraDoLocal = await l.evaluate(() => todos('documentos').filter(d => d.arquivo && d.arquivo.onde !== 'local').map(d => d.id));
  assert.deepStrictEqual(foraDoLocal, [], 'todos os documentos da cópia ficaram com o arquivo neste computador');

  // depois de fechar e abrir de novo, continua igual
  await l.reload();
  await l.waitForFunction(() => Armazem.modo === 'local');
  r = await ler();
  assert.strictEqual(r.onde, 'local', 'depois de abrir de novo');
  assert.ok(r.bytes && Buffer.from(r.bytes).equals(pdf), 'depois de abrir de novo o PDF abre: ' + r.erro);

  // "Ver PDF" na tela abre o arquivo (o Chromium do teste não mostra PDF: guarda o endereço que a página abriria)
  await l.evaluate(() => { location.hash = 'documentos'; window.__aberto = null; window.open = u => { window.__aberto = String(u); return {}; }; });
  const ver = l.locator('[data-acao="abrir-arquivo"][data-alvo="documentos:doc-pnl-1"]').first();
  await ver.waitFor({ timeout: 10000 });
  await limparToast(l);
  await ver.click();
  await l.waitForFunction(() => !!window.__aberto, null, { timeout: 10000 }).catch(() => {});
  const visto = await l.evaluate(async () => { const u = window.__aberto; if (!u) return null; return { u, bytes: Array.from(new Uint8Array(await (await fetch(u)).arrayBuffer())) }; });
  assert.ok(visto, '"Ver PDF" abriu o arquivo (aviso: ' + await textoToast(l) + ')');
  assert.match(visto.u, /^blob:/);
  assert.ok(Buffer.from(visto.bytes).equals(pdf), '"Ver PDF" mostra o PDF da cópia');

  // 3) "Salvar cópia de tudo" feita no computador leva os PDFs
  await l.evaluate(() => { location.hash = 'frota'; });
  const [baixadoL] = await Promise.all([l.waitForEvent('download', { timeout: 30000 }), l.click('#sec-dados [data-acao="backup"]')]);
  const copiaLocal = JSON.parse(fs.readFileSync(await baixadoL.path(), 'utf8'));
  const e = copiaLocal.arquivos && copiaLocal.arquivos[idArq];
  assert.ok(e && Buffer.from(e.dados, 'base64').equals(pdf), 'a cópia feita no computador leva o PDF');
  const faltam = comArquivo.filter(d => !(copiaLocal.arquivos && copiaLocal.arquivos[d.arquivo.id] && copiaLocal.arquivos[d.arquivo.id].dados === copiaPainel.arquivos[d.arquivo.id].dados)).map(d => d.id);
  assert.deepStrictEqual(faltam, [], 'nenhum PDF da cópia do painel ficou de fora da cópia seguinte');
});

// ---------- 12. RH: ponto pelo celular ----------
async function funcionarioAPI(ctx, id, extra = {}) {
  let r = await ctx.request.put(`${BASE}/rh/api/dados/funcionarios/${id}`, { data: Object.assign({ id, nome: 'Func ' + id, cpf: '12345678901', cargo: 'Motorista', jornadaMin: 528, situacao: 'ativo', criadoEm: new Date().toISOString() }, extra) });
  assert.strictEqual(r.status(), 200);
  r = await ctx.request.post(`${BASE}/rh/api/link/${id}`, { data: {} });
  assert.strictEqual(r.status(), 200);
  return (await r.json()).token;
}
/* JPEG de verdade, feito pelo próprio navegador, maior que 1024 px para conferir a redução */
const jpegDeTeste = (p, w = 1600, h = 1200) => p.evaluate(([w, h]) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#c33'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(w / 4, h / 4, w / 2, h / 2);
  return c.toDataURL('image/jpeg', 0.9).split(',')[1];
}, [w, h]).then(b => ({ name: 'selfie.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b, 'base64') }));
const LOCAL_TELA = { latitude: -26.8766, longitude: -52.4036, accuracy: 15 };

teste('Ponto pelo celular: aviso de privacidade, foto e local falsos, registra entrada e depois saída', async () => {
  const adm = await logado();
  const tok = await funcionarioAPI(adm, 'f-tela', { nome: 'Bruno da Tela' });
  const ctx = await contexto({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.grantPermissions(['geolocation'], { origin: BASE });
  await ctx.setGeolocation(LOCAL_TELA);
  const p = await abrir(ctx, '/ponto/' + tok);
  assert.strictEqual((await p.textContent('#nome')).trim(), 'Bruno da Tela');
  assert.ok(await p.isVisible('#aviso'), 'aviso de privacidade na primeira vez');
  assert.match(await p.textContent('#aviso'), /foto/);
  assert.ok(!(await p.isVisible('#bater')), 'o botão aparece depois do aviso');
  await p.click('#entendi');
  assert.strictEqual((await p.textContent('#bater')).trim(), 'Registrar entrada');
  assert.strictEqual(await p.getAttribute('#foto', 'capture'), 'user');
  const foto = await jpegDeTeste(p);
  await p.setInputFiles('#foto', foto);
  await p.waitForSelector('#comprovante:not([hidden])', { timeout: 15000 });
  assert.match((await p.textContent('#comp-tipo')).trim(), /^Entrada registrada às \d{2}:\d{2}$/);
  assert.strictEqual((await p.textContent('#bater')).trim(), 'Registrar saída');
  // a saída pelo caminho de verdade: o botão abre a câmera (o seletor de arquivo)
  const [seletor] = await Promise.all([p.waitForEvent('filechooser'), p.click('#bater')]);
  await seletor.setFiles(foto);
  await p.waitForFunction(() => document.querySelector('#comp-tipo').textContent.startsWith('Saída registrada às'), null, { timeout: 15000 });
  assert.strictEqual((await p.textContent('#bater')).trim(), 'Registrar entrada');
  assert.ok(await larguraDaPagina(p) <= 390, 'sem rolagem para o lado');
  const meus = (await dados(adm, 'rh')).pontos.filter(x => x.funcionarioId === 'f-tela');
  assert.deepStrictEqual(meus.map(x => x.tipo), ['entrada', 'saida']);
  assert.strictEqual(meus[0].lat, LOCAL_TELA.latitude);
  assert.strictEqual(meus[0].lon, LOCAL_TELA.longitude);
  assert.strictEqual(meus[0].precisao, 15);
  // a foto chegou reduzida a 1024 px, em JPEG
  const pa = await abrir(adm, '/');
  const tam = await pa.evaluate(async id => { const r = await fetch('/rh/api/arquivos/' + id); const b = await createImageBitmap(await r.blob()); return { tipo: r.headers.get('content-type'), w: b.width, h: b.height }; }, meus[0].foto.id);
  assert.deepStrictEqual(tam, { tipo: 'image/jpeg', w: 1024, h: 768 });
  // na segunda vez o aviso não aparece
  await p.reload();
  assert.ok(!(await p.isVisible('#aviso')));
  assert.match(await p.textContent('#ultimo'), /Saída/);
  // sem permitir a localização: avisa e não registra
  await ctx.clearPermissions();
  await p.setInputFiles('#foto', foto);
  await p.waitForFunction(() => /localiza/i.test(document.querySelector('#msg').textContent), null, { timeout: 25000 });
  assert.strictEqual((await dados(adm, 'rh')).pontos.filter(x => x.funcionarioId === 'f-tela').length, 2, 'sem local não registrou');
  // a resposta não chegou: a página não diz que não registrou, manda conferir o último registro
  await ctx.grantPermissions(['geolocation'], { origin: BASE });
  await ctx.route('**/registrar', r => r.abort());
  await p.setInputFiles('#foto', foto);
  await p.waitForFunction(() => /confirmar/.test(document.querySelector('#msg').textContent), null, { timeout: 15000 });
  await ctx.unroute('**/registrar');
});

// ---------- 13. RH: central ----------
teste('RH: a central cadastra o funcionário pela tela, copia o link do ponto e gera link novo', async () => {
  const ctx = await logado();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const p = await abrir(ctx, '/');
  await p.click('a.cartao[href="/rh/"]');
  await p.waitForURL(BASE + '/rh/');
  await esperarServidor(p);
  assert.strictEqual((await p.textContent('h1')).trim(), 'Controle interno de ponto');
  assert.match(await p.textContent('main'), /REP-P/);
  await p.evaluate(() => { location.hash = 'funcionarios'; });
  await p.fill('#fu-nome', 'Carla Teste');
  await p.fill('#fu-cpf', '123.456.789-01');
  await p.fill('#fu-cargo', 'Auxiliar de escritório');
  await p.fill('#fu-jornada', '8:48');
  await p.click('#f-func button[type="submit"]');
  await p.waitForFunction(() => document.querySelector('#t-func').textContent.includes('Carla Teste'));
  let d = await dados(ctx, 'rh');
  const f = d.funcionarios.find(x => x.nome === 'Carla Teste');
  assert.ok(f, 'gravado no servidor');
  assert.strictEqual(f.cpf, '12345678901');
  assert.strictEqual(f.jornadaMin, 528);
  assert.strictEqual(f.situacao, 'ativo');
  await p.waitForFunction(id => document.querySelector(`[data-acao="copiar-link"][data-id="${id}"]`), f.id);
  const link = () => dados(ctx, 'rh').then(x => (x.links.find(l => l.id === f.id) || {}).token);
  const t1 = await link();
  assert.ok(t1, 'o link já sai no cadastro');
  await limparToast(p);
  await p.click(`[data-acao="copiar-link"][data-id="${f.id}"]`);
  await esperarToast(p, 'copiado');
  assert.strictEqual(await p.evaluate(() => navigator.clipboard.readText()), `${BASE}/ponto/${t1}`);
  // jornada que não é hora: avisa e não grava
  await p.click(`[data-acao="editar"][data-id="${f.id}"]`);
  await p.fill('#fu-jornada', 'oito');
  await limparToast(p);
  await p.click('#f-func button[type="submit"]');
  await esperarToast(p, 'jornada');
  assert.strictEqual((await dados(ctx, 'rh')).funcionarios.find(x => x.id === f.id).jornadaMin, 528);
  // link novo: pergunta antes, e o antigo para de valer
  p.once('dialog', dlg => dlg.accept());
  await limparToast(p);
  await p.click(`[data-acao="novo-link"][data-id="${f.id}"]`);
  await esperarToast(p, 'Link novo');
  const t2 = await link();
  assert.notStrictEqual(t2, t1);
  assert.strictEqual((await ctx.request.get(`${BASE}/ponto/${t1}`)).status(), 404);
  assert.strictEqual((await ctx.request.get(`${BASE}/ponto/${t2}`)).status(), 200);
});

teste('RH: a central mostra o dia com foto, mapa e horas; corrige e inclui com justificativa sem apagar o original', async () => {
  const ctx = await logado();
  const tok = await funcionarioAPI(ctx, 'f-central', { nome: 'Dora Central' });
  const p = await abrir(ctx, '/rh/#registros');
  await esperarServidor(p);
  const foto = await jpegDeTeste(p, 320, 240);
  const r = await fetch(`${BASE}/ponto/${tok}/registrar`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-Lat': '-26.8766', 'X-Lon': '-52.4036', 'X-Precisao': '10' }, body: foto.buffer });
  assert.strictEqual(r.status, 200);
  const c = await r.json();
  const bloco = p.locator('[data-func="f-central"]');
  await bloco.waitFor({ timeout: 5000 }); // chega pelo aviso ao vivo, sem recarregar
  assert.match(await bloco.textContent(), /entrada sem saída/);
  assert.strictEqual(await bloco.locator('a[href="https://www.google.com/maps?q=-26.8766,-52.4036"]').count(), 1, 'ver no mapa');
  await bloco.locator('img').first().waitFor();
  await p.waitForFunction(() => { const i = document.querySelector('[data-func="f-central"] img'); return i && i.complete && i.naturalWidth === 320; }, null, { timeout: 5000 });
  // corrigir a entrada para 08:00: sem justificativa não grava
  await bloco.locator('[data-acao="corrigir"]').first().click();
  await p.fill('#co-hora', '08:00');
  await p.fill('#co-just', '');
  await p.click('#f-cor button[type="submit"]');
  assert.match(await p.textContent('#co-msg'), /justificativa/i);
  assert.strictEqual((await dados(ctx, 'rh')).pontos.filter(x => x.funcionarioId === 'f-central').length, 1);
  await p.fill('#co-just', 'Bateu atrasado, chegou às 8h');
  await p.click('#f-cor button[type="submit"]');
  await p.waitForFunction(() => !document.querySelector('#d-cor').open);
  // incluir a saída das 12:00
  await bloco.locator('[data-acao="incluir"]').click();
  await p.selectOption('#co-tipo', 'saida');
  await p.fill('#co-hora', '12:00');
  await p.fill('#co-just', 'Esqueceu de bater a saída');
  await p.click('#f-cor button[type="submit"]');
  await p.waitForFunction(() => /4:00/.test(document.querySelector('[data-func="f-central"] .horas-dia').textContent), null, { timeout: 5000 });
  const txt = semEspaco(await bloco.textContent());
  assert.doesNotMatch(txt, /entrada sem saída/);
  assert.match(txt, new RegExp('era ' + c.hora), 'o original aparece');
  assert.match(txt, /Bateu atrasado/);
  const meus = (await dados(ctx, 'rh')).pontos.filter(x => x.funcionarioId === 'f-central');
  assert.strictEqual(meus.length, 3, 'original, correção e inclusão');
  const original = meus.find(x => x.origem === 'celular');
  assert.strictEqual(original.hora, c.hora, 'o original não mudou');
  assert.ok(meus.some(x => x.substitui === original.id && x.hora === '08:00' && x.por === 'admin'));
});

teste('RH: relatório do mês dá o total certo num caso com 2 dias, com Excel e página para imprimir', async () => {
  const ctx = await logado();
  await funcionarioAPI(ctx, 'f-mes', { nome: 'Edu Relatório', cpf: '11122233344', jornadaMin: 528 });
  const incluir = async (tipo, data, hora, extra = {}) => {
    const r = await ctx.request.post(`${BASE}/rh/api/pontos`, { data: Object.assign({ funcionarioId: 'f-mes', tipo, data, hora, justificativa: 'Teste do relatório' }, extra) });
    assert.strictEqual(r.status(), 200);
    return (await r.json()).ponto;
  };
  // dia 7: um registro desconsiderado não soma, mas o dia sai como ajustado pelo RH
  const desc = await incluir('entrada', '2026-10-07', '09:00');
  await incluir(undefined, undefined, undefined, { funcionarioId: undefined, substitui: desc.id, anulado: true });
  // dia 5: 4:00 + 4:48 = 8:48 (a jornada); dia 6: 10:00 (1:12 acima) e uma entrada sem saída, que não soma
  await incluir('entrada', '2026-10-05', '08:00'); await incluir('saida', '2026-10-05', '12:00');
  await incluir('entrada', '2026-10-05', '13:00'); await incluir('saida', '2026-10-05', '17:48');
  await incluir('entrada', '2026-10-06', '08:00'); await incluir('saida', '2026-10-06', '18:00');
  await incluir('entrada', '2026-10-06', '19:00');
  const p = await abrir(ctx, '/rh/#relatorio');
  await esperarServidor(p);
  await p.fill('#m-mes', '2026-10');
  await p.locator('#m-mes').dispatchEvent('change');
  const bloco = p.locator('.rel-func[data-func="f-mes"]');
  await bloco.waitFor({ timeout: 5000 });
  assert.strictEqual(await bloco.locator('tr[data-dia]').count(), 31, 'todos os dias de outubro');
  assert.strictEqual((await bloco.locator('.total-horas').textContent()).trim(), '18:48');
  assert.strictEqual((await bloco.locator('.total-extra').textContent()).trim(), '1:12');
  const d5 = semEspaco(await bloco.locator('tr[data-dia="2026-10-05"]').textContent());
  assert.match(d5, /08:00, 13:00/);
  assert.match(d5, /12:00, 17:48/);
  assert.match(d5, /8:48/);
  const d6 = semEspaco(await bloco.locator('tr[data-dia="2026-10-06"]').textContent());
  assert.match(d6, /08:00, 19:00/);
  assert.match(d6, /10:00/);
  assert.match(d6, /1:12/);
  assert.match(d6, /entrada sem saída/);
  assert.strictEqual(await bloco.locator('tr[data-dia="2026-10-06"].marcado').count(), 1, 'o dia com entrada sem saída fica marcado');
  assert.match(semEspaco(await bloco.locator('tr[data-dia="2026-10-07"]').textContent()), /ajustado pelo RH/, 'o dia com registro desconsiderado aparece');
  const resumo = semEspaco(await p.locator('#m-resumo tr[data-func="f-mes"]').textContent());
  assert.match(resumo, /Edu Relatório/);
  assert.match(resumo, /18:48/);
  assert.match(resumo, /1:12/);
  // Excel: aba Resumo e uma aba por funcionário, com as horas em [h]:mm
  const xml = await p.evaluate(async () => { const x = planilhaMes('2026-10'); return x instanceof Blob ? await x.text() : new TextDecoder().decode(x); });
  assert.ok(xml.includes('<sheet name="Resumo"'), 'aba Resumo');
  assert.ok(xml.includes('<sheet name="Edu Relatório"'), 'aba do funcionário');
  assert.ok(xml.includes('[h]:mm'), 'horas como hora do Excel');
  assert.ok(xml.includes('<v>' + (1128 / 1440) + '</v>'), 'total 18:48 no Excel');
  assert.ok(xml.includes('<v>' + (72 / 1440) + '</v>'), '1:12 acima da jornada no Excel');
  assert.ok(xml.includes('entrada sem saída'), 'a marcação vai para o Excel');
  const [baixado] = await Promise.all([p.waitForEvent('download'), p.click('[data-acao="excel"]')]);
  assert.strictEqual(baixado.suggestedFilename(), 'ponto-2026-10.xlsx');
  // na impressão sai só o relatório
  await p.emulateMedia({ media: 'print' });
  assert.ok(!(await p.isVisible('.abas')), 'sem as abas na impressão');
  assert.ok(!(await p.isVisible('#m-mes')), 'sem os filtros na impressão');
  assert.ok(await p.isVisible('.rel-func[data-func="f-mes"]'));
  assert.match(await p.textContent('.so-impressao'), /Controle interno de ponto/);
  await p.emulateMedia({ media: 'screen' });
});

teste('RH: a central continua rápida com um ano de registros de 50 funcionários', async () => {
  const ctx = await logado();
  const p = await abrir(ctx, '/rh/#registros');
  await esperarServidor(p);
  const ms = await p.evaluate(() => {
    const hoje = hojeISO(), ini = Date.parse(hoje + 'T12:00:00Z');
    for (let f = 0; f < 50; f++) {
      D.funcionarios.set('fx' + f, { id: 'fx' + f, nome: 'Carga ' + f, jornadaMin: 528, situacao: 'ativo' });
      for (let d = 0; d < 365; d++) {
        const data = new Date(ini - d * 86400000).toISOString().slice(0, 10);
        [['entrada', '08:00'], ['saida', '12:00'], ['entrada', '13:00'], ['saida', d % 7 ? '17:48' : '19:00']].forEach(([tipo, hora], i) => {
          if (d === 3 && i === 3) return; // uma entrada sem saída para o aviso
          D.pontos.set(`px${f}-${d}-${i}`, { id: `px${f}-${d}-${i}`, funcionarioId: 'fx' + f, tipo, data, hora, origem: 'celular' });
        });
      }
    }
    const t0 = performance.now(); render(); const t1 = performance.now(); relatorioMes(hoje.slice(0, 7)); const t2 = performance.now();
    return { registros: Math.round(t1 - t0), relatorio: Math.round(t2 - t1), aviso: document.querySelector('#r-pendentes').textContent.includes('Carga 0') };
  });
  assert.ok(ms.aviso, 'o aviso de entrada sem saída aparece');
  assert.ok(ms.registros < 1000 && ms.relatorio < 1000, 'milissegundos: ' + JSON.stringify(ms));
});

teste('RH: clique duplo em Salvar ou em Gravar não duplica', async () => {
  const ctx = await logado();
  const p = await abrir(ctx, '/rh/#funcionarios');
  await esperarServidor(p);
  await p.fill('#fu-nome', 'Gil Duplo');
  await p.fill('#fu-jornada', '8:00');
  await p.dblclick('#f-func button[type="submit"]');
  await p.waitForFunction(() => document.querySelector('#t-func').textContent.includes('Gil Duplo'));
  await p.waitForTimeout(600);
  const gil = (await dados(ctx, 'rh')).funcionarios.filter(f => f.nome === 'Gil Duplo');
  assert.strictEqual(gil.length, 1, 'um funcionário só');
  await p.evaluate(() => { location.hash = 'registros'; });
  await p.click(`[data-acao="incluir"][data-id="${gil[0].id}"]`);
  await p.fill('#co-hora', '07:00');
  await p.fill('#co-just', 'Clique duplo');
  await p.dblclick('#f-cor button[type="submit"]');
  await p.waitForFunction(() => !document.querySelector('#d-cor').open);
  await p.waitForTimeout(600);
  assert.strictEqual((await dados(ctx, 'rh')).pontos.filter(x => x.funcionarioId === gil[0].id).length, 1, 'um registro só');
});

teste('RH: se a primeira leitura dos dados falha, a central tenta de novo sozinha', async () => {
  const ctx = await logado();
  let pedidos = 0;
  await ctx.route('**/rh/api/dados', r => (pedidos++ ? r.continue() : r.fulfill({ status: 502, body: 'Bad Gateway' })));
  const p = await abrir(ctx, '/rh/');
  await esperarServidor(p, 15000);
  assert.ok(pedidos >= 2, 'tentou de novo: ' + pedidos);
});

teste('celular 390px: central do RH sem rolagem para o lado', async () => {
  const ctx = await logado({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await abrir(ctx, '/rh/');
  await esperarServidor(p);
  const larguras = {};
  for (const aba of ['registros', 'funcionarios', 'relatorio']) {
    await p.evaluate(x => { location.hash = x; }, aba);
    await p.waitForFunction(x => { const v = document.querySelector('#v-' + x); return !!v && !v.hidden; }, aba);
    await p.waitForTimeout(200);
    larguras[aba] = await larguraDaPagina(p);
  }
  assert.deepStrictEqual(Object.entries(larguras).filter(([, w]) => w > 390), [], 'larguras: ' + JSON.stringify(larguras));
});

// ---------- 9. erros de página ----------
teste('nenhum erro de página (pageerror) em nenhum teste', async () => {
  assert.deepStrictEqual(errosDePagina, []);
});

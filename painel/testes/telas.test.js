'use strict';
/* Testes de tela do Painel Deconto (Playwright). Rodar: node --test painel/testes/telas.test.js
   Sobe o servidor num processo filho, com pastas temporárias e as páginas de verdade
   (DECONT e Controle de Operação), e usa o Chromium do Playwright. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const PORTA = 3398;
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
fs.copyFileSync(path.join(RAIZ, 'munck', 'mapa-sul.json'), path.join(PUBLICO, 'mapa-sul.json'));

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
    proc = spawn(process.execPath, [SERVIDOR], { env: Object.assign({}, process.env, { PORTA: String(PORTA), HOST: '127.0.0.1', PAINEL_SENHA: SENHA, PASTA_DADOS: DADOS, PASTA_PUBLICO: PUBLICO, PASTA_CARGA: CARGA }), stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    proc.stdout.on('data', c => { saida += c; if (saida.includes('Painel Deconto em')) ok(); });
    proc.stderr.on('data', c => { saida += c; });
    proc.on('exit', code => falha(new Error('servidor saiu: ' + code + '\n' + saida)));
    setTimeout(() => falha(new Error('servidor não subiu:\n' + saida)), 15000);
  });
}
function descer() { return new Promise(ok => { if (!proc) return ok(); proc.removeAllListeners('exit'); proc.on('exit', () => ok()); proc.kill('SIGTERM'); }); }

before(async () => {
  await subir();
  navegador = await chromium.launch();
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

// ---------- 1. login, tela inicial e DECONT pelo cartão ----------
teste('login e tela inicial mostram os 5 cartões; DECONT abre pelo cartão e mostra "Salvo no servidor"', async () => {
  const ctx = await contexto();
  const p = await ctx.newPage();
  await p.goto(BASE + '/');
  assert.match(p.url(), /\/entrar$/, 'sem login vai para /entrar');
  await p.fill('#usuario', 'admin');
  await p.fill('#senha', SENHA);
  await p.click('#ir');
  await p.waitForURL(BASE + '/');
  const nomes = await p.$$eval('.cartao h2', hs => hs.map(h => h.textContent.trim()));
  assert.deepStrictEqual(nomes, ['DECONT', 'Controle de Operação', 'RH', 'Financeiro', 'Cargas']);
  assert.strictEqual(await p.locator('a.cartao[href="/frota/"]').count(), 1);
  assert.strictEqual(await p.locator('a.cartao[href="/operacao/"]').count(), 1);
  const breves = await p.$$eval('.cartao.breve', cs => cs.map(c => c.querySelector('h2').textContent.trim() + ': ' + c.textContent));
  assert.strictEqual(breves.length, 3);
  for (const [i, nome] of ['RH', 'Financeiro', 'Cargas'].entries()) {
    assert.ok(breves[i].startsWith(nome + ':'), 'cartão em desenvolvimento: ' + nome);
    assert.match(breves[i], /Em desenvolvimento/);
  }
  await p.click('a.cartao[href="/frota/"]');
  await p.waitForURL(BASE + '/frota/');
  await esperarServidor(p);
  assert.strictEqual(await p.evaluate(() => window.PAINEL && window.PAINEL.sistema), 'frota');
  assert.strictEqual(await p.title(), 'DECONT');
});

// ---------- 2. caminhão pela tela e o outro navegador vê ----------
teste('DECONT: cadastrar caminhão pela tela e outro navegador vê em até 2 s sem recarregar', async () => {
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
teste('DECONT: documento com PDF anexado fica com o arquivo no servidor e a API devolve os mesmos bytes', async () => {
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
teste('DECONT: "Carregar uma cópia" com 20 documentos e PDFs guarda os 20 no servidor, e carregar de novo não cria arquivos', async () => {
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
teste('DECONT: "Salvar cópia de tudo" no modo servidor gera um .json com os arquivos embutidos', async () => {
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
    assert.strictEqual(await p.locator('.cartao').count(), 5, 'tela inicial depois de ' + sis);
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
teste('Controle de Operação: abre pelo cartão, agenda pelo quadro e o outro navegador vê, mapa abre e carrega cópia "controle-munck"', async () => {
  const ctxA = await logado();
  const a = await abrir(ctxA, '/');
  await a.click('a.cartao[href="/operacao/"]');
  await a.waitForURL(BASE + '/operacao/');
  assert.strictEqual(await a.title(), 'Controle de Operação');
  await esperarServidor(a);
  assert.strictEqual(await a.evaluate(() => window.PAINEL && window.PAINEL.sistema), 'operacao');

  // caminhão e obra para o quadro (pelas funções da página)
  await a.evaluate(async () => {
    const agora = new Date().toISOString();
    await gravar('caminhoes', { id: 'cam-op-1', placa: 'OPR1A23', apelido: 'Munck 1', situacao: 'ativo', criadoEm: agora });
    await gravar('obras', { id: 'ob-tela-1', nome: 'Obra Teste Tela', cliente: 'Cliente X', cidade: 'Chapecó', situacao: 'andamento', inicio: agora.slice(0, 10), etapas: [], criadoEm: agora });
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
  await a.selectOption('#ag-obra', 'ob-tela-1');
  await a.fill('#ag-hora', '08:00');
  await a.fill('#ag-serv', 'Içar poste');
  await limparToast(a);
  await a.click('#f-ag button[type="submit"]');
  const t0 = Date.now();
  await b.waitForFunction(() => document.querySelector('#quadro').textContent.includes('Obra Teste Tela'), null, { timeout: 2000 });
  assert.ok(Date.now() - t0 <= 2000);
  assert.strictEqual(await b.evaluate(() => window.__semRecarregar), 'sim', 'o outro navegador não recarregou');
  await esperarToast(a, 'Agendado');
  const o = await dados(ctxA, 'operacao');
  assert.ok(o.agenda.some(x => x.caminhaoId === 'cam-op-1' && x.obraId === 'ob-tela-1' && x.data === hoje && x.servico === 'Içar poste'), 'agendamento no servidor');

  // mapa
  await a.click('.aba[data-aba="mapa"]');
  await a.waitForSelector('#mapa-svg', { timeout: 15000 });

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

// ---------- 8. celular ----------
teste('celular 390px: tela inicial e DECONT sem rolagem para o lado', async () => {
  const ctx = await logado({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await abrir(ctx, '/');
  await p.waitForSelector('.cartao');
  const larguras = { inicial: await larguraDaPagina(p) };
  await p.goto(BASE + '/frota/');
  await esperarServidor(p);
  larguras['DECONT painel'] = await larguraDaPagina(p);
  for (const aba of ['frota', 'documentos']) {
    await p.evaluate(x => { location.hash = x; }, aba);
    await p.waitForFunction(x => { const v = document.querySelector('#v-' + x); return !!v && !v.hidden; }, aba);
    await p.waitForTimeout(300);
    larguras['DECONT #' + aba] = await larguraDaPagina(p);
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
teste('gravação feita por outro navegador enquanto a página abre aparece sem recarregar (DECONT e Controle)', async () => {
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

// ---------- 9. erros de página ----------
teste('nenhum erro de página (pageerror) em nenhum teste', async () => {
  assert.deepStrictEqual(errosDePagina, []);
});

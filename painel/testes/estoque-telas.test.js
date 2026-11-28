'use strict';
/* Testes de tela do Estoque e da ligação com o DECONTO e o Controle (Playwright).
   Rodar: node --test painel/testes/estoque-telas.test.js
   Sobe o servidor num processo filho, com pastas temporárias e as páginas de verdade. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

// o node --test roda este arquivo junto do telas.test.js: duas portas depois da dele
const PORTA = (Number(process.env.PORTA_TESTE) || 3398) + 2;
const BASE = `http://127.0.0.1:${PORTA}`;
const RAIZ = path.join(__dirname, '..', '..');
const SERVIDOR = path.join(__dirname, '..', 'servidor', 'servidor.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-estoque-telas-'));
const PUBLICO = path.join(tmp, 'publico');
const SENHA = 'senhaTeste1';
fs.mkdirSync(PUBLICO, { recursive: true });
fs.copyFileSync(path.join(RAIZ, 'sistema-carlise', 'frota.html'), path.join(PUBLICO, 'frota.html'));
fs.copyFileSync(path.join(RAIZ, 'munck', 'munck.html'), path.join(PUBLICO, 'operacao.html'));
fs.copyFileSync(path.join(RAIZ, 'estoque', 'estoque.html'), path.join(PUBLICO, 'estoque.html'));

let proc = null, navegador = null, testeAtual = '';
const errosDePagina = [], abertos = [];
function subir() {
  return new Promise((ok, falha) => {
    proc = spawn(process.execPath, [SERVIDOR], { env: Object.assign({}, process.env, { PORTA: String(PORTA), HOST: '127.0.0.1', PAINEL_SENHA: SENHA, PASTA_DADOS: path.join(tmp, 'data'), PASTA_PUBLICO: PUBLICO, PASTA_CARGA: path.join(tmp, 'carga') }), stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    proc.stdout.on('data', c => { saida += c; if (saida.includes('Painel Deconto em')) ok(); });
    proc.stderr.on('data', c => { saida += c; });
    proc.on('exit', code => falha(new Error('servidor saiu: ' + code + '\n' + saida)));
    setTimeout(() => falha(new Error('servidor não subiu:\n' + saida)), 15000);
  });
}
before(async () => {
  await subir();
  navegador = await chromium.launch(process.env.PW_CANAL ? { channel: process.env.PW_CANAL } : {});
});
after(async () => {
  if (navegador) await navegador.close().catch(() => {});
  if (proc) await new Promise(ok => { proc.removeAllListeners('exit'); proc.on('exit', () => ok()); proc.kill('SIGTERM'); });
  fs.rmSync(tmp, { recursive: true, force: true });
});
function teste(nome, fn) {
  test(nome, { timeout: 180000 }, async t => {
    testeAtual = nome;
    try { await fn(t); } finally { for (const c of abertos.splice(0)) await c.close().catch(() => {}); }
  });
}
async function contexto(opc = {}) {
  const ctx = await navegador.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }, opc));
  abertos.push(ctx);
  await ctx.route(u => /^https?:$/.test(u.protocol) && u.host !== `127.0.0.1:${PORTA}`, r => r.abort());
  ctx.on('page', p => p.on('pageerror', e => errosDePagina.push(`[${testeAtual}] ${p.url()}: ${e.message}`)));
  return ctx;
}
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
const esperarServidor = p => p.waitForFunction(() => { const e = document.querySelector('#estado'); return !!e && e.textContent.trim() === 'Salvo no servidor'; }, null, { timeout: 15000 });
const esperarToast = (p, trecho) => p.waitForFunction(x => { const t = document.querySelector('#toast'); return !!t && t.textContent.includes(x); }, trecho, { timeout: 15000 });
const limparToast = p => p.evaluate(() => { document.querySelector('#toast').textContent = ''; });
const texto = (p, sel) => p.evaluate(s => (document.querySelector(s) || {}).textContent || '', sel);
// o "R$ 260,00" do Intl tem espaço que não quebra: compara com espaços comuns
const esperarTexto = (p, sel, trecho, timeout = 6000) => p.waitForFunction(([s, x]) => { const el = document.querySelector(s); return !!el && el.textContent.replace(/\s/g, ' ').includes(x); }, [sel, trecho], { timeout });
async function pedir(ctx, metodo, rota, corpo) {
  const r = await ctx.request.fetch(BASE + rota, { method: metodo, data: corpo });
  assert.strictEqual(r.status(), 200, metodo + ' ' + rota);
  return r.json();
}
const saldos = ctx => pedir(ctx, 'GET', '/estoque/api/saldos');
const material = async (ctx, nome) => (await saldos(ctx)).materiais.find(m => m.nome === nome);
let n = 0;
const id = p => p + '-' + Date.now().toString(36) + (++n);
async function criarMaterial(ctx, dados) {
  const mid = id('mat');
  await pedir(ctx, 'PUT', '/estoque/api/dados/materiais/' + mid, Object.assign({ categoria: 'Peças', unidade: 'un', minimo: null, ativo: true, criadoEm: new Date().toISOString() }, dados));
  return mid;
}
const entrada = (ctx, materialId, qtd, valorUnit, data = '2026-11-01') => pedir(ctx, 'PUT', '/estoque/api/dados/movimentos/' + id('mv'), { tipo: 'entrada', materialId, data, qtd, valorUnit, criadoEm: new Date().toISOString() });
const linhaSaldo = (p, mid) => p.$$eval(`#t-saldo tr[data-mat="${mid}"] td`, tds => tds.map(t => t.textContent).join(' | '));
const semEspaco = s => s.replace(/\s+/g, ' ');

// ---------- Estoque ----------
teste('Estoque: cadastra tanque e filtro, compra, saída e medição; saldo, barra, avisos, histórico e Excel', async () => {
  const ctx = await logado();
  const p = await abrir(ctx, '/estoque/');
  await esperarServidor(p);
  const cadastrar = async (nome, cat, extra) => {
    await p.click('[data-acao="novo-mat"]');
    await p.fill('#mat-nome', nome);
    await p.selectOption('#mat-cat', cat);
    for (const [sel, v] of Object.entries(extra)) await p.fill(sel, v);
    await p.click('#f-mat button[type="submit"]');
    await esperarToast(p, nome);
  };
  await cadastrar('Tanque pátio', 'Combustível', { '#mat-min': '1.000', '#mat-cap': '5.000' });
  await cadastrar('Filtro de óleo', 'Filtros', { '#mat-min': '2', '#mat-local': 'Prateleira A' });
  const tq = await material(ctx, 'Tanque pátio'), fil = await material(ctx, 'Filtro de óleo');
  assert.strictEqual(tq.tanque, true);
  assert.strictEqual(tq.unidade, 'L', 'tanque fica em litros');
  assert.strictEqual(tq.capacidade, 5000);
  assert.strictEqual(fil.local, 'Prateleira A');
  const lancar = async (tipo, mid, qtd, extra = {}) => {
    await p.selectOption('#mov-tipo', tipo);
    await p.selectOption('#mov-mat', mid);
    await p.fill('#mov-qtd', qtd);
    for (const [sel, v] of Object.entries(extra)) await p.fill(sel, v);
    await limparToast(p);
    await p.click('#f-mov button[type="submit"]');
    await esperarToast(p, 'salv');
  };
  await lancar('entrada', tq.id, '3.000', { '#mov-vu': '5,50', '#mov-forn': 'Distribuidora Sul' });
  await lancar('entrada', fil.id, '3', { '#mov-vu': '40' });
  await lancar('saida', fil.id, '2', { '#mov-quem': 'João' });
  await lancar('medicao', tq.id, '800');
  await esperarTexto(p, `#t-saldo tr[data-mat="${tq.id}"]`, '800');
  await esperarTexto(p, `#t-saldo tr[data-mat="${fil.id}"]`, 'Baixo');
  assert.match(semEspaco(await linhaSaldo(p, fil.id)), /\b1 un\b/);
  const s = await material(ctx, 'Tanque pátio');
  assert.strictEqual(s.saldo, 800);
  assert.strictEqual(s.precoMedio, 5.5);
  assert.deepStrictEqual([s.ultimaMedicao.valor, s.ultimaMedicao.data.length], [800, 10]);
  // tanque com barra
  const tanque = semEspaco(await texto(p, '#tanques'));
  assert.match(tanque, /Tanque pátio/);
  assert.match(tanque, /800 L de 5\.000 L/);
  assert.strictEqual(await p.locator('#tanques .tanque .nivel').count(), 1);
  // avisos
  const avisos = await texto(p, '#avisos');
  assert.match(avisos, /Tanque pátio abaixo do mínimo/);
  assert.match(avisos, /Filtro de óleo no mínimo/);
  // histórico do filtro: compra e saída
  await p.click(`#t-saldo tr[data-mat="${fil.id}"] [data-acao="historico"]`);
  await esperarTexto(p, '#movs', 'João');
  const movs = await texto(p, '#movs');
  assert.match(movs, /Compra/);
  assert.match(movs, /Saída avulsa/);
  // Excel com saldo e movimentos
  const [baixado] = await Promise.all([p.waitForEvent('download'), p.click('[data-acao="excel"]')]);
  assert.match(baixado.suggestedFilename(), /^estoque-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const xlsx = fs.readFileSync(await baixado.path()).toString('utf8');
  assert.ok(xlsx.includes('name="Saldo"') && xlsx.includes('name="Movimentos"'), 'abas Saldo e Movimentos');
  assert.ok(xlsx.includes('Filtro de óleo') && xlsx.includes('Distribuidora Sul'), 'os dados estão na planilha');
});

teste('Estoque: material sem movimento apaga, com movimento só desativa; outro navegador vê sem recarregar', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/estoque/'), b = await abrir(await logado(), '/estoque/');
  await esperarServidor(a);
  await esperarServidor(b);
  const mid = await criarMaterial(ctx, { nome: 'Luva de raspa', categoria: 'EPI', unidade: 'un' });
  await esperarTexto(a, `#t-saldo tr[data-mat="${mid}"]`, 'Apagar');
  await b.evaluate(() => { window.__semRecarregar = 'sim'; });
  await entrada(ctx, mid, 12, 9.9);
  await esperarTexto(b, `#t-saldo tr[data-mat="${mid}"]`, '12 un');
  assert.strictEqual(await b.evaluate(() => window.__semRecarregar), 'sim');
  await esperarTexto(a, `#t-saldo tr[data-mat="${mid}"]`, 'Desativar');
  assert.doesNotMatch(await linhaSaldo(a, mid), /Apagar/);
  await a.click(`#t-saldo tr[data-mat="${mid}"] [data-acao="desativar"]`);
  await esperarTexto(a, `#t-saldo tr[data-mat="${mid}"]`, 'Desativado');
  assert.strictEqual((await material(ctx, 'Luva de raspa')).ativo, false);
  const sem = await criarMaterial(ctx, { nome: 'Sem uso' });
  await esperarTexto(a, `#t-saldo tr[data-mat="${sem}"]`, 'Apagar');
  await a.click(`#t-saldo tr[data-mat="${sem}"] [data-acao="apagar-mat"]`);
  await a.waitForFunction(x => !document.querySelector(`#t-saldo tr[data-mat="${x}"]`), sem, { timeout: 6000 });
  assert.strictEqual(await material(ctx, 'Sem uso'), undefined);
});

teste('Estoque: saldo negativo fica em vermelho e avisa', async () => {
  const ctx = await logado();
  const mid = await criarMaterial(ctx, { nome: 'Lona de freio', categoria: 'Peças' });
  await entrada(ctx, mid, 1, 120);
  await pedir(ctx, 'PUT', '/frota/api/dados/manutencoes/' + id('man'), { data: '2026-11-05', veiculoTipo: 'caminhao', veiculoId: 'cam-x', tipo: 'Freios', servico: 0, valor: 480, pecas: [{ origem: 'estoque', materialId: mid, nome: 'Lona de freio', qtd: 4, preco: 120 }] });
  const p = await abrir(ctx, '/estoque/');
  await esperarServidor(p);
  await esperarTexto(p, `#t-saldo tr[data-mat="${mid}"]`, '-3');
  assert.strictEqual(await p.getAttribute(`#t-saldo tr[data-mat="${mid}"]`, 'class'), 'neg');
  assert.match(await texto(p, '#avisos'), /Lona de freio com saldo negativo/);
});

teste('celular 390px: Estoque sem rolagem para o lado', async () => {
  const ctx = await logado({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await abrir(ctx, '/estoque/');
  await esperarServidor(p);
  await p.click('[data-acao="novo-mat"]');
  await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, 'largura: ' + await p.evaluate(() => document.documentElement.scrollWidth));
});

// ---------- DECONTO: abastecimento no tanque ----------
const camFrota = (ctx, cid, placa) => pedir(ctx, 'PUT', '/frota/api/dados/caminhoes/' + cid, { placa, tipo: 'Cavalo mecânico 6x2', situacao: 'rodando', kmInicial: 100000 });
async function tanqueCom(ctx, nome, litros, preco) {
  const tq = await criarMaterial(ctx, { nome, categoria: 'Combustível', unidade: 'L', capacidade: 5000, minimo: 1000, combustivel: 'Diesel S10' });
  if (litros) await entrada(ctx, tq, litros, preco);
  return tq;
}
teste('DECONTO: abastecer no tanque tira os litros do Estoque e o valor vem pelo preço médio', async () => {
  const ctx = await logado();
  const tq = await tanqueCom(ctx, 'Tanque oficina', 3000, 5.5);
  await camFrota(ctx, 'cam-tq', 'TNQ1A00');
  const e = await abrir(await logado(), '/estoque/');
  await esperarServidor(e);
  const p = await abrir(ctx, '/frota/#abastecer');
  await esperarServidor(p);
  await p.waitForFunction(x => !!document.querySelector(`#ab-onde option[value="${x}"]`), tq, { timeout: 6000 });
  assert.strictEqual(await p.isVisible('#ab-onde'), true);
  await p.selectOption('#ab-cam', 'cam-tq');
  await p.selectOption('#ab-onde', tq);
  assert.strictEqual(await p.isVisible('#ab-posto'), false, 'no tanque não pede o posto');
  await p.fill('#ab-litros', '300');
  assert.strictEqual(await p.inputValue('#ab-valor'), '1.650,00');
  assert.match(await texto(p, '#ab-onde-dica'), /3\.000 L/);
  await e.evaluate(() => { window.__semRecarregar = 'sim'; });
  await limparToast(p);
  await p.click('#f-ab button[type="submit"]');
  await esperarToast(p, 'Abastecimento salvo');
  const ab = (await pedir(ctx, 'GET', '/frota/api/dados')).abastecimentos.find(a => a.caminhaoId === 'cam-tq');
  assert.deepStrictEqual([ab.tanqueId, ab.litros, ab.valor, ab.combustivel], [tq, 300, 1650, 'Diesel S10']);
  assert.strictEqual((await material(ctx, 'Tanque oficina')).saldo, 2700);
  await esperarTexto(e, `#t-saldo tr[data-mat="${tq}"]`, '2.700 L');
  assert.strictEqual(await e.evaluate(() => window.__semRecarregar), 'sim', 'o Estoque não recarregou');
  await e.click(`#t-saldo tr[data-mat="${tq}"] [data-acao="historico"]`);
  await esperarTexto(e, '#movs', 'Abastecimento no DECONTO');
  assert.strictEqual(await e.locator('#movs a[href="/frota/#abastecer"]').count(), 1);
  // valor escrito à mão não é trocado pelo preço médio
  await p.selectOption('#ab-onde', tq);
  await p.fill('#ab-valor', '1.000,00');
  await p.fill('#ab-litros', '100');
  assert.strictEqual(await p.inputValue('#ab-valor'), '1.000,00');
});

teste('DECONTO no arquivo (file://): sem "Onde abasteceu"; corrigir abastecimento com tanque mantém o tanqueId', async () => {
  const ctx = await contexto();
  const l = await ctx.newPage();
  await l.goto(pathToFileURL(path.join(RAIZ, 'sistema-carlise', 'frota.html')).href + '#abastecer');
  await l.waitForFunction(() => Armazem.modo === 'local');
  assert.strictEqual(await l.isVisible('#ab-onde'), false);
  assert.strictEqual(await l.isVisible('#ab-posto'), true);
  await l.evaluate(async () => {
    await gravar('caminhoes', { id: 'cam-l', placa: 'LOC1A00', tipo: 'Truck', situacao: 'rodando' });
    await gravar('abastecimentos', { id: 'ab-l', data: '2026-11-10', caminhaoId: 'cam-l', litros: 100, valor: 550, tanqueId: 'tq-x', combustivel: 'Diesel S10', tanqueCheio: true });
    editar('abastecimentos', 'ab-l');
  });
  await l.fill('#ab-litros', '120');
  await l.click('#f-ab button[type="submit"]');
  await esperarToast(l, 'Abastecimento salvo');
  assert.deepStrictEqual(await l.evaluate(() => { const a = D.abastecimentos.get('ab-l'); return [a.litros, a.tanqueId]; }), [120, 'tq-x']);
});

// ---------- DECONTO: peças na manutenção ----------
const linha = (p, i) => p.locator('#man-pecas .peca').nth(i);
async function novaPeca(p, i, campos) {
  await p.click('#f-man [data-acao="add-peca"]');
  const l = linha(p, i);
  if (campos.origem) await l.locator('.p-origem').selectOption(campos.origem);
  if (campos.mat) await l.locator('.p-mat').selectOption(campos.mat);
  for (const k of ['nome', 'qtd', 'valor', 'forn']) if (campos[k] != null) await l.locator('.p-' + k).fill(campos[k]);
  return l;
}
async function abrirManutencao(ctx, veiculo) {
  const p = await abrir(ctx, '/frota/#manutencao');
  await esperarServidor(p);
  await p.waitForFunction(() => ESTOQUE.ok, null, { timeout: 6000 });
  if (veiculo) await p.selectOption('#man-veic', veiculo);
  return p;
}
const manDoCam = async (ctx, cid) => (await pedir(ctx, 'GET', '/frota/api/dados')).manutencoes.filter(m => m.veiculoId === cid);
teste('DECONTO: peças do estoque e compradas; total ao vivo; a lista usa o total', async () => {
  const ctx = await logado();
  const mid = await criarMaterial(ctx, { nome: 'Filtro diesel', categoria: 'Filtros' });
  await entrada(ctx, mid, 3, 40);
  await camFrota(ctx, 'cam-pc', 'PCA1A00');
  const p = await abrirManutencao(ctx, 'caminhao:cam-pc');
  assert.match(await texto(p, 'label[for="man-valor"]'), /Mão de obra \/ serviço/);
  await p.fill('#man-valor', '100');
  const l0 = await novaPeca(p, 0, { mat: mid, qtd: '2' });
  assert.match(await l0.locator('.p-info').textContent(), /Em estoque: 3/);
  await novaPeca(p, 1, { origem: 'comprada', nome: 'Correia', qtd: '1', valor: '80', forn: 'Auto Peças X' });
  await esperarTexto(p, '#man-total', 'R$ 260,00');
  await limparToast(p);
  await p.click('#f-man button[type="submit"]');
  await esperarToast(p, 'Manutenção salva');
  const [m] = await manDoCam(ctx, 'cam-pc');
  assert.deepStrictEqual([m.valor, m.servico, m.pecas.length], [260, 100, 2]);
  assert.deepStrictEqual([m.pecas[0].origem, m.pecas[0].materialId, m.pecas[0].qtd, m.pecas[0].preco, m.pecas[0].nome], ['estoque', mid, 2, 40, 'Filtro diesel']);
  assert.deepStrictEqual([m.pecas[1].origem, m.pecas[1].nome, m.pecas[1].qtd, m.pecas[1].valor, m.pecas[1].fornecedor], ['comprada', 'Correia', 1, 80, 'Auto Peças X']);
  assert.strictEqual((await material(ctx, 'Filtro diesel')).saldo, 1);
  await esperarTexto(p, '#t-man', 'R$ 260,00');
  assert.strictEqual(await p.locator('#man-pecas .peca').count(), 0, 'o formulário limpo não tem peças');
});

teste('DECONTO: pedir mais do que tem avisa e sugere dividir; salva com saldo negativo', async () => {
  const ctx = await logado();
  const mid = await criarMaterial(ctx, { nome: 'Lâmpada H7', categoria: 'Peças' });
  await entrada(ctx, mid, 1, 15);
  await camFrota(ctx, 'cam-dv', 'DIV1A00');
  const p = await abrirManutencao(ctx, 'caminhao:cam-dv');
  await p.fill('#man-valor', '0');
  const l0 = await novaPeca(p, 0, { mat: mid, qtd: '4' });
  assert.match(await l0.locator('.p-info').textContent(), /Em estoque: 1, pediu 4/);
  await l0.locator('[data-acao="dividir-peca"]').click();
  const l1 = linha(p, 1);
  assert.deepStrictEqual([await l0.locator('.p-qtd').inputValue(), await l1.locator('.p-origem').inputValue(), await l1.locator('.p-nome').inputValue(), await l1.locator('.p-qtd').inputValue()], ['1', 'comprada', 'Lâmpada H7', '3']);
  await l1.locator('.p-valor').fill('45');
  await esperarTexto(p, '#man-total', 'R$ 60,00');
  await limparToast(p);
  await p.click('#f-man button[type="submit"]');
  await esperarToast(p, 'Manutenção salva');
  assert.strictEqual((await material(ctx, 'Lâmpada H7')).saldo, 0);
  // sem dividir: não trava, o saldo fica negativo
  await p.waitForFunction(x => ESTOQUE.porId.get(x).saldo === 0, mid, { timeout: 6000 });
  await p.selectOption('#man-veic', 'caminhao:cam-dv');
  await p.fill('#man-valor', '0');
  const n0 = await novaPeca(p, 0, { mat: mid, qtd: '2' });
  assert.match(await n0.locator('.p-info').textContent(), /Em estoque: 0, pediu 2/);
  assert.strictEqual(await n0.locator('[data-acao="peca-comprada"]').count(), 1);
  await limparToast(p);
  await p.click('#f-man button[type="submit"]');
  await esperarToast(p, 'Manutenção salva');
  const s = await material(ctx, 'Lâmpada H7');
  assert.deepStrictEqual([s.saldo, s.situacao], [-2, 'negativo']);
});

teste('DECONTO: corrigir manutenção não desconta as próprias peças; antiga sem peças abre com o valor no serviço', async () => {
  const ctx = await logado();
  const mid = await criarMaterial(ctx, { nome: 'Filtro de ar', categoria: 'Filtros' });
  await entrada(ctx, mid, 3, 50);
  await camFrota(ctx, 'cam-co', 'COR1A00');
  await pedir(ctx, 'PUT', '/frota/api/dados/manutencoes/man-co', { data: '2026-11-05', veiculoTipo: 'caminhao', veiculoId: 'cam-co', tipo: 'Revisão preventiva', servico: 20, valor: 120, pecas: [{ origem: 'estoque', materialId: mid, nome: 'Filtro de ar', unidade: 'un', qtd: 2, preco: 50 }], criadoEm: new Date().toISOString() });
  await pedir(ctx, 'PUT', '/frota/api/dados/manutencoes/man-antiga', { data: '2025-03-05', veiculoTipo: 'caminhao', veiculoId: 'cam-co', tipo: 'Freios', valor: 350, oficina: 'Oficina Velha', criadoEm: '2025-03-05T10:00:00.000Z' });
  assert.strictEqual((await material(ctx, 'Filtro de ar')).saldo, 1);
  const p = await abrirManutencao(ctx);
  await p.evaluate(() => editar('manutencoes', 'man-co'));
  await esperarTexto(p, '#man-pecas .peca .p-info', 'Em estoque: 3');
  assert.strictEqual(await p.inputValue('#man-valor'), '20');
  await linha(p, 0).locator('.p-qtd').fill('1');
  await esperarTexto(p, '#man-total', 'R$ 70,00');
  await limparToast(p);
  await p.click('#f-man button[type="submit"]');
  await esperarToast(p, 'Manutenção salva');
  assert.strictEqual((await material(ctx, 'Filtro de ar')).saldo, 2);
  // manutenção antiga, sem peças: o valor que tinha vira o serviço e o total não muda
  const antes = (await saldos(ctx)).movimentos.length;
  await p.evaluate(() => editar('manutencoes', 'man-antiga'));
  assert.strictEqual(await p.inputValue('#man-valor'), '350');
  assert.strictEqual(await p.locator('#man-pecas .peca').count(), 0);
  await esperarTexto(p, '#man-total', 'R$ 350,00');
  await limparToast(p);
  await p.click('#f-man button[type="submit"]');
  await esperarToast(p, 'Manutenção salva');
  const m = (await manDoCam(ctx, 'cam-co')).find(x => x.id === 'man-antiga');
  assert.deepStrictEqual([m.valor, m.servico, (m.pecas || []).length, m.oficina], [350, 350, 0, 'Oficina Velha']);
  assert.strictEqual((await saldos(ctx)).movimentos.length, antes, 'a manutenção antiga não mexe no estoque');
});

teste('DECONTO no arquivo (file://): só peça comprada, e o total soma', async () => {
  const ctx = await contexto();
  const l = await ctx.newPage();
  await l.goto(pathToFileURL(path.join(RAIZ, 'sistema-carlise', 'frota.html')).href + '#manutencao');
  await l.waitForFunction(() => Armazem.modo === 'local');
  await l.evaluate(async () => { await gravar('caminhoes', { id: 'cam-lp', placa: 'LPC1A00', tipo: 'Truck', situacao: 'rodando' }); });
  await l.selectOption('#man-veic', 'caminhao:cam-lp');
  await l.fill('#man-valor', '50');
  await l.click('#f-man [data-acao="add-peca"]');
  const l0 = linha(l, 0);
  assert.strictEqual(await l0.locator('.p-origem option[value="estoque"]').count(), 0, 'sem Estoque não tem "Do estoque"');
  assert.strictEqual(await l0.locator('.p-origem').inputValue(), 'comprada');
  await l0.locator('.p-nome').fill('Palheta');
  await l0.locator('.p-qtd').fill('2');
  await l0.locator('.p-valor').fill('30');
  await esperarTexto(l, '#man-total', 'R$ 80,00');
  await l.click('#f-man button[type="submit"]');
  await esperarToast(l, 'Manutenção salva');
  assert.deepStrictEqual(await l.evaluate(() => { const m = todos('manutencoes')[0]; return [m.valor, m.servico, m.pecas[0].nome]; }), [80, 50, 'Palheta']);
});

// ---------- Controle de Operação: peças na manutenção ----------
teste('Controle: manutenção com peça do estoque tira do saldo, total na lista; corrigir não desconta as próprias', async () => {
  const ctx = await logado();
  const mid = await criarMaterial(ctx, { nome: 'Mangueira hidráulica', categoria: 'Peças' });
  await entrada(ctx, mid, 3, 40);
  await pedir(ctx, 'PUT', '/operacao/api/dados/caminhoes/cam-mk', { placa: 'MNK1A00', situacao: 'ativo' });
  const p = await abrir(ctx, '/operacao/#manutencao');
  await esperarServidor(p);
  await p.waitForFunction(() => ESTOQUE.ok, null, { timeout: 6000 });
  await p.selectOption('#man-cam', 'cam-mk');
  assert.match(await texto(p, 'label[for="man-valor"]'), /Mão de obra \/ serviço/);
  await p.fill('#man-valor', '50');
  const l0 = await novaPeca(p, 0, { mat: mid, qtd: '1' });
  assert.match(await l0.locator('.p-info').textContent(), /Em estoque: 3/);
  await esperarTexto(p, '#man-total', 'R$ 90,00');
  await limparToast(p);
  await p.click('#f-man button[type="submit"]');
  await esperarToast(p, 'Manutenção salva');
  const [m] = (await pedir(ctx, 'GET', '/operacao/api/dados')).manutencoes.filter(x => x.caminhaoId === 'cam-mk');
  assert.deepStrictEqual([m.valor, m.servico, m.pecas[0].materialId, m.pecas[0].qtd, m.pecas[0].preco], [90, 50, mid, 1, 40]);
  assert.strictEqual((await material(ctx, 'Mangueira hidráulica')).saldo, 2);
  await esperarTexto(p, '#t-man', 'R$ 90,00');
  await p.waitForFunction(x => ESTOQUE.porId.get(x).saldo === 2, mid, { timeout: 6000 });
  await p.evaluate(x => editar('manutencoes', x), m.id);
  await esperarTexto(p, '#man-pecas .peca .p-info', 'Em estoque: 3');
  const e = await abrir(ctx, '/estoque/');
  await esperarServidor(e);
  await e.click(`#t-saldo tr[data-mat="${mid}"] [data-acao="historico"]`);
  await esperarTexto(e, '#movs', 'Manutenção no Controle');
  assert.strictEqual(await e.locator('#movs a[href="/operacao/#manutencao"]').count(), 1);
});

// ---------- no fim ----------
teste('nenhum erro de página (pageerror) em nenhum teste', async () => {
  assert.deepStrictEqual(errosDePagina, []);
});

'use strict';
/* Testes do Estoque no servidor. Rodar: node --test painel/testes/estoque-servidor.test.js
   Primeiro o cálculo do saldo (função pura, sem servidor); depois a rota e os avisos ao vivo,
   com o servidor num processo filho e pastas temporárias. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { calcularSaldos } = require('../servidor/estoque');

// ---------- cálculo do saldo ----------
const HOJE = '2026-11-20';
let seq = 0;
const tanque = extra => Object.assign({ id: 'tq-1', nome: 'Tanque pátio', categoria: 'Combustível', unidade: 'L', capacidade: 5000, minimo: 1000, combustivel: 'Diesel S10', ativo: true }, extra);
const mat = (id, extra) => Object.assign({ id, nome: 'Filtro ' + id, categoria: 'Filtros', unidade: 'un', minimo: null, ativo: true }, extra);
const mov = (tipo, materialId, data, extra) => Object.assign({ id: 'mv-' + (++seq), tipo, materialId, data, criadoEm: data + 'T12:00:00.000Z' }, extra);
const ab = (id, data, litros, extra) => Object.assign({ id, data, litros, caminhaoId: 'cam-1', tanqueId: 'tq-1', criadoEm: data + 'T12:00:00.000Z' }, extra);
const calc = (estoque, frota, operacao) => calcularSaldos({ estoque, frota, operacao }, HOJE);
const de = (r, id) => r.materiais.find(m => m.id === id);

test('entrada, saída avulsa e abastecimento em tanque dão o saldo; abastecimento no posto não conta', () => {
  const r = calc({ materiais: [tanque()], movimentos: [mov('entrada', 'tq-1', '2026-11-01', { qtd: 1000, valorUnit: 5.5 }), mov('saida', 'tq-1', '2026-11-03', { qtd: 100 })] },
    { abastecimentos: [ab('ab-1', '2026-11-02', 300), ab('ab-posto', '2026-11-02', 50, { tanqueId: '' })], caminhoes: [{ id: 'cam-1', placa: 'ABC1D23' }] });
  assert.strictEqual(de(r, 'tq-1').saldo, 600);
  assert.strictEqual(de(r, 'tq-1').tanque, true);
  const m = r.movimentos.find(x => x.id === 'ab-1');
  assert.deepStrictEqual([m.sistema, m.col, m.tipo, m.qtd, m.conta], ['frota', 'abastecimentos', 'abastecimento', -300, true]);
  assert.match(m.texto, /ABC1D23/);
  assert.ok(!r.movimentos.some(x => x.id === 'ab-posto'));
  assert.deepStrictEqual(r.caminhoes, [{ id: 'cam-1', placa: 'ABC1D23', situacao: undefined }]);
});

test('medição vale como verdade: o que veio depois soma; lançamento atrasado não muda e sai marcado', () => {
  const r = calc({ materiais: [tanque()], movimentos: [
    mov('entrada', 'tq-1', '2026-11-01', { qtd: 1000, valorUnit: 5 }),
    mov('medicao', 'tq-1', '2026-11-11', { hora: '08:00', valor: 800, criadoEm: '2026-11-11T11:00:00.000Z' }),
  ] }, { abastecimentos: [
    ab('ab-atrasado', '2026-11-10', 200, { criadoEm: '2026-11-12T09:00:00.000Z' }),
    ab('ab-mesmo-dia', '2026-11-11', 50, { criadoEm: '2026-11-11T10:00:00.000Z' }),
    ab('ab-depois', '2026-11-12', 100),
  ] });
  const t = de(r, 'tq-1');
  assert.strictEqual(t.saldo, 700);
  assert.deepStrictEqual(t.ultimaMedicao, { data: '2026-11-11', hora: '08:00', valor: 800 });
  const por = id => r.movimentos.find(x => x.id === id);
  assert.deepStrictEqual([por('ab-atrasado').conta, por('ab-atrasado').depoisMedicao], [false, true]);
  assert.deepStrictEqual([por('ab-mesmo-dia').conta, por('ab-mesmo-dia').depoisMedicao], [false, false]);
  assert.deepStrictEqual([por('ab-depois').conta, por('ab-depois').depoisMedicao], [true, false]);
});

test('duas medições no mesmo dia: vale a de hora maior', () => {
  const r = calc({ materiais: [tanque()], movimentos: [
    mov('medicao', 'tq-1', '2026-11-11', { hora: '17:00', valor: 450 }),
    mov('medicao', 'tq-1', '2026-11-11', { hora: '08:00', valor: 500 }),
  ] });
  assert.strictEqual(de(r, 'tq-1').saldo, 450);
});

test('preço médio ponderado', () => {
  const r = calc({ materiais: [tanque()], movimentos: [mov('entrada', 'tq-1', '2026-11-01', { qtd: 1000, valorUnit: 5 }), mov('entrada', 'tq-1', '2026-11-03', { qtd: 1000, valorUnit: 6 })] },
    { abastecimentos: [ab('ab-1', '2026-11-02', 500)] });
  assert.strictEqual(de(r, 'tq-1').precoMedio, 5.6667);
  assert.strictEqual(de(r, 'tq-1').saldo, 1500);
  const sem = calc({ materiais: [mat('f1')], movimentos: [] });
  assert.strictEqual(de(sem, 'f1').precoMedio, null);
});

test('peças do estoque na manutenção do DECONTO e do Controle saem; comprada e manutenção antiga não', () => {
  const r = calc({ materiais: [mat('f1')], movimentos: [mov('entrada', 'f1', '2026-11-01', { qtd: 10, valorUnit: 40 })] },
    { manutencoes: [
      { id: 'man-f', data: '2026-11-05', veiculoTipo: 'caminhao', veiculoId: 'cam-1', tipo: 'Troca de óleo e filtros', valor: 180, pecas: [{ origem: 'estoque', materialId: 'f1', qtd: 2, preco: 40 }, { origem: 'comprada', nome: 'x', qtd: 5, valor: 50 }] },
      { id: 'man-antiga', data: '2026-11-05', veiculoTipo: 'caminhao', veiculoId: 'cam-1', tipo: 'Freios', valor: 350 },
    ], caminhoes: [{ id: 'cam-1', placa: 'ABC1D23' }] },
    { manutencoes: [{ id: 'man-o', data: '2026-11-06', caminhaoId: 'cam-1', tipo: 'Outro', valor: 120, pecas: [{ origem: 'estoque', materialId: 'f1', qtd: 3, preco: 40 }] }], caminhoes: [{ id: 'cam-1', placa: 'ABC1D23' }] });
  assert.strictEqual(de(r, 'f1').saldo, 5);
  const ms = r.movimentos.filter(x => x.tipo === 'manutencao');
  assert.deepStrictEqual(ms.map(x => [x.sistema, x.id, x.qtd]).sort(), [['frota', 'man-f', -2], ['operacao', 'man-o', -3]]);
  assert.match(ms.find(x => x.sistema === 'operacao').texto, /ABC1D23/);
});

test('saldo negativo e situações', () => {
  const r = calc({ materiais: [mat('neg'), mat('zero'), mat('baixo', { minimo: 2 }), mat('ok', { minimo: 2 })], movimentos: [
    mov('entrada', 'neg', '2026-11-01', { qtd: 1 }),
    mov('entrada', 'baixo', '2026-11-01', { qtd: 2 }),
    mov('entrada', 'ok', '2026-11-01', { qtd: 3 }),
  ] }, { manutencoes: [{ id: 'man-n', data: '2026-11-02', veiculoTipo: 'caminhao', veiculoId: 'c', tipo: 'Outro', pecas: [{ origem: 'estoque', materialId: 'neg', qtd: 4 }] }] });
  assert.strictEqual(de(r, 'neg').saldo, -3);
  assert.deepStrictEqual(['neg', 'zero', 'baixo', 'ok'].map(id => de(r, id).situacao), ['negativo', 'zerado', 'baixo', 'ok']);
});

test('consumo de 30 dias e "dá para N dias"', () => {
  const r = calc({ materiais: [tanque()], movimentos: [mov('entrada', 'tq-1', '2026-10-01', { qtd: 2200, valorUnit: 5 })] },
    { abastecimentos: [ab('ab-velho', '2026-10-11', 1000), ab('ab-novo', '2026-11-10', 300)] });
  const t = de(r, 'tq-1');
  assert.strictEqual(t.saldo, 900);
  assert.strictEqual(t.consumo30, 300);
  assert.strictEqual(t.dias, 90);
  const sem = calc({ materiais: [mat('f1')], movimentos: [] });
  assert.strictEqual(de(sem, 'f1').dias, null);
});

test('registro com número inválido ou material que não existe não derruba a conta', () => {
  const r = calc({ materiais: [mat('f1'), null, { nome: 'sem id' }], movimentos: [
    mov('entrada', 'f1', '2026-11-01', { qtd: 4 }),
    mov('entrada', 'f1', '2026-11-01', { qtd: 'abc' }),
    mov('saida', 'nao-existe', '2026-11-01', { qtd: 1 }),
    mov('saida', 'f1', null, { qtd: 1 }),
    null,
  ] }, { abastecimentos: [ab('ab-x', '2026-11-02', 'muito', { tanqueId: 'f1' })], manutencoes: [{ id: 'm', data: '2026-11-02', pecas: 'nao-e-lista' }, { id: 'm2', data: '2026-11-02', pecas: [null, { origem: 'estoque', materialId: 'f1', qtd: -2 }] }] });
  assert.strictEqual(de(r, 'f1').saldo, 4);
  assert.strictEqual(r.materiais.length, 1);
});

// ---------- servidor: rota dos saldos e avisos ao vivo ----------
// o node --test roda este arquivo junto do servidor.test.js: duas portas depois da dele
const PORTA = (Number(process.env.PORTA_TESTE_SRV) || 3399) + 2;
const BASE = `http://127.0.0.1:${PORTA}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'painel-estoque-'));
const PUBLICO = path.join(tmp, 'publico');
fs.mkdirSync(PUBLICO, { recursive: true });
for (const [arq, txt] of [['frota.html', 'DECONTO'], ['operacao.html', 'Controle de Operação'], ['estoque.html', 'Estoque']]) fs.writeFileSync(path.join(PUBLICO, arq), `<title>${txt}</title>\n<p>pagina ${txt}</p>`);
let proc = null, cookie = '';
before(() => new Promise((ok, falha) => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'servidor', 'servidor.js')], { env: Object.assign({}, process.env, { PORTA: String(PORTA), HOST: '127.0.0.1', PAINEL_SENHA: 'senhaTeste1', PASTA_DADOS: path.join(tmp, 'data'), PASTA_PUBLICO: PUBLICO, PASTA_CARGA: path.join(tmp, 'carga') }), stdio: ['ignore', 'pipe', 'pipe'] });
  let saida = '';
  proc.stdout.on('data', async c => {
    saida += c;
    if (!saida.includes('Painel Deconto em') || cookie) return;
    const r = await fetch(BASE + '/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'admin', senha: 'senhaTeste1' }) });
    cookie = r.headers.get('set-cookie').split(';')[0];
    ok();
  });
  proc.stderr.on('data', c => { saida += c; });
  proc.on('exit', code => falha(new Error('servidor saiu: ' + code + '\n' + saida)));
  setTimeout(() => falha(new Error('servidor não subiu:\n' + saida)), 8000);
}));
after(async () => {
  if (proc) await new Promise(ok => { proc.removeAllListeners('exit'); proc.on('exit', () => ok()); proc.kill('SIGTERM'); });
  fs.rmSync(tmp, { recursive: true, force: true });
});
const pedir = (rota, opc = {}) => fetch(BASE + rota, Object.assign({ redirect: 'manual' }, opc, { headers: Object.assign({ cookie }, opc.headers || {}) }));
const enviar = async (metodo, rota, corpo) => {
  const r = await pedir(rota, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  assert.strictEqual(r.status, 200, metodo + ' ' + rota);
};
const saldos = async () => (await pedir('/estoque/api/saldos')).json();
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function ouvir(rota) {
  const ctl = new AbortController();
  const r = await fetch(BASE + rota, { headers: { cookie }, signal: ctl.signal });
  const leitor = r.body.getReader();
  let txt = '';
  const lido = (async () => { try { for (;;) { const { value, done } = await leitor.read(); if (done) break; txt += Buffer.from(value).toString(); } } catch (e) { /* fechado daqui */ } })();
  return { fim: async () => { await esperar(300); ctl.abort(); await lido; return txt; } };
}

test('sem login, /estoque/api/saldos dá 401', async () => {
  assert.strictEqual((await fetch(BASE + '/estoque/api/saldos')).status, 401);
});
test('tela inicial tem o cartão Estoque e a página abre', async () => {
  assert.match(await (await pedir('/')).text(), /href="\/estoque\/"/);
  assert.match(await (await pedir('/estoque/')).text(), /window\.PAINEL = \{[^<]*"sistema":"estoque"/);
});
test('saldos juntam Estoque, DECONTO e Controle e acompanham correção e apagar', async () => {
  await enviar('PUT', '/estoque/api/dados/materiais/fil-1', { nome: 'Filtro de óleo', categoria: 'Filtros', unidade: 'un', minimo: 2, ativo: true });
  await enviar('PUT', '/estoque/api/dados/movimentos/mv-e1', { tipo: 'entrada', materialId: 'fil-1', data: '2026-11-01', qtd: 10, valorUnit: 40 });
  const man = qtd => ({ data: '2026-11-05', veiculoTipo: 'caminhao', veiculoId: 'cam-1', tipo: 'Outro', servico: 0, valor: qtd * 40, pecas: [{ origem: 'estoque', materialId: 'fil-1', qtd, preco: 40 }] });
  await enviar('PUT', '/frota/api/dados/manutencoes/man-a', man(2));
  await enviar('PUT', '/operacao/api/dados/manutencoes/man-b', Object.assign(man(3), { caminhaoId: 'cam-1' }));
  const f = () => saldos().then(s => s.materiais.find(m => m.id === 'fil-1'));
  assert.strictEqual((await f()).saldo, 5);
  assert.strictEqual((await f()).precoMedio, 40);
  await enviar('PUT', '/frota/api/dados/manutencoes/man-a', man(1));
  assert.strictEqual((await f()).saldo, 6);
  await enviar('DELETE', '/operacao/api/dados/manutencoes/man-b');
  assert.strictEqual((await f()).saldo, 9);
});
test('gravar no DECONTO avisa o Estoque, e gravar no Estoque avisa DECONTO e Controle', async () => {
  let e = await ouvir('/estoque/api/eventos');
  await enviar('PUT', '/frota/api/dados/abastecimentos/ab-1', { data: '2026-11-05', caminhaoId: 'cam-1', litros: 100, valor: 550, tanqueId: 'tq-1' });
  assert.match(await e.fim(), /"tipo":"estoque"/);
  e = await ouvir('/estoque/api/eventos');
  const f = await ouvir('/frota/api/eventos'), o = await ouvir('/operacao/api/eventos');
  await enviar('PUT', '/estoque/api/dados/materiais/tq-1', { nome: 'Tanque pátio', categoria: 'Combustível', unidade: 'L', capacidade: 5000, minimo: 1000, ativo: true });
  assert.match(await f.fim(), /"tipo":"estoque"/);
  assert.match(await o.fim(), /"tipo":"estoque"/);
  assert.match(await e.fim(), /"col":"materiais"[\s\S]*"tipo":"estoque"/);
});
test('km do dia no DECONTO não avisa o Estoque', async () => {
  const e = await ouvir('/estoque/api/eventos');
  await enviar('PUT', '/frota/api/dados/dias/dia-1', { data: '2026-11-05', caminhaoId: 'cam-1', kmInicial: 1, kmFinal: 2 });
  assert.doesNotMatch(await e.fim(), /"tipo":"estoque"/);
});

'use strict';
/* Estoque: o saldo é calculado, nunca guardado. Cada acontecimento fica só no sistema onde aconteceu
   (compra, saída avulsa e medição no Estoque; abastecimento em tanque no DECONTO; peças "do estoque"
   nas manutenções do DECONTO e do Controle) e aqui se faz a conta. Corrigiu ou apagou o registro,
   o saldo se corrige sozinho.
   A medição vale como verdade naquela data: saldo = última medição + o que entrou/saiu depois dela.
   O que tem data igual ou anterior à medição já está "dentro" dela e não muda mais o saldo. */

// os dados vêm de páginas: número que não é número (ou ≤ 0 onde precisa ser positivo) é ignorado, sem erro
const numero = v => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
const positivo = v => { const n = numero(v); return n != null && n > 0 ? n : null; };
const dataOk = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const lista = x => (Array.isArray(x) ? x.filter(o => o && typeof o === 'object') : []);
const r3 = n => Math.round(n * 1000) / 1000;
const mostraPlaca = p => (/^[A-Z]{3}\d{4}$/.test(p || '') ? p.slice(0, 3) + '-' + p.slice(3) : p || '');
function diasAntes(hoje, n) {
  const d = new Date((dataOk(hoje) ? hoje : new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
// no mesmo dia, os lançamentos vêm antes da medição (estão "dentro" dela); medições pela hora
const ordem = (a, b) => a.data.localeCompare(b.data) || (a.tipo === 'medicao') - (b.tipo === 'medicao') || a.hora.localeCompare(b.hora) || a.criadoEm.localeCompare(b.criadoEm);

function calcularSaldos(dados, hoje) {
  const est = dados.estoque || {}, fr = dados.frota || {}, op = dados.operacao || {};
  const mats = lista(est.materiais).filter(m => typeof m.id === 'string' && m.id);
  const doMaterial = new Map(mats.map(m => [m.id, []]));
  const movs = [];
  const juntar = (materialId, m) => {
    const l = doMaterial.get(materialId);
    if (!l || !dataOk(m.data)) return;
    const x = Object.assign({ materialId, hora: '', valorUnit: null, caminhaoId: '', texto: '' }, m);
    x.hora = String(x.hora || ''); x.criadoEm = String(x.criadoEm || '');
    l.push(x); movs.push(x);
  };
  const placaFrota = new Map([...lista(fr.caminhoes), ...lista(fr.semirreboques)].map(c => [c.id, mostraPlaca(c.placa)]));
  const placaOper = new Map(lista(op.caminhoes).map(c => [c.id, mostraPlaca(c.placa)]));

  for (const x of lista(est.movimentos)) {
    const base = { data: x.data, hora: x.hora, sistema: 'estoque', col: 'movimentos', id: x.id, criadoEm: x.criadoEm };
    if (x.tipo === 'medicao') {
      const v = numero(x.valor);
      if (v != null && v >= 0) juntar(x.materialId, Object.assign(base, { tipo: 'medicao', qtd: v, texto: x.obs || '' }));
    } else if (x.tipo === 'entrada' || x.tipo === 'saida') {
      const q = positivo(x.qtd);
      if (q == null) continue;
      const entrada = x.tipo === 'entrada', vu = numero(x.valorUnit);
      juntar(x.materialId, Object.assign(base, {
        tipo: x.tipo, qtd: entrada ? q : -q, valorUnit: entrada && vu != null && vu >= 0 ? vu : null, caminhaoId: entrada ? '' : x.caminhaoId || '',
        texto: (entrada ? [x.fornecedor, x.nota ? 'nota ' + x.nota : '', x.obs] : [placaFrota.get(x.caminhaoId), x.quem, x.obs]).filter(Boolean).join(' · '),
      }));
    }
  }
  for (const a of lista(fr.abastecimentos)) {
    const q = positivo(a.litros);
    if (a.tanqueId && q != null) juntar(a.tanqueId, { tipo: 'abastecimento', qtd: -q, data: a.data, sistema: 'frota', col: 'abastecimentos', id: a.id, caminhaoId: a.caminhaoId || '', criadoEm: a.criadoEm, texto: [placaFrota.get(a.caminhaoId), a.combustivel].filter(Boolean).join(' · ') });
  }
  const pecas = (sistema, m, placa, caminhaoId) => {
    for (const p of lista(m.pecas)) {
      const q = positivo(p.qtd);
      if (p.origem === 'estoque' && q != null) juntar(p.materialId, { tipo: 'manutencao', qtd: -q, data: m.data, sistema, col: 'manutencoes', id: m.id, caminhaoId, criadoEm: m.criadoEm, texto: [placa, m.tipo].filter(Boolean).join(' · ') });
    }
  };
  for (const m of lista(fr.manutencoes)) pecas('frota', m, placaFrota.get(m.veiculoId), m.veiculoTipo === 'caminhao' ? m.veiculoId || '' : '');
  for (const m of lista(op.manutencoes)) pecas('operacao', m, placaOper.get(m.caminhaoId), m.caminhaoId || '');

  const de30 = diasAntes(hoje, 29), ate = dataOk(hoje) ? hoje : diasAntes(hoje, 0);
  const materiais = mats.map(mat => {
    const l = doMaterial.get(mat.id).sort(ordem);
    let saldo = 0, media = null, ultMed = null, consumo = 0;
    for (const m of l) {
      if (m.tipo === 'medicao') { saldo = m.qtd; ultMed = m; continue; }
      // custo médio ponderado; sem saldo (ou sem preço ainda), vale o preço desta compra
      if (m.tipo === 'entrada' && m.valorUnit != null) media = saldo > 0 && media != null ? (saldo * media + m.qtd * m.valorUnit) / (saldo + m.qtd) : m.valorUnit;
      saldo += m.qtd;
      if (m.qtd < 0 && m.data >= de30 && m.data <= ate) consumo -= m.qtd;
    }
    // de trás para a frente: o que tem uma medição depois já está dentro dela
    let prox = null;
    for (let i = l.length - 1; i >= 0; i--) {
      const m = l[i];
      if (m.tipo === 'medicao') { m.conta = m === ultMed; m.depoisMedicao = false; prox = m; continue; }
      m.conta = !prox;
      m.depoisMedicao = !!prox && m.criadoEm > prox.criadoEm;
    }
    saldo = r3(saldo);
    const minimo = numero(mat.minimo);
    const situacao = saldo < 0 ? 'negativo' : saldo === 0 ? 'zerado' : minimo != null && saldo <= minimo ? 'baixo' : 'ok';
    return Object.assign({}, mat, {
      tanque: mat.categoria === 'Combustível' && (numero(mat.capacidade) || 0) > 0,
      saldo, precoMedio: media == null ? null : Math.round(media * 10000) / 10000, situacao,
      consumo30: r3(consumo), dias: consumo > 0 ? Math.max(0, Math.floor(saldo / (consumo / 30))) : null,
      ultimaMedicao: ultMed ? { data: ultMed.data, hora: ultMed.hora, valor: ultMed.qtd } : null,
    });
  });
  movs.forEach(m => { m.qtd = r3(m.qtd); });
  return {
    materiais,
    movimentos: movs.sort((a, b) => ordem(b, a)),
    caminhoes: lista(fr.caminhoes).filter(c => c.id).map(c => ({ id: c.id, placa: c.placa, situacao: c.situacao })),
  };
}

module.exports = { calcularSaldos };

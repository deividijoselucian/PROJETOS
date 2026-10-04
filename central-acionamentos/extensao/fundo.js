// Serviço em segundo plano: recebe os chamados lidos nos portais, decide quando tocar o alarme,
// mostra o aviso do Windows e recarrega as abas que não se atualizam sozinhas.
importScripts('portais.js');

const MIN = 60000;

// As leituras chegam ao mesmo tempo de várias abas: uma de cada vez evita perder dados.
let fila = Promise.resolve();
const emFila = fn => (fila = fila.then(fn).catch(err => console.error(err)));

function iniciar(abrir) {
  chrome.alarms.create('vigia', { periodInMinutes: 1 });
  if (abrir) abrirCentral();
  emFila(atualizarAlarme);
}
chrome.runtime.onInstalled.addListener(({ reason }) => iniciar(reason === 'install'));
chrome.runtime.onStartup.addListener(() => iniciar(true));
chrome.action.onClicked.addListener(() => abrirCentral());

chrome.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.tipo) {
    case 'leitura':
      if (sender.tab) emFila(() => receberLeitura(msg, sender.tab));
      break;
    case 'silenciar': emFila(silenciar); break;
    case 'limpar': emFila(limparAvisos); break;
    case 'testar':
      emFila(() => dispararAlarme('teste', null, 'Se você ouviu o alarme e viu este aviso, está funcionando.', 'aviso'));
      break;
    case 'abrir-portal': emFila(() => abrirPortal(msg.portal, msg.silenciar)); break;
    case 'abrir-chamado': emFila(() => abrirChamado(msg.portal, msg.id)); break;
    case 'abrir-todos': emFila(abrirTodos); break;
    case 'config': emFila(() => chrome.storage.local.set({ config: msg.config })); break;
    case 'som-pronto': emFila(atualizarAlarme); break;
    case 'diagnostico': emFila(pedirDiagnostico); break;
    case 'diag-resposta':
      if (sender.tab) emFila(() => guardarDiagnostico(msg, sender.tab));
      break;
    case 'testar-whatsapp':
      mandarZap('*Teste da Central de Acionamentos*\nOs avisos de chamado vão sair por este número.', true);
      break;
  }
});

/* ---------- diagnóstico ---------- */

// Pede para cada aba de portal (todos os quadros) descrever a própria tela.
async function pedirDiagnostico() {
  await chrome.storage.local.set({ diagnostico: { em: Date.now(), itens: [] } });
  const { estado = {} } = await chrome.storage.local.get('estado');
  for (const k of ORDEM_PORTAIS) {
    const e = estado[k];
    if (e && e.tabId != null) chrome.tabs.sendMessage(e.tabId, { tipo: 'diagnostico' }).catch(() => {});
  }
}

async function guardarDiagnostico({ portal, dados }, tab) {
  const { diagnostico = { itens: [] } } = await chrome.storage.local.get('diagnostico');
  diagnostico.itens.push({ portal, aba: tab.id, ...dados });
  await chrome.storage.local.set({ diagnostico });
}

/* ---------- avisos por WhatsApp ---------- */

// Uma mensagem de cada vez, fora da fila das leituras (o servidor pode demorar).
let filaZap = Promise.resolve();
const mandarZap = (texto, teste) => (filaZap = filaZap.then(() => enviarWhatsApp(texto, teste)).catch(err => console.error(err)));

// "49 99999-0000" vira "5549999990000".
function numeroWhats(s) {
  const d = String(s).replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return '55' + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

function mensagemZap(portal, c, evento) {
  const titulo = { novo: '🚨 NOVO ACIONAMENTO', cancelado: '❌ CHAMADO CANCELADO', mudanca: '🔔 CHAMADO NA CENTRAL' }[evento];
  return [
    `*${titulo}* · ${PORTAIS[portal].nome}`,
    [c.titulo, c.protocolo].filter(Boolean).join(' · '),
    c.detalhes,
    c.prazo ? 'Prazo: ' + c.prazo : '',
    evento === 'novo' ? (portal === 'porto' ? 'Abra o portal e aceite antes que a Porto repasse.' : 'Abra o portal para aceitar.') : '',
  ].filter(Boolean).join('\n');
}

async function enviarUm(z, numero, para, texto) {
  const base = z.url.replace(/\/+$/, '');
  const ctrl = new AbortController();
  const limite = setTimeout(() => ctrl.abort(), 15000);
  try {
    const resp = z.formato === 'evolution'
      ? await fetch(`${base}/message/sendText/${encodeURIComponent(numero.instancia)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: z.chave },
        body: JSON.stringify({ number: para, text: texto }),
        signal: ctrl.signal,
      })
      : await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + z.chave },
        body: JSON.stringify({ de: numero.instancia || numero.nome, para, mensagem: texto }),
        signal: ctrl.signal,
      });
    if (!resp.ok) throw new Error('o servidor respondeu com erro ' + resp.status);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('o servidor não respondeu em 15 segundos');
    if (e instanceof TypeError) throw new Error('não consegui falar com o servidor');
    throw e;
  } finally {
    clearTimeout(limite);
  }
}

// Manda pelo número escolhido; se falhar e a reserva estiver ligada, tenta pelo outro.
async function enviarWhatsApp(texto, teste) {
  const { config = {} } = await chrome.storage.local.get('config');
  const z = zapComPadrao(config.whatsapp);
  const status = s => chrome.storage.local.set({ whatsappStatus: { em: Date.now(), teste: !!teste, ...s } });
  if (!z.ligado && !teste) return;
  if (!z.url) return status({ ok: false, erro: 'falta o endereço do servidor.' });
  const destinos = z.destinos.split(/[\n,;]+/).map(numeroWhats).filter(Boolean);
  if (!destinos.length) return status({ ok: false, erro: 'nenhum número válido em "Mandar para".' });

  await status({ enviando: true });
  const ordem = [z.enviarPor];
  if (z.reserva) ordem.push(z.enviarPor === '1' ? '2' : '1');
  const erros = [];
  for (const n of ordem) {
    const numero = z.numeros[n];
    if (!numero.instancia) { erros.push(`${nomeDoNumero(z, n)} sem identificação no servidor`); continue; }
    try {
      for (const para of destinos) await enviarUm(z, numero, para, texto);
      return status({ ok: true, numero: nomeDoNumero(z, n), falhou: n !== z.enviarPor ? nomeDoNumero(z, z.enviarPor) : '' });
    } catch (e) {
      erros.push(`${nomeDoNumero(z, n)}: ${e.message}`);
    }
  }
  return status({ ok: false, erro: erros.join('; ') + '.' });
}

const descricao = c => [c.titulo, c.protocolo, c.detalhes].filter(Boolean).join(' · ').slice(0, 220);

async function receberLeitura({ portal, leitura, pagina }, tab) {
  if (!PORTAIS[portal]) return;
  const { estado = {} } = await chrome.storage.local.get('estado');
  const antes = estado[portal] || {};
  const agora = Date.now();
  // Na Porto a tela de serviços fica num quadro dentro da página; a moldura não tem os
  // serviços, então a leitura dela não pode apagar a do quadro.
  if (leitura.estado !== 'ok' && antes.estado === 'ok' && antes.tabId === tab.id && agora - antes.lidoEm < MIN) return;

  const novidades = [];
  if (leitura.estado === 'ok') {
    const antigos = new Map((antes.chamados || []).map(c => [c.id, c]));
    const primeiraLeitura = !antes.chamados;
    for (const c of leitura.chamados) {
      const velho = antigos.get(c.id);
      c.vistoEm = velho ? velho.vistoEm : agora;
      if (c.etapa === 'novo') {
        if (!velho || velho.etapa !== 'novo' || (c.qtd || 0) > (velho.qtd || 0)) novidades.push({ c, tipo: 'pendente' });
      } else if (!velho && !primeiraLeitura && c.etapa !== 'concluido') {
        novidades.push({ c, tipo: 'aviso' });
      }
    }
  }

  estado[portal] = { ...antes, ...leitura, lidoEm: agora, tabId: tab.id, windowId: tab.windowId, pagina };
  await chrome.storage.local.set({ estado });

  if (novidades.length) {
    const { config = {} } = await chrome.storage.local.get('config');
    const zap = zapComPadrao(config.whatsapp);
    for (const { c, tipo } of novidades.slice(0, 3)) {
      const texto = (c.etapa === 'cancelado' ? 'Cancelado: ' : '') + descricao(c);
      await dispararAlarme(portal, c.id, texto, tipo);
      const evento = c.etapa === 'novo' ? 'novo' : c.etapa === 'cancelado' ? 'cancelado' : 'mudanca';
      if (zap.ligado && zap.eventos[evento]) mandarZap(mensagemZap(portal, c, evento));
    }
  }
  await atualizarAlarme();
}

async function dispararAlarme(portal, chamadoId, texto, tipo) {
  const { alarme = { itens: [] }, historico = [] } = await chrome.storage.local.get(['alarme', 'historico']);
  const em = Date.now();
  const item = { id: `${em}-${portal}`, portal, chamadoId, texto, tipo, em };
  alarme.itens = [item, ...(alarme.itens || []).filter(i => !chamadoId || i.chamadoId !== chamadoId)].slice(0, 12);
  alarme.silenciado = false;
  await chrome.storage.local.set({ alarme, historico: [item, ...historico].slice(0, 50) });

  const teste = !PORTAIS[portal];
  chrome.notifications.create(item.id, {
    type: 'basic',
    iconUrl: 'icones/icone128.png',
    title: teste ? 'Teste do alarme' : (tipo === 'pendente' ? 'Novo acionamento · ' : 'Mudança · ') + PORTAIS[portal].nome,
    message: texto,
    priority: 2,
    requireInteraction: true,
    buttons: teste ? [{ title: 'Silenciar alarme' }] : [{ title: 'Abrir no portal' }, { title: 'Silenciar alarme' }],
  });
}

async function atualizarAlarme() {
  const { alarme = { itens: [] }, estado = {} } = await chrome.storage.local.get(['alarme', 'estado']);
  const itens = alarme.itens || [];
  // Serviço que saiu da lista de novos (aceito ou repassado) não precisa mais de alarme.
  const aindaNovo = i => {
    const e = estado[i.portal];
    return !!(e && e.chamados && e.chamados.some(c => c.id === i.chamadoId && c.etapa === 'novo'));
  };
  const ficam = itens.filter(i => i.tipo !== 'pendente' || aindaNovo(i));
  if (ficam.length !== itens.length) {
    itens.filter(i => !ficam.includes(i)).forEach(i => chrome.notifications.clear(i.id));
    alarme.itens = ficam;
    await chrome.storage.local.set({ alarme });
  }
  await chrome.action.setBadgeText({ text: ficam.length ? String(ficam.length) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#F2A900' });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#1D1600' });
  await atualizarSom(ficam.length > 0 && !alarme.silenciado);
}

// O som toca num documento escondido, porque o serviço em segundo plano não toca áudio.
async function atualizarSom(tocar) {
  const existe = (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length > 0;
  if (tocar && !existe) {
    await chrome.offscreen.createDocument({
      url: 'som.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Tocar o alarme quando entra acionamento novo.',
    });
    return; // quando o som.html carregar, ele avisa ("som-pronto") e recebe a ordem de tocar
  }
  if (existe) chrome.runtime.sendMessage({ alvo: 'som', acao: tocar ? 'tocar' : 'parar' }).catch(() => {});
}

async function silenciar() {
  const { alarme = { itens: [] } } = await chrome.storage.local.get('alarme');
  alarme.silenciado = true;
  // Avisos simples (teste, mudança de etapa) somem quando você os vê;
  // serviço novo fica listado até sair da lista de novos do portal.
  (alarme.itens || []).filter(i => i.tipo !== 'pendente').forEach(i => chrome.notifications.clear(i.id));
  alarme.itens = (alarme.itens || []).filter(i => i.tipo === 'pendente');
  await chrome.storage.local.set({ alarme });
  await atualizarAlarme();
}

async function limparAvisos() {
  const { alarme = { itens: [] } } = await chrome.storage.local.get('alarme');
  (alarme.itens || []).forEach(i => chrome.notifications.clear(i.id));
  await chrome.storage.local.set({ alarme: { itens: [], silenciado: false } });
  await atualizarAlarme();
}

async function focarAba(tabId) {
  const tab = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

// Leva para a aba do portal (abre se estiver fechada). Devolve o id da aba, se já existia.
async function irParaPortal(portal) {
  const { estado = {} } = await chrome.storage.local.get('estado');
  const e = estado[portal];
  if (e && e.tabId != null) {
    try { await focarAba(e.tabId); return e.tabId; } catch (err) { /* a aba foi fechada */ }
  }
  await chrome.tabs.create({ url: PORTAIS[portal].url });
  return null;
}

async function abrirPortal(portal, calar) {
  if (PORTAIS[portal]) await irParaPortal(portal);
  if (calar) await silenciar();
}

async function abrirChamado(portal, id) {
  if (!PORTAIS[portal]) return;
  const tabId = await irParaPortal(portal);
  const { estado = {} } = await chrome.storage.local.get('estado');
  const c = ((estado[portal] || {}).chamados || []).find(x => x.id === id);
  if (tabId != null && c) {
    chrome.tabs.sendMessage(tabId, { tipo: 'destacar', portal, id, protocolo: c.protocolo }).catch(() => {});
  }
  const { alarme = { itens: [] } } = await chrome.storage.local.get('alarme');
  if ((alarme.itens || []).some(i => i.chamadoId === id)) await silenciar();
}

async function abrirTodos() {
  const { estado = {} } = await chrome.storage.local.get('estado');
  for (const k of ORDEM_PORTAIS) {
    const e = estado[k];
    let existe = false;
    if (e && e.tabId != null) {
      try { await chrome.tabs.get(e.tabId); existe = true; } catch (err) { /* fechada */ }
    }
    if (!existe) await chrome.tabs.create({ url: PORTAIS[k].url, active: false });
  }
}

async function abrirCentral() {
  const { centralTab } = await chrome.storage.session.get('centralTab');
  if (centralTab != null) {
    try { await focarAba(centralTab); return; } catch (err) { /* fechada */ }
  }
  const tab = await chrome.tabs.create({ url: 'central.html', pinned: true });
  await chrome.storage.session.set({ centralTab: tab.id });
}

// A cada minuto: recarrega as abas que não se atualizam sozinhas e confere o alarme.
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'vigia') emFila(vigiar); });

async function vigiar() {
  const { estado = {}, config = {}, recarregadoEm = {} } = await chrome.storage.local.get(['estado', 'config', 'recarregadoEm']);
  const agora = Date.now();
  for (const k of ORDEM_PORTAIS) {
    const e = estado[k];
    const minutos = config.recarregar && config.recarregar[k] != null ? config.recarregar[k] : PORTAIS[k].recarregar;
    if (!e || e.tabId == null || !minutos) continue;
    if (agora - (recarregadoEm[k] || 0) < minutos * MIN - 5000) continue;
    try {
      const tab = await chrome.tabs.get(e.tabId);
      const janela = await chrome.windows.get(tab.windowId);
      if (tab.active && janela.focused) continue; // você está usando essa aba agora
      await chrome.tabs.reload(e.tabId);
      recarregadoEm[k] = agora;
    } catch (err) { /* aba fechada */ }
  }
  await chrome.storage.local.set({ recarregadoEm });
  await atualizarAlarme();
}

chrome.tabs.onRemoved.addListener(tabId => emFila(async () => {
  const { estado = {} } = await chrome.storage.local.get('estado');
  let mudou = false;
  for (const k of Object.keys(estado)) {
    if (estado[k].tabId === tabId) {
      estado[k] = { ...estado[k], estado: 'fechado', tabId: null };
      mudou = true;
    }
  }
  if (mudou) await chrome.storage.local.set({ estado });
}));

const portalDaNotificacao = id => id.split('-')[1];
chrome.notifications.onClicked.addListener(id => {
  chrome.notifications.clear(id);
  emFila(() => abrirPortal(portalDaNotificacao(id), true));
});
chrome.notifications.onButtonClicked.addListener((id, botao) => {
  chrome.notifications.clear(id);
  const portal = portalDaNotificacao(id);
  const abrir = PORTAIS[portal] && botao === 0;
  emFila(() => (abrir ? abrirPortal(portal, true) : silenciar()));
});

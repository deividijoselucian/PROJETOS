// Painel único: junta os chamados lidos em todos os portais e mostra por etapa.
(() => {
  const $ = s => document.querySelector(s);
  const MIN = 60000;
  const pad = n => String(n).padStart(2, '0');
  const hora = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fmtIdade = ms => {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return s + ' s';
    const m = Math.floor(s / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min';
  };
  const fmtEspera = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + pad(s % 60); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nomeDo = p => (PORTAIS[p] ? PORTAIS[p].nome : 'Teste');
  const enviar = msg => chrome.runtime.sendMessage(msg).catch(() => {});

  const COLUNAS = [
    { id: 'novo', nome: 'Novos', vazio: 'Nenhum chamado esperando aceite' },
    { id: 'agendado', nome: 'Agendados', vazio: 'Nada agendado' },
    { id: 'caminho', nome: 'A caminho', vazio: 'Ninguém a caminho' },
    { id: 'servico', nome: 'Em serviço', vazio: 'Nenhum em serviço' },
    { id: 'pendencia', nome: 'Pendências', vazio: 'Sem pendências' },
  ];
  const LEITURA_VELHA = 10 * MIN; // chamados de portal sem leitura há mais que isso saem do quadro

  let dados = { estado: {}, alarme: { itens: [] }, historico: [], config: {}, whatsappStatus: null };
  let adiado = false;
  let formPreenchido = false;

  chrome.tabs.getCurrent(tab => { if (tab) chrome.storage.session.set({ centralTab: tab.id }); });

  async function carregar() {
    const d = await chrome.storage.local.get(['estado', 'alarme', 'historico', 'config', 'whatsappStatus']);
    dados = {
      estado: d.estado || {},
      alarme: d.alarme || { itens: [] },
      historico: d.historico || [],
      config: d.config || {},
      whatsappStatus: d.whatsappStatus || null,
    };
    if (!formPreenchido) { preencherZap(zapComPadrao(dados.config.whatsapp)); formPreenchido = true; }
    render();
  }
  chrome.storage.onChanged.addListener((_, area) => { if (area === 'local') carregar(); });

  function situacao(e) {
    if (!e || e.estado === 'fechado') return { sit: 'off', texto: 'Não está aberto · clique para abrir' };
    const idade = Date.now() - e.lidoEm;
    if (e.estado === 'login') return { sit: 'erro', texto: 'Precisa entrar de novo' };
    if (e.estado === 'outra-tela') return { sit: 'aviso', texto: 'Fora da tela de serviços' };
    if (idade > 3 * MIN) return { sit: 'aviso', texto: 'Sem leitura há ' + fmtIdade(idade) };
    return { sit: 'ok', texto: 'Lendo · há ' + fmtIdade(idade) };
  }

  // Chamados de todos os portais que estão sendo lidos agora.
  function todosChamados() {
    const lista = [];
    for (const k of ORDEM_PORTAIS) {
      const e = dados.estado[k];
      if (!e || !e.chamados || e.estado === 'fechado' || Date.now() - e.lidoEm > LEITURA_VELHA) continue;
      lista.push(...e.chamados);
    }
    return lista;
  }

  function render() {
    if (document.activeElement && document.activeElement.tagName === 'SELECT') { adiado = true; return; }
    const chamados = todosChamados();
    renderAlerta();
    renderPortais();
    renderResumo(chamados);
    renderBoard(chamados);
    renderHistorico();
    renderRecarga();
    renderZapTopo();
    renderZapStatus();
  }
  document.addEventListener('focusout', () => { if (adiado) { adiado = false; setTimeout(render, 0); } });

  function renderAlerta() {
    const { itens = [], silenciado } = dados.alarme;
    $('#alerta').hidden = itens.length === 0;
    document.title = itens.length ? `(${itens.length}) NOVO ACIONAMENTO` : 'Central de Acionamentos';
    if (!itens.length) return;
    $('#alerta-titulo').textContent = itens.length === 1 ? 'Novo acionamento' : itens.length + ' avisos de acionamento';
    $('#silenciar').disabled = !!silenciado;
    $('#silenciar').textContent = silenciado ? 'Alarme silenciado' : 'Silenciar alarme';
    $('#alerta-lista').innerHTML = itens.map(i => `
      <div class="alerta-item">
        <div>
          <div class="t"><span class="pdot" style="--c:var(--p-${esc(i.portal)})"></span>${esc(nomeDo(i.portal))}</div>
          <div class="s">${esc(i.texto)}</div>
          <div class="s">Chegou às ${hora(i.em)} · há <span data-desde="${i.em}">${fmtIdade(Date.now() - i.em)}</span></div>
        </div>
        ${PORTAIS[i.portal] ? `<button class="btn btn-dark" data-chamado="${esc(i.chamadoId || '')}" data-portal="${esc(i.portal)}">Abrir no portal</button>` : ''}
      </div>`).join('');
  }

  function renderPortais() {
    $('#portais').innerHTML = ORDEM_PORTAIS.map(k => {
      const e = dados.estado[k];
      const s = situacao(e);
      const n = e && e.chamados && s.sit !== 'off' ? e.chamados.filter(c => c.etapa !== 'concluido').length : 0;
      return `<button class="pill-portal" data-sit="${s.sit}" data-abrir-portal="${k}" style="--c:var(--p-${k})" title="Ir para a aba do ${esc(PORTAIS[k].nome)}">
        <span class="pdot"></span>
        <span class="ptext"><b>${esc(PORTAIS[k].nome)}</b><span>${esc(s.texto)}</span></span>
        <span class="pcount" title="Chamados na tela">${n}</span>
      </button>`;
    }).join('');
  }

  function renderResumo(chamados) {
    const c = etapa => chamados.filter(x => x.etapa === etapa).length;
    const atraso = chamados.filter(x => x.atraso).length;
    const itens = [
      ['Novos', c('novo'), c('novo') ? 'warn' : ''],
      ['Em atraso', atraso, atraso ? 'crit' : ''],
      ['A caminho', c('caminho'), ''],
      ['Em serviço', c('servico'), ''],
      ['Agendados', c('agendado'), ''],
      ['Pendências', c('pendencia') + c('cancelado'), c('pendencia') + c('cancelado') ? 'warn' : ''],
    ];
    $('#resumo').innerHTML = itens.map(([nome, n, sev]) => `<div class="stat" data-sev="${sev}"><b>${n}</b><span>${nome}</span></div>`).join('');
  }

  function cardHTML(c) {
    const novo = c.etapa === 'novo';
    const prazo = c.prazo ? `<p class="due">${c.atraso ? 'Em atraso · ' : 'Prazo: '}${esc(c.prazo)}</p>` : (c.atraso ? '<p class="due">Em atraso</p>' : '');
    const espera = novo ? `<p class="note">Chegou há <span data-espera="${c.vistoEm}">${fmtEspera(Date.now() - c.vistoEm)}</span>${c.portal === 'porto' ? '. Se não abrir, a Porto repassa.' : ''}</p>` : '';
    return `<article class="card" data-atraso="${c.atraso ? 1 : 0}">
      <div class="card-top"><span class="ptag"><span class="pdot" style="--c:var(--p-${esc(c.portal)})"></span>${esc(nomeDo(c.portal))}</span><span class="proto">${esc(c.protocolo)}</span></div>
      ${c.etapa === 'cancelado' ? '<span class="selo">Cancelado</span>' : ''}
      <h3 class="svc">${esc(c.titulo)}</h3>
      ${c.detalhes ? `<p class="det" title="${esc(c.detalhes)}">${esc(c.detalhes)}</p>` : ''}
      ${prazo}${espera}
      <div class="card-foot">
        <button class="btn btn-sm${novo ? ' btn-primary' : ''}" data-chamado="${esc(c.id)}" data-portal="${esc(c.portal)}">Abrir no portal</button>
        ${c.secao ? `<span class="secao">${esc(c.secao)}</span>` : ''}
      </div>
    </article>`;
  }

  function renderBoard(chamados) {
    const ordem = (a, b) => (a.etapa === 'novo' ? a.vistoEm - b.vistoEm : (b.atraso - a.atraso) || (a.vistoEm - b.vistoEm));
    $('#board').innerHTML = COLUNAS.map(col => {
      const lista = chamados
        .filter(c => c.etapa === col.id || (col.id === 'pendencia' && c.etapa === 'cancelado'))
        .sort(ordem);
      return `<section class="col" data-col="${col.id}" data-has="${lista.length ? 1 : 0}" aria-label="${col.nome}">
        <header class="col-head"><h2>${col.nome}</h2><span class="col-count">${lista.length}</span></header>
        ${lista.length ? lista.map(cardHTML).join('') : `<p class="empty">${col.vazio}</p>`}
      </section>`;
    }).join('');
  }

  function renderHistorico() {
    const h = dados.historico.slice(0, 12);
    $('#historico').innerHTML = h.length
      ? h.map(i => `<li><span class="hh">${hora(i.em)}</span><b>${esc(nomeDo(i.portal))}</b> · ${esc(i.texto)}</li>`).join('')
      : '<li class="muted">Nenhum aviso ainda. Use “Testar alarme” para ver como fica.</li>';
  }

  function renderRecarga() {
    const opcoes = [[0, 'Não recarregar'], [1, 'A cada 1 minuto'], [2, 'A cada 2 minutos'], [5, 'A cada 5 minutos']];
    $('#recarga').innerHTML = ORDEM_PORTAIS.map(k => {
      const atual = dados.config.recarregar && dados.config.recarregar[k] != null ? dados.config.recarregar[k] : PORTAIS[k].recarregar;
      return `<label for="rec-${k}">${esc(PORTAIS[k].nome)}</label>
        <select id="rec-${k}" data-rec="${k}">${opcoes.map(([v, r]) => `<option value="${v}"${v === atual ? ' selected' : ''}>${r}</option>`).join('')}</select>`;
    }).join('');
  }

  /* ---------- avisos por WhatsApp ---------- */
  const AJUDA_FORMATO = {
    evolution: 'Manda para {endereço}/message/sendText/{identificação do número}, com a chave no cabeçalho "apikey".',
    json: 'Manda um POST para o endereço com { de, para, mensagem } e a chave em "Authorization: Bearer".',
  };
  const campo = id => document.getElementById(id);

  function preencherZap(z) {
    campo('zap-ligado').checked = z.ligado;
    campo('zap-por-' + z.enviarPor).checked = true;
    for (const n of ['1', '2']) {
      campo('zap-nome-' + n).value = z.numeros[n].nome;
      campo('zap-inst-' + n).value = z.numeros[n].instancia;
    }
    campo('zap-reserva').checked = z.reserva;
    campo('zap-destinos').value = z.destinos;
    campo('zap-ev-novo').checked = z.eventos.novo;
    campo('zap-ev-cancelado').checked = z.eventos.cancelado;
    campo('zap-ev-mudanca').checked = z.eventos.mudanca;
    campo('zap-formato').value = z.formato;
    campo('zap-url').value = z.url;
    campo('zap-chave').value = z.chave;
    campo('zap-ajuda').textContent = AJUDA_FORMATO[z.formato];
  }

  function lerZap() {
    const marcado = document.querySelector('input[name="zap-por"]:checked');
    return zapComPadrao({
      ligado: campo('zap-ligado').checked,
      enviarPor: marcado ? marcado.value : '1',
      reserva: campo('zap-reserva').checked,
      numeros: {
        1: { nome: campo('zap-nome-1').value.trim(), instancia: campo('zap-inst-1').value.trim() },
        2: { nome: campo('zap-nome-2').value.trim(), instancia: campo('zap-inst-2').value.trim() },
      },
      destinos: campo('zap-destinos').value.trim(),
      eventos: {
        novo: campo('zap-ev-novo').checked,
        cancelado: campo('zap-ev-cancelado').checked,
        mudanca: campo('zap-ev-mudanca').checked,
      },
      formato: campo('zap-formato').value,
      url: campo('zap-url').value.trim(),
      chave: campo('zap-chave').value.trim(),
    });
  }

  function mostrarZapStatus(ok, texto) {
    const el = campo('zap-status');
    el.dataset.ok = ok == null ? '' : ok ? '1' : '0';
    el.textContent = texto;
  }

  function renderZapStatus() {
    const s = dados.whatsappStatus;
    if (!s) return;
    if (s.enviando) return mostrarZapStatus(null, 'Mandando mensagem…');
    if (s.ok) {
      const reserva = s.falhou ? `, como reserva (o ${s.falhou} falhou)` : '';
      return mostrarZapStatus(true, `${s.teste ? 'Teste enviado' : 'Última mensagem'} às ${hora(s.em)} pelo ${s.numero}${reserva}.`);
    }
    mostrarZapStatus(false, `Mensagem das ${hora(s.em)} não foi: ${s.erro}`);
  }

  function renderZapTopo() {
    const z = zapComPadrao(dados.config.whatsapp);
    const sel = campo('zap-topo');
    const valor = z.ligado ? z.enviarPor : 'off';
    sel.innerHTML = ['1', '2'].map(n => {
      const nome = nomeDoNumero(z, n);
      return `<option value="${n}">${esc(nome === 'Número ' + n ? nome : 'Nº ' + n + ' · ' + nome)}</option>`;
    }).join('') + '<option value="off">Desligado</option>';
    sel.value = valor;
    sel.closest('label').dataset.ligado = z.ligado ? '1' : '0';
  }

  async function gravarZap(z) {
    dados.config = Object.assign({}, dados.config, { whatsapp: z });
    await chrome.storage.local.set({ config: dados.config });
  }

  // O Chrome só deixa a extensão falar com o servidor depois que você autoriza o endereço.
  function salvarZap(depois) {
    const z = lerZap();
    let origem = null;
    if (z.url) {
      try {
        const u = new URL(z.url);
        if (!/^https?:$/.test(u.protocol)) throw new Error();
        origem = u.origin + '/*';
      } catch (e) {
        mostrarZapStatus(false, 'O endereço do servidor não parece certo. Exemplo: https://seu-servidor.com.br');
        return;
      }
    }
    const seguir = async () => {
      await gravarZap(z);
      preencherZap(z);
      renderZapTopo();
      if (depois) depois(z);
      else mostrarZapStatus(true, z.ligado ? `Salvo. Os avisos vão sair pelo ${nomeDoNumero(z, z.enviarPor)}.` : 'Salvo. Avisos pelo WhatsApp desligados.');
    };
    if (!origem) return seguir();
    chrome.permissions.request({ origins: [origem] }, ok => {
      if (!ok) {
        mostrarZapStatus(false, 'Sem permissão para falar com o servidor. Clique em Salvar de novo e aceite o pedido do Chrome.');
        return;
      }
      seguir();
    });
  }

  campo('zap-form').addEventListener('submit', e => { e.preventDefault(); salvarZap(); });
  campo('zap-testar').addEventListener('click', () => {
    salvarZap(z => {
      if (!z.url) return mostrarZapStatus(false, 'Falta o endereço do servidor (em Configuração do servidor).');
      mostrarZapStatus(null, 'Mandando mensagem de teste…');
      enviar({ tipo: 'testar-whatsapp' });
    });
  });
  campo('zap-formato').addEventListener('change', e => { campo('zap-ajuda').textContent = AJUDA_FORMATO[e.target.value]; });

  // Troca rápida no alto da tela.
  campo('zap-topo').addEventListener('change', async e => {
    const z = zapComPadrao(dados.config.whatsapp);
    if (e.target.value === 'off') z.ligado = false;
    else { z.ligado = true; z.enviarPor = e.target.value; }
    await gravarZap(z);
    preencherZap(z);
    toast(z.ligado ? `Avisos pelo WhatsApp saindo pelo ${nomeDoNumero(z, z.enviarPor)}.` : 'Avisos pelo WhatsApp desligados.');
    e.target.blur();
  });

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'testar') {
      enviar({ tipo: 'testar' });
      toast('Alarme de teste enviado: deve tocar e aparecer um aviso do Windows.');
    } else if (b.id === 'abrir-todos') {
      enviar({ tipo: 'abrir-todos' });
      toast('Abrindo os portais que ainda não estão abertos.');
    } else if (b.id === 'silenciar') {
      enviar({ tipo: 'silenciar' });
    } else if (b.id === 'limpar') {
      enviar({ tipo: 'limpar' });
    } else if (b.dataset.abrirPortal) {
      enviar({ tipo: 'abrir-portal', portal: b.dataset.abrirPortal });
    } else if (b.dataset.portal) {
      if (b.dataset.chamado) enviar({ tipo: 'abrir-chamado', portal: b.dataset.portal, id: b.dataset.chamado });
      else enviar({ tipo: 'abrir-portal', portal: b.dataset.portal, silenciar: true });
    }
  });

  document.addEventListener('change', e => {
    const s = e.target.closest('select[data-rec]');
    if (!s) return;
    const recarregar = Object.assign({}, dados.config.recarregar, { [s.dataset.rec]: Number(s.value) });
    enviar({ tipo: 'config', config: Object.assign({}, dados.config, { recarregar }) });
    toast('Pronto: ' + PORTAIS[s.dataset.rec].nome + ' ' + s.options[s.selectedIndex].text.toLowerCase() + '.');
  });

  let segundos = 0;
  setInterval(() => {
    const d = new Date();
    $('#relogio').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    document.querySelectorAll('[data-desde]').forEach(el => { el.textContent = fmtIdade(Date.now() - Number(el.dataset.desde)); });
    document.querySelectorAll('[data-espera]').forEach(el => { el.textContent = fmtEspera(Date.now() - Number(el.dataset.espera)); });
    if (++segundos % 15 === 0) render();
  }, 1000);

  carregar();
})();

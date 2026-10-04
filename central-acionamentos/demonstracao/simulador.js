// Demonstração do painel: imita a extensão (armazenamento, mensagens e chegada de chamados)
// para o painel de verdade (central.js) rodar numa página comum, sem os portais.
(() => {
  const MIN = 60000;
  const agora = () => Date.now();
  const pad = n => String(n).padStart(2, '0');
  const hhmm = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const copia = o => JSON.parse(JSON.stringify(o));
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  /* ---------- o "chrome" de mentira ---------- */
  const armazem = {};
  const ouvintes = [];
  const gravar = obj => {
    Object.assign(armazem, copia(obj));
    ouvintes.forEach(f => f(obj, 'local'));
  };
  window.chrome = {
    storage: {
      local: {
        get: async chaves => {
          const lista = chaves == null ? Object.keys(armazem) : [].concat(chaves);
          const r = {};
          lista.forEach(k => { if (k in armazem) r[k] = copia(armazem[k]); });
          return r;
        },
        set: async obj => gravar(obj),
      },
      session: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: f => ouvintes.push(f) },
    },
    tabs: { getCurrent: cb => cb(null) },
    permissions: { request: (_, cb) => cb(true) },
    runtime: { sendMessage: async msg => { setTimeout(() => receber(msg), 0); } },
  };

  /* ---------- chamados de exemplo ---------- */
  const T = agora();
  const ch = (portal, etapa, o) => ({
    id: portal + ':' + o.protocolo, portal, etapa, secao: o.secao || '', protocolo: o.protocolo,
    titulo: o.titulo, detalhes: o.detalhes || '', campos: [], prazo: o.prazo || '',
    atraso: !!o.atraso, link: '', vistoEm: o.vistoEm || agora(),
  });
  const estado = {
    porto: {
      chamados: [
        ch('porto', 'pendencia', { protocolo: '3417610', titulo: 'Bateria', detalhes: 'Centro · Formosa do Sul/SC', secao: 'GPS não iniciados (INI)', vistoEm: T - 12 * MIN }),
      ],
    },
    tokio: {
      chamados: [
        ch('tokio', 'caminho', { protocolo: '25091877', titulo: 'Pane elétrica', detalhes: 'Centro · Coronel Freitas/SC', prazo: 'até ' + hhmm(T + 22 * MIN), secao: 'A Caminho do Local / Origem', vistoEm: T - 18 * MIN }),
        ch('tokio', 'agendado', { protocolo: '25091904', titulo: 'Reboque', detalhes: 'Oficina · Quilombo/SC → Concessionária · Chapecó/SC', prazo: 'amanhã 08:00', secao: 'Agendadas', vistoEm: T - 60 * MIN }),
      ],
    },
    notro: {
      chamados: [
        ch('notro', 'servico', { protocolo: '03032668/02', titulo: 'Reboque', detalhes: 'REBOQUE - EXT · Cliente exemplo · São Lourenço do Oeste/SC · Em serviço', prazo: 'até ' + hhmm(T - 46 * MIN), atraso: true, secao: 'Acompanhamento', vistoEm: T - 150 * MIN }),
        ch('notro', 'agendado', { protocolo: '03032701/01', titulo: 'Reboque', detalhes: 'Pinhalzinho/SC → Residência · Quilombo/SC', prazo: 'hoje ' + hhmm(T + 190 * MIN), secao: 'Acompanhamento', vistoEm: T - 95 * MIN }),
      ],
    },
    aciona: {
      chamados: [
        ch('aciona', 'caminho', { protocolo: '558214', titulo: 'Troca de pneu', detalhes: 'SC-155 · Abelardo Luz/SC', prazo: 'até ' + hhmm(T + 9 * MIN), secao: 'Saída de Base', vistoEm: T - 40 * MIN }),
        ch('aciona', 'pendencia', { protocolo: '557903', titulo: 'Reboque', detalhes: 'Confirmar dados do serviço · BR-480 · Chapecó/SC', secao: 'Confirmar Dados', vistoEm: T - 200 * MIN }),
      ],
    },
  };
  for (const k of Object.keys(estado)) Object.assign(estado[k], { estado: 'ok', lidoEm: T - rnd(2, 20) * 1000, tabId: 1 });

  gravar({
    estado,
    alarme: { itens: [], silenciado: false },
    historico: [],
    whatsappStatus: null,
    config: {
      recarregar: {},
      whatsapp: {
        ligado: true, enviarPor: '1', reserva: true, destinos: '49 99999-0000', formato: 'evolution',
        url: 'https://servidor.exemplo.com.br', chave: '',
        numeros: { 1: { nome: 'Escritório', instancia: 'escritorio' }, 2: { nome: 'Plantão', instancia: 'plantao' } },
        eventos: { novo: true, cancelado: true, mudanca: false },
      },
    },
  });

  /* ---------- som e avisos na tela ---------- */
  let ctx = null;
  document.addEventListener('pointerdown', () => {
    try { ctx = ctx || new AudioContext(); ctx.resume(); } catch (e) { /* sem áudio */ }
  });
  function bip() {
    if (!ctx) return; // o navegador só deixa tocar depois do primeiro clique na página
    const t0 = ctx.currentTime;
    [0, 0.28, 0.56, 0.84, 1.12, 1.4].forEach((dt, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = i % 2 ? 660 : 880;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.15, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.24);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0 + dt);
      o.stop(t0 + dt + 0.26);
    });
  }
  setInterval(() => {
    const a = armazem.alarme;
    if (a && a.itens.length && !a.silenciado) bip();
  }, 12000);

  // Imita o aviso do Windows no canto da tela.
  function notificacao(origem, titulo, texto) {
    let caixa = document.getElementById('demo-avisos');
    if (!caixa) {
      caixa = document.createElement('div');
      caixa.id = 'demo-avisos';
      caixa.className = 'demo-avisos';
      caixa.setAttribute('aria-live', 'polite');
      document.body.appendChild(caixa);
    }
    const card = document.createElement('div');
    card.className = 'demo-aviso';
    const icone = document.querySelector('.mark');
    card.innerHTML = `<img alt="" src="${icone ? icone.src : ''}"><small></small><b></b><span></span>`;
    card.querySelector('small').textContent = origem;
    card.querySelector('b').textContent = titulo;
    card.querySelector('span').textContent = texto;
    caixa.appendChild(card);
    setTimeout(() => card.remove(), 7000);
  }
  const naVersaoReal = texto => notificacao('Demonstração', 'Na versão de verdade', texto);

  /* ---------- o que a extensão faria ---------- */
  function alarme(portal, chamadoId, texto, tipo) {
    const em = agora();
    const item = { id: em + '-' + portal, portal, chamadoId, texto, tipo, em };
    const a = armazem.alarme || { itens: [] };
    gravar({
      alarme: { itens: [item, ...a.itens].slice(0, 12), silenciado: false },
      historico: [item, ...(armazem.historico || [])].slice(0, 50),
    });
    const titulo = PORTAIS[portal] ? 'Novo acionamento · ' + PORTAIS[portal].nome : 'Teste do alarme';
    notificacao('Aviso do Windows · Central de Acionamentos', titulo, texto);
    bip();
  }

  function silenciar() {
    const a = armazem.alarme || { itens: [] };
    gravar({ alarme: { itens: a.itens.filter(i => i.tipo === 'pendente'), silenciado: true } });
  }

  function mandarZap(teste) {
    const z = zapComPadrao((armazem.config || {}).whatsapp);
    const falha = erro => gravar({ whatsappStatus: { em: agora(), ok: false, erro, teste } });
    if (!z.url) return falha('falta o endereço do servidor.');
    const destinos = z.destinos.split(/[\n,;]+/).filter(s => s.replace(/\D/g, '').length >= 10);
    if (!destinos.length) return falha('nenhum número válido em "Mandar para".');
    const n = z.enviarPor;
    if (!z.numeros[n].instancia) return falha(nomeDoNumero(z, n) + ' sem identificação no servidor.');
    gravar({ whatsappStatus: { em: agora(), enviando: true } });
    setTimeout(() => {
      gravar({ whatsappStatus: { em: agora(), ok: true, numero: nomeDoNumero(z, n), teste } });
      notificacao('WhatsApp (simulado)', 'Mensagem enviada pelo ' + nomeDoNumero(z, n),
        teste ? 'Teste da Central de Acionamentos.' : `Aviso do chamado para ${destinos.length} número(s).`);
    }, 1200);
  }

  function abrirChamado(portal, id) {
    const est = copia(armazem.estado);
    const c = est[portal].chamados.find(x => x.id === id);
    if (!c) return;
    if (c.etapa !== 'novo') {
      naVersaoReal(`Leva você para a aba do ${PORTAIS[portal].nome} e destaca o chamado ${c.protocolo}.`);
      return;
    }
    naVersaoReal(`Leva você para a aba do ${PORTAIS[portal].nome} com o chamado destacado, para aceitar. Aqui ele vai ser "aceito" em 2 segundos.`);
    setTimeout(() => {
      const e2 = copia(armazem.estado);
      const c2 = e2[portal].chamados.find(x => x.id === id);
      if (!c2) return;
      c2.etapa = 'caminho';
      c2.secao = 'A caminho';
      const a = armazem.alarme || { itens: [] };
      gravar({ estado: e2, alarme: { ...a, itens: a.itens.filter(i => i.chamadoId !== id) } });
    }, 2000);
  }

  function receber(msg) {
    switch (msg.tipo) {
      case 'testar':
        alarme('teste', null, 'Se você ouviu o alarme e viu este aviso, está funcionando.', 'aviso');
        break;
      case 'silenciar': silenciar(); break;
      case 'limpar': gravar({ alarme: { itens: [], silenciado: false } }); break;
      case 'abrir-portal':
        naVersaoReal(`Leva você para a aba do ${PORTAIS[msg.portal].nome}.`);
        if (msg.silenciar) silenciar();
        break;
      case 'abrir-chamado': abrirChamado(msg.portal, msg.id); break;
      case 'abrir-todos': naVersaoReal('Abre as abas dos portais que estiverem fechadas.'); break;
      case 'config': gravar({ config: msg.config }); break;
      case 'testar-whatsapp': mandarZap(true); break;
    }
  }

  /* ---------- chamados novos chegando ---------- */
  const NOVOS = [
    { portal: 'tokio', titulo: 'Reboque', detalhes: 'BR-282 · Xaxim/SC → Oficina · Chapecó/SC', secao: 'Serviços em Acionamento' },
    { portal: 'porto', titulo: 'Reboque', detalhes: 'BR-282 km 540 · Xanxerê/SC', secao: 'Serviços pendentes' },
    { portal: 'aciona', titulo: 'Troca de pneu', detalhes: 'SC-157 · Formosa do Sul/SC', secao: 'Novos Serviços' },
    { portal: 'porto', titulo: 'Pane seca', detalhes: 'Centro · Quilombo/SC', secao: 'Serviços pendentes' },
    { portal: 'tokio', titulo: 'Bateria', detalhes: 'Centro · Chapecó/SC', secao: 'Serviços em Acionamento' },
  ];
  const PROTOCOLO = {
    porto: () => '34' + rnd(18000, 19999),
    tokio: () => '2509' + rnd(1000, 9999),
    aciona: () => '55' + rnd(8300, 8999),
  };
  let proximo = 0;

  function chegar() {
    const est = copia(armazem.estado);
    const novos = Object.values(est).reduce((n, e) => n + e.chamados.filter(c => c.etapa === 'novo').length, 0);
    if (novos >= 3) return;
    const m = NOVOS[proximo++ % NOVOS.length];
    const c = ch(m.portal, 'novo', { ...m, protocolo: PROTOCOLO[m.portal](), prazo: 'até ' + hhmm(agora() + rnd(50, 90) * MIN) });
    est[m.portal].chamados.unshift(c);
    est[m.portal].lidoEm = agora();
    gravar({ estado: est });
    alarme(m.portal, c.id, [c.titulo, c.protocolo, c.detalhes].join(' · '), 'pendente');
    const z = zapComPadrao(armazem.config.whatsapp);
    if (z.ligado && z.eventos.novo) mandarZap(false);
  }

  // Os portais "são lidos" de tempos em tempos.
  setInterval(() => {
    const est = copia(armazem.estado);
    const k = ORDEM_PORTAIS[rnd(0, ORDEM_PORTAIS.length - 1)];
    est[k].lidoEm = agora();
    gravar({ estado: est });
  }, 6000);

  const agendar = ms => setTimeout(() => { chegar(); agendar(rnd(50, 80) * 1000); }, ms);
  agendar(8000);
  document.addEventListener('click', e => {
    if (e.target.closest('#demo-chegar')) chegar();
  });
})();

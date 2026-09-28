// Lê a tela dos portais de assistência e manda para a central cada chamado que encontrou.
// Só lê: não clica, não aceita e não envia nada para fora do computador.
(() => {
  const host = location.hostname;
  const portal =
    host.endsWith('portoseguro.com.br') ? 'porto' :
    host === 'tms-prestador.tokiomarine.com.br' ? 'tokio' :
    host === 'hub.notro.io' ? 'notro' :
    host.endsWith('acionafacil.com.br') ? 'aciona' : null;
  if (!portal) return;

  const limpo = s => (s || '').replace(/\s+/g, ' ').trim();
  const norm = s => limpo(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const numero = (t, rotulo) => {
    const m = t.match(new RegExp(rotulo + '\\s*\\(?\\s*(\\d+)'));
    return m ? Number(m[1]) : null;
  };
  const situacao = (t, frase) => (t.includes(frase) ? 'nenhum' : 'tem serviço');
  const hash = s => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };

  // Títulos das seções de cada portal (como aparecem na tela) e a coluna da central.
  const SECOES = {
    porto: [['servicos pendentes', 'novo'], ['servicos cancelados', 'cancelado'], ['servicos recebidos gps', 'pendencia']],
    tokio: [['servicos em acionamento', 'novo'], ['servicos em andamento', 'servico'], ['a caminho do local', 'caminho'],
      ['em andamento', 'servico'], ['agendadas', 'agendado'], ['saida de base pendente', 'pendencia'], ['concluidas', 'concluido']],
    aciona: [['novos servicos', 'novo'], ['saida de base', 'caminho'], ['em andamento', 'servico'],
      ['confirmar dados', 'pendencia'], ['orcamentos pendentes', 'pendencia']],
    notro: [],
  }[portal];

  // Reconhece a tela de serviços pelo texto e tira as contagens que ela mostra.
  // "pendentes" diz se a seção de serviços novos tem algo, mesmo que não dê para ler as linhas.
  const TELAS = {
    porto(t) {
      const iCanc = t.indexOf('servicos cancelados');
      const iPend = iCanc < 0 ? -1 : t.lastIndexOf('servicos pendentes', iCanc);
      if (iPend < 0) return null;
      const ini = iPend + 'servicos pendentes'.length;
      const novo = !t.slice(ini, iCanc).includes('nenhum servico pendente');
      return {
        pendentes: novo ? 1 : 0,
        faixa: [ini, iCanc],
        contagens: [
          ['Pendentes', novo ? 'tem serviço' : 'nenhum'],
          ['Cancelados', situacao(t, 'nenhum servico cancelado')],
          ['GPS não iniciados', situacao(t, 'nenhum servico recebido pelo gps')],
        ],
      };
    },
    tokio(t) {
      const titulo = 'servicos em acionamento';
      const iAc = t.indexOf(titulo);
      if (iAc < 0) return null;
      const ini = iAc + titulo.length;
      let fim = t.indexOf('servicos em andamento', ini);
      if (fim < 0) fim = t.length;
      const novo = !t.slice(ini, fim).includes('nao existem servicos em acionamento');
      return {
        pendentes: novo ? 1 : 0,
        faixa: [ini, fim],
        contagens: [
          ['Em acionamento', novo ? 'tem serviço' : 'nenhum'],
          ['A caminho', situacao(t, 'nao existem servicos a caminho')],
          ['Em andamento', situacao(t, 'nao existem servicos em andamento')],
          ['Agendadas', situacao(t, 'nao existem servicos agendados')],
          ['Saída de base pendente', situacao(t, 'nao existem servicos pendentes de saida')],
        ],
      };
    },
    aciona(t) {
      const novos = numero(t, 'novos servicos');
      if (novos == null) return null;
      return {
        pendentes: novos,
        faixa: null,
        contagens: [
          ['Novos serviços', novos],
          ['Em andamento', numero(t, 'em andamento')],
          ['Saída de base', numero(t, 'saida de base')],
          ['Confirmar dados', numero(t, 'confirmar dados')],
          ['Orçamentos pendentes', numero(t, 'orcamentos pendentes')],
        ],
      };
    },
    notro(t) {
      const todos = numero(t, 'todos');
      if (todos == null || !t.includes('aguardando deslocamento')) return null;
      return {
        pendentes: 0,
        faixa: null,
        contagens: [
          ['Todos', todos],
          ['Agendados', numero(t, 'agendados')],
          ['Aguardando deslocamento', numero(t, 'aguardando deslocamento')],
          ['A caminho do local', numero(t, 'a caminho do local')],
          ['Em serviço', numero(t, 'em servico')],
        ],
      };
    },
  };

  const TIPOS = [
    ['pane seca', 'Pane seca'], ['pane eletrica', 'Pane elétrica'], ['pane mecanica', 'Pane mecânica'],
    ['troca de pneu', 'Troca de pneu'], ['pneu', 'Pneu'], ['bateria', 'Bateria'], ['chaveiro', 'Chaveiro'],
    ['reboque', 'Reboque'], ['guincho', 'Guincho'], ['remocao', 'Remoção'], ['socorro', 'Socorro'], ['pane', 'Pane'],
  ];

  // Na Notro cada linha traz a própria situação.
  function etapaPelaSituacao(n) {
    if (/agendad/.test(n)) return 'agendado';
    if (/aguardando deslocamento|a caminho|deslocamento/.test(n)) return 'caminho';
    if (/finaliz|conclu/.test(n)) return 'concluido';
    if (/cancelad/.test(n)) return 'cancelado';
    if (/aguardando aceite|oferta/.test(n)) return 'novo';
    return 'servico';
  }

  // Títulos de seção na ordem em que aparecem na página.
  function marcadores() {
    const lista = [];
    if (!SECOES.length) return lista;
    const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let no = andar.nextNode(); no; no = andar.nextNode()) {
      const n = norm(no.nodeValue);
      if (!n || n.length > 60) continue;
      const achado = SECOES.find(([titulo]) => n.startsWith(titulo));
      if (!achado) continue;
      const el = no.parentElement;
      const linha = el.closest('tr, [role="row"]');
      if (linha && celulasDe(linha).length >= 3) continue; // texto de uma linha de dados, não título
      lista.push({ el, etapa: achado[1], secao: limpo(no.nodeValue) });
    }
    return lista;
  }

  function celulasDe(linha) {
    return linha.tagName === 'TR'
      ? [...linha.cells].filter(c => c.tagName === 'TD')
      : [...linha.querySelectorAll('[role="cell"], [role="gridcell"]')];
  }

  function cabecalhos(linha) {
    const tabela = linha.closest('table');
    if (tabela) {
      const ths = tabela.querySelectorAll('thead th');
      if (ths.length) return [...ths].map(th => limpo(th.innerText));
      const primeira = tabela.rows[0];
      if (primeira && primeira.cells.length && [...primeira.cells].every(c => c.tagName === 'TH')) {
        return [...primeira.cells].map(c => limpo(c.innerText));
      }
      return [];
    }
    const grade = linha.closest('[role="table"], [role="grid"]');
    return grade ? [...grade.querySelectorAll('[role="columnheader"]')].map(h => limpo(h.innerText)) : [];
  }

  function chamadoDaLinha(linha, cels, etapa, secao) {
    const texto = limpo(linha.innerText);
    const n = norm(texto);
    const valores = cels.map(c => limpo(c.innerText));
    const heads = cabecalhos(linha);
    const prot = texto.match(/\b\d[\d./-]{4,}\d\b/);
    const protocolo = prot ? prot[0] : '';
    const tipo = TIPOS.find(([chave]) => n.includes(chave));
    const primeiro = valores.find(v => v && v !== protocolo) || 'Serviço';
    const iPrazo = heads.findIndex(h => /prazo|previs/.test(norm(h)));
    const link = [...linha.querySelectorAll('a[href]')].find(a => /^https?:/.test(a.href));
    const titulo = tipo ? tipo[1] : primeiro.slice(0, 40);
    // Detalhes sem repetir o que já aparece no card (protocolo, tipo e prazo).
    const detalhes = valores
      .map((v, i) => (i === iPrazo ? '' : limpo(protocolo ? v.replace(protocolo, '') : v)))
      .filter(v => v && norm(v) !== norm(titulo) && norm(v) !== (tipo ? tipo[0] : ''));
    return {
      id: portal + ':' + (protocolo || hash(n)),
      portal,
      etapa,
      secao,
      protocolo,
      titulo,
      detalhes: detalhes.join(' · ').slice(0, 260),
      campos: valores.map((v, i) => [heads[i] || '', v]).filter(([h, v]) => h && v).slice(0, 8),
      prazo: iPrazo >= 0 ? valores[iPrazo] || '' : '',
      atraso: /atras/.test(n),
      link: link ? link.href : '',
    };
  }

  function chamados() {
    const marcas = marcadores();
    const lista = [];
    const vistos = new Set();
    document.querySelectorAll('tr, [role="row"]').forEach(linha => {
      const cels = celulasDe(linha);
      if (cels.length < 2) return;
      if (linha.querySelector('table, [role="table"], [role="grid"]')) return; // tabela de layout
      const texto = limpo(linha.innerText);
      const n = norm(texto);
      if (!texto || texto.length > 600 || /^(nenhum|nao existe|nao ha)/.test(n)) return;
      if (SECOES.some(([titulo]) => n.startsWith(titulo))) return; // é um título
      let etapa = null;
      let secao = '';
      if (portal === 'notro') {
        etapa = etapaPelaSituacao(n);
        secao = 'Acompanhamento';
      } else {
        for (const m of marcas) {
          if (m.el.compareDocumentPosition(linha) & Node.DOCUMENT_POSITION_FOLLOWING) {
            etapa = m.etapa;
            secao = m.secao;
          }
        }
      }
      if (!etapa) return; // linha fora das seções de serviço (menu, rodapé...)
      const c = chamadoDaLinha(linha, cels, etapa, secao);
      if (vistos.has(c.id)) return;
      vistos.add(c.id);
      lista.push(c);
    });
    return lista;
  }

  let ultimo = '';
  let enviadoEm = 0;
  let relogio = null;

  function ler() {
    if (!document.body) return;
    const bruto = limpo(document.body.innerText);
    const t = bruto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const tela = TELAS[portal](t);
    let leitura;
    if (tela) {
      const lista = chamados();
      // A seção de novos tem serviço, mas não deu para ler as linhas: avisa assim mesmo.
      if (tela.pendentes > 0 && !lista.some(c => c.etapa === 'novo')) {
        const f = tela.faixa;
        const fonte = t.length === bruto.length ? bruto : t;
        lista.unshift({
          id: portal + ':sem-linha',
          portal,
          etapa: 'novo',
          secao: '',
          protocolo: '',
          qtd: tela.pendentes,
          titulo: tela.pendentes > 1 ? tela.pendentes + ' serviços novos' : 'Serviço novo',
          detalhes: f ? fonte.slice(f[0], f[1]).trim().slice(0, 260) : 'Abra o portal para ver e aceitar.',
          campos: [],
          prazo: '',
          atraso: false,
          link: '',
        });
      }
      leitura = { estado: 'ok', chamados: lista, contagens: tela.contagens };
    } else if (window === window.top) {
      const senha = [...document.querySelectorAll('input[type="password"]')].some(el => el.offsetParent !== null);
      leitura = { estado: senha ? 'login' : 'outra-tela' };
    } else {
      return; // quadro interno sem a tela de serviços
    }

    const json = JSON.stringify(leitura);
    if (json === ultimo && Date.now() - enviadoEm < 30000) return;
    ultimo = json;
    enviadoEm = Date.now();
    try {
      chrome.runtime.sendMessage({ tipo: 'leitura', portal, leitura, pagina: location.href }).catch(() => {});
    } catch (e) {
      clearInterval(relogio); // a extensão foi atualizada ou removida
    }
  }

  // "Abrir no portal" na central: rola a tela até o chamado e marca ele por alguns segundos.
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.tipo !== 'destacar' || msg.portal !== portal) return;
    const alvo = [...document.querySelectorAll('tr, [role="row"]')].find(linha => {
      const texto = limpo(linha.innerText);
      if (!texto || linha.querySelector('table')) return false;
      return msg.protocolo ? texto.includes(msg.protocolo) : msg.id === portal + ':' + hash(norm(texto));
    });
    if (!alvo) return;
    alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const antes = alvo.style.outline;
    alvo.style.outline = '3px solid #F2A900';
    alvo.style.outlineOffset = '2px';
    setTimeout(() => { alvo.style.outline = antes; }, 6000);
  });

  // Lê quando a tela muda (o portal se atualizou) e, por garantia, a cada 15 segundos.
  let marcado = false;
  const agendar = () => {
    if (marcado) return;
    marcado = true;
    setTimeout(() => { marcado = false; ler(); }, 1500);
  };
  new MutationObserver(agendar).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  relogio = setInterval(ler, 15000);
  ler();
})();

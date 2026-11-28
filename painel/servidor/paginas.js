'use strict';
/* Páginas do Painel Deconto: login, tela inicial com os sistemas e a moldura de cada sistema. */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MARCA = '<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect x="0.5" y="0.5" width="33" height="33" rx="7" fill="#1F3E9C"/><circle cx="17" cy="17" r="10.6" fill="none" stroke="#FFFFFF" stroke-width="4.2"/><path d="M18.6 9.6L12.6 18.2H16.4L15.2 24.6L21.6 15.4H17.8Z" fill="#F2C230"/></svg>';

/* Ícone da aba do navegador: a mesma logo. */
const ICONE = '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent(MARCA.replace(' aria-hidden="true"', ' xmlns="http://www.w3.org/2000/svg"')) + '">';

const ESTILO = `
:root {
  /* Painel: barra escura com o nome do grupo; cartões dos sistemas numa grade, cada um com a cor do seu sistema. */
  --bg: #EEF1F5; --surface: #FFFFFF; --sunk: #E4E8EF; --ink: #151A23; --muted: #535E72; --line: #D3D9E3;
  --accent: #1C47B5; --accent-hover: #15398F; --accent-ink: #FFFFFF; --ok: #0B7550; --bad: #BA2E29;
  --barra: #171C24; --barra-ink: #F3F5F8; --barra-muted: #A9B2C1; --barra-line: #2C3441; --faixa: #F2C230;
  --display: "Barlow Condensed", "Arial Narrow", system-ui, sans-serif; --body: "Barlow", system-ui, -apple-system, "Segoe UI", sans-serif;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #0E1117; --surface: #161B24; --sunk: #1D2430; --ink: #E7EBF2; --muted: #9CA6B8; --line: #2B3443;
    --accent: #87A3FF; --accent-hover: #A9BEFF; --accent-ink: #0E1117; --ok: #4FCB96; --bad: #FF8F87; --barra: #0A0D12; --barra-line: #232A35; color-scheme: dark; }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); font: 16px/1.5 var(--body); }
h1, h2, p { margin: 0; }
.barra { background: var(--barra); color: var(--barra-ink); border-bottom: 1px solid var(--barra-line); }
.barra-in, .wrap { max-width: 1100px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.barra-in { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 12px; }
.marca { display: flex; align-items: center; gap: 10px; }
.marca strong { display: block; font: 700 1.4rem/1.1 var(--display); }
.marca span { font-size: 0.82rem; color: var(--barra-muted); }
.quem { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; color: var(--barra-muted); }
.quem button { font: 600 0.88rem var(--body); color: var(--barra-ink); background: transparent; border: 1px solid var(--barra-line); border-radius: 8px; padding: 6px 12px; min-height: 36px; cursor: pointer; }
.quem button:hover { border-color: var(--faixa); }
.wrap { padding-block: 28px 56px; display: flex; flex-direction: column; gap: 22px; }
.h1 { font: 700 1.9rem/1.1 var(--display); }
.hint { color: var(--muted); font-size: 0.95rem; }
.cartoes { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 14px; }
.cartao { position: relative; display: flex; flex-direction: column; gap: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px 18px 18px 22px; color: inherit; text-decoration: none; min-width: 0; overflow: hidden; }
.cartao::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 6px; background: var(--cor); }
a.cartao:hover { border-color: var(--cor); box-shadow: 0 6px 18px rgba(21, 26, 35, 0.08); }
a.cartao:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.cartao .num { font: 700 0.78rem var(--body); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.cartao h2 { font: 700 1.5rem/1.1 var(--display); }
.cartao p { color: var(--muted); font-size: 0.95rem; }
.cartao .abrir { margin-top: auto; align-self: flex-start; font-weight: 700; color: var(--accent); }
.cartao.breve { opacity: 0.7; border-style: dashed; }
.cartao.breve .abrir { color: var(--muted); }
.bloco { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 12px; max-width: 560px; }
.bloco h2 { font: 600 1.25rem var(--display); }
.campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 12px; }
label { display: flex; flex-direction: column; gap: 5px; font-weight: 600; font-size: 0.92rem; }
input { font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; min-height: 44px; width: 100%; }
input:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
.btn { font: 700 1rem var(--body); color: var(--accent-ink); background: var(--accent); border: 0; border-radius: 9px; min-height: 44px; padding: 10px 18px; cursor: pointer; }
.btn:hover { background: var(--accent-hover); }
.btn:disabled { opacity: 0.6; cursor: wait; }
.msg { min-height: 1.4em; font-weight: 600; font-size: 0.92rem; }
.msg.erro { color: var(--bad); } .msg.ok { color: var(--ok); }
`;
const FONTES = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap">';
const cabeca = titulo => `<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>${esc(titulo)}</title>\n${ICONE}\n${FONTES}\n<style>${ESTILO}</style>\n</head>\n`;

function paginaEntrar() {
  return cabeca('Painel Deconto · Entrar') + `<body>
<header class="barra"><div class="barra-in"><div class="marca">${MARCA}<div><strong>Painel Deconto</strong><span>Sistemas do grupo Deconto</span></div></div></div></header>
<main class="wrap" style="max-width:420px">
  <form class="bloco" id="f" novalidate>
    <h2>Entrar</h2>
    <label>Usuário <input id="usuario" autocomplete="username" autocapitalize="none" autofocus></label>
    <label>Senha <input id="senha" type="password" autocomplete="current-password"></label>
    <button class="btn" id="ir" type="submit">Entrar</button>
    <p class="msg erro" id="msg" role="status"></p>
  </form>
</main>
<script>
document.getElementById('f').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = document.getElementById('msg'), ir = document.getElementById('ir');
  msg.textContent = ''; ir.disabled = true;
  try {
    const r = await fetch('/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ usuario: document.getElementById('usuario').value, senha: document.getElementById('senha').value }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { location.href = '/'; return; }
    msg.textContent = d.erro || 'Não consegui entrar. Tente de novo.';
  } catch (er) { msg.textContent = 'O servidor não respondeu. Confira a internet.'; }
  ir.disabled = false;
});
</script>
</body>
</html>
`;
}

function paginaInicial(u, sistemas) {
  const cartoes = sistemas.map(s => s.pronto
    ? `<a class="cartao" href="/${esc(s.id)}/" style="--cor:${esc(s.cor)}"><span class="num">Sistema ${s.numero}</span><h2>${esc(s.nome)}</h2><p>${esc(s.descricao)}</p><span class="abrir">Abrir →</span></a>`
    : `<div class="cartao breve" style="--cor:${esc(s.cor)}" aria-disabled="true"><span class="num">Sistema ${s.numero}</span><h2>${esc(s.nome)}</h2><p>Em desenvolvimento.</p><span class="abrir">Em breve</span></div>`).join('\n    ');
  return cabeca('Painel Deconto') + `<body>
<header class="barra"><div class="barra-in"><div class="marca">${MARCA}<div><strong>Painel Deconto</strong><span>Sistemas do grupo Deconto</span></div></div>
  <div class="quem"><span>${esc(u.nome || u.usuario)}</span><button type="button" id="sair">Sair</button></div></div></header>
<main class="wrap">
  <div><h1 class="h1">Sistemas</h1><p class="hint">Escolha o sistema que vai usar.</p></div>
  <div class="cartoes">
    ${cartoes}
  </div>
  <form class="bloco" id="f-senha" novalidate>
    <h2>Trocar a minha senha</h2>
    <div class="campos">
      <label>Senha atual <input id="atual" type="password" autocomplete="current-password"></label>
      <label>Senha nova <input id="nova" type="password" autocomplete="new-password"></label>
    </div>
    <div><button class="btn" type="submit">Trocar a senha</button></div>
    <p class="msg" id="msg-senha" role="status"></p>
  </form>
</main>
<script>
document.getElementById('sair').addEventListener('click', async () => {
  try { await fetch('/api/sair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'same-origin' }); } catch (e) { /* sai assim mesmo */ }
  location.href = '/entrar';
});
document.getElementById('f-senha').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = document.getElementById('msg-senha');
  const atual = document.getElementById('atual').value, nova = document.getElementById('nova').value;
  if (nova.length < 6) { msg.className = 'msg erro'; msg.textContent = 'A senha nova precisa ter pelo menos 6 letras ou números.'; return; }
  try {
    const r = await fetch('/api/minha-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ atual, nova }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = '/entrar'; return; }
    msg.className = 'msg ' + (r.ok ? 'ok' : 'erro');
    msg.textContent = r.ok ? 'Senha trocada.' : (d.erro || 'Não consegui trocar a senha.');
    if (r.ok) { document.getElementById('atual').value = ''; document.getElementById('nova').value = ''; }
  } catch (er) { msg.className = 'msg erro'; msg.textContent = 'O servidor não respondeu. Confira a internet.'; }
});
</script>
</body>
</html>
`;
}

/* A página do sistema (feita para o claude.ai, sem <head>) ganha o <head> com título, fontes
   e window.PAINEL, que liga o modo servidor dela. O título e as fontes só saem das linhas do
   começo, antes do primeiro <style> (ou <script>): o JavaScript da página também escreve
   <title> e <link> dentro de textos, e esses não podem ser mexidos. */
const RESET = '*,*::before,*::after{box-sizing:border-box}body{margin:0}img{max-width:100%}[hidden]{display:none!important}';
function paginaSistema(htmlSistema, u, s) {
  const cab = [];
  const fim = htmlSistema.search(/<(?:style|script)[\s>]/i);
  const topo = fim < 0 ? htmlSistema : htmlSistema.slice(0, fim), resto = fim < 0 ? '' : htmlSistema.slice(fim);
  const corpo = topo.replace(/<title>[\s\S]*?<\/title>\n?|<meta name="claude:[^>]*>\n?|<link rel="(?:preconnect|stylesheet)"[^>]*>\n?/g, m => { if (!m.includes('claude:')) cab.push(m.trim()); return ''; }) + resto;
  const painel = JSON.stringify({ usuario: u.usuario, nome: u.nome, admin: !!u.admin, sistema: s.id, nomeSistema: s.nome }).replace(/</g, '\\u003c');
  return '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    + ICONE + '\n' + cab.join('\n') + `\n<style>${RESET}</style>\n<script>window.PAINEL = ${painel};</script>\n</head>\n<body>\n` + corpo + '\n</body>\n</html>\n';
}

/* Ponto pelo celular (/ponto/<token>, sem login). A foto vem da câmera da frente (capture="user"),
   reduzida aqui para ~1024 px em JPEG; o local, do GPS. A hora que vale é a do servidor. */
const ESTILO_PONTO = `
.ponto-wrap { max-width: 480px; gap: 18px; }
.relogio strong { display: block; font: 700 3.4rem/1 var(--display); font-variant-numeric: tabular-nums; }
.relogio span { color: var(--muted); }
.bater { width: 100%; min-height: 96px; font-size: 1.45rem; border-radius: 16px; }
.bater.entrada { background: var(--ok); }
.bater.saida { background: var(--accent); }
.comprovante { border-color: var(--ok); border-width: 2px; }
.comprovante strong { font: 700 1.5rem/1.2 var(--display); color: var(--ok); }
`;
function paginaPontoNaoVale(msg) {
  return cabeca('Ponto') + `<body>
<header class="barra"><div class="barra-in"><div class="marca">${MARCA}<div><strong>Ponto</strong><span>Deconto</span></div></div></div></header>
<main class="wrap" style="max-width:480px"><p class="bloco">${esc(msg)}</p></main>
</body>
</html>
`;
}
function paginaPonto(estado) {
  const dados = JSON.stringify(estado).replace(/</g, '\\u003c');
  return cabeca('Ponto · ' + estado.nome).replace('</style>', ESTILO_PONTO + '</style>') + `<body>
<header class="barra"><div class="barra-in"><div class="marca">${MARCA}<div><strong>Ponto</strong><span>Deconto · controle interno</span></div></div></div></header>
<main class="wrap ponto-wrap">
  <div><p class="hint">Olá,</p><h1 class="h1" id="nome">${esc(estado.nome)}</h1></div>
  <div class="relogio" aria-live="off"><strong id="hora">--:--:--</strong><span id="dia"></span></div>
  <p class="hint" id="ultimo"></p>
  <section class="bloco" id="aviso" hidden>
    <h2>Aviso de privacidade</h2>
    <p>Ao registrar o ponto, este celular manda para o RH da Deconto uma foto sua e o local daquele momento. Nada é enviado fora do registro, e o RH usa só para conferir o ponto (LGPD).</p>
    <div><button class="btn" type="button" id="entendi">Entendi</button></div>
  </section>
  <button class="btn bater entrada" type="button" id="bater" hidden>Registrar entrada</button>
  <input id="foto" type="file" accept="image/*" capture="user" hidden>
  <p class="msg" id="msg" role="status" aria-live="polite"></p>
  <section class="bloco comprovante" id="comprovante" hidden aria-live="polite">
    <strong id="comp-tipo"></strong>
    <p id="comp-det"></p>
  </section>
  <p class="hint">Ao tocar no botão, o celular tira uma foto sua e pega o local. Dica: salve esta página na tela inicial do celular.</p>
</main>
<script>
var P = ${dados};
var dif = P.agora - Date.now();
var $ = function (id) { return document.getElementById(id); };
var FUSO = 'America/Sao_Paulo';
var NOME_TIPO = { entrada: 'Entrada', saida: 'Saída' };
var dataBR = function (s) { return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4); };
function tic() {
  var d = new Date(Date.now() + dif);
  $('hora').textContent = d.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('dia').textContent = d.toLocaleDateString('pt-BR', { timeZone: FUSO, weekday: 'long', day: '2-digit', month: 'long' });
}
function mostrar() {
  $('bater').textContent = P.proximo === 'saida' ? 'Registrar saída' : 'Registrar entrada';
  $('bater').className = 'btn bater ' + P.proximo;
  $('ultimo').textContent = P.ultimo ? 'Último registro: ' + NOME_TIPO[P.ultimo.tipo] + ' em ' + dataBR(P.ultimo.data) + ' às ' + P.ultimo.hora + '.' : 'Nenhum registro ainda.';
}
function msg(t, erro) { $('msg').textContent = t; $('msg').className = 'msg' + (erro ? ' erro' : ''); }
function local() {
  return new Promise(function (ok, falha) {
    if (!navigator.geolocation) return falha({ code: 2 });
    navigator.geolocation.getCurrentPosition(ok, falha, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
// ~1024 px no lado maior, em JPEG; se o navegador não conseguir ler, manda a original (JPG ou PNG)
function reduzir(arq) {
  return new Promise(function (ok) {
    var url = URL.createObjectURL(arq), img = new Image();
    var original = function () { URL.revokeObjectURL(url); ok(arq.type === 'image/jpeg' || arq.type === 'image/png' ? arq : null); };
    img.onload = function () {
      var k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(function (b) { if (b) { URL.revokeObjectURL(url); ok(b); } else original(); }, 'image/jpeg', 0.8);
    };
    img.onerror = original;
    img.src = url;
  });
}
var aviso = false;
try { aviso = localStorage.getItem('ponto-aviso-lido') === '1'; } catch (e) { /* sem localStorage: mostra o aviso */ }
$('aviso').hidden = aviso;
$('bater').hidden = !aviso;
$('entendi').addEventListener('click', function () {
  try { localStorage.setItem('ponto-aviso-lido', '1'); } catch (e) { /* mostra de novo na próxima vez */ }
  $('aviso').hidden = true; $('bater').hidden = false; $('bater').focus();
});
$('bater').addEventListener('click', function () { msg(''); $('foto').value = ''; $('foto').click(); });
$('foto').addEventListener('change', async function () {
  var arq = $('foto').files[0];
  if (!arq) { msg('Sem a foto o ponto não é registrado. Toque no botão e tire a foto.', true); return; }
  $('bater').disabled = true;
  $('comprovante').hidden = true;
  try {
    msg('Pegando o local…');
    var pos;
    try { pos = await local(); } catch (e) {
      msg(e && e.code === 1 ? 'Sem a localização o ponto não é registrado. Permita a localização para este site nas configurações do navegador e tente de novo.' : 'Não consegui pegar a localização. Ligue o GPS, vá para um lugar aberto e tente de novo.', true);
      return;
    }
    var foto = await reduzir(arq);
    if (!foto) { msg('Não consegui ler a foto. Tente de novo.', true); return; }
    msg('Enviando…');
    var r, d;
    try {
      r = await fetch('/ponto/' + location.pathname.split('/')[2] + '/registrar', { method: 'POST', body: foto,
        headers: { 'Content-Type': foto.type, 'X-Lat': String(pos.coords.latitude), 'X-Lon': String(pos.coords.longitude), 'X-Precisao': String(Math.round(pos.coords.accuracy || 0)) } });
      d = await r.json().catch(function () { return {}; });
    } catch (e) { msg('Sem internet: o ponto não foi registrado. Confira a internet e tente de novo.', true); return; }
    if (!r.ok) { msg(d.erro || 'O ponto não foi registrado. Tente de novo.', true); return; }
    P.proximo = d.proximo;
    P.ultimo = { tipo: d.tipo, data: d.data, hora: d.hora };
    mostrar();
    msg('');
    $('comp-tipo').textContent = NOME_TIPO[d.tipo] + ' registrada às ' + d.hora;
    $('comp-det').textContent = d.nome + ' · ' + dataBR(d.data) + ' · hora do servidor';
    $('comprovante').hidden = false;
  } finally { $('bater').disabled = false; }
});
mostrar();
tic();
setInterval(tic, 1000);
</script>
</body>
</html>
`;
}

module.exports = { paginaEntrar, paginaInicial, paginaSistema, paginaPonto, paginaPontoNaoVale };

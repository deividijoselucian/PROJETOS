// Toca o alarme (bipe de sirene) a cada 12 segundos até a central mandar parar.
let ctx = null;
let timer = null;

function bip() {
  ctx = ctx || new AudioContext();
  ctx.resume();
  const t0 = ctx.currentTime;
  [0, 0.28, 0.56, 0.84, 1.12, 1.4].forEach((dt, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = i % 2 ? 660 : 880;
    g.gain.setValueAtTime(0.0001, t0 + dt);
    g.gain.exponentialRampToValueAtTime(0.2, t0 + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.24);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0 + dt);
    o.stop(t0 + dt + 0.26);
  });
}

chrome.runtime.onMessage.addListener(msg => {
  if (msg.alvo !== 'som') return;
  if (msg.acao === 'tocar' && !timer) {
    bip();
    timer = setInterval(bip, 12000);
  }
  if (msg.acao === 'parar') {
    clearInterval(timer);
    timer = null;
  }
});

chrome.runtime.sendMessage({ tipo: 'som-pronto' }).catch(() => {});

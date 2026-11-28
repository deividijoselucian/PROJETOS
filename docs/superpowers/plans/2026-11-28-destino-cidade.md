# Destino puxando a cidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Destino A e B (Operação e Agenda) sugerem cidades do Sul e destinos já usados enquanto a pessoa digita.

**Architecture:** Tudo em `munck/munck.html`: uma constante com as 1.191 cidades (PR, SC, RS), uma função pura que monta as sugestões e uma lista de sugestões própria (um `<ul>` só, reaproveitado pelos 4 campos). Os campos deixam de usar o `datalist` `lista-destinos`.

**Tech Stack:** HTML/JS sem dependências; testes de tela com Playwright (`painel/testes/telas.test.js`).

**Spec:** `docs/superpowers/specs/2026-11-28-destino-cidade-design.md`

## Global Constraints
- Campos: `#km-dest-a`, `#km-dest-b`, `#ag-dest-a`, `#ag-dest-b`.
- Lista a partir de **2** letras, no máximo **8** itens; destinos já usados primeiro, depois cidades `"Nome - UF"`.
- Sem acento e sem maiúscula ("sao" acha "São Domingos - SC"); cidade que começa com o texto vem antes da que só contém.
- Setas + Enter e clique escolhem; Esc fecha; o campo continua aceitando texto livre.
- Fonte das cidades: `git show a1bad9b^:munck/mapa-sul.json`, campo `cidades` (`[nome, uf, lat, lon]`); citar IBGE/CC0 e kelvins/municipios-brasileiros/MIT num comentário.

## Review Focus
1. Enter com a lista aberta escolhe o item e **não** envia o formulário da Operação.
2. Valor posto pelo sistema (sugestão do agendamento, editar) não abre a lista: só digitação abre.
3. Celular 390px: a lista não cria rolagem para o lado (o teste de celular existente precisa seguir passando).
4. Destino já usado com `<` ou `&` aparece como texto, não como HTML.
5. Clique no item (mousedown) escolhe antes de o campo perder o foco.

---

### Task 1: Sugestão de cidade nos destinos

**Files:**
- Modify: `munck/munck.html` (campos das linhas ~372-373 e ~424-425; `datalist` `lista-destinos` ~647 e o `preencherDatalist('lista-destinos', …)` ~1158; listeners de `input`/`keydown`/`focusout`)
- Modify: `munck/README.md` (uma linha sobre a lista de cidades)
- Test: `painel/testes/telas.test.js`

**Interfaces:**
- Produces: `const CIDADES` (array de `"Nome - UF"`, 1.191 itens); `semAcento(s: string): string` (minúsculo e sem acento; reusar se já existir função igual); `sugestoesDestino(texto: string): string[]` (pura, lê os destinos de `todos('km')` e `todos('agenda')`).

- [ ] **Step 1: Escrever os testes que falham** (depois de `'Operação: registro antigo com obra…'`)

```js
teste('Destino: puxa a cidade sem acento; destinos já usados vêm primeiro; Enter não envia', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/operacao/#operacao');
  await esperarServidor(a);
  await caminhoesDeTeste(a);
  await a.evaluate(async () => { await gravar('km', { id: 'km-dest-usado', data: '2025-02-01', caminhaoId: 'cam-sem', cliente: 'C', destinoA: 'Pátio Deconto - Xanxerê', destinoB: '<b>x</b> & y', kmInicial: 1, kmFinal: 2, criadoEm: new Date().toISOString() }); });
  const itens = () => a.$$eval('#sug-destino li', l => l.map(x => x.textContent));
  await a.fill('#km-dest-a', 'x');
  assert.strictEqual(await a.isVisible('#sug-destino'), false, '1 letra não abre');
  await a.fill('#km-dest-a', 'xanx');
  await a.waitForSelector('#sug-destino li');
  const l1 = await itens();
  assert.strictEqual(l1[0], 'Pátio Deconto - Xanxerê', 'usado primeiro');
  assert.ok(l1.includes('Xanxerê - SC'));
  assert.ok(l1.length <= 8);
  await a.fill('#km-dest-a', 'sao d');
  await a.waitForFunction(() => [...document.querySelectorAll('#sug-destino li')].some(x => x.textContent === 'São Domingos - SC'));
  const antes = (await dados(ctx, 'operacao')).km.length;
  await a.press('#km-dest-a', 'ArrowDown');
  await a.press('#km-dest-a', 'Enter');
  assert.match(await a.inputValue('#km-dest-a'), / - (PR|SC|RS)$/, 'Enter escolheu uma cidade');
  assert.strictEqual(await a.isVisible('#sug-destino'), false, 'lista fecha ao escolher');
  assert.strictEqual((await dados(ctx, 'operacao')).km.length, antes, 'Enter não enviou o formulário');
  await a.fill('#km-dest-b', '<b');
  await a.waitForSelector('#sug-destino li');
  assert.ok((await itens()).includes('<b>x</b> & y'), 'texto, não HTML');
  await a.press('#km-dest-b', 'Escape');
  assert.strictEqual(await a.isVisible('#sug-destino'), false, 'Esc fecha');
  // Agenda: clique escolhe
  await a.evaluate(() => { location.hash = 'agenda'; });
  await a.fill('#ag-dest-b', 'chapec');
  await a.click('#sug-destino li:has-text("Chapecó - SC")');
  assert.strictEqual(await a.inputValue('#ag-dest-b'), 'Chapecó - SC');
});

teste('Destino: sugestoesDestino ordena quem começa antes de quem contém', async () => {
  const ctx = await logado();
  const a = await abrir(ctx, '/operacao/#operacao');
  await esperarServidor(a);
  const r = await a.evaluate(() => ({ n: CIDADES.length, flor: sugestoesDestino('flor'), oeste: sugestoesDestino('oeste'), conc: sugestoesDestino('concordia'), um: sugestoesDestino('c') }));
  assert.strictEqual(r.n, 1191);
  assert.ok(r.flor.length > 0 && r.flor.length <= 8 && r.flor.every(x => /^Flor/.test(x)));
  assert.ok(r.oeste.includes('São Miguel do Oeste - SC'));
  assert.ok(r.conc.includes('Concórdia - SC'));
  assert.deepStrictEqual(r.um, []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --test-name-pattern="Destino" painel/testes/telas.test.js` (com `PW_CANAL=chrome` e `NODE_PATH` da pasta do Playwright)
Expected: FAIL nos dois (`#sug-destino` não existe; `CIDADES is not defined`).

- [ ] **Step 3: Implementar em `munck/munck.html`**
- Gerar `CIDADES` a partir do `mapa-sul.json` do histórico (nome + `" - "` + UF, na ordem do arquivo) e embutir como uma string separada por `|` que vira array no carregamento, com o comentário da fonte.
- `sugestoesDestino(texto)`: menos de 2 letras → `[]`; usados (destinoA/B de km e agenda, sem repetir) que contêm o texto, depois cidades que começam, depois cidades que contêm; sem repetir; corta em 8.
- Um `<ul id="sug-destino" role="listbox" hidden>` posicionado embaixo do campo focado, com a largura do campo; itens com `textContent`.
- Os 4 campos ganham `data-sugere="destino"` e perdem `list="lista-destinos"`; apagar o `datalist` e o `preencherDatalist('lista-destinos', …)`.
- Abre/atualiza no evento `input` (só digitação); `keydown` ArrowDown/ArrowUp movem, Enter com item marcado escolhe e faz `preventDefault`, Escape fecha; `mousedown` no item escolhe; `focusout` fecha. Ao escolher: põe o valor, fecha e dispara `change` no campo.
- CSS da lista no estilo dos campos existentes.

- [ ] **Step 4: Rodar e ver passar; depois tudo**

Run: `node --test --test-name-pattern="Destino" painel/testes/telas.test.js`, depois `node --test painel/testes/servidor.test.js` e `node --test painel/testes/telas.test.js`
Expected: os 2 novos PASS; servidor 34/34; telas 23/23.

- [ ] **Step 5: README e commit**

`munck/README.md`: na descrição de Agenda/Operação, dizer que Destino A e B sugerem as cidades de PR, SC e RS e os destinos já usados.

```bash
git add munck/munck.html munck/README.md painel/testes/telas.test.js docs/superpowers/plans/2026-11-28-destino-cidade.md docs/superpowers/specs/2026-11-28-destino-cidade-design.md
git commit -m "Controle: Destino A e B sugerem cidades do Sul e destinos já usados"
```

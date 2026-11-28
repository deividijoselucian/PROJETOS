# Controle de Operação: Operação, Agenda de operação e Documento — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar obras/mapa por Operação (cliente, destinos, valor, pago, horímetro), Agenda de operação e Documento por caminhão no Controle de Operação, e pôr o cartão Monitoramento de Frota no Painel Deconto.

**Architecture:** Tudo do Controle está num arquivo só, `munck/munck.html` (vira `publico/operacao.html`). A coleção `km` vira a Operação (campos novos, registros antigos continuam valendo); `agenda` troca obra/etapa por cliente e destinos; coleção nova `documentos`. O servidor só muda a lista de sistemas (`painel/servidor/sistemas.js`) e o pacote.

**Tech Stack:** HTML/JS puro (sem dependências), Node 18+ no servidor, `node --test`, Playwright para os testes de tela.

**Spec:** `docs/superpowers/specs/2026-11-27-controle-operacao-design.md`

## Global Constraints

- Nada de dado antigo é apagado nem convertido: `obras`, `km` com `obraId/etapa/dataFim/modo/horas` e `agenda` com `obraId` continuam lidos e mostrados.
- Coleções, iguais em `COLS` (munck.html) e `cols` (sistemas.js): `['caminhoes', 'motoristas', 'obras', 'agenda', 'km', 'manutencoes', 'documentos', 'config']`.
- `munck.html` continua um arquivo só, sem biblioteca nem internet; funciona aberto direto, pelo link do claude.ai e pelo servidor. `CHAVE_LOCAL` não muda.
- Textos na tela em português simples, no estilo do sistema. Abas, na ordem: Painel, Agenda, Operação, Documento, Manutenção, Relatório, Caminhões e motoristas.
- Exibição do serviço em todo lugar que hoje mostra obra: `cliente · destino A → destino B` (só as partes preenchidas); sem cliente, o nome da obra antiga.
- Sem dependência nova no repositório. Playwright só numa pasta de rascunho para rodar os testes.
- Push dispara o workflow que troca o pacote da produção: só na Task 7, com o ok do dono.

## Review Focus

1. Valor escrito "1.500,00", "1500" ou "1500,5" vira número; "abc" mostra erro no campo e não salva.
2. Registro antigo (com `obraId`, `horas`, `etapa`) aparece na Operação, no Painel e no Relatório com o nome da obra no lugar do cliente e as horas somadas.
3. Caminhão sem "Munck" no cadastro: os campos de horímetro somem e não são gravados; trocar o caminhão no formulário mostra/esconde na hora.
4. Editar uma operação mantém valor e pago; marcar como pago tira o valor do "A receber".
5. Documento de caminhão "Fora da frota": não aparece na tabela nem gera aviso; caminhão ativo sem documento aparece com "Preencher".

---

### Task 0: Rodar os testes aqui

**Files:**
- Modify: `painel/testes/telas.test.js:61`

- [ ] **Step 1:** Instalar Playwright fora do repositório: `npm i --prefix <scratchpad>/pw playwright` (sem baixar navegador; usa o Chrome instalado).
- [ ] **Step 2:** Em `telas.test.js:61`, trocar `chromium.launch()` por `chromium.launch(process.env.PW_CANAL ? { channel: process.env.PW_CANAL } : {})`.
- [ ] **Step 3:** Rodar a base e anotar o resultado (tem que passar antes de mexer):
  `node --test painel/testes/servidor.test.js` e
  `NODE_PATH=<scratchpad>/pw/node_modules PW_CANAL=chrome node --test painel/testes/telas.test.js`
- [ ] **Step 4:** Commit `Testes de tela: escolher o navegador pelo PW_CANAL`.

### Task 1: Servidor, pacote e cartão Monitoramento de Frota

**Files:**
- Modify: `painel/servidor/sistemas.js`, `painel/servidor/montar-pacote.sh`, `.github/workflows/painel-deconto.yml`
- Delete: `munck/mapa-sul.json`, `munck/mapa/`
- Test: `painel/testes/servidor.test.js` (linhas 25, 106-112, 134, 150-155, 166), `painel/testes/telas.test.js:29`

**Interfaces:**
- Produces: sistema `operacao` com `extras: []` e `cols` da Global Constraints; sistema `{ id: 'monitoramento', numero: 6, nome: 'Monitoramento de Frota', pronto: false, descricao: 'Em desenvolvimento.', cor: '#0E7490', cols: [] }`.

- [ ] **Step 1: Testes que falham** em `servidor.test.js`:
  - na tela inicial logada: `assert.match(html, /Monitoramento de Frota/)` e o cartão sem link (`!/href="\/monitoramento\/"/.test(html)`);
  - `/operacao/mapa-sul.json` logado responde 404;
  - `PUT /operacao/api/dados/documentos/d1` com `{ caminhaoId: 'c1' }` responde 200; a recusa de coleção que a operação não tem passa a usar `abastecimentos` (400).
  - Tirar o fixture `mapa-sul.json` (linha 25) e o teste "mapa sai para quem entrou"; no teste "sem login…", tirar a linha do mapa.
- [ ] **Step 2:** `node --test painel/testes/servidor.test.js` → FAIL nesses asserts.
- [ ] **Step 3:** `sistemas.js`: operação com `descricao: 'Caminhões munck: agenda de operação, operações, documentos, manutenção e relatório.'`, `extras: []`, `cols` novos; cartão `monitoramento` no fim. `montar-pacote.sh` e workflow sem `mapa-sul.json`. Apagar `munck/mapa-sul.json` e `munck/mapa/`. Em `telas.test.js:29`, tirar a cópia do mapa.
- [ ] **Step 4:** `node --test painel/testes/servidor.test.js` → PASS. `bash painel/servidor/montar-pacote.sh <scratchpad>/dist` → "Pronto", e `tar -tzf` sem `mapa-sul.json`.
- [ ] **Step 5:** Commit `Painel: cartão Monitoramento de Frota; Controle sem mapa e com documentos`.

### Task 2: Tirar as abas Mapa e Obras

**Files:**
- Modify: `munck/munck.html` (abas 372-379, vistas `v-obras` e `v-mapa`, CSS do mapa e `.obras`, `ABAS`, `FORM_DA_COL`, `VISTA_DO_FORM`, `render()`, `UI.obraSel`, funções `carregarMapa` até `renderListaMapa`, `statsObra`, `renderObras`, `renderObraDet`, `planilhaObra`, ações do mapa e `ver-obra` em `ligarEventos`, `lista-cidades`)
- Test: `painel/testes/telas.test.js` (teste "Controle de Operação…", linhas 284-342)

**Interfaces:**
- Produces: `obra(id)` e `nomeObra(id)` continuam (só leitura, para registros antigos). `D.obras` continua carregada.

- [ ] **Step 1: Teste que falha:** no teste do Controle, trocar o bloco "mapa" por
  `assert.strictEqual(await a.locator('.aba[data-aba="mapa"], .aba[data-aba="obras"]').count(), 0);`
  e manter a carga da cópia antiga com `obras` (prova que dado antigo entra e fica no servidor).
- [ ] **Step 2:** Rodar só esse teste (`--test-name-pattern "Controle de Operação"`) → FAIL (abas ainda existem).
- [ ] **Step 3:** Tirar HTML, CSS, JS e eventos listados em Files. Nenhuma referência a `Mapa.`, `renderObras`, `renderMapa`, `statsObra`, `planilhaObra`, `obraSel` pode sobrar (`grep`).
- [ ] **Step 4:** Teste → PASS, sem `errosDePagina`.
- [ ] **Step 5:** Commit `Controle: saem as abas Mapa e Obras`.

### Task 3: Aba Operação e Agenda de operação

**Files:**
- Modify: `munck/munck.html` (aba `km` → `data-aba="operacao"`, `#operacao`, título "Operação"; formulários `f-km` e `f-ag`; `ABAS`, `VISTA_DO_FORM`; `htmlLista`, `rotuloDoValor`, `atualizarDatalists`; `calcKm`, `sugerirKm`, `renderListaKm`, `calcAg`, `sugerirAg`, `renderQuadro`, `renderListaAgenda`, `ondeEsta`/`cartaoMunck`, `calcAlertas`, `salvarForm` (ramo agenda/km), `ligarEventos`)
- Test: `painel/testes/telas.test.js` (teste do Controle + 2 testes novos)

**Interfaces:**
- Produces (usadas nas Tasks 4 e 5):
  - `descServ(x) -> string`: `[cliente, rota]` juntos por " · ", rota = `destinoA → destinoB` (ou só o que houver); sem cliente e com `obraId`, `nomeObra(x.obraId)`.
  - `horasDe(r) -> number`: `horimetroFinal - horimetroInicial` (mín. 0) quando os dois existem; senão `r.horas || 0`.
  - `temMunck(camId) -> boolean`: `!!(cam(camId) && String(cam(camId).munck || '').trim())`.
  - `ultimoHor(camId, dia, exceto) -> number|null`: maior `horimetroFinal` do caminhão até o dia.
  - Registro `km`: `{ data, caminhaoId, motoristaId, cliente, destinoA, destinoB, valor: number|null, pago: boolean, kmInicial, kmFinal, horimetroInicial: number|null, horimetroFinal: number|null, obs }`.
  - Registro `agenda`: `{ data, dataFim, hora, caminhaoId, motoristaId, cliente, destinoA, destinoB, servico, situacao, obs }`.
  - Datalists `lista-clientes` (clientes de km, agenda e `obras.cliente`) e `lista-destinos` (destinos A e B já usados). Selects `filtro-clientes` (`#fk-cliente`, `#fa-cliente`) e `#fk-pago` (`todos` / `pago` / `receber`).

- [ ] **Step 1: Testes que falham** (`telas.test.js`):
  - Teste do Controle (agenda pelo quadro): em vez de `#ag-obra`, preencher `#ag-cliente` "Cliente X", `#ag-dest-a` "Chapecó", `#ag-dest-b` "Xanxerê"; o outro navegador espera `#quadro` conter "Cliente X"; no servidor, `x.cliente === 'Cliente X' && x.destinoA === 'Chapecó'`.
  - `teste('Operação: lança com cliente, destinos, valor e pago; horímetro só no munck')`: grava caminhão `cam-mk` (com `munck: 'Madal MD 45.000'`) e `cam-sem` (sem munck); abre `/operacao/#operacao`; escolhe `cam-sem` → `#km-hor-ini` invisível; escolhe `cam-mk` → visível; preenche data hoje, cliente "Cliente Y", destinos, valor "1.500,00", pago "Não", km 1000→1080, horímetro 100→106,5; salva; no servidor: `valor === 1500`, `pago === false`, `horimetroFinal === 106.5`; `#km-resumo` contém "R$ 1.500,00 a receber"; editar e marcar pago "Sim" → "a receber" some do resumo. Valor "abc" → `#km-valor[aria-invalid="true"]` e nada novo no servidor.
  - `teste('Agenda de operação preenche a Operação do dia e vira Feito')`: grava agendamento hoje para `cam-mk` com cliente/destinos/motorista; na Operação, escolher `cam-mk` e a data → `#km-cliente`, `#km-dest-a`, `#km-mot` preenchidos; salvar → agendamento com `situacao === 'feito'`.
  - Registro antigo: grava `obras` `ob-velha` "Obra Velha" e `km` com `obraId: 'ob-velha', horas: 3`; a lista da Operação mostra "Obra Velha" e "3 h".
- [ ] **Step 2:** Rodar esses testes → FAIL.
- [ ] **Step 3:** Implementar em `munck.html`:
  - Formulário Operação: data, caminhão, motorista, cliente (`#km-cliente`, `list="lista-clientes"`), destino A/B (`#km-dest-a`, `#km-dest-b`, `list="lista-destinos"`), valor (`#km-valor`, `data-tipo="dec"`), pago (`#km-pago`, select Não/Sim), km inicial/final, horímetro inicial/final (`#km-hor-ini`, `#km-hor-fin`, dentro de `#km-hor-box`, escondido quando `!temMunck`), observação. Sai "por dia / por etapa", obra, obra nova e etapa.
  - Agenda: `#ag-cliente`, `#ag-dest-a`, `#ag-dest-b` no lugar de obra, obra nova e etapa.
  - `salvarForm` (agenda e km): exige caminhão e cliente ("Escreva o cliente."); valor `NaN` ou < 0 → "O valor tem que ser só números, como 1.500,00."; horímetro final < inicial → erro; sem munck, apaga os dois horímetros; `pago` vira boolean. "Feito": agendamentos do mesmo caminhão que cobrem a data, válidos e não feitos. Avisos com `descServ`.
  - `sugerirKm`: motorista, cliente e destinos do agendamento do dia; km inicial como hoje; horímetro inicial de `ultimoHor`.
  - Lista: colunas Data, Caminhão, Motorista, Cliente e destinos, Rodou, Horas (`horasDe`), Valor, Pago (pill "Pago"/"A receber"), ações; resumo `N operações, X km, Y h, R$ total (R$ Z a receber)`; filtros caminhão, cliente, mês, pago.
  - Trocar `nomeObra(a.obraId)` por `descServ(a)` em `calcAlertas`, `cartaoMunck`, `renderQuadro`, `renderListaAgenda`, `calcKm`, extrato do relatório. Aviso "Falta o km" vira "Falta lançar a operação de …" e o botão "Lançar operação".
- [ ] **Step 4:** Testes do Controle → PASS, sem `errosDePagina`.
- [ ] **Step 5:** Commit `Controle: aba Operação e agenda de operação`.

### Task 4: Aba Documento e avisos de vencimento

**Files:**
- Modify: `munck/munck.html` (aba e vista `documento`, formulário `f-doc` `data-col="documentos"`, `COLS`, `ABAS`, `FORM_DA_COL`, `VISTA_DO_FORM`, `render()`, `salvarForm`, `calcAlertas`, `planilhaTudo`, `ligarEventos`)
- Test: `painel/testes/telas.test.js` (teste novo)

**Interfaces:**
- Consumes: `validade(data, nome)` (pill de vencimento, já existe), `camAtivos()`.
- Produces: registro `documentos`: `{ caminhaoId, numero, temSeguro: boolean, vencDocumento, vencSeguro, obs }`; `docDe(camId) -> registro|undefined`; `renderDocumentos()`.

- [ ] **Step 1: Teste que falha** `teste('Documento: um por caminhão, seguro só com sim, vencido avisa no Painel')`: grava `cam-doc` ativo e `cam-fora` com `situacao: 'fora'`; abre `#documento`; tabela `#t-doc` tem "Preencher" para `cam-doc` e não tem a placa de `cam-fora`; preenche número "123456", tem seguro "Não" → `#doc-venc-seg` escondido; vencimento do documento ontem; salva; tentar novo para o mesmo caminhão → `.f-msg` "Esse caminhão já tem documento"; Painel `#painel-alertas` contém "documento" e a placa; no servidor um só registro com `temSeguro === false` e `vencSeguro === ''`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar: tabela por caminhão ativo (mais os que já têm documento e não estão "fora"), colunas Caminhão, Número, Seguro (Sim/Não), Venc. documento (`validade`), Venc. seguro (`validade` ou "—"), ação Preencher/Editar (abre `f-doc` com o caminhão). `salvarForm` ramo `documentos`: exige caminhão; bloqueia segundo registro do mesmo caminhão; `temSeguro` boolean; sem seguro, `vencSeguro = ''`. `calcAlertas`: para caminhão não "fora", documento e seguro vencidos (`grave`) ou em até 30 dias (`breve`), botão "Atualizar" (`editar`, `documentos:<id>`). Excel: aba "Documentos" em `planilhaTudo`.
- [ ] **Step 4:** Teste → PASS.
- [ ] **Step 5:** Commit `Controle: aba Documento com avisos de vencimento`.

### Task 5: Painel, Relatório e Excel

**Files:**
- Modify: `munck/munck.html` (`renderPainel`, `dadosRel`, `porCaminhaoRel`, `porObraRel` → `porClienteRel`, `baldesKm`, `renderRelatorio`, `planilhaTudo`, `planilhaRel`)
- Test: `painel/testes/telas.test.js` (teste novo)

**Interfaces:**
- Consumes: `descServ`, `horasDe` (Task 3).
- Produces: `porClienteRel(R) -> [{ nome, km, horas, n, valor, receber }]` ordenado por valor, depois km.

- [ ] **Step 1: Teste que falha** `teste('Relatório: faturado, a receber e por cliente; Excel com Operações e Documentos')`: grava 2 operações no mês (Cliente A R$ 1.000 pago; Cliente B R$ 500 não pago); Painel `#painel-kpis` contém "A receber" e "R$ 500,00"; Relatório `#rel-conteudo` contém "Faturado", "R$ 1.500,00" e `#t-rel-cli` com "Cliente A" e "Cliente B"; `await a.evaluate(() => planilhaTudo().map(x => x.nome))` contém "Operações" e "Documentos" e não contém "Obras".
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar: KPI "Obras em andamento" → "A receber" (soma de `valor` com `pago !== true`, sub "de R$ X no mês"). Relatório: números ganham Faturado e A receber; horas por `horasDe`; tabela e gráfico "Por obra" → "Por cliente" (`#t-rel-cli`, colunas Cliente, Operações, Km, Horas, Valor, A receber). Excel tudo: Caminhões, Motoristas, Operações (data, placa, motorista, cliente, destino A, destino B, km inicial, km final, km, horímetro inicial, final, horas, valor, pago, obs), Agenda (com cliente e destinos), Manutenções, Documentos. Excel do relatório: "Por obra" → "Por cliente".
- [ ] **Step 4:** Teste → PASS.
- [ ] **Step 5:** Commit `Controle: relatório por cliente com faturado e a receber`.

### Task 6: Tudo verde e documentação

**Files:**
- Modify: `munck/README.md`, `painel/README.md`, `painel/servidor/LEIA-ME.md` (onde citam obras, mapa ou km das obras)

- [ ] **Step 1:** `node --test painel/testes/servidor.test.js` e a suíte de tela inteira → PASS, sem erros de página.
- [ ] **Step 2:** Abrir o Controle no Chrome com o servidor local e conferir as 7 abas, uma operação, a agenda e um documento.
- [ ] **Step 3:** README e LEIA-ME descrevem as abas novas; sem menção a mapa e obras como abas.
- [ ] **Step 4:** Commit `Controle: README com Operação, Agenda de operação e Documento`.

### Task 7: Publicar e atualizar a VM (com ok do dono)

- [ ] **Step 1:** Pedir ok para o push (troca o pacote da produção).
- [ ] **Step 2:** `git push -u origin claude/operacao-documento`; esperar o workflow "Painel Deconto (pacote do servidor)" ficar verde (`gh run watch`).
- [ ] **Step 3:** O dono roda no console da VM o mesmo comando de instalação (atualiza e mantém dados e senha).
- [ ] **Step 4:** Conferir `https://painel.191-252-231-120.sslip.io` (tela de entrar) e, com o dono logado, o Controle com as abas novas e o cartão Monitoramento de Frota.

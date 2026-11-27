# Painel Deconto — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um servidor só, na VM sistemadeconto, com login único, a tela inicial do Painel Deconto com os sistemas em cartões, o DECONT (com fotos e PDFs) e o Controle de Operação, instalado com um comando.

**Architecture:** Programa Node sem pacotes (`painel/servidor/`), derivado de `munck/servidor/servidor.js` (já testado): lista de sistemas, usuários com os sistemas de cada um, dados de cada sistema num arquivo próprio, avisos ao vivo por Server-Sent Events e arquivos do DECONT em disco. Cada sistema continua sendo a sua página única (`sistema-carlise/frota.html` e `munck/munck.html`), que ganha o modo "painel" quando a página traz `window.PAINEL`.

**Tech Stack:** Node.js ≥ 18 (http, fs, crypto, node:test), HTML/JS das páginas existentes, Playwright (só nos testes de tela, já instalado nesta máquina), bash, PM2, nginx, certbot, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-27-painel-deconto-design.md`

## Global Constraints

- Node.js 18 ou mais novo; nenhum pacote do npm no servidor.
- Telas, mensagens e textos em português.
- Nada de dados reais, senhas ou chaves no repositório PROJETOS (é público) nem no pacote.
- Pasta `/opt/painel-deconto`, processo PM2 `painel-deconto`, site nginx `painel-deconto`, endereço `painel.<ip-com-traços>.sslip.io`, porta 3200 ou a próxima livre até 3299, `HOST=127.0.0.1`.
- Sistemas: `frota` = "DECONT" em `/frota/`; `operacao` = "Controle de Operação" em `/operacao/`.
- Arquivos do DECONT: JPG, PNG, WebP, GIF ou PDF, até 15 MB (os mesmos de `TIPOS_ARQ` e `LIMITE_ARQ` em `frota.html`).
- Uma cópia por dia de cada sistema em `data/copias/`, guardando as últimas 30.
- O link do DECONT no claude.ai, o DECONT.exe e o link do Controle continuam funcionando: os modos "nuvem" e "local" das páginas não mudam.
- Cópias antigas do "Controle Munck" (`app: 'controle-munck'`) continuam carregando no Controle de Operação.

## Review Focus

- Pessoa sem o sistema liberado abrindo `/frota/` direto ou chamando `/frota/api/...`: volta para o painel (página) ou recebe 403 (API). Teste na Task 1.
- Arquivo que não é foto nem PDF, ou acima de 15 MB, ou com nome com acento e espaço: o primeiro e o segundo são recusados com mensagem clara; o terceiro grava e abre com o nome certo. Teste na Task 3.
- "Carregar uma cópia" com os 20 CRLVs (arquivo de 3 MB com os PDFs em base64): os 20 documentos ficam com o PDF abrindo; carregar a mesma cópia de novo não duplica documentos. Teste na Task 5.
- Dois navegadores no mesmo sistema e o servidor reiniciado no meio: os dois veem o que o outro lança, e o que foi salvo antes do reinício continua lá. Teste na Task 2.
- Administrador tira um sistema de uma pessoa que está com ele aberto, ou apaga a pessoa: a próxima gravação dela é recusada e ela volta para o painel ou para o login. Teste na Task 4.

---

### Task 1: Núcleo do servidor do painel (login, usuários e quem vê o quê)

**Files:**
- Create: `painel/servidor/servidor.js` (rotas e sessões; partir de `munck/servidor/servidor.js`)
- Create: `painel/servidor/sistemas.js`
- Create: `painel/servidor/paginas.js` (HTML do login e da tela inicial; nesta task só a lista de cartões)
- Create: `painel/testes/servidor.test.js` (node:test; sobe o servidor num processo filho com `PORTA=3399`, `PASTA_DADOS=<pasta temporária>`, `PAINEL_SENHA=senhaTeste1`, `PASTA_PUBLICO=<pasta com páginas de teste>`)

**Interfaces:**
- Produces: `sistemas.js` exporta `[{ id, nome, descricao, pagina, cols, arquivos, extras, cor }]`:
  - `{ id: 'frota', nome: 'DECONT', descricao: 'Frota: km do dia, abastecimento, manutenção, documentos e relatório', pagina: 'frota.html', cols: ['caminhoes','semirreboques','motoristas','dias','abastecimentos','manutencoes','trocas','documentos','config'], arquivos: true, extras: [], cor: '#1C47B5' }`
  - `{ id: 'operacao', nome: 'Controle de Operação', descricao: 'Caminhões munck: onde estão, agenda, km das obras, mapa, manutenção e relatório', pagina: 'operacao.html', cols: ['caminhoes','motoristas','obras','agenda','km','manutencoes','config'], arquivos: false, extras: ['mapa-sul.json'], cor: '#5B3FD6' }`
- Produces (rotas): `GET /entrar`; `POST /api/entrar {usuario, senha}`; `POST /api/sair`; `GET /api/eu → {usuario, nome, admin, sistemas: [id]}`; `GET /` (tela inicial); `GET /api/usuarios` (admin) `→ [{usuario, nome, admin, sistemas}]`; `POST /api/usuarios` (admin) `{usuario, nome, senha, admin, sistemas}`; `PUT /api/usuarios/:usuario` (admin) `{nome?, admin?, sistemas?, senha?}`; `DELETE /api/usuarios/:usuario` (admin); `POST /api/minha-senha {atual, nova}`; `GET /:sistema` → 301 `/:sistema/`; `GET /:sistema/` → página do sistema com `<script>window.PAINEL = {usuario, nome, admin, sistema, nomeSistema}</script>` no `<head>`; `GET /operacao/mapa-sul.json`.
- Regra de acesso: `podeUsar(u, sistemaId)` = `u.admin || u.sistemas.includes(sistemaId)`. Página sem acesso: 302 para `/`. API sem acesso: 403 `{erro: 'Você não tem acesso a este sistema.'}`. Sem login: página 302 `/entrar`, API 401.
- `usuarios.json`: `{usuario, nome, sal, hash, admin, sistemas, criadoEm}`; o `admin` criado na primeira vez tem `sistemas` = todos.

- [ ] **Step 1: Escrever os testes** em `painel/testes/servidor.test.js`: `sem login, / manda para /entrar`; `login errado dá 401 e certo dá cookie HttpOnly`; `admin vê os dois cartões em /`; `admin cria joao só com operacao`; `joao em /frota/ volta para /`; `joao em /frota/api/dados recebe 403`; `joao abre /operacao/ e a página traz window.PAINEL com sistema 'operacao'`; `login só aceita JSON (415)`; `oito senhas erradas bloqueiam (429)`.
- [ ] **Step 2: Rodar e ver falhar:** `node --test painel/testes/servidor.test.js` → falha (servidor não existe).
- [ ] **Step 3: Implementar** `sistemas.js`, `paginas.js` (login no visual do Controle; tela inicial com cartões coloridos pela `cor` de cada sistema, só os liberados, "Sair" e o nome de quem entrou) e `servidor.js` (reaproveita do servidor do Controle: `.env`, scrypt, sessões em `sessoes.json` com hash do token, cookie `painel`, limite de tentativas usando `X-Real-IP`, cabeçalhos de segurança). As variáveis `PASTA_DADOS` e `PASTA_PUBLICO` trocam as pastas padrão `data/` e `publico/`.
- [ ] **Step 4: Rodar e ver passar:** `node --test painel/testes/servidor.test.js` → todos `ok`.
- [ ] **Step 5: Commit** `Painel Deconto: login único e quem vê cada sistema`.

### Task 2: Dados de cada sistema e avisos ao vivo

**Files:**
- Create: `painel/servidor/banco.js`
- Modify: `painel/servidor/servidor.js` (rotas de dados)
- Test: `painel/testes/servidor.test.js`

**Interfaces:**
- Consumes: `sistemas.js` (Task 1).
- Produces: `criarBanco(pastaDados, sistema) → { todos() → {col: [obj]}, aplicar(op) → op|null, salvar(), gravarAgora() }`, com o arquivo `data/<id>.json` e a cópia do dia `data/copias/<id>-AAAA-MM-DD.json` (30 guardadas). `op` = `{tipo: 'set', col, obj}` ou `{tipo: 'del', col, id}`; coleção fora de `sistema.cols` ou id fora de `/^[A-Za-z0-9_.~:@+-]{1,120}$/` → `null`.
- Produces (rotas, todas checando `podeUsar`): `GET /:sistema/api/dados → {col: [obj]}`; `PUT /:sistema/api/dados/:col/:id` (corpo = objeto); `DELETE /:sistema/api/dados/:col/:id`; `POST /:sistema/api/lote {ops: [op]}` (até 20.000 ops, corpo até 20 MB); `GET /:sistema/api/eventos` (SSE; mensagens `{tipo:'set'|'del', col, ...}` ou `{tipo:'lote', ops}`, só para quem está no mesmo sistema; `X-Accel-Buffering: no`).

- [ ] **Step 1: Escrever os testes:** `gravar em frota não aparece em operacao`; `coleção que não é do sistema dá 400`; `evento chega para outro ouvinte do mesmo sistema e não para o de outro sistema`; `lote grava tudo ou nada (um item inválido → 400 e nada gravado)`; `depois de reiniciar o processo (SIGTERM e subir de novo) os dados continuam`; `existe data/copias/frota-<hoje>.json`.
- [ ] **Step 2: Rodar e ver falhar:** `node --test painel/testes/servidor.test.js`.
- [ ] **Step 3: Implementar** `banco.js` (gravação atômica `.tmp` + rename, 250 ms de espera, grava na hora no SIGTERM) e as rotas; o lote valida tudo antes de aplicar.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** `Painel Deconto: dados de cada sistema e avisos ao vivo`.

### Task 3: Arquivos do DECONT no servidor

**Files:**
- Modify: `painel/servidor/banco.js` (guarda de arquivos)
- Modify: `painel/servidor/servidor.js` (rotas de arquivos, só nos sistemas com `arquivos: true`)
- Test: `painel/testes/servidor.test.js`

**Interfaces:**
- Produces: `criarArquivos(pastaDados, sistemaId) → { guardar(buffer, {nome, tipo}) → {id, nome, tipo, tamanho, onde: 'servidor'}, abrir(id) → {caminho, tipo, nome}|null, apagar(id) }`, gravando em `data/arquivos/<sistema>/<id>` com um `<id>.json` ao lado (nome e tipo).
- Produces (rotas): `POST /:sistema/api/arquivos` (corpo cru; `Content-Type` = tipo do arquivo; `X-Nome-Arquivo` = nome com `encodeURIComponent`) → meta acima; `GET /:sistema/api/arquivos/:id` → o arquivo com o `Content-Type` guardado, `Content-Disposition: inline; filename*=UTF-8''<nome>` e `X-Content-Type-Options: nosniff`; `DELETE /:sistema/api/arquivos/:id`.
- Recusas: tipo fora da lista → 415 `{erro: 'Esse tipo de arquivo não dá. Use foto (JPG ou PNG) ou PDF.'}`; acima de 15 MB → 413 `{erro: 'O arquivo passa de 15 MB.'}`; sistema sem arquivos → 404.

- [ ] **Step 1: Escrever os testes:** `PDF com nome "CRLV São José.pdf" grava e volta igual (mesmos bytes e nome)`; `SVG ou HTML dá 415`; `16 MB dá 413`; `operacao não aceita arquivos (404)`; `quem não tem frota não baixa arquivo (403)`; `apagar tira o arquivo`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** O id é `arq-` + 16 bytes aleatórios em hex; o `id` da URL é conferido com `/^arq-[0-9a-f]{32}$/` antes de virar caminho.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** `Painel Deconto: fotos e PDFs do DECONT no servidor`.

### Task 4: Tela inicial e acessos

**Files:**
- Modify: `painel/servidor/paginas.js` (tela inicial completa)
- Create: `painel/testes/telas.test.js` (Playwright; mesmo jeito de subir o servidor da Task 1)

**Interfaces:**
- Consumes: rotas de usuários da Task 1.
- Produces: na tela inicial, para o administrador, a área **Acessos**: lista (usuário, nome, sistemas, administrador), formulário "Criar acesso" (usuário, nome, senha, uma caixa por sistema, administrador sim/não), "Mudar sistemas" por pessoa e "Tirar o acesso" com confirmação. Para todos: "Trocar a minha senha" e "Sair".

- [ ] **Step 1: Escrever os testes de tela:** `admin cria maria só com frota e ela vê só o cartão DECONT`; `admin tira frota da maria com a página do DECONT aberta e a próxima gravação dela volta para o painel`; `maria troca a senha e a antiga não entra`; `admin apaga maria e ela volta para /entrar`; `no celular (390 px) a tela inicial não rola para o lado`.
- [ ] **Step 2: Rodar e ver falhar:** `node --test painel/testes/telas.test.js`.
- [ ] **Step 3: Implementar** a tela no mesmo visual (barra escura, Barlow, cartões com a cor do sistema), tema claro e escuro.
- [ ] **Step 4: Rodar e ver passar** e olhar uma captura de tela (claro, escuro e celular).
- [ ] **Step 5: Commit** `Painel Deconto: tela inicial e acessos`.

### Task 5: DECONT no modo painel

**Files:**
- Modify: `sistema-carlise/frota.html` (armazenamento, `Arquivos`, cabeçalho, cópia)
- Test: `painel/testes/telas.test.js`

**Interfaces:**
- Consumes: rotas de dados (Task 2) e de arquivos (Task 3); `window.PAINEL` (Task 1).
- Produces: com `window.PAINEL`, `Armazem.modo = 'servidor'`: `gravar`, `apagar`, `gravarVarios` pela API (caminhos relativos `api/...`), atualização ao vivo por `EventSource('api/eventos')` com nova leitura de tudo ao reconectar; `Arquivos.guardar/ler/apagar` com `onde: 'servidor'`; no cabeçalho "← Painel Deconto" (link `/`), nome de quem entrou e "Sair"; estado "Salvo no servidor"; 401 leva a `/entrar` e 403 a `/`. "Salvar cópia de tudo" leva os arquivos também no modo servidor; "Carregar uma cópia" sobe para o servidor todo arquivo que vier embutido (`onde` diferente de `'nuvem'`) e aproveita o arquivo que o documento já tem quando nome e tamanho batem.

- [ ] **Step 1: Escrever os testes de tela:** `admin abre DECONT pelo cartão e vê "Salvo no servidor"`; `cadastra caminhão e o outro navegador vê na hora`; `anexa um PDF num documento e abre o PDF`; `carregar a cópia de teste com 20 documentos e 20 PDFs deixa 20 documentos com arquivo; carregar de novo continua com 20`; `"← Painel Deconto" volta para a tela inicial`. A cópia de teste é gerada no próprio teste com dados inventados (placas `TST1A00`…`TST1A19` e um PDF mínimo).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** em `frota.html`, sem mudar os modos "nuvem" e "local".
- [ ] **Step 4: Rodar e ver passar.** Rodar também os testes antigos do DECONT (modos nuvem e local): `teste2.js`, `teste4.js`, `teste5.js`, `teste7.js`, `teste9.js`, `teste10.js`, `teste11.js` e `teste12.js` em `/tmp/claude-0/-home-user-PROJETOS/6b592832-8003-51fe-b585-162759b747ad/scratchpad/` → sem FALHA e `ERROS: nenhum`.
- [ ] **Step 5: Commit** `DECONT: modo painel (dados e arquivos no servidor)`.

### Task 6: Controle de Operação (nome novo e modo painel)

**Files:**
- Modify: `munck/munck.html`
- Test: `painel/testes/telas.test.js`

**Interfaces:**
- Consumes: `window.PAINEL` (Task 1), rotas de dados (Task 2).
- Produces: nome "Controle de Operação" no `<title>`, no cabeçalho, em `NOME_APP`, nas planilhas (`controle-operacao-AAAA-MM-DD.xlsx`) e na cópia (`app: 'controle-operacao'`, aceitando também `'controle-munck'`). O modo servidor passa a ler `window.PAINEL` (e ainda `window.MUNCK_SERVIDOR`); o bloco "Acesso ao sistema" sai (foi para a tela inicial); cabeçalho com "← Painel Deconto"; 401 → `/entrar`, 403 → `/`. A chave `controle-munck:dados:v1` do modo local fica como está.

- [ ] **Step 1: Escrever os testes de tela:** `abre pelo cartão com o nome Controle de Operação`; `agenda pelo quadro e o outro navegador vê`; `o mapa abre (mapa-sul.json)`; `carrega uma cópia antiga com app 'controle-munck'`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar**, mais os testes antigos `teste-munck.js` e `teste-munck2.js` do scratchpad → sem FALHA.
- [ ] **Step 5: Commit** `Controle de Operação: nome novo e modo painel`; republicar o link do claude.ai do Controle (`https://claude.ai/artifact/LhkeoVe4md4yG9wGbMALud`) com o arquivo novo e o `mapa-sul.json`.

### Task 7: Pacote, instalador e download

**Files:**
- Create: `painel/servidor/instalar-no-servidor.sh` (a partir de `munck/servidor/instalar-no-servidor.sh`, com os nomes do Global Constraints)
- Create: `painel/servidor/montar-pacote.sh` (pasta `painel-deconto/` com `servidor.js`, `sistemas.js`, `banco.js`, `paginas.js`, `instalar-no-servidor.sh`, `.env.example`, `LEIA-ME.md` e `publico/frota.html` ← `sistema-carlise/frota.html`, `publico/operacao.html` ← `munck/munck.html`, `publico/mapa-sul.json` ← `munck/mapa-sul.json`)
- Create: `painel/servidor/LEIA-ME.md`, `painel/servidor/.env.example`, `painel/servidor/.gitignore`, `painel/README.md`
- Create: `.github/workflows/painel-deconto.yml` (confere `node --check`, `bash -n`, roda `node --test painel/testes/servidor.test.js`, monta e publica `painel-deconto-servidor.tar.gz` no pré-lançamento `painel-deconto`)
- Delete: `munck/servidor/` e `.github/workflows/controle-munck.yml`; ajustar `munck/README.md` para apontar o painel.

- [ ] **Step 1: Montar o pacote** `bash painel/servidor/montar-pacote.sh <scratchpad>/pacote-painel` e listar: os 10 arquivos acima, nenhum `data/`, `.env` ou `.json` de dados.
- [ ] **Step 2: Subir o pacote extraído** com `node servidor.js` (porta de teste) e rodar `node --test painel/testes/telas.test.js` contra ele → passa.
- [ ] **Step 3: Conferir o instalador:** `bash -n` sem erro; reler os passos (VM nova, reinstalação, porta ocupada, sem certbot).
- [ ] **Step 4: Commit e push;** conferir no GitHub que o workflow passou e que o pré-lançamento `painel-deconto` tem `painel-deconto-servidor.tar.gz`; baixar pela URL pública e listar o conteúdo.

### Depois do plano (com o usuário)

- Abrir 22, 80 e 443 da VM sistemadeconto no painel da Locaweb (ele, ou eu pelo computador dele conectado).
- Rodar o comando de instalação **só depois do "pode subir" dele**, com `run_in_background`, um de cada vez.
- No painel instalado: trocar a senha do admin; no DECONT, "Carregar uma cópia" com `frota-carlise-20-veiculos.json`; conferir 18 caminhões, 2 semirreboques e 20 CRLVs com o PDF abrindo.

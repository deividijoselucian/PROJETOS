# Backup de cada sistema e backup geral — design curto

**Data:** 2026-11-28 · **Pedido do dono:** "preciso que cada sistema tenha uma opção de baixar
backup do mesmo" e "quero um do sistema geral".

## O que já existe
- DECONTO e Controle de Operação: botão "Salvar cópia de tudo (.json)" (feito no navegador, com os
  arquivos embutidos) e "Carregar uma cópia".
- O servidor guarda uma cópia automática por dia em `data/copias`.
- RH e Estoque (este em construção) não têm botão.

## O que faz
1. **Cada sistema** tem o botão **"Baixar backup"**, que baixa um `.json` com **todos os dados do
   sistema e os arquivos dele embutidos** (PDFs do DECONTO, fotos do ponto do RH), no **mesmo formato**
   do "Salvar cópia de tudo" (`app`, `versao`, `salvoEm`, `dados`, `arquivos`), para dar para
   carregar de volta pelo "Carregar uma cópia" onde existir.
   - Nome do arquivo: `backup-<sistema>-AAAA-MM-DD.json`.
2. **Painel Deconto (só admin): "Baixar backup geral"** → um `.zip` com o backup de cada sistema
   pronto (`frota.json`, `operacao.json`, `rh.json`, `estoque.json`…, cada um no formato acima) e um
   `LEIA-ME.txt` (data, sistemas, quantos registros e arquivos em cada).
   - Nome: `backup-geral-painel-deconto-AAAA-MM-DD.zip`.

## Como (decisões minhas)
- O backup é **gerado no servidor**: rota `GET /<sistema>/api/backup` (cada sistema; qualquer usuário
  logado que abre o sistema) e `GET /api/backup-geral` (só admin). Assim vale para todo sistema da
  lista `sistemas.js`, inclusive os que vierem depois (Estoque), sem código novo por sistema.
- As páginas só ganham o botão (link de download). No DECONTO e no Controle, o "Salvar cópia de tudo"
  continua (serve também sem servidor); no modo servidor ele pode usar a rota nova.
- `.zip` montado no próprio Node (zlib), sem dependência nova; abre direto no Windows.
- Coleções que só o servidor grava (ex.: `pontos`, `links`/senhas do RH) entram no backup, mas
  **senhas nunca** (nem o hash): o backup não pode virar um jeito de levar senhas para fora.
- Arquivo grande: a rota manda aos poucos (stream), sem montar tudo na memória.

## Fora do escopo
Restaurar o backup geral pelo Painel (hoje cada sistema carrega o seu), backup automático para
nuvem/e-mail, agendamento.

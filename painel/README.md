# Painel Deconto

Um endereço só, com login, onde a equipe entra e escolhe o sistema da empresa. A tela inicial
mostra os sistemas em cartões; cada um abre no seu endereço, com os seus dados separados, e o
que alguém lança aparece na hora para quem está com o mesmo sistema aberto. Roda num servidor
Linux (a VM da Locaweb) com Node.js, sem nenhum pacote do npm.

Fase 1 (agora): um login só, o `admin`, com a senha criada na instalação (trocável na tela
inicial); todos os sistemas aparecem para quem entra. Usuários e acessos de cada pessoa ficam
para a fase 2.

## Sistemas

1. **DECONTO** (`/frota/`): a frota, com km do dia, abastecimento, manutenção, documentos com
   vencimento (e os PDFs guardados no servidor) e relatório.
2. **Controle de Operação** (`/operacao/`): o antigo Controle Munck, com agenda de operação,
   operações (cliente, destinos, valor, pago, km e horímetro), documento e seguro de cada
   caminhão, manutenção e relatório.
3. **RH**: em desenvolvimento.
4. **Financeiro**: em desenvolvimento.
5. **Cargas**: em desenvolvimento.
6. **Monitoramento de Frota**: em desenvolvimento (integração futura).
7. **Estoque** (`/estoque/`): materiais, pneus e tanques de diesel, com saldo calculado no servidor
   junto com o Abastecimento do DECONTO e as peças das Manutenções do DECONTO e do Controle
   ([estoque/README.md](../estoque/README.md)).

## Onde fica cada coisa

- `servidor/servidor.js`: o programa (login, tela inicial, rotas de cada sistema, avisos ao vivo).
- `servidor/sistemas.js`: a lista de sistemas da tela inicial. Sistema novo = uma linha aqui e
  a página dele em `publico/`.
- `servidor/banco.js`: os dados de cada sistema (`data/<sistema>.json`, cópia por dia), os
  arquivos do DECONTO e a carga inicial.
- `servidor/paginas.js`: as telas de login e inicial e a moldura de cada sistema.
- `servidor/instalar-no-servidor.sh` e `servidor/montar-pacote.sh`: o instalador e o pacote
  `painel-deconto-servidor.tar.gz`, publicado pelo GitHub Actions
  (`.github/workflows/painel-deconto.yml`). Passo a passo em
  [servidor/LEIA-ME.md](servidor/LEIA-ME.md).
- As páginas dos sistemas não ficam aqui: o pacote leva `sistema-carlise/frota.html` (DECONTO),
  `munck/munck.html` (Controle de Operação).
- `testes/servidor.test.js`: os testes do servidor.
- Estoque: `servidor/estoque.js` (o cálculo do saldo), a página `estoque/estoque.html` e os testes
  `testes/estoque-servidor.test.js` e `testes/estoque-telas.test.js`.

## Testes

Na raiz do repositório:

```bash
node --test painel/testes/servidor.test.js
```

# Estoque (Painel Deconto, sistema 7)

Materiais, pneus (por quantidade de cada medida) e tanques de diesel/Arla: compras, saídas avulsas,
medições e contagens, saldo com situação (ok, baixo, zerado, negativo), avisos, histórico de cada
material e planilha do Excel. Projeto: `docs/superpowers/specs/2026-11-28-estoque-design.md`.

- **O saldo não é guardado.** O servidor calcula em `painel/servidor/estoque.js` (`GET /estoque/api/saldos`):
  última medição + compras − saídas avulsas − abastecimentos em tanque (DECONTO) − peças "do estoque"
  nas manutenções do DECONTO e do Controle. O que tem data igual ou anterior à medição já está dentro dela.
- **Preço médio ponderado** a cada compra; o DECONTO usa no valor do abastecimento no tanque e as
  manutenções usam no custo das peças do estoque.
- **Avisos ao vivo:** quando um dos três sistemas grava algo que muda o saldo, o servidor manda
  `{ "tipo": "estoque" }` para as páginas abertas dos três, e elas buscam os saldos de novo.
- Funciona só dentro do Painel (`window.PAINEL`). DECONTO e Controle sem o Estoque (arquivo local)
  escondem "Onde abasteceu" e "Do estoque" e funcionam como antes.

**Acesso por usuário (trabalho 4):** quem usa o Estoque precisa poder **ler** o DECONTO e o Controle
(a rota dos saldos lê os dois), e quem lança no DECONTO ou no Controle precisa ler `/estoque/api/saldos`.

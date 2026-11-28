# Controle de Estoque (com diesel e pneus) — design

**Data:** 2026-11-28 · **Trabalho 5** · Rascunho de apoio: `docs/superpowers/specs/rascunhos/2026-11-28-estoque-rascunho.md`

## Por quê (palavras do dono)
"Controle de estoque com todo material da empresa; depósito de diesel, quantos litros tem,
vinculado com o outro sistema que vai abastecer, para avisar quando precisa abastecer ou dar baixa
em algo do estoque; estoque no geral; pneus." E: "sistema novo vinculado com todos os outros:
quando usar algo do estoque [em outro sistema], muda no sistema do estoque."

## Decisões do dono
1. **Sistema novo** no Painel: cartão "Estoque", página própria.
2. **Ligado aos outros:** o que é usado no DECONTO (abastecimento, manutenção) e no Controle de
   Operação (manutenção) sai do estoque sozinho.
3. **Tanques cadastráveis:** criar tanque, mudar nome, capacidade e mínimo (não fixo).
4. **Pneus por quantidade** de cada medida (sem número de fogo).
5. **Baixa de peça direto na Manutenção** (DECONTO e Controle): ao lançar a manutenção, escolhe
   as peças do estoque.

## O que faz
### No sistema Estoque
- **Materiais:** nome, categoria (Peças, Filtros, Óleos, Pneus, EPI, Combustível, Outros), unidade
  (un, L, kg, m), local, **mínimo**. Pneu é material da categoria Pneus com a medida no nome
  (ex.: "Pneu 295/80 R22.5").
- **Tanques:** material da categoria Combustível com **capacidade** em litros e combustível
  (Diesel S10, Diesel S500, Arla 32). Criar, renomear, desativar.
- **Entrada (compra):** data, material/tanque, quantidade, valor unitário, fornecedor, nota.
- **Saída avulsa:** data, material, quantidade, caminhão (opcional), quem pegou, observação.
- **Acerto de contagem/medição:** "contei/medi e tem X" → o sistema grava a diferença.
- **Saldo:** lista com saldo, mínimo e situação (ok, baixo, zerado), filtro por categoria, busca,
  Excel. Tanque com barra (litros / capacidade) e "dá para ~N dias" (média de 30 dias).
- **Movimentos:** histórico de cada material com a origem de cada linha (compra, saída avulsa,
  acerto, **abastecimento no DECONTO**, **manutenção no DECONTO/Controle**), com link para ir ao registro.
- **Avisos:** material no mínimo ou zerado e tanque abaixo do mínimo, no topo do Estoque.

### Nos outros sistemas
- **DECONTO → Abastecimento:** campo novo "Onde abasteceu: Posto / <tanque>" (lista vem do Estoque).
  Se for tanque: os litros saem do tanque; o valor vem preenchido com o **preço médio das compras**
  daquele tanque (pode mudar).
- **DECONTO → Manutenção** e **Controle → Manutenção:** bloco "Peças" (quantas linhas quiser; pneus
  entram aqui, na manutenção tipo Pneus). Em cada linha a pessoa diz **de onde veio a peça**
  (pedido do dono, 2026-11-28):
  - **Do estoque:** escolhe o material da lista do Estoque; ao lado aparece **quanto tem em estoque**.
    Se não tiver o suficiente, avisa ("Em estoque: 1, pediu 4") e sugere marcar como comprada;
    não trava. Ao salvar, sai do saldo do Estoque.
  - **Comprada para esta manutenção:** nome da peça (escolhe da lista ou escreve), quantidade,
    valor e fornecedor. **Não mexe no estoque**; entra só no custo da manutenção.
- **DECONTO → Painel de avisos:** também mostra "Tanque X abaixo do mínimo" e "material no mínimo".

## Como (decisões minhas, com o porquê)
- **Uma verdade por acontecimento ("saldo calculado"):** o abastecimento e a manutenção continuam
  gravados só no sistema onde aconteceram (com o tanque/peças escolhidos). O Estoque **calcula** o
  saldo: entradas − saídas avulsas ± acertos − abastecimentos em tanque (DECONTO) − peças usadas em
  manutenções (DECONTO e Controle). Corrigiu ou apagou o abastecimento/manutenção, o saldo se corrige
  sozinho; nunca há dois registros para manter iguais.
- O Estoque **lê** os dados do DECONTO e do Controle pelas rotas de dados que já existem (o mesmo
  login abre todos os sistemas hoje) e ouve os avisos ao vivo dos três. DECONTO e Controle **leem**
  a lista de materiais/tanques do Estoque para montar as escolhas.
- Compra de diesel para o tanque **não** entra como gasto de diesel nos relatórios do DECONTO (o gasto
  já vem do abastecimento, pelo preço médio); assim não conta duas vezes.
- Saldo pode ficar negativo (lançaram a manutenção antes da compra): mostra em vermelho e avisa,
  não bloqueia o lançamento na oficina.
- Apagar material/tanque que já tem movimento: não apaga, desativa.

## Respostas à conferência (builder check, 2026-11-28) — decisões minhas, salvo onde diz "dono"
- **Medição/contagem vale como verdade naquela data:** o acerto grava o **valor medido** (data e
  hora), não a diferença. O saldo é: última medição + o que entrou/saiu **depois** dela. Lançamento
  com data igual ou anterior à medição já está "dentro" da medição: não muda mais o saldo (aparece no
  histórico marcado "lançado depois da medição"). Sem medição, conta desde o começo.
- **Saldo calculado no servidor:** rota `GET /estoque/api/saldos` faz a conta uma vez (o servidor já
  tem os dados dos três sistemas na memória) e devolve saldo, mínimo, situação e preço médio por
  material. O Estoque, o DECONTO (avisos, "quanto tem") e o Controle ("quanto tem") usam essa rota.
  Quando vier o acesso por usuário (trabalho 4), essa rota vale para quem usa qualquer um dos três.
- **Preço médio = custo médio ponderado:** a cada compra, média = (saldo × média + qtd × preço) ÷
  (saldo + qtd). Acompanha o preço do que está no tanque.
- **Os 11 caminhões do Controle são os mesmos do DECONTO** (mesmo id, vieram da carga). Abastecimento
  só existe no DECONTO, então o diesel fecha. Manutenção pode ser lançada nos dois sistemas (pedido do
  dono); cada uma dá baixa uma vez — lançar a mesma manutenção nos dois baixa duas vezes (o histórico
  mostra a origem para achar). "Caminhão" na saída avulsa: lista do DECONTO.
- **Conexões ao vivo:** o Estoque ouve os três sistemas; o plano trata o limite de 6 conexões por
  endereço (ex.: HTTP/2 no nginx ou um canal só).
- **Medição do tanque em litros** (dono): digita os litros lidos na bomba/medidor; não há régua.
- **Custo da manutenção (dono: "o sistema soma sozinho"):** o campo Valor passa a ser
  **"Mão de obra / serviço (R$)"**; o **total da manutenção** = serviço + peças compradas (valor
  digitado em cada linha) + peças do estoque (quantidade × preço médio na data). O total aparece
  ao vivo no formulário e é o que os relatórios usam (manutenção por caminhão, por km, custo/km).
  Manutenções antigas (sem linhas de peças) continuam com o total = o Valor que já tinham.
  Sem Estoque (arquivo local), a opção "Do estoque" some; "Comprada" continua.
- **Mesma regra de medição para contagem de peças.** Na linha "do estoque", se pedirem mais do que
  tem, sugere dividir: parte do estoque, parte comprada. Ao corrigir uma manutenção, o "quanto tem"
  não desconta as peças dela mesma.
- **Saída avulsa com caminhão** aparece no histórico do Estoque com o caminhão, mas **não** entra no
  custo do caminhão nos relatórios do DECONTO (para isso, lance como peça na Manutenção).

## Restrições
- Seguir o padrão das páginas atuais (HTML único, conversa com `painel/servidor`, testes de servidor
  e de tela com Playwright, `PORTA_TESTE`).
- Não quebrar quem abre DECONTO/Controle sem o Estoque (ex.: arquivo local): sem Estoque, os campos
  novos somem e tudo funciona como hoje.
- Quando vier o acesso por usuário (trabalho 4), quem usa o Estoque precisa poder **ler** DECONTO e
  Controle — anotar lá.

## Fora do escopo agora
Pneu por número de fogo e posição, pedido de compra/cotação, código de barras, vários depósitos
(além dos tanques), custo médio contábil oficial.

## Tamanho
Uma a duas semanas de trabalho humano; entregue em partes: (1) Estoque com materiais, tanques,
entradas, saídas, acertos, saldo e avisos; (2) ligação com Abastecimento do DECONTO; (3) peças nas
Manutenções do DECONTO e do Controle; (4) avisos no Painel do DECONTO.

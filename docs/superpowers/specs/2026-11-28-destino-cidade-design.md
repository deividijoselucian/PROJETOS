# Destino A e B puxando a cidade — design curto

**Data:** 2026-11-28 · **Sistema:** Controle de Operação (`munck/munck.html`)

## Por quê
Na Operação e na Agenda, digitar o começo da cidade ("xanx") e escolher "Xanxerê - SC" na lista,
sem escrever tudo e sem erro de digitação. Grátis e sem internet (o usuário trocou o Google por isto).

## O que faz
- Vale para **Destino A** e **Destino B** da **Operação** e da **Agenda**.
- A partir de 2 letras, aparece embaixo do campo uma lista com até 8 itens:
  primeiro os destinos já usados que batem, depois as cidades "Nome - UF".
- Busca sem acento e sem diferença de maiúscula ("sao" acha "São Domingos - SC"); cidade que
  **começa** com o texto vem antes da que só contém.
- Setas e Enter escolhem, clique também; Esc fecha. Depois de escolher, dá para continuar
  escrevendo (rua, referência). O campo segue aceitando texto livre.

## Como (decisão minha)
- Lista oficial do IBGE com as **1.191 cidades de PR, SC e RS**, a mesma que o mapa antigo usava
  (fonte no histórico: `munck/mapa-sul.json`, IBGE/CC0 e kelvins/municipios-brasileiros/MIT).
  Só nome e UF, embutidos no `munck.html` (~20 KB). Outros estados: dá para somar depois.
- Uma lista de sugestões própria (não o `datalist`), porque o `datalist` do navegador não acha
  "sao" em "São".

## Fora do escopo
Rua e número vindos de mapa, mapa na tela, rota, distância.

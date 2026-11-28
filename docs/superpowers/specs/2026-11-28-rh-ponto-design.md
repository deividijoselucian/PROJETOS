# RH — Ponto pelo celular com foto e local + relatório do mês — design curto

**Data:** 2026-11-28 · **Pedido do dono:** "bater o ponto pegando a localização de onde foi e
solicitando uma foto, mandando para a central do RH, marcando horário que entrou e que parou";
"todo mês tirar relatório para mandar para a contabilidade, com as horas já totais".

## O que faz (primeira fase)
1. **Funcionários** (no RH): nome, CPF, cargo, jornada do dia (ex.: 8h48), ativo/desligado.
2. **Ponto pelo celular**: cada funcionário recebe um **link pessoal** (o RH gera e manda por
   WhatsApp; ele salva na tela inicial do celular). O link abre direto a tela do ponto:
   nome, hora certa e um botão grande **Registrar entrada** / **Registrar saída** (alterna sozinho).
   Ao tocar: o celular pede a **localização** e tira uma **foto** (câmera da frente); o registro
   vai para o servidor com a **hora do servidor** (não a do celular). Aparece o comprovante:
   "Entrada registrada às 07:58 — Xanxerê". Sem internet ou sem permitir foto/local: avisa e
   não registra.
3. **Central do RH** (o cartão "RH" do Painel deixa de ser "Em breve"): registros por dia e por
   funcionário com entrada, saída, horas do dia, foto pequena e "ver no mapa" (link do Google Maps,
   grátis). Avisa entrada sem saída. O RH pode corrigir ou incluir um registro com **justificativa**
   (fica guardado quem mudou e quando; o original não some).
4. **Relatório do mês para a contabilidade**: por funcionário, cada dia com entradas, saídas e
   horas; **total de horas do mês**; horas acima da jornada do dia somadas à parte. Sai em
   **Excel** (uma aba por funcionário + uma aba resumo) e em página para imprimir/PDF.

## Decisões minhas (pode corrigir)
- **Link pessoal em vez de usuário e senha** para o funcionário: motorista na rua não precisa
  decorar senha, e o link só serve para bater o ponto (não abre DECONTO nem Operação).
  O RH pode trocar o link de alguém a qualquer hora (o antigo para de funcionar). A foto inibe
  um bater pelo outro.
- Foto pequena (~100 KB) guardada no servidor como os PDFs do DECONTO.
- Aviso de privacidade (LGPD) na primeira vez: foto e local só no momento do registro, para o RH.

## Atenção (lei)
Para o ponto valer como **ponto oficial** perante o Ministério do Trabalho, a Portaria 671/2021
pede um programa registrado (REP-P), com arquivos próprios e comprovante. Esta fase é um
**controle interno**; a pesquisa sobre o que falta para oficializar está em
`docs/superpowers/specs/rascunhos/2026-11-28-rh-ponto-rascunho.md` (sendo feita).

## Fora desta fase
Banco de horas com saldo e compensação, férias, 13º, salário, folha, ponto sem internet,
jornada de motorista (Lei 13.103).

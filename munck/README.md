# Controle de Operação (antigo Controle Munck)

Sistema separado do DECONTO, para os caminhões munck: a agenda de operação de cada caminhão e
as operações (cliente, destino A e B, valor, se já foi pago, km e horímetro), o documento e o
seguro de cada caminhão, a manutenção e o relatório. Tem nome, link e dados próprios; nada é
compartilhado com o DECONTO.

## Abas

1. **Painel**: um cartão por caminhão com o serviço de hoje (cliente, destinos, hora e
   motorista, ou "sem serviço agendado" e o último serviço), os próximos três serviços e o km
   do mês. Em cima: quantos estão trabalhando hoje, serviços nos próximos 7 dias, km do mês e
   **A receber** (soma das operações ainda não pagas). "Precisa de atenção" mostra:
   - o mesmo caminhão com dois serviços no mesmo dia sem horários diferentes;
   - o mesmo motorista em dois caminhões no mesmo dia;
   - dia agendado que já passou sem operação lançada (com o botão "Lançar operação");
   - caminhão na oficina ou parado com serviço marcado;
   - CNH ou curso de operador (NR-11) vencendo em 30 dias ou vencido;
   - documento ou seguro do caminhão vencendo em 30 dias ou vencido;
   - manutenção vencida ou perto (1.000 km ou 15 dias).
2. **Agenda** (agenda de operação): quadro da semana (caminhões nas linhas, dias nas colunas).
   O **+** agenda aquele caminhão naquele dia; clicar num serviço abre para mudar. O
   agendamento tem data, "até" (vários dias), hora, caminhão, motorista (vem o fixo do
   caminhão), cliente, destino A, destino B, o que vai fazer e a situação (agendado,
   confirmado, feito, cancelado). Embaixo, a lista com filtro por caminhão e cliente.
3. **Operação**: data, caminhão, motorista, cliente, destino A, destino B, valor, pago (sim ou
   não), km inicial e final e "Usou o munck?". Com Sim, aparecem o horímetro inicial e final, e
   o sistema mostra as horas ligado. Motorista, cliente e destinos vêm do agendamento daquele dia; o km e o horímetro
   iniciais vêm do último lançamento do caminhão. Ao salvar, o agendamento do dia fica
   "Feito". A lista tem filtro por caminhão, cliente, pagas ou a receber e mês, com o total
   de km, horas, valor e a receber.

   Nos campos Destino A e B (Agenda e Operação), a partir de 2 letras aparece uma lista com
   os destinos já usados e as cidades de PR, SC e RS (IBGE), sem precisar de acento
   ("sao" acha "São Domingos - SC"). Setas e Enter ou clique escolhem; Esc fecha.
4. **Documento**: uma linha por caminhão com o número do documento, o vencimento, se tem
   seguro e o vencimento do seguro. O Painel avisa 30 dias antes de vencer.
5. **Manutenção**: data, caminhão, serviço (do caminhão ou do munck: hidráulico, cabo de aço,
   lubrificação, inspeção e laudo NR-11/NR-12, estrutura), o que foi feito, oficina, km, valor e
   a próxima por km ou por data. "Próximas manutenções" mostra a última de cada serviço em cada
   caminhão com o que falta; a aba mostra quantas estão vencidas.
6. **Relatório**: período (este mês, mês passado, últimos 30 dias, este ano ou datas
   escolhidas) e caminhão. Números: km rodados, faturado, a receber, horas de munck, dias
   trabalhados, serviços feitos, manutenção e manutenção por km. Gráficos: km por caminhão, km
   por cliente, km por dia (por mês em períodos longos) e manutenção por caminhão. Tabelas por
   caminhão, por cliente e das manutenções. Escolhendo um caminhão, sai o extrato dele.
   "Baixar no Excel" leva tudo.
7. **Caminhões e motoristas**: placa, apelido, marca, modelo, ano, munck (marca e modelo),
   capacidade, alcance, motorista fixo, hodômetro e situação; motoristas com telefone, CNH
   e validade da CNH e do curso de operador. "Baixar tudo no Excel (.xlsx)" traz as abas
   Caminhões, Motoristas, Operações, Agenda, Manutenções e Documentos.

Os lançamentos antigos, de quando o sistema era por obra, continuam guardados e aparecem com o
nome da obra no lugar do cliente.

## Onde os dados ficam

- **No servidor**: o sistema agora roda dentro do **Painel Deconto** (pasta
  [`painel/`](../painel/README.md)), com o nome **Controle de Operação**, no endereço
  `/operacao/` do painel. Lá ele tem login, os dados num arquivo próprio no servidor, separados
  dos do DECONTO (cópia automática por dia), e o que um lança aparece na hora para os outros.
  Instala com um comando só, do mesmo jeito que a Sinistra (PM2, nginx e HTTPS pelo sslip.io):
  passo a passo em [painel/servidor/LEIA-ME.md](../painel/servidor/LEIA-ME.md).
- Pelo link do claude.ai: na conta, num banco de dados da própria página, em qualquer
  aparelho que abrir o link.
- Abrindo o `munck.html` direto: no navegador daquele computador (chave
  `controle-munck:dados:v1`). Use "Salvar cópia de tudo (.json)" de vez em quando.

## Arquivo

- `munck.html`: o sistema inteiro numa página. A planilha do Excel e os gráficos são montados
  no próprio sistema, sem internet (os mesmos do DECONTO).

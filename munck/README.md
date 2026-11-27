# Controle Munck

Sistema separado do DECONT, para os caminhões munck: onde cada caminhão está trabalhando,
a agenda dos serviços e o km inicial e final de cada obra, por dia ou por etapa. Tem nome,
link e dados próprios; nada é compartilhado com o DECONT.

## Abas

1. **Painel**: um cartão por caminhão com onde ele trabalha hoje (obra, etapa, hora e
   motorista, ou "sem serviço agendado" e o último serviço), os próximos três serviços e o
   km do mês. Em cima, quantos estão trabalhando hoje, quantos serviços há nos próximos 7
   dias, o km do mês e as obras em andamento. "Precisa de atenção" mostra:
   - o mesmo caminhão com dois serviços no mesmo dia sem horários diferentes;
   - o mesmo motorista em dois caminhões no mesmo dia;
   - dia agendado que já passou sem km lançado (com o botão "Lançar km");
   - caminhão na oficina ou parado com serviço marcado;
   - CNH ou curso de operador (NR-11) vencendo em 30 dias ou vencido;
   - obra em andamento que passou da previsão de término.
2. **Agenda**: quadro da semana (caminhões nas linhas, dias nas colunas). O **+** agenda
   aquele caminhão naquele dia; clicar num serviço abre para mudar. O agendamento tem data,
   "até" (serviço de vários dias), hora, caminhão, motorista (vem o fixo do caminhão), obra
   (ou "+ Cadastrar obra nova" ali mesmo), etapa, o que vai fazer e a situação (agendado,
   confirmado, feito, cancelado). Embaixo, a lista com filtro por caminhão e obra.
3. **Km das obras**: lançamento **por dia** (data) ou **por etapa** (início e fim da etapa),
   com caminhão, motorista, obra, etapa, km inicial, km final e horas de munck (opcional).
   O km inicial vem do último km final do caminhão; motorista, obra e etapa vêm do
   agendamento daquele dia. O sistema avisa quando o km não bate com o lançamento anterior.
   Ao lançar o km, o agendamento daquele dia fica como "Feito".
4. **Obras**: cada obra com cliente, cidade, local, responsável, início, previsão, situação
   e etapas (uma por linha; etapas novas lançadas na agenda ou no km entram sozinhas). "Ver
   obra" mostra o km por etapa, por caminhão, dia a dia e a agenda da obra, e baixa tudo
   isso no Excel.
5. **Caminhões e motoristas**: placa, apelido, marca, modelo, ano, munck (marca e modelo),
   capacidade, alcance, motorista fixo, hodômetro e situação; motoristas com telefone, CNH
   e validade da CNH e do curso de operador. "Baixar tudo no Excel (.xlsx)" traz as abas
   Caminhões, Motoristas, Obras, Km por obra (obra, etapa e caminhão), Km e Agenda.

## Onde os dados ficam

- Pelo link do claude.ai: na conta, num banco de dados da própria página, em qualquer
  aparelho que abrir o link.
- Abrindo o `munck.html` direto: no navegador daquele computador (chave
  `controle-munck:dados:v1`). Use "Salvar cópia de tudo (.json)" de vez em quando.

## Arquivo

- `munck.html`: o sistema inteiro numa página. A planilha do Excel é montada no próprio
  sistema, sem internet (o mesmo gerador de .xlsx usado no DECONT).

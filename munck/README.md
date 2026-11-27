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
   - manutenção vencida ou perto (1.000 km ou 15 dias);
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
   isso no Excel. A cidade pode ser escrita "Chapecó", "Chapecó/SC" ou "Chapecó - SC"; o campo
   "Ponto no mapa" aceita as coordenadas copiadas do Google Maps.
5. **Mapa**: as obras no mapa do Paraná, Santa Catarina e Rio Grande do Sul, com os
   municípios de SC. Cada situação tem cor e forma próprias (a cor nunca vem sozinha):
   - **em atividade hoje**: círculo verde-água com anel (há caminhão agendado ou km lançado hoje);
   - **em andamento**: círculo azul;
   - **futura**: círculo vazado (obra planejada ou que ainda vai começar);
   - **atrasada**: losango laranja com "!" (passou da previsão de término; com anel se tem
     caminhão lá hoje);
   - **concluída**: quadrado cinza (escondida até ligar na legenda).
   A legenda mostra quantas obras há em cada situação e liga ou desliga cada uma. A obra fica
   no centro da cidade dela ou no ponto marcado ("Marcar o ponto no mapa" e clicar no lugar).
   Arrastar move, + e − (ou a roda do mouse, ou dois dedos) aproximam, ⤢ mostra todas. Embaixo,
   a lista das obras do mapa, com as que estão sem localização.
6. **Manutenção**: data, caminhão, serviço (do caminhão ou do munck: hidráulico, cabo de aço,
   lubrificação, inspeção e laudo NR-11/NR-12, estrutura), o que foi feito, oficina, km, valor e
   a próxima por km ou por data. "Próximas manutenções" mostra a última de cada serviço em cada
   caminhão com o que falta; a aba mostra quantas estão vencidas.
7. **Relatório**: período (este mês, mês passado, últimos 30 dias, este ano ou datas
   escolhidas) e caminhão. Números: km rodados, horas de munck, dias trabalhados, serviços
   feitos, manutenção e manutenção por km. Gráficos: km por caminhão, km por obra, km por dia
   (por mês em períodos longos) e manutenção por caminhão. Tabelas por caminhão (com o uso:
   dias trabalhados ÷ dias úteis), por obra e das manutenções. Escolhendo um caminhão, sai o
   extrato dele (km, manutenções e agenda em ordem de data). "Baixar no Excel" leva tudo.
8. **Caminhões e motoristas**: placa, apelido, marca, modelo, ano, munck (marca e modelo),
   capacidade, alcance, motorista fixo, hodômetro e situação; motoristas com telefone, CNH
   e validade da CNH e do curso de operador. "Baixar tudo no Excel (.xlsx)" traz as abas
   Caminhões, Motoristas, Obras, Km por obra (obra, etapa e caminhão), Km, Agenda e
   Manutenções.

## Onde os dados ficam

- **No servidor** (pasta `servidor/`, passo a passo em [servidor/LEIA-ME.md](servidor/LEIA-ME.md)):
  numa VM Linux, com usuário e senha para cada pessoa, os dados num arquivo no servidor (cópia
  automática por dia) e o que um lança aparece na hora para os outros. Instala com um comando
  só, do mesmo jeito que a Sinistra (PM2, nginx e HTTPS pelo sslip.io).
- Pelo link do claude.ai: na conta, num banco de dados da própria página, em qualquer
  aparelho que abrir o link.
- Abrindo o `munck.html` direto: no navegador daquele computador (chave
  `controle-munck:dados:v1`). Use "Salvar cópia de tudo (.json)" de vez em quando.

## Arquivo

- `munck.html`: o sistema inteiro numa página. A planilha do Excel e os gráficos são montados
  no próprio sistema, sem internet (os mesmos do DECONT).
- `mapa-sul.json`: o mapa (contorno de PR, SC e RS, municípios de SC simplificados e as 1.191
  cidades dos três estados com latitude e longitude), publicado junto com a página. Aberto
  direto como arquivo, o navegador não lê esse arquivo e o mapa não aparece; pelo link funciona.
- `mapa/montar_mapa.py`: gera o `mapa-sul.json` (precisa de `shapely`). Fontes: malha
  municipal do IBGE via [tbrugz/geodata-br](https://github.com/tbrugz/geodata-br) (CC0) e
  coordenadas das cidades de [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros) (MIT).
  Uso: baixar `geojs-41-mun.json`, `geojs-42-mun.json`, `geojs-43-mun.json` e `municipios.csv`
  numa pasta e rodar `python3 mapa/montar_mapa.py <pasta> mapa-sul.json`.

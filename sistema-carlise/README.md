# DECONT (controle da frota)

O sistema era chamado de Sistema Carlise; a pasta do repositório continua `sistema-carlise`.

Controle da frota de caminhões: quanto cada caminhão rodou por dia, quem dirigiu, qual
semirreboque estava engatado, quanto gastou de combustível e de manutenção, e o relatório
com gráficos e o extrato de cada caminhão.

## Abas

1. **Painel**: números do período (km rodados, litros abastecidos, combustível, manutenção, custo por km,
   consumo), o que precisa de atenção, tabela por caminhão, km por dia, gasto por
   caminhão, por motorista e por semirreboque. O período pode ser hoje, 7 dias, este mês,
   mês passado, este ano ou datas escolhidas.
2. **Km do dia**: data, caminhão, motorista, semirreboque, km inicial e final, de onde saiu
   e onde chegou. O km inicial vem do último km final do caminhão; o sistema avisa quando
   o km não bate com o lançamento anterior ("70 km sem lançamento") ou quando passa de
   1.500 km num dia.
3. **Abastecer**: diesel S10, S500 ou Arla 32, litros, valor, km do hodômetro, posto, e se
   completou o tanque. Com tanque cheio, calcula o km/l de um tanque ao outro e marca o
   tanque que ficou abaixo da média do caminhão.
4. **Manutenção**: serviço, valor, oficina, km, e a próxima por km ou por data. A lista de
   próximas manutenções avisa quando está perto ou vencida.
5. **Documentos**: os documentos de cada caminhão e de cada semirreboque, separados por
   veículo: CRLV, IPVA, seguro, RNTRC, aferição do tacógrafo, AET, CIV, CIPP, licença
   ambiental, rastreador, extintor, laudo de opacidade ou outro. Cada um tem número,
   emissão, vencimento, valor e a foto ou o PDF (até 15 MB). O seguro tem seguradora,
   apólice, vigência e pagamento à vista ou parcelado (parcelas e valor de cada uma; o
   sistema calcula o total ou a parcela que faltar). "Renovar" cadastra o novo e deixa o
   anterior como histórico; só o mais novo conta para o vencimento. Cada veículo mostra
   o que ainda falta cadastrar (caminhão: CRLV, seguro, RNTRC e tacógrafo; semirreboque:
   CRLV).
6. **Relatório**: indicadores com metas de consumo (km/l) e custo por km, gráficos
   (consumo, custo por km, gasto, km, litros e preço do diesel por caminhão, km por dia,
   gasto, litros de diesel, consumo e custo
   mês a mês, km, litros e consumo por motorista, manutenção por serviço, preço do diesel),
   os documentos vencidos ou vencendo e o
   **extrato por caminhão**: ficha com Renavam e chassi, documentos do caminhão e do
   semirreboque engatado, e todos os lançamentos em ordem de data, com o gasto
   acumulado. Dá para imprimir (no programa do Windows), baixar o relatório (.html) e
   baixar o extrato (.csv).
7. **Frota**: caminhões e semirreboques (placa, apelido como "Caçamba 01" ou "Carreta
   branca", tipo, marca, modelo, ano de fabricação e modelo, Renavam, chassi, situação dos
   documentos; os tipos incluem caminhonete e automóvel para os carros de apoio), motoristas (CNH e exame
   toxicológico com validade), "Conjuntos agora" para trocar motorista e semirreboque de
   cada caminhão (a troca fica registrada), cópia de segurança e dados de exemplo.

**Categorias**: cada caminhão e semirreboque pode ser de Transporte, Rede, Rede Viva ou
Particular (o semirreboque sem categoria segue o caminhão em que está engatado). O seletor
"Categoria" no alto da tela vale para o sistema inteiro: painel, lançamentos, documentos,
relatório, planilhas e avisos passam a mostrar só aquela categoria. Com "Todas", o painel e
o relatório mostram a divisão por categoria (km, litros, combustível, manutenção e custo
por km, com gráficos). O sistema lembra a última categoria escolhida em cada aparelho.

**Documentos no Excel**: o botão "Baixar no Excel (.xlsx)" da aba Documentos gera a
planilha com as abas Resumo (cada veículo, Renavam, chassi, quantos documentos vencidos,
vencendo e em dia, o próximo vencimento e o que falta), Todos os documentos (com filtro) e
uma aba por caminhão e por semirreboque. A situação vem colorida, as datas e os valores
já no formato do Excel. A planilha é montada no próprio sistema, sem internet.

**Relatório de documentos em PDF**: o botão "Relatório em PDF" da aba Documentos gera um PDF
(A4 deitado) com a situação de cada veículo, o próximo vencimento, o que falta cadastrar e
todos os documentos separados por veículo. O PDF é montado no próprio sistema.

**Avisos**: CNH, exame toxicológico ou documento de veículo vencendo ou vencido, manutenção
perto (2.000 km ou 15 dias) ou passada, caminhão rodando sem km lançado há 3 dias. A
antecedência é ajustável na aba Documentos: seguro (padrão 45 dias, para dar tempo de cotar
a renovação) e os outros documentos, CNH e exame (padrão 30 dias). O que estiver vencendo
aparece no Painel e numa faixa no alto das outras telas; no programa do Windows, com
"Avisar também no Windows", aparece um aviso do Windows ao abrir o sistema (uma vez por dia).

O que cada veículo deve ter cadastrado depende do tipo: caminhonete e automóvel, CRLV e
seguro; caminhões, CRLV, seguro e tacógrafo; cavalo mecânico e veículos da categoria
Transporte, também o RNTRC; semirreboque, CRLV.

Contas:

- **Km rodados** = km final − km inicial dos lançamentos do dia.
- **Consumo** = km de um tanque cheio até o outro ÷ litros de diesel colocados (Arla 32
  fora). Se nunca se marcou "completou o tanque", vale km rodados ÷ litros.
- **Custo por km** = combustível (com Arla) + manutenção, ÷ km rodados.
- A manutenção dos semirreboques entra no total da frota, mas não no extrato do caminhão,
  porque o semirreboque troca de caminhão.

Toda lista tem "Baixar planilha (.csv)", que abre no Excel (separador `;`, vírgula decimal).

## Onde os dados ficam

- **Pelo link do claude.ai**: na conta, num banco de dados da própria página. Aparecem
  em qualquer aparelho em que se abre o link (computador e celular) e para quem tiver
  acesso de edição.
- **Pelo programa do Windows** ou abrindo o `frota.html` direto: no navegador daquele
  computador. Use "Salvar cópia de tudo (.json)" de vez em quando; "Carregar uma cópia"
  traz os dados de volta (ou leva de um lugar para o outro).

As fotos e os PDFs dos documentos ficam na conta (pelo claude.ai, para quem tem acesso de
edição) ou no próprio computador (programa do Windows). No programa do Windows eles vão
junto na cópia de segurança.

Os dados de exemplo vêm marcados e saem todos no botão "Apagar os exemplos", sem mexer no
que foi cadastrado de verdade.

## Arquivos

- `frota.html`: o sistema inteiro numa página (a mesma publicada como Artifact no claude.ai).
- `exe/`: gera `DECONT.exe`.
  - `montar.py`: acrescenta o cabeçalho HTML e embute as fontes em base64.
  - `fontes/`: Barlow e Barlow Condensed (Google Fonts, licença SIL Open Font License 1.1),
    só os caracteres latinos.
  - `gerar_icone.py`: desenha o ícone (caminhão com semirreboque).
  - `frota.nsi`: o .exe copia o sistema para `%LOCALAPPDATA%\SistemaCarlise`, cria o atalho
    "DECONT" na Área de Trabalho (e apaga o atalho antigo "Sistema Carlise") e abre numa janela própria do Microsoft Edge.
    Sem Edge, abre no navegador padrão. Rodar um .exe mais novo atualiza o sistema e
    mantém os dados.

Para gerar de novo no Linux: `sudo apt install nsis` e depois `./exe/build.sh`.
O GitHub Actions faz isso a cada mudança nesta pasta e publica no pré-lançamento
`sistema-carlise`.

O .exe não é assinado digitalmente, então o Windows avisa na primeira vez
("O Windows protegeu o computador"): clique em **Mais informações** › **Executar assim mesmo**.

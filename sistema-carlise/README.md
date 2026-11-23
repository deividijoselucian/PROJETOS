# Sistema Carlise

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
5. **Relatório**: indicadores com metas de consumo (km/l) e custo por km, gráficos
   (consumo, custo por km, gasto, km, litros e preço do diesel por caminhão, km por dia,
   gasto, litros de diesel, consumo e custo
   mês a mês, km, litros e consumo por motorista, manutenção por serviço, preço do diesel) e o
   **extrato por caminhão**: todos os lançamentos em ordem de data, com o gasto
   acumulado. Dá para imprimir (no programa do Windows), baixar o relatório (.html) e
   baixar o extrato (.csv).
6. **Frota**: caminhões, semirreboques e motoristas (CNH e exame toxicológico com
   validade), "Conjuntos agora" para trocar motorista e semirreboque de cada caminhão
   (a troca fica registrada), cópia de segurança e dados de exemplo.

Avisos do painel: CNH ou exame toxicológico vencendo (30 dias) ou vencido, manutenção
perto (2.000 km ou 15 dias) ou passada, caminhão rodando sem km lançado há 3 dias.

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

Os dados de exemplo vêm marcados e saem todos no botão "Apagar os exemplos", sem mexer no
que foi cadastrado de verdade.

## Arquivos

- `frota.html`: o sistema inteiro numa página (a mesma publicada como Artifact no claude.ai).
- `exe/`: gera `SistemaCarlise.exe`.
  - `montar.py`: acrescenta o cabeçalho HTML e embute as fontes em base64.
  - `fontes/`: Barlow e Barlow Condensed (Google Fonts, licença SIL Open Font License 1.1),
    só os caracteres latinos.
  - `gerar_icone.py`: desenha o ícone (caminhão com semirreboque).
  - `frota.nsi`: o .exe copia o sistema para `%LOCALAPPDATA%\SistemaCarlise`, cria o atalho
    "Sistema Carlise" na Área de Trabalho e abre numa janela própria do Microsoft Edge.
    Sem Edge, abre no navegador padrão. Rodar um .exe mais novo atualiza o sistema e
    mantém os dados.

Para gerar de novo no Linux: `sudo apt install nsis` e depois `./exe/build.sh`.
O GitHub Actions faz isso a cada mudança nesta pasta e publica no pré-lançamento
`sistema-carlise`.

O .exe não é assinado digitalmente, então o Windows avisa na primeira vez
("O Windows protegeu o computador"): clique em **Mais informações** › **Executar assim mesmo**.

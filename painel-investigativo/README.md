# Meu Painel Investigativo

Ferramenta para o Desafio Final da Fase 2 da Maratona Tech 2026 (tema Dilemas Digitais).
Pesquisa: uso do celular ao acordar (redes sociais e jogos).
Pergunta: "Quanto tempo você usa o celular ao acordar e qual aplicativo você usa?"

A página tem três abas, na ordem do trabalho:

1. **Entrevistar**: uma ficha para cada pessoa (nome ou apelido, idade, aplicativo e
   minutos). O aplicativo já define o tipo (rede social, jogo, mensagens ou não usa).
   As fichas ficam numa tabela, com editar e apagar, e a meta de 10 pessoas.
2. **Explicar**: o que os números mostram (quem mais usa, quem menos usa, amplitude,
   média, redes sociais × jogos, menores de 18 × adultos), os campos de padrão e
   conclusão e o texto do vídeo de 1 minuto.
3. **Apresentar**: o painel em forma de tela de bloqueio de celular na hora de acordar,
   com as 4 partes que a banca pede (tema, pergunta, organização dos resultados e
   conclusão). Tem papel de parede, tela cheia e "esconder botões" para gravar.

Na aba Apresentar, o **Modo vídeo** passa sozinho pelas 4 partes no ritmo do texto da aba
Explicar (que pode ser editado), com o texto no alto para ler e legenda opcional. No programa
para Windows, ele também grava o painel junto com a câmera e o microfone do computador e salva
o vídeo (MP4 quando o Edge permite, senão WebM).

Para levar as entrevistas de um aparelho para outro (ou do link para o programa), use
"Copiar meus dados" e "Carregar estes dados" na aba Entrevistar.

Os dados ficam só no navegador de quem usa (localStorage). Os nomes aparecem como
"Pessoa 1, Pessoa 2…" no painel, a não ser que se marque "Mostrar os nomes".

## Arquivos

- `painel.html`: a página (é a mesma publicada como Artifact no claude.ai).
- `exe/`: gera `PainelInvestigativo.exe`, que abre o painel no Windows sem internet.
  - `montar.py`: acrescenta o cabeçalho HTML e embute as fontes em base64.
  - `fontes/`: Atkinson Hyperlegible e Unbounded (Google Fonts, licença SIL Open Font
    License 1.1), só os caracteres latinos.
  - `gerar_icone.py`: desenha o ícone (celular no céu do amanhecer).
  - `painel.nsi`: o .exe copia o painel para `%LOCALAPPDATA%\PainelInvestigativo` e
    abre numa janela própria do Microsoft Edge. Sem Edge, abre no navegador padrão.

Para gerar de novo no Linux: `sudo apt install nsis` e depois `./exe/build.sh`.

O .exe não é assinado digitalmente, então o Windows avisa na primeira vez
("O Windows protegeu o computador"): clique em **Mais informações** › **Executar assim mesmo**.

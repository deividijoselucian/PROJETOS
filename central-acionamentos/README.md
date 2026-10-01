# Central de Acionamentos

Tela única para o prestador de auto socorro ver todos os chamados que chegam pelos portais
das assistências (Porto Seguro, Tokio Marine, Notro e Aciona Fácil), com alarme quando entra
serviço novo e um botão que leva direto ao chamado no portal.

## Como funciona

A central é uma extensão do Chrome. Os portais continuam abertos nas abas, com o login do
prestador; a extensão lê a tela de serviços de cada um, junta os chamados num painel só
(Novos, Agendados, A caminho, Em serviço, Pendências) e:

- toca um alarme e mostra um aviso do Windows quando entra chamado novo;
- para o alarme sozinha quando o chamado sai da lista de novos (aceito ou repassado);
- no botão **Abrir no portal**, vai para a aba do portal e destaca a linha do chamado;
- recarrega as abas dos portais que não se atualizam sozinhos (Tokio e Aciona Fácil, a cada
  2 minutos, sem mexer na aba que está em uso);
- manda aviso por WhatsApp, pelo servidor, usando o número escolhido no painel.

## Avisos por WhatsApp

Com dois números de WhatsApp conectados no servidor, o painel tem a escolha de qual deles
manda os avisos: no alto da tela (troca rápida entre Número 1, Número 2 ou Desligado) e no
bloco "Avisos por WhatsApp", onde ficam o nome e a identificação de cada número no servidor,
para quem mandar, quando avisar (chamado novo, cancelado, chamado que apareceu direto em outra
etapa) e a opção de tentar pelo outro número se o escolhido falhar.

Formatos de envio:

- **Evolution API**: `POST {endereço}/message/sendText/{identificação}` com o cabeçalho
  `apikey` e o corpo `{ "number": "5549999990000", "text": "..." }`.
- **Outro (JSON da Central)**: `POST {endereço}` com `Authorization: Bearer {chave}` e o corpo
  `{ "de": "{identificação}", "para": "5549999990000", "mensagem": "..." }`.

O Chrome pede autorização para falar com o endereço do servidor na primeira vez que você salva.

A extensão só lê os portais: não clica nem aceita nada. A única coisa que sai do computador são
os avisos por WhatsApp, se você ligar, e só para o endereço do seu servidor.

## Arquivos

- `extensao/`: a extensão do Chrome.
  - `leitor.js`: lê a tela de cada portal (seções, linhas das tabelas, contagens).
  - `fundo.js`: guarda as leituras, decide o alarme, avisos do Windows, recarga das abas.
  - `central.html`, `central.css`, `central.js`: o painel.
  - `som.html`, `som.js`: toca o alarme.
  - `portais.js`: endereços e telas de cada portal.
- `prototipo.html`: a primeira demonstração, com dados de exemplo.
- `instalador/`: gera o instalador de teste para Windows e o .zip da extensão.

## Instalador de teste (Windows)

- Instala em `C:\CentralAcionamentos` (ou na pasta do usuário, se não puder), sem pedir
  administrador, com a extensão em `C:\CentralAcionamentos\extensao`.
- Abre o passo a passo para ligar a extensão no Chrome (uma vez só):
  `chrome://extensions` › Modo do desenvolvedor › Carregar sem compactação › pasta `extensao`.
- Atalho **Central de Acionamentos** na Área de Trabalho abre o painel numa janela própria.
  A extensão tem id fixo (`key` no manifest.json), por isso o atalho sabe o endereço do painel.
- Não é assinado digitalmente, então o Windows avisa ("O Windows protegeu o computador").
  Clique em **Mais informações** › **Executar assim mesmo**.
- Desinstala por Configurações › Aplicativos.

Para gerar de novo no Linux: `sudo apt install nsis zip` e depois `./instalador/build.sh`.
O GitHub Actions faz isso a cada mudança e publica no pré-lançamento `instalador-teste`.

## Como cada portal é lido

| Portal | Tela | Vai para a coluna |
|---|---|---|
| Porto Seguro | Receber Serviços (atualiza a cada 90 s) | Serviços pendentes → Novos · Cancelados e GPS não iniciados → Pendências |
| Tokio Marine | Acompanhamento de Serviço | Em acionamento → Novos · A caminho · Em andamento → Em serviço · Agendadas · Saída de base pendente → Pendências |
| Notro Hub | Acompanhamento, aba Todos (ligar "Atualizar a cada 30 seg") | pela situação de cada linha: Agendado · Aguardando deslocamento e A caminho → A caminho · Em serviço |
| Aciona Fácil | Meus Serviços | Novos Serviços → Novos · Saída de Base → A caminho · Em Andamento → Em serviço · Confirmar Dados e Orçamentos → Pendências |

A leitura foi montada a partir de prints das telas vazias. Quando chegar chamado de verdade,
conferir se ele aparece certo no painel e ajustar `leitor.js` se preciso.

## Próximos passos

1. Conferir a leitura com chamados reais de cada portal.
2. Confirmar o 5º portal e onde aparece serviço novo no Notro.

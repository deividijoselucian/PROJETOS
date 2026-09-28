# Central de Acionamentos

Tela única para o prestador de auto socorro acompanhar os acionamentos que chegam pelos
portais das assistências (Porto Seguro, Tokio Marine, Notro, Aciona Fácil e outros), com
alarme quando entra serviço novo.

Estado atual: **protótipo com dados de exemplo**. Nenhum portal está conectado ainda.

## Arquivos

- `prototipo.html`: a tela da central (alarme de serviço novo, colunas por etapa, prazo de
  chegada, frota).
- `instalador/`: gera o instalador de teste para Windows.
  - `central.nsi`: script do instalador (NSIS 3).
  - `gerar_icone.py`: desenha o ícone (giroflex) sem precisar de bibliotecas.
  - `build.sh`: monta tudo e gera `instalador/dist/CentralAcionamentos-Teste-Setup.exe`.

## Instalador de teste

- Instala em `C:\CentralAcionamentos` (ou na pasta do usuário, se não puder), sem pedir
  administrador.
- Cria atalho na Área de Trabalho e no Menu Iniciar. O atalho abre a central numa janela
  própria do Chrome (ou do Edge, se não tiver Chrome).
- Desinstala por Configurações › Aplicativos, como qualquer programa.
- Não é assinado digitalmente, então o Windows avisa ("O Windows protegeu o computador").
  Clique em **Mais informações** › **Executar assim mesmo**.

Para gerar de novo no Linux: `sudo apt install nsis` e depois `./instalador/build.sh`.

## Como cada portal vai entrar na central

| Portal | Tela lida | Vai para a coluna |
|---|---|---|
| Porto Seguro | Portal do Prestador › Receber Serviços (atualiza a cada 90 s) | Pendentes → Novos · GPS não iniciados → Pendências |
| Tokio Marine | Acompanhamento de Serviço | Em acionamento → Novos · A caminho · Em andamento → Em serviço · Agendadas · Saída de base pendente → Pendências |
| Notro Hub | Acompanhamento (atualiza a cada 30 s) | Agendados · Aguardando deslocamento e A caminho → A caminho · Em serviço |
| Aciona Fácil | Meus Serviços | Novos · Saída de Base → A caminho · Em Andamento → Em serviço · Confirmar Dados e Orçamentos → Pendências |

## Próximos passos

1. Confirmar o 5º portal e a tela onde aparece serviço novo no Notro.
2. Extensão do Chrome lendo um portal de verdade.
3. Ligar os outros portais, um de cada vez.

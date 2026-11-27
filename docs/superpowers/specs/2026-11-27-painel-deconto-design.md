# Painel Deconto — desenho

27/11/2026

## Para que serve

Um endereço só, na VM **sistemadeconto** da Locaweb, onde a equipe entra com usuário e senha e
encontra os sistemas da empresa. Hoje são dois, feitos neste projeto:

- **DECONT** (o antigo Sistema Carlise): a frota, com km do dia, abastecimento, manutenção,
  documentos com vencimento (já tem as placas e os 20 CRLVs cadastrados), relatório, Excel e PDF.
- **Controle de Operação** (o antigo Controle Munck): onde cada caminhão munck trabalha, agenda,
  km das obras por dia ou etapa, obras, mapa, manutenção e relatório.

Outros sistemas vão ser criados depois e entram no mesmo painel.

**A primeira tela** (pedido do usuário): depois do login, a tela inicial é o painel, com os
sistemas em cartões; ele escolhe qual usar. Para começar, sobe o DECONT (o "painel de ontem") e,
já pronto, o Controle de Operação.

**Segmentos e CNPJs (depois)**: o grupo tem vários CNPJs, e cada segmento da operação vai ter os
seus sistemas. Isso ainda vai ser definido (quais segmentos, qual CNPJ, o que cada um faz). Quando
estiver, cada segmento entra no painel como mais cartões, com dados separados, e a frota do DECONT
(hoje com veículos de Deconto Soluções Elétricas, Prestadora de Serviços GP e de pessoas físicas)
pode ser dividida. Nada disso entra agora.

## Objetivos

- Um login só para todos os sistemas. Depois de entrar, a pessoa vê a página do painel com os
  cartões dos sistemas que ela pode usar.
- Cada sistema separado: dados próprios, telas próprias. Um não mexe no outro (o usuário pediu
  que o sistema dos munck não usasse o mesmo sistema da frota, por serem outro segmento).
- Para cada pessoa, o administrador marca quais sistemas ela usa e se ela é administradora.
- O que alguém lança aparece na hora para quem está com o mesmo sistema aberto.
- Levar para o servidor o que o DECONT já tem: veículos, placas, CRLVs e os PDFs.
- Trocar o nome "Controle Munck" por "Controle de Operação" em tudo (tela, planilhas, cópias).
- Instalar com um comando só, como a Sinistra: pasta própria, PM2, nginx, HTTPS.

## Fora deste trabalho

- Criar os sistemas novos (cada um vai ser um projeto à parte).
- Juntar dados entre DECONT e Controle de Operação (ex.: o mesmo caminhão nos dois).
- Aplicativo de celular, avisos por WhatsApp ou e-mail.

## O que seria um fracasso mesmo funcionando

- Perder ou embaralhar as placas e os CRLVs que já estão no DECONT.
- Uma pessoa ver um sistema que não foi liberado para ela.
- Os dois sistemas misturarem dados.
- Quebrar o que já funciona hoje: o link do DECONT no claude.ai, o DECONT.exe e o link do
  Controle no claude.ai continuam abrindo como hoje.

## Restrições

- VM Ubuntu na Locaweb Cloud. O firewall da Locaweb fica fora da VM e só deixa passar 22, 80 e
  443 (assim é na Sinistra); as portas são abertas no painel da Locaweb.
- Só Node.js, sem pacotes do npm (como o servidor do Controle Munck já feito e testado).
- Nada de dados ou senhas no repositório PROJETOS (ele é público) nem no pacote de instalação.
- Respostas e telas em português.

## Jeitos considerados

1. **Painel com entrada única** (escolhido): um programa só com o login, a página do painel e
   cada sistema num endereço próprio. Sistema novo = mais um cartão e mais um endereço, sem
   mexer nos outros.
2. Só trocar o nome: cada sistema com login e endereço próprios, como a Sinistra. Mais rápido
   agora, mas a equipe fica com vários endereços e senhas.
3. Tudo numa página com abas: pesado, e mexer num sistema arrisca os outros.

O usuário ficou com o 1.

## Como fica

**Endereços** (decisão minha): `https://painel.<ip>.sslip.io` (ou um domínio da empresa depois).
- `/entrar`: login.
- `/`: página do Painel Deconto com os cartões dos sistemas liberados para a pessoa.
- `/frota/`: DECONT.
- `/operacao/`: Controle de Operação.

**Usuários** (proposta): `admin` criado na instalação, com a senha mostrada no fim. O
administrador cria os acessos, marca os sistemas de cada pessoa e tira acessos. Cada um troca a
própria senha. Tudo isso numa área "Acessos" da página do painel (só administrador vê). Quem
tenta abrir o endereço de um sistema que não é seu volta para o painel.

**Dentro de cada sistema** (decisão minha): no alto, "← Painel Deconto", o nome de quem entrou e
"Sair". O resto da tela continua como está hoje.

**Dados no servidor** (decisão minha): `/opt/painel-deconto/data/`
- `frota.json` e `operacao.json`: os registros de cada sistema, separados.
- `arquivos/frota/`: as fotos e PDFs dos documentos do DECONT (até 15 MB cada, como hoje).
- `copias/`: uma cópia por dia de cada sistema, guardando as últimas 30.
- `usuarios.json` e `sessoes.json`: senhas só como hash.

**Levar os dados**: no DECONT do painel, "Carregar uma cópia" com o arquivo
`frota-carlise-20-veiculos.json` (os 18 veículos, 2 semirreboques e os 20 CRLVs com o PDF). No
Controle de Operação, a cópia salva no link do claude.ai, se houver algo lá. Depois disso, a
equipe usa só o painel; o link do claude.ai e o .exe continuam existindo, mas com dados à parte.

**Nome novo**: "Controle de Operação" no título, no cabeçalho, nas planilhas e no nome dos
arquivos baixados. Cópias antigas do "Controle Munck" continuam carregando.

**Instalação**: pacote `painel-deconto-servidor.tar.gz` publicado pelo GitHub Actions, com um
comando que baixa e instala (pasta `/opt/painel-deconto`, PM2 `painel-deconto`, arquivo próprio no
nginx, certbot). Numa VM nova ele instala o que faltar. Rodar de novo atualiza sem mexer nos
dados nem nas senhas.

## Decisões minhas que saíram da leitura do desenho

- **Cópia de tudo com os arquivos**: no DECONT do painel, "Salvar cópia de tudo (.json)" leva
  também as fotos e PDFs (como no .exe), para dar para mudar de servidor sem perder nada.
- **Acessos só no painel**: o bloco "Acesso ao sistema" que o Controle Munck ganhou hoje sai de
  dentro do sistema e vai para a página do painel (criar acesso, marcar sistemas, tirar acesso,
  trocar a minha senha).
- **O pacote do Controle Munck é substituído** pelo do painel: o workflow novo publica
  `painel-deconto-servidor.tar.gz`; o antigo deixa de ser gerado.

## Fica para quem constrói

- O visual da página do painel (seguindo o das telas de hoje).
- A forma exata das rotas da API e dos testes.
- Cada sistema novo no futuro: uma página e uma linha na lista de sistemas do servidor.

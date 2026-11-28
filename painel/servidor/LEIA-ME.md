# Painel Deconto no servidor

## O que é

Um endereço só, com usuário e senha, onde a equipe entra e escolhe o sistema que vai usar:

- **DECONTO**: a frota (km do dia, abastecimento, manutenção, documentos com vencimento e os
  PDFs, relatório, Excel e PDF).
- **Controle de Operação** (o antigo Controle Munck): onde cada caminhão munck trabalha, agenda,
  km das obras, mapa, manutenção e relatório.

Cada sistema tem os seus dados, separados. O que alguém lança aparece na hora para quem está com
o mesmo sistema aberto. Ele roda numa VM da Locaweb do mesmo jeito que a Sinistra: pasta própria,
processo próprio no PM2 e endereço próprio no nginx. Se a VM já tiver outros sistemas, ele não
mexe neles.

- Pasta: `/opt/painel-deconto`
- Porta interna: 3200 (ou a próxima livre até 3299)
- Processo no PM2: `painel-deconto`
- Endereço: `https://painel.SEU-IP-COM-TRAÇOS.sslip.io` (o instalador mostra no fim)
- Dados: `/opt/painel-deconto/data` (`frota.json`, `operacao.json`, as fotos e PDFs do DECONTO em
  `arquivos/frota`, os PDFs apagados por 30 dias em `lixeira/frota`, e uma cópia por dia de cada
  sistema em `copias`, guardando as últimas 30)
- Nenhum pacote do npm: o programa usa só o Node.js.

## 1. Preparar a VM na Locaweb

- Sistema: **Ubuntu 22.04 ou 24.04**.
- Tamanho: o menor serve (1 GB de memória basta); disco de 20 GB.

A VM nasce só com IP interno (ex.: 10.1.1.51). Para chegar nela de fora:

1. Menu **Rede** › a rede da VM › **IPs públicos**: use o IP público da rede (ou adquira um).
2. Nesse IP público, crie o **redirecionamento de portas** (port forwarding) para a VM:
   22 → 22, 80 → 80 e 443 → 443, protocolo TCP. Ou ligue o **NAT estático** desse IP para a VM.
3. Nas regras de **firewall** desse IP público, libere a entrada das portas 22, 80 e 443 (TCP)
   de qualquer endereço (`0.0.0.0/0`). Sem 80 e 443 abertas, o endereço não abre e o HTTPS não
   sai.
4. No MobaXterm: **Session › SSH**, em "Remote host" o IP público, porta 22, marque "Specify
   username" e escreva o usuário da VM. Entre com a senha (ou a chave).

O instalador descobre o IP público sozinho e monta o endereço `painel.IP-COM-TRAÇOS.sslip.io`.
Se o IP público que recebe as portas for diferente do que a VM usa para sair para a internet,
veja "Usar outro endereço" mais abaixo.

## 2. Levar a carga do DECONTO (antes de instalar)

A carga é o arquivo **`painel-deconto-carga-frota.json`**: a cópia de tudo do DECONTO (veículos,
placas, documentos e os PDFs dos CRLVs). Se você não recebeu esse arquivo pronto, gere no DECONTO:
"Salvar cópia de tudo (.json)" e troque o nome do arquivo baixado para
`painel-deconto-carga-frota.json`.

Faça isto **antes** de rodar o comando de instalação:

1. Conecte na VM pelo MobaXterm.
2. No painel de arquivos da esquerda (aba **Sftp**), fica a pasta do seu usuário
   (`/home/NOME-DO-USUÁRIO`). Arraste para lá o arquivo `painel-deconto-carga-frota.json`.
   Não precisa mudar de pasta.

O instalador procura esse arquivo em `/opt`, em `/root` e na pasta de cada usuário em `/home`.
Ele só usa a carga se o DECONTO do servidor ainda estiver vazio; se já tiver dados, o arquivo é
deixado de lado e nada é apagado. No fim ele mostra quantos registros e arquivos entraram, por
exemplo "Carga de DECONTO: 40 registros e 20 arquivos.". Depois disso pode apagar o arquivo da
sua pasta: o servidor guarda uma cópia dele em `/opt/painel-deconto/data`.

A carga entra inteira ou não entra: se algum registro ou PDF dela estiver com defeito, nada é
gravado, o arquivo fica em `/opt/painel-deconto/carga` e o log diz qual registro deu problema.
Corrija o arquivo (ou gere de novo no DECONTO) e reinicie o painel.

Se esquecer a carga, dá para levar os dados depois pela tela: no DECONTO do painel, use
"Carregar uma cópia" e escolha o arquivo.

## 3. Instalar

No terminal do MobaXterm, cole este comando único e aperte Enter. Ele baixa o pacote do GitHub,
abre em `/opt` e instala:

```bash
sudo bash -c 'cd /opt && curl -fsSL -o painel-deconto-servidor.tar.gz https://github.com/deividijoselucian/PROJETOS/releases/download/painel-deconto/painel-deconto-servidor.tar.gz && tar -xzf painel-deconto-servidor.tar.gz && bash painel-deconto/instalar-no-servidor.sh'
```

Numa VM nova ele instala sozinho o Node.js, o PM2, o nginx e o certbot (HTTPS). Leva uns
minutos. No fim ele mostra:

- o **endereço** do painel;
- o usuário **admin** e a **senha** (só na primeira instalação: guarde a senha);
- a pasta dos dados;
- o comando para ver os logs.

## 4. Entrar e trocar a senha

1. Abra o endereço no navegador e entre com o usuário `admin` e a senha mostrada no fim da
   instalação.
2. Na tela inicial do painel, em **Trocar a minha senha**, escreva a senha atual e a nova (pelo
   menos 6 letras ou números) e aperte **Trocar a senha**. As outras entradas abertas com a
   senha antiga saem.

## Atualizar

Rode o mesmo comando do passo 3:

```bash
sudo bash -c 'cd /opt && curl -fsSL -o painel-deconto-servidor.tar.gz https://github.com/deividijoselucian/PROJETOS/releases/download/painel-deconto/painel-deconto-servidor.tar.gz && tar -xzf painel-deconto-servidor.tar.gz && bash painel-deconto/instalar-no-servidor.sh'
```

Os dados, os PDFs e a senha ficam como estão.

## Logs e reinício

Ver o que o painel está fazendo (Ctrl+C sai):

```bash
sudo pm2 logs painel-deconto
```

Reiniciar o painel:

```bash
sudo pm2 restart painel-deconto
```

Se o endereço não abrir: confira as portas 80 e 443 no painel da Locaweb (redirecionamento e
firewall) e rode o comando de instalação de novo (ele também tenta o HTTPS de novo).

### O painel não sobe: "arquivo com defeito"

Se o log mostrar `O Painel Deconto NÃO subiu: o arquivo ... está com defeito`, um arquivo de dados
ficou cortado ou estragado (por exemplo, numa queda de energia ou com o disco cheio). O painel não
sobe de propósito: se subisse vazio, apagaria os dados na primeira gravação. O arquivo não é
mexido. Para voltar a cópia mais nova do sistema (o exemplo é do DECONTO; troque a data pela da
cópia mais nova que aparecer no `ls`):

```bash
ls /opt/painel-deconto/data/copias
sudo mv /opt/painel-deconto/data/frota.json /opt/painel-deconto/data/frota-com-defeito.json
sudo cp /opt/painel-deconto/data/copias/frota-2026-11-27.json /opt/painel-deconto/data/frota.json
sudo pm2 restart painel-deconto
```

O `usuarios.json` e o `sessoes.json` não têm cópia por dia; o log diz o que fazer com cada um.

### Trazer de volta um PDF apagado

O PDF apagado no DECONTO fica 30 dias em `/opt/painel-deconto/data/lixeira/frota` e só depois sai
de vez. Para trazê-lo de volta, mova os dois arquivos dele (`arq-...` e `arq-....json`) para
`/opt/painel-deconto/data/arquivos/frota`. O documento que aponta para ele (por exemplo, numa cópia
antiga dos dados que você voltou) passa a abrir o PDF de novo.

## Usar outro endereço

Para usar um domínio da empresa (ex.: `painel.suaempresa.com.br`), aponte o domínio para o IP
público da VM (registro A) e rode o instalador com o domínio na frente:

```bash
sudo DOMINIO=painel.suaempresa.com.br bash /opt/painel-deconto/instalar-no-servidor.sh
```

## Desfazer

Antes, guarde uma cópia da pasta `/opt/painel-deconto/data` (ela tem os dados e os PDFs).

Tirar o processo do PM2:

```bash
sudo pm2 delete painel-deconto && sudo pm2 save
```

Tirar o endereço do nginx:

```bash
sudo rm -f /etc/nginx/sites-enabled/painel-deconto /etc/nginx/sites-available/painel-deconto && sudo systemctl reload nginx
```

Apagar a pasta do painel (só depois de guardar a cópia dos dados):

```bash
sudo rm -rf /opt/painel-deconto
```

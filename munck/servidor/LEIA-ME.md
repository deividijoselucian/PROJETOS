# Controle Munck no servidor

O mesmo sistema do link do claude.ai, rodando numa VM sua na nuvem, do mesmo jeito que a
Sinistra: pasta própria, processo próprio no PM2 e endereço próprio no nginx. Se um dia for
para um servidor que já tem outros sistemas, ele não mexe neles.

- Pasta: `/opt/controle-munck`
- Porta interna: 3200 (ou a próxima livre)
- Processo no PM2: `controle-munck`
- Endereço: `https://munck.SEU-IP-COM-TRAÇOS.sslip.io` (o instalador mostra no fim)
- Dados: `/opt/controle-munck/data/munck.json`, com uma cópia por dia em `data/copias`
  (guarda as últimas 30)
- Nenhum pacote do npm: o programa usa só o Node.js.

## 1. Criar a VM

- Sistema: **Ubuntu 22.04 ou 24.04**.
- Tamanho: o menor serve (1 GB de memória basta); disco de 20 GB.
- No painel da nuvem, libere a entrada das portas **22** (SSH), **80** e **443** (TCP), de
  qualquer endereço (0.0.0.0/0). Sem 80 e 443 abertas, o endereço não abre e o HTTPS não sai.
- Guarde o **IP público** e o acesso SSH (usuário e senha, ou a chave).

### Na Locaweb Cloud

A VM nasce só com IP interno (ex.: 10.1.1.51). Para chegar nela de fora:

1. Menu **Rede** › a rede da VM › **IPs públicos**: use o IP público da rede (ou adquira um).
2. Nesse IP público, crie o **redirecionamento de portas** (port forwarding) para a VM:
   22 → 22, 80 → 80 e 443 → 443, protocolo TCP. Ou ligue o **NAT estático** desse IP para a VM.
3. Nas regras de **firewall** desse IP público, libere a entrada das portas 22, 80 e 443 de
   `0.0.0.0/0`.
4. Entre pelo MobaXterm nesse IP público, porta 22.

O instalador descobre o IP público sozinho e monta o endereço `munck.IP-COM-TRAÇOS.sslip.io`.
Se o IP público que recebe as portas for diferente do que a VM usa para sair para a internet,
rode o instalador com `DOMINIO=munck.IP-CERTO-COM-TRAÇOS.sslip.io` na frente.

## 2. Instalar

### Jeito mais fácil (baixando direto na VM)

Conecte na VM pelo MobaXterm (Session › SSH › IP público e usuário) e rode este comando
único. Ele baixa o pacote do GitHub, abre em `/opt` e instala:
```bash
sudo bash -c 'cd /opt && curl -fsSL -o controle-munck-servidor.tar.gz https://github.com/deividijoselucian/PROJETOS/releases/download/controle-munck/controle-munck-servidor.tar.gz && tar -xzf controle-munck-servidor.tar.gz && bash controle-munck/instalar-no-servidor.sh'
```
Para atualizar depois, rode o mesmo comando.

### Mandando o arquivo pelo MobaXterm

1. Conecte na VM pelo MobaXterm (Session › SSH › IP público, usuário e senha ou chave).
2. Vire root: `sudo -i`
3. No painel de arquivos da esquerda, entre em `/opt` e arraste para lá o arquivo
   `controle-munck-servidor.tar.gz`. (Se não deixar gravar em `/opt`, mande para a sua pasta e
   rode `mv ~/controle-munck-servidor.tar.gz /opt/` como root. Com `sudo -i`, a pasta do
   usuário fica em `/home/NOME-DO-USUÁRIO`.)
4. No terminal, rode:
   ```bash
   cd /opt && tar -xzf controle-munck-servidor.tar.gz && bash controle-munck/instalar-no-servidor.sh
   ```
   Numa VM nova ele instala sozinho o Node.js, o PM2, o nginx e o certbot. Leva uns minutos.
5. No fim ele mostra o **endereço**, o usuário **admin** e a **senha**. Guarde a senha.
6. Abra o endereço, entre e troque a senha em "Caminhões e motoristas" › "Acesso ao sistema".
   Ali também se criam os acessos de cada pessoa.

## Levar os dados que já estão no link do claude.ai

1. No link do claude.ai: "Caminhões e motoristas" › **Salvar cópia de tudo (.json)**.
2. No servidor: "Caminhões e motoristas" › **Carregar uma cópia** e escolha o arquivo.

## Atualizar

Mande o `controle-munck-servidor.tar.gz` novo para `/opt` e rode o mesmo comando do passo 4.
Os dados, os usuários e a senha ficam como estão.

## Se algo não abrir

- O endereço não abre: confira as portas 80 e 443 no painel da nuvem e rode o instalador de
  novo (ele também tenta o HTTPS de novo).
- Ver o que o sistema está fazendo:
  ```bash
  pm2 logs controle-munck
  ```
- Reiniciar:
  ```bash
  pm2 restart controle-munck
  ```

Para usar um domínio seu (ex.: `munck.suaempresa.com.br`), aponte o domínio para o IP da VM
(registro A) e rode o instalador assim:
```bash
DOMINIO=munck.suaempresa.com.br bash /opt/controle-munck/instalar-no-servidor.sh
```

## Desfazer

Antes, guarde uma cópia da pasta `/opt/controle-munck/data` (ela tem os dados).
```bash
pm2 delete controle-munck && pm2 save
```
```bash
rm -f /etc/nginx/sites-enabled/controle-munck /etc/nginx/sites-available/controle-munck && systemctl reload nginx
```
Depois apague a pasta `/opt/controle-munck`.

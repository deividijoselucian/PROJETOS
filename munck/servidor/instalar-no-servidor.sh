#!/usr/bin/env bash
# Instala (ou atualiza) o Controle Munck numa VM nova (Ubuntu ou Debian) ou num servidor
# que já tem outros sistemas, sem mexer neles: pasta própria (/opt/controle-munck), porta
# própria (3200, ou a próxima livre), processo próprio no PM2 e um arquivo NOVO no nginx.
# Numa VM nova ele instala o que faltar: Node.js, PM2, nginx e certbot (HTTPS).
#
# Uso (como root):
#   cd /opt && tar -xzf controle-munck-servidor.tar.gz && bash controle-munck/instalar-no-servidor.sh
#
# Pode rodar de novo quantas vezes quiser: ele só atualiza. Os dados (pasta data/)
# e a senha (.env) ficam como estão.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=l
export NEEDRESTART_SUSPEND=1

PASTA="$(cd "$(dirname "$0")" && pwd)"
NOME=controle-munck
SITE_NGINX=/etc/nginx/sites-available/$NOME

passo() { echo; echo "==> $*"; }
erro()  { echo; echo "❌ $*"; exit 1; }
recarregar_nginx() { systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || nginx -s reload; }

[ "$(id -u)" = "0" ] || erro "Rode como root (sudo bash instalar-no-servidor.sh)."
cd "$PASTA"
[ -f servidor.js ] && [ -f publico/munck.html ] || erro "Faltam arquivos do sistema nesta pasta ($PASTA)."

# ---------- 0. O básico numa VM nova ----------
passo "Programas básicos"
FALTA=""
command -v curl >/dev/null || FALTA="$FALTA curl"
command -v ss >/dev/null || FALTA="$FALTA iproute2"
command -v nginx >/dev/null || FALTA="$FALTA nginx"
command -v certbot >/dev/null || FALTA="$FALTA certbot python3-certbot-nginx"
if [ -n "$FALTA" ]; then
  echo "Instalando:$FALTA"
  apt-get update
  apt-get install -y $FALTA
  (systemctl enable --now nginx 2>/dev/null || service nginx start 2>/dev/null || nginx) || true
else
  echo "Já tem curl, nginx e certbot."
fi

IP="$(curl -fsS -4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
DOMINIO="${DOMINIO:-munck.${IP//./-}.sslip.io}"
echo "IP público: $IP"

# ---------- 1. Porta ----------
passo "Porta"
if [ -f .env ] && grep -q '^PORTA=' .env; then
  PORTA="$(grep '^PORTA=' .env | cut -d= -f2)"
  echo "Usando a porta já escolhida antes: $PORTA"
else
  PORTA=""
  for p in $(seq 3200 3299); do
    if ! ss -tlnp | grep -q ":$p "; then PORTA=$p; break; fi
  done
  [ -n "$PORTA" ] || erro "Não achei porta livre entre 3200 e 3299. Nada foi alterado."
  echo "Porta livre: $PORTA"
fi
if ss -tlnp | grep ":$PORTA " | grep -vq node; then
  erro "A porta $PORTA está sendo usada por outro programa. Nada foi alterado."
fi

# ---------- 2. Node.js ----------
# Não atualiza um Node que já existe: a Sinistra e o hotspot podem depender dele.
passo "Node.js"
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' \
  || erro "Este servidor tem Node $(node -v); o Controle Munck precisa do 18 ou mais novo. Não atualizei para não arriscar os outros sistemas."
command -v npm >/dev/null || apt-get install -y npm
node -v

# ---------- 3. Senha e configuração ----------
passo "Configuração"
if [ ! -f .env ]; then
  SENHA_NOVA="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 12)"
  printf 'PORTA=%s\nHOST=127.0.0.1\nPAINEL_SENHA=%s\n' "$PORTA" "$SENHA_NOVA" > .env
  echo "Senha do usuário admin criada em $PASTA/.env"
fi
chmod 600 .env
mkdir -p data
chmod 700 data

# ---------- 4. PM2 ----------
passo "PM2 (processo próprio: $NOME)"
command -v pm2 >/dev/null || npm install -g pm2
if pm2 describe "$NOME" >/dev/null 2>&1; then pm2 restart "$NOME" --update-env
else pm2 start servidor.js --name "$NOME" --max-memory-restart 150M; fi
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

sleep 3
curl -fsS -o /dev/null "http://127.0.0.1:$PORTA/entrar" || erro "O Controle Munck não respondeu na porta $PORTA. Veja: pm2 logs $NOME"

# ---------- 5. nginx (arquivo novo; o da Sinistra e o do hotspot ficam intactos) ----------
passo "nginx: $DOMINIO"
command -v nginx >/dev/null || erro "nginx não encontrado. O sistema está rodando só em 127.0.0.1:$PORTA."
if [ ! -f "$SITE_NGINX" ] || ! grep -q "server_name $DOMINIO;" "$SITE_NGINX"; then
cat > "$SITE_NGINX" <<EOF
server {
    listen 80;
    server_name $DOMINIO;
    client_max_body_size 25m;
    location / {
        proxy_pass http://127.0.0.1:$PORTA;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
EOF
fi
sed -i "s#proxy_pass http://127.0.0.1:[0-9]*;#proxy_pass http://127.0.0.1:$PORTA;#" "$SITE_NGINX"
ln -sf "$SITE_NGINX" /etc/nginx/sites-enabled/$NOME
if ! nginx -t; then
  rm -f /etc/nginx/sites-enabled/$NOME "$SITE_NGINX"
  erro "Teste do nginx falhou. Tirei o arquivo novo; os outros sistemas continuam como estavam."
fi
recarregar_nginx

# ---------- 5b. Portas 80 e 443 dentro da VM ----------
# Algumas nuvens (a Oracle, por exemplo) já vêm com o firewall da própria VM fechando tudo
# menos o SSH. Abre só 80 e 443. As portas também precisam estar liberadas no painel da nuvem.
passo "Portas 80 e 443 na VM"
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && echo "ufw: 80 e 443 liberadas."
elif command -v iptables >/dev/null && iptables -S INPUT 2>/dev/null | grep -qE -- '-j (REJECT|DROP)'; then
  for p in 80 443; do
    iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport $p -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null; then netfilter-persistent save >/dev/null 2>&1 || true
  elif [ -d /etc/iptables ]; then iptables-save > /etc/iptables/rules.v4; fi
  echo "iptables: 80 e 443 liberadas."
else
  echo "Nada a fazer aqui."
fi

# ---------- 6. HTTPS ----------
passo "HTTPS (certbot)"
if command -v certbot >/dev/null && certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos --register-unsafely-without-email --redirect --keep-until-expiring; then
  URL="https://$DOMINIO"
else
  URL="http://$DOMINIO"
  echo "⚠️  HTTPS não foi configurado. Quase sempre é a porta 80 fechada no painel da nuvem."
  echo "    Libere as portas 80 e 443 lá e rode de novo este instalador."
fi

echo
echo "=============================================="
echo " ✅ Controle Munck publicado"
echo "    Endereço: $URL"
if [ -f data/usuarios.json ] && [ "$(stat -c %Y data/usuarios.json)" -lt "$(( $(date +%s) - 60 ))" ]; then
  echo "    Usuários: os mesmos de antes"
else
  echo "    Usuário:  admin"
  echo "    Senha:    $(grep '^PAINEL_SENHA=' .env | cut -d= -f2-)"
fi
echo "    Dados:    $PASTA/data (cópia automática por dia em data/copias)"
echo "    Logs:     pm2 logs $NOME"
echo "=============================================="

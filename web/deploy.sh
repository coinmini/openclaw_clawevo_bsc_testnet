#!/usr/bin/env bash
# Deploy ClawEvo web frontend to 162.247.153.224
# Usage: bash deploy.sh

set -euo pipefail

SERVER="root@162.247.153.224"
REMOTE_DIR="/opt/clawevo-web"
NODE_BIN="/root/.nvm/versions/node/v22.15.0/bin"

echo "=== 1. Building production bundle ==="
cd "$(dirname "$0")"
npx next build

echo ""
echo "=== 2. Syncing files to server ==="
# Create remote dir
ssh "$SERVER" "mkdir -p $REMOTE_DIR"

# Rsync only what's needed (no node_modules, no .next/cache)
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next/cache' \
  ./ "$SERVER:$REMOTE_DIR/"

echo ""
echo "=== 3. Installing dependencies on server ==="
ssh "$SERVER" "export PATH=$NODE_BIN:\$PATH && cd $REMOTE_DIR && npm install --production"

echo ""
echo "=== 4. Setting up PM2 ==="
ssh "$SERVER" "export PATH=$NODE_BIN:\$PATH && npm list -g pm2 2>/dev/null || npm install -g pm2"
ssh "$SERVER" "export PATH=$NODE_BIN:\$PATH && cd $REMOTE_DIR && pm2 delete clawevo-web 2>/dev/null || true && pm2 start $NODE_BIN/node --name clawevo-web -- node_modules/.bin/next start --port 3000"
ssh "$SERVER" "export PATH=$NODE_BIN:\$PATH && pm2 save"

echo ""
echo "=== 5. Configuring Nginx ==="
ssh "$SERVER" "cat > /etc/nginx/sites-available/clawevo.ai << 'NGINX_EOF'
server {
    listen 80;
    server_name clawevo.ai www.clawevo.ai;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name clawevo.ai www.clawevo.ai;

    ssl_certificate     /etc/nginx/ssl/clawevo.ai.pem;
    ssl_certificate_key /etc/nginx/ssl/clawevo.ai.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Cloudflare real IP restoration
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 131.0.72.0/22;
    real_ip_header CF-Connecting-IP;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Next.js static assets
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control \"public, max-age=31536000, immutable\";
    }

    # Public assets
    location /assets {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 30d;
        add_header Cache-Control \"public, max-age=2592000\";
    }
}
NGINX_EOF"

ssh "$SERVER" "ln -sf /etc/nginx/sites-available/clawevo.ai /etc/nginx/sites-enabled/clawevo.ai && nginx -t && systemctl reload nginx"

echo ""
echo "=== Done! ==="
echo "Site: https://clawevo.ai"
echo "API:  https://api.clawevo.ai/graphql"
echo ""
echo "PM2 commands (on server):"
echo "  pm2 logs clawevo-web"
echo "  pm2 restart clawevo-web"
echo "  pm2 status"

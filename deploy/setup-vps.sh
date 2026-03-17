#!/bin/bash
# PeerWeights VPS Initial Setup
# Run on VPS: bash /opt/peerweights/deploy/setup-vps.sh
set -euo pipefail

echo "=== PeerWeights VPS Setup ==="

# 1. Clone repo (skip if already exists)
if [ ! -d /opt/peerweights/.git ]; then
    echo "Cloning repository..."
    git clone https://github.com/EthanGeisler/PeerWeights.git /opt/peerweights
else
    echo "Repo already exists, pulling latest..."
    cd /opt/peerweights && git pull origin main
fi

cd /opt/peerweights

# 2. Install dependencies
echo "Installing dependencies..."
npm install

# 3. Generate Prisma client
echo "Generating Prisma client..."
npm run db:generate

# 4. Build web frontend
echo "Building web frontend..."
npm run build:web

# 5. Create models directory
echo "Creating models directory..."
mkdir -p /opt/peerweights/models

# 6. Copy .env if not present
if [ ! -f /opt/peerweights/server/.env ]; then
    echo "IMPORTANT: Copy server/.env.example to server/.env and configure it!"
    cp /opt/peerweights/server/.env.example /opt/peerweights/server/.env
    echo "  → Edit /opt/peerweights/server/.env with production values"
fi

# 7. Install nginx config
echo "Setting up nginx..."
cp /opt/peerweights/deploy/peerweights.nginx.conf /etc/nginx/sites-available/peerweights.com
ln -sf /etc/nginx/sites-available/peerweights.com /etc/nginx/sites-enabled/peerweights.com

# 8. SSL certificate (must happen before nginx starts with SSL config)
# First, temporarily set up HTTP-only nginx for certbot
echo "Obtaining SSL certificate..."
# Create temp HTTP-only config for certbot
cat > /etc/nginx/sites-available/peerweights-temp <<'TEMPCONF'
server {
    listen 80;
    server_name peerweights.com www.peerweights.com;
    root /var/www/html;
    location /.well-known/acme-challenge/ { allow all; }
}
TEMPCONF
ln -sf /etc/nginx/sites-available/peerweights-temp /etc/nginx/sites-enabled/peerweights.com
nginx -t && systemctl reload nginx

certbot certonly --webroot -w /var/www/html \
    -d peerweights.com -d www.peerweights.com \
    --non-interactive --agree-tos --email admin@peerweights.com

# Now switch to the real config with SSL
cp /opt/peerweights/deploy/peerweights.nginx.conf /etc/nginx/sites-available/peerweights.com
ln -sf /etc/nginx/sites-available/peerweights.com /etc/nginx/sites-enabled/peerweights.com
rm -f /etc/nginx/sites-available/peerweights-temp

# 9. Install systemd service
echo "Setting up systemd service..."
cp /opt/peerweights/deploy/peerweights.service /etc/systemd/system/peerweights.service
systemctl daemon-reload
systemctl enable peerweights

# 10. Test and start
echo "Testing nginx config..."
nginx -t

echo "Starting PeerWeights service..."
systemctl start peerweights

echo "Reloading nginx..."
systemctl reload nginx

echo ""
echo "=== Setup Complete ==="
echo ""
echo "REMAINING MANUAL STEPS:"
echo "  1. Edit /opt/peerweights/server/.env with production values:"
echo "     - DATABASE_URL (local PostgreSQL)"
echo "     - REDIS_URL (local Redis)"
echo "     - JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (generate random strings)"
echo "     - STRIPE_SECRET_KEY (live key)"
echo "     - STRIPE_WEBHOOK_SECRET (from Stripe dashboard)"
echo "     - CORS_ORIGIN=https://peerweights.com"
echo "     - NODE_ENV=production"
echo "  2. Run database migration: cd /opt/peerweights && npm run db:migrate"
echo "  3. Configure Stripe webhook endpoint: https://peerweights.com/api/payments/webhook"
echo "  4. Install & configure Transmission: apt install transmission-daemon"
echo "  5. Restart after .env changes: systemctl restart peerweights"
echo "  6. Smoke test: curl https://peerweights.com/api/health"

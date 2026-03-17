#!/bin/bash
# PeerWeights VPS Re-deploy / Update Script
# Initial deployment completed 2026-03-17 on 204.168.133.38
# SSL is managed by certbot auto-renew — no manual cert steps needed.
#
# Run on VPS: bash /opt/peerweights/deploy/setup-vps.sh
set -euo pipefail

echo "=== PeerWeights VPS Update ==="

# 1. Pull latest code
echo "Pulling latest..."
cd /opt/peerweights && git pull origin main

# 2. Install dependencies
echo "Installing dependencies..."
npm install

# 3. Generate Prisma client
echo "Generating Prisma client..."
npm run db:generate

# 4. Build web frontend
echo "Building web frontend..."
npm run build:web

# 5. Copy service and nginx configs
echo "Updating systemd service..."
cp /opt/peerweights/deploy/peerweights.service /etc/systemd/system/peerweights.service
systemctl daemon-reload

echo "Updating nginx config..."
cp /opt/peerweights/deploy/peerweights.nginx.conf /etc/nginx/sites-available/peerweights.com
ln -sf /etc/nginx/sites-available/peerweights.com /etc/nginx/sites-enabled/peerweights.com

# 6. Test and reload
echo "Testing nginx config..."
nginx -t

echo "Restarting PeerWeights service..."
systemctl restart peerweights

echo "Reloading nginx..."
systemctl reload nginx

echo ""
echo "=== Update Complete ==="

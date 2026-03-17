#!/usr/bin/env bash
# Re-add all published model torrents to Transmission
# Run on VPS: ssh root@204.168.133.38 'bash -s' < scripts/reseed-torrents.sh

set -euo pipefail

DB_NAME="${DB_NAME:-peerweights}"
MODELS_DIR="${MODELS_DIR:-/opt/peerweights/models}"
RPC_URL="${RPC_URL:-http://127.0.0.1:9091/transmission/rpc}"

echo "[reseed] Fetching published model torrents from database..."

# Get session ID from Transmission
SESSION_ID=$(curl -s -o /dev/null -D - "$RPC_URL" | grep -i 'X-Transmission-Session-Id' | tr -d '\r' | awk '{print $2}')
if [ -z "$SESSION_ID" ]; then
  echo "[reseed] ERROR: Could not get Transmission session ID"
  exit 1
fi
echo "[reseed] Got Transmission session ID: $SESSION_ID"

# Query all torrent files from published models with READY versions
QUERY="SELECT encode(t.torrent_file, 'base64') FROM torrents t
  INNER JOIN model_versions mv ON mv.torrent_id = t.id
  INNER JOIN models m ON mv.model_id = m.id
  WHERE m.status = 'PUBLISHED' AND mv.status = 'READY';"

COUNT=0
while IFS= read -r b64_torrent; do
  [ -z "$b64_torrent" ] && continue

  # Write base64 to temp file and decode with python (avoids bash arg limits)
  TMPFILE=$(mktemp /tmp/torrent_XXXXXX.b64)
  echo "$b64_torrent" > "$TMPFILE"
  B64_CLEAN=$(python3 -c "import sys; print(open(sys.argv[1]).read().strip().replace('\n','').replace(' ',''))" "$TMPFILE")
  rm -f "$TMPFILE"

  BODY=$(cat <<EOF
{
  "method": "torrent-add",
  "arguments": {
    "metainfo": "$B64_CLEAN",
    "download-dir": "$MODELS_DIR"
  }
}
EOF
)

  RESULT=$(curl -s -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -H "X-Transmission-Session-Id: $SESSION_ID" \
    -d "$BODY")

  STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('result','unknown'))" 2>/dev/null || echo "parse-error")
  echo "[reseed] Added torrent: $STATUS"
  COUNT=$((COUNT + 1))

done < <(psql -t -A "$DB_NAME" -c "$QUERY")

echo "[reseed] Done. Processed $COUNT torrent(s)."

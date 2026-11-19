#!/usr/bin/env bash
# Starts Postgres + API (Docker) and the Next.js app inside a GitHub Codespace.
set -e
cd "$(dirname "$0")/.."

# Wait for the Docker daemon (docker-in-docker starts asynchronously).
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done

docker compose up -d --build

for i in $(seq 1 90); do curl -sf http://localhost:8000/api/health >/dev/null && break; sleep 2; done

cd web
[ -d node_modules ] || npm ci
nohup sh -c "npm run build && npm run start" > /tmp/web.log 2>&1 &
echo "Web app starting on port 3000 (log: /tmp/web.log). Login: admin@yashpowertech.local / Admin@12345"

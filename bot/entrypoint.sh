#!/usr/bin/env bash
set -u
export HOME=/home/node PATH=/home/node/.local/bin:/home/node/.bun/bin:/home/node/.cargo/bin:$PATH
mkdir -p /home/node/.local/bin && for t in gh shot pr-image say; do ln -sf /opt/bot/$t /home/node/.local/bin/$t; done
mkdir -p /home/node/.tailscale
[ -x /home/node/.local/bin/tailscaled ] && tailscaled --tun=userspace-networking --state=/home/node/.tailscale/state --socket=/home/node/.tailscale/sock --socks5-server=localhost:1055 >/home/node/.tailscale/tailscaled.log 2>&1 &
cd /home/node/workspace
/opt/t3/t3 serve --no-browser --host 0.0.0.0 --port 3773 /home/node/workspace &
for i in $(seq 1 60); do curl -fs http://127.0.0.1:3773 >/dev/null 2>&1 && break; sleep 1; done
[ -n "${DISCORD_TOKEN:-}" ] || { echo "no DISCORD_TOKEN; t3 only"; wait; }
cd /opt/bot && exec bun run index.ts

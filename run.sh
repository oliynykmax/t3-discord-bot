#!/usr/bin/env bash
# (Re)start the bot container. Secrets come from the OS keychain through fnox and are passed by name only.
set -euo pipefail
cd "$(dirname "$0")"
V=$(readlink -f ~/.t3/runtime/versions/* | sort -V | tail -1)
podman rm -f hackbot >/dev/null 2>&1 || true
exec fnox exec -- podman run -d --name hackbot --userns=keep-id:uid=1000,gid=1000 \
  --env-file bot.env \
  -e DISCORD_TOKEN -e GH_APP_PRIVATE_KEY -e COPILOT_GITHUB_TOKEN \
  -v "$PWD/home:/home/node" -v "$V:/opt/t3:ro" -v "$PWD/bot:/opt/bot:ro" \
  --shm-size=512m -p 127.0.0.1:3774:3773 --hostname hackathon-bot --restart=unless-stopped \
  localhost/hackathon-bot-base:latest /opt/bot/entrypoint.sh

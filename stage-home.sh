#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
BOT_GIT_NAME=$(grep -m1 "^BOT_GIT_NAME=" bot.env | cut -d= -f2-)
BOT_GIT_EMAIL=$(grep -m1 "^BOT_GIT_EMAIL=" bot.env | cut -d= -f2-)
: "${BOT_GIT_NAME:?set BOT_GIT_NAME in bot.env}" "${BOT_GIT_EMAIL:?set BOT_GIT_EMAIL in bot.env}"
H=home
umask 077
mkdir -p $H/.claude $H/.codex $H/.local/share/opencode $H/.config/github-copilot $H/.copilot $H/.gemini $H/.qwen $H/workspace
cp -f ~/.claude/.credentials.json $H/.claude/
cp -f ~/.codex/auth.json ~/.codex/config.toml $H/.codex/
cp -f ~/.local/share/opencode/auth.json $H/.local/share/opencode/
cp -f ~/.config/github-copilot/apps.json $H/.config/github-copilot/
cp -f ~/.copilot/config.json $H/.copilot/
cp -f ~/.gemini/oauth_creds.json ~/.gemini/google_accounts.json $H/.gemini/
cp -f ~/.qwen/settings.json ~/.qwen/subscription_credentials.json $H/.qwen/
[ -f ~/.claude.json ] && jq '{hasCompletedOnboarding:true,theme:"dark"}' <<<'{}' > $H/.claude.json
git config -f $H/.gitconfig user.name "$BOT_GIT_NAME"
git config -f $H/.gitconfig user.email "$BOT_GIT_EMAIL"
git config -f $H/.gitconfig credential.helper '!bun /opt/bot/ghapp.ts git-credential'
git config -f $H/.gitconfig safe.directory '*'
mkdir -p $H/.t3/tools $H/.t3/caches $H/.t3/userdata/providers $H/.gemini
for t in qwen-code github-copilot-cli antigravity-acp; do [ -d ~/.t3/tools/$t ] && cp -a ~/.t3/tools/$t $H/.t3/tools/; done
cp -a ~/.t3/caches/acp-registry ~/.t3/caches/acpRegistry_qwen_code.json ~/.t3/caches/acpRegistry_copilot.json ~/.t3/caches/antigravity.json $H/.t3/caches/ 2>/dev/null || true
[ -d ~/.t3/userdata/providers/antigravity ] && cp -a ~/.t3/userdata/providers/antigravity $H/.t3/userdata/providers/
cp -a ~/.gemini/antigravity-cli ~/.gemini/config $H/.gemini/ 2>/dev/null || true
echo "staged. Secrets (DISCORD_TOKEN, GH_APP_PRIVATE_KEY, COPILOT_GITHUB_TOKEN) are not copied: they come from fnox at run time."

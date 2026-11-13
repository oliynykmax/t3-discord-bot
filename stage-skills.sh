#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
H=home
KEEP="${SKILLS:?set SKILLS to a space-separated list of skill directory names to copy}"
for pair in ".claude/skills:.claude/skills" ".agents/skills:.agents/skills" ".codex/skills:.codex/skills" ".config/opencode/skills:.config/opencode/skills"; do
  src=~/${pair%%:*}; dst=$H/${pair##*:}
  [ -d "$src" ] || continue
  mkdir -p "$dst"
  for s in $KEEP; do [ -e "$src/$s" ] && cp -aL "$src/$s" "$dst/"; done
done
[ -f ~/.config/t3-pstack/models.md ] && mkdir -p $H/.config/t3-pstack && cp -f ~/.config/t3-pstack/models.md $H/.config/t3-pstack/ || true
echo "skills staged:"; for d in .claude/skills .agents/skills .codex/skills .config/opencode/skills; do [ -d $H/$d ] && echo "  $d: $(ls $H/$d | wc -l)"; done

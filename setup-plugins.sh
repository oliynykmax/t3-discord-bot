#!/usr/bin/env bash
set -euo pipefail
podman exec hackbot bash -lc 'export HOME=/home/node
claude plugin marketplace add chhoumann/t3-pstack || true
claude plugin install t3-pstack@t3-pstack --scope user
claude plugin marketplace add anthropics/claude-plugins-official || true
claude plugin install frontend-design@claude-plugins-official --scope user
claude plugin install code-simplifier@claude-plugins-official --scope user
claude plugin list'

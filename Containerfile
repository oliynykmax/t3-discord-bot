FROM docker.io/library/node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git openssh-client ripgrep unzip jq procps python3 build-essential \
      ffmpeg imagemagick sqlite3 fd-find fzf bat tree tmux wget postgresql-client cmake zip xz-utils \
    && rm -rf /var/lib/apt/lists/*
RUN npm i -g bun pnpm @anthropic-ai/claude-code @openai/codex opencode-ai && npm cache clean --force
RUN ln -s /usr/bin/fdfind /usr/local/bin/fd && ln -s /usr/bin/batcat /usr/local/bin/bat
USER node
WORKDIR /home/node
USER root
RUN TAG=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | jq -r .tag_name) \
 && curl -fsSL "https://github.com/cli/cli/releases/download/${TAG}/gh_${TAG#v}_linux_amd64.tar.gz" | tar xz -C /tmp \
 && install /tmp/gh_*/bin/gh /usr/local/bin/gh-real && rm -rf /tmp/gh_*
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw NODE_PATH=/usr/local/lib/node_modules
RUN npm i -g playwright && npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/* && npm cache clean --force
USER node

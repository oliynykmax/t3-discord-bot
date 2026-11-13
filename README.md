# t3-discord-bot

A small Discord bot that drives one [T3 Code](https://t3.codes) project for a team.
Everything runs in a single rootless Podman container: its own `t3 serve`, the provider CLIs (Claude, Codex, OpenCode, Copilot, Qwen, Antigravity), Chromium for screenshots, and the bot itself (Bun).

- Each Discord **thread** is one T3 conversation. Tag the bot in a channel to start a new parallel one (`model=<model>` picks the model).
- A plain reply **steers** the running agent. `!queue <text>` queues a message, `!model <model>` switches model, `!models`, `!stop`, `!status`, `!help`.
- Only the important output is posted: the final message of each run, pending questions, failures.
- Attach files or images to a message and the agent can read them. Agents can send files back (`attach: /path` in their final message) and post to channels (`say "text"`).
- Agents commit and open PRs as a **GitHub App** installation, not as a person. PR screenshots: `shot <url> out.png`, then `pr-image out.png`.

## Setup

Requirements: Podman, Bun, [fnox](https://fnox.jdx.dev), a T3 Code install on the host (`~/.t3`), a Discord application with the Message Content intent, and a GitHub App installed on the target repo (read/write on code, issues, pull requests, workflows).

1. Build the image: `podman build -t hackathon-bot-base .`
2. Configure: `cp bot.env.example bot.env` and fill it in (ids, project, bot git identity).
3. Store the secrets in your keychain through fnox. `fnox.toml` lists their names only; values never touch disk or git:
   ```sh
   fnox set DISCORD_TOKEN                                   # prompts, hidden
   fnox set GH_APP_PRIVATE_KEY --from-file path/to/app.pem  # then delete the .pem
   fnox set COPILOT_GITHUB_TOKEN                            # optional
   ```
4. `./stage-home.sh` copies your provider logins into `./home` (the container's `$HOME`, git-ignored) and writes the bot's git identity. `SKILLS="a b c" ./stage-skills.sh` copies the named agent skills, and `./setup-plugins.sh` installs Claude plugins in the running container.
5. `./run.sh` starts the container with the secrets passed by name from fnox. Logs: `podman logs -f hackbot`.

## Security notes

- The agents run with **full access inside the container**. Treat the container as untrusted, give it only credentials you are happy to hand to everyone on the allowlist, and keep the GitHub App limited to the repos it needs.
- The bot refuses everyone unless `ALLOWED_USER_IDS` or `ALLOWED_ROLE_IDS` is set.
- `./home` holds copies of your provider logins. It is git-ignored and must stay local.
- `run.sh` forwards only `DISCORD_TOKEN`, `GH_APP_PRIVATE_KEY` and `COPILOT_GITHUB_TOKEN`. fnox also merges any global fnox secrets into the environment of `fnox exec`, so never switch it to forwarding the whole environment.
- File attachments from agents are limited to images, PDFs, video and text under 9 MB, from worktrees, `/tmp`, `/home/node/shared`, `/home/node/uploads` and `ATTACH_EXTRA_ROOTS`.

## Layout

`bot/` is mounted read-only into the container: `index.ts` (Discord wiring, `say` endpoint), `core.ts` (conversations, watching T3 runs), `t3.ts` and `mcpauth.ts` (T3 MCP client and its OAuth flow), `ghapp.ts` (GitHub App tokens and the git credential helper), plus the `gh`, `say`, `shot` and `pr-image` helpers agents call.

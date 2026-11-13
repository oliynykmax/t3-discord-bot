import { createSign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const APP_ID = process.env.GH_APP_ID!;
const INSTALLATION_ID = process.env.GH_INSTALLATION_ID!;
const KEY_PEM = process.env.GH_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
const KEY_PATH = process.env.GH_APP_KEY_FILE;
const CACHE = "/home/node/.cache/ghapp-token.json";
const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");

function appJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(JSON.stringify({ iat: now - 60, exp: now + 540, iss: APP_ID }))}`;
  const sig = createSign("RSA-SHA256").update(body).sign(KEY_PEM ?? readFileSync(KEY_PATH ?? "/dev/null"));
  return `${body}.${b64(sig)}`;
}

export async function installationToken(): Promise<string> {
  if (existsSync(CACHE)) {
    const c = JSON.parse(readFileSync(CACHE, "utf8"));
    if (Date.parse(c.expires_at) - Date.now() > 10 * 60_000) return c.token;
  }
  const res = await fetch(`https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${appJwt()}`, Accept: "application/vnd.github+json", "User-Agent": "t3-discord-bot" },
  });
  if (!res.ok) throw new Error(`installation token ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { token: string; expires_at: string };
  mkdirSync("/home/node/.cache", { recursive: true });
  writeFileSync(CACHE, JSON.stringify(j), { mode: 0o600 });
  return j.token;
}

if (import.meta.main) {
  const cmd = process.argv[2];
  if (cmd === "token") process.stdout.write(await installationToken());
  if (cmd === "git-credential") {
    const input = await Bun.stdin.text();
    if (cmd === "git-credential" && process.argv[3] === "get" && /host=github\.com/.test(input))
      process.stdout.write(`username=x-access-token\npassword=${await installationToken()}\n`);
  }
}

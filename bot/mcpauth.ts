import { createHash, randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const ORIGIN = process.env.T3_ORIGIN ?? "http://127.0.0.1:3773";
const T3_BIN = process.env.T3_BIN ?? "/opt/t3/t3";
const REDIRECT = "http://127.0.0.1:8976/callback";
const b64u = (b: Buffer) => b.toString("base64url");

async function pairingCode(): Promise<string> {
  const p = Bun.spawn([T3_BIN, "auth", "pairing", "create", "--ttl", "5m", "--label", "discord-bot-mcp", "--json"], { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  if ((await p.exited) !== 0) throw new Error(`pairing create failed: ${await new Response(p.stderr).text()}`);
  return JSON.parse(out).credential;
}

async function post(path: string, body: unknown, form = false): Promise<any> {
  const res = await fetch(ORIGIN + path, {
    method: "POST",
    headers: { "content-type": form ? "application/x-www-form-urlencoded" : "application/json" },
    body: form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text}`);
  return JSON.parse(text);
}

export async function mintMcpToken(access = "full-access"): Promise<string> {
  const { client_id } = await post("/oauth/mcp/register", { client_name: "discord-bot", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" });
  const verifier = b64u(randomBytes(32));
  const authorization = {
    response_type: "code", client_id, redirect_uri: REDIRECT,
    code_challenge: b64u(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256",
    state: b64u(randomBytes(8)), resource: `${ORIGIN}/mcp`,
  };
  const { redirectTo } = await post("/oauth/mcp/decision", { authorization, decision: { _tag: "pairing-code", access, code: await pairingCode() } });
  const code = new URL(redirectTo).searchParams.get("code");
  if (!code) throw new Error(`no code in redirect: ${redirectTo}`);
  const tok = await post("/oauth/mcp/token", { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id, code_verifier: verifier, resource: `${ORIGIN}/mcp` }, true);
  return tok.access_token;
}

if (import.meta.main) {
  const path = process.argv[2] ?? "/home/node/.secrets/t3-token";
  mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(path, await mintMcpToken(), { mode: 0o600 });
  console.log("token written");
}

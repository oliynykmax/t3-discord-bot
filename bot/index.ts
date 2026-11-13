import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ChannelType, Client, Events, GatewayIntentBits, type Message, type ThreadChannel } from "discord.js";
import { Conversations, HELP, MAX_ATTACH_BYTES, checkFile, chunk, type Poster } from "./core.ts";
import { mintMcpToken } from "./mcpauth.ts";
import { T3 } from "./t3.ts";

const env = (k: string, d?: string) => process.env[k] ?? d;
const list = (k: string) => (env(k, "") as string).split(",").map((s) => s.trim()).filter(Boolean);
const TOKEN_FILE = env("T3_TOKEN_FILE", "/home/node/.secrets/t3-token")!;
const allowedUsers = new Set(list("ALLOWED_USER_IDS"));
const allowedRoles = new Set(list("ALLOWED_ROLE_IDS"));
const channelIds = new Set(list("CHANNEL_IDS"));

if (allowedUsers.size === 0 && allowedRoles.size === 0) throw new Error("Set ALLOWED_USER_IDS or ALLOWED_ROLE_IDS. The bot commits under the app identity, so it refuses everyone by default.");

const refreshToken = async () => writeFileSync(TOKEN_FILE, await mintMcpToken(), { mode: 0o600 });
for (let i = 0; ; i++) {
  try {
    await refreshToken();
    break;
  } catch (e) {
    if (i > 30) throw e;
    await Bun.sleep(2000);
  }
}
const t3 = new T3(`${env("T3_ORIGIN", "http://127.0.0.1:3773")}/mcp`, () => readFileSync(TOKEN_FILE, "utf8").trim(), refreshToken);

const projects = await t3.call<{ projects: { id: string; title: string; workspaceRoot: string }[] }>("t3_project_list", { limit: 100 });
const want = env("PROJECT", "sandbox")!;
const project = projects.projects.find((p) => p.id === want || p.title === want || p.workspaceRoot === want);
if (!project) throw new Error(`T3 project "${want}" not found. Have: ${projects.projects.map((p) => p.title).join(", ")}`);

const convs = new Conversations(t3, {
  projectId: project.id,
  defaultModel: env("DEFAULT_MODEL", "claudeAgent/claude-opus-5-5"),
  baseRef: env("BASE_REF", "main")!,
  startFromOrigin: env("START_FROM_ORIGIN", "false") === "true",
  stateFile: env("STATE_FILE", "/home/node/bot-state.json")!,
  preamble: env(
    "PREAMBLE",
    "You work in this repository on behalf of a hackathon team via a Discord bot. Make small commits on your branch and push it to origin. Open a pull request with `gh pr create` when the work is ready to review. Your final message is posted to Discord, so keep it short: what changed, the PR link, and anything the team must decide.",
  )!,
});

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const posterFor = (thread: ThreadChannel): Poster => ({
  post: async (text, files = []) => {
    const parts = chunk(text);
    for (const [i, part] of parts.entries()) {
      const last = i === parts.length - 1;
      try {
        await thread.send({ content: part, allowedMentions: { parse: [] }, ...(last && files.length ? { files } : {}) });
      } catch (e: any) {
        if (!last || !files.length) throw e;
        console.error("attachment upload failed", e?.message);
        await thread.send({ content: `${part}\n(could not upload ${files.length} file(s): ${String(e?.message).slice(0, 120)})`, allowedMentions: { parse: [] } });
      }
    }
  },
});

const UPLOAD_DIR = env("UPLOAD_DIR", "/home/node/uploads")!;
const saveAttachments = async (msg: Message): Promise<string[]> => {
  const out: string[] = [];
  for (const a of msg.attachments.values()) {
    if (a.size > MAX_ATTACH_BYTES * 2) {
      out.push(`(skipped ${a.name}: ${(a.size / 1048576).toFixed(0)} MB is over the limit)`);
      continue;
    }
    const dir = join(UPLOAD_DIR, msg.id);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, (a.name ?? "file").replace(/[^\w.\-]+/g, "_"));
    const res = await fetch(a.url);
    if (!res.ok) throw new Error(`Could not download ${a.name}: HTTP ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    out.push(path);
  }
  return out;
};
const withFiles = (text: string, files: string[]) => (files.length ? `${text}\n\nFiles attached to this message by the user (read them from these paths):\n${files.map((f) => `- ${f}`).join("\n")}`.trim() : text);

const allowed = (msg: Message) => allowedUsers.has(msg.author.id) || (msg.member?.roles.cache.some((r) => allowedRoles.has(r.id)) ?? false);
const botRoleIds = (msg: Message) => msg.mentions.roles.filter((r) => r.tags?.botId === client.user!.id).map((r) => r.id);
const isMentioned = (msg: Message) => msg.mentions.users.has(client.user!.id) || botRoleIds(msg).length > 0;
const strip = (msg: Message) => {
  let t = msg.content.replace(new RegExp(`<@!?${client.user!.id}>`, "g"), "");
  for (const id of botRoleIds(msg)) t = t.replaceAll(`<@&${id}>`, "");
  return t.trim();
};
const log = (msg: Message, what: string) =>
  console.log(`[${new Date().toISOString()}] ${msg.author.username} in ${msg.channel.isThread() ? "thread" : "#" + (msg.channel as any).name} ${msg.id}: ${what} | ${msg.content.slice(0, 80).replace(/\n/g, " ")}`);

const POST_CHANNEL = env("POST_CHANNEL_ID");
const textChannels = () => client.channels.cache.filter((c) => c.isTextBased() && !c.isDMBased() && "guildId" in c && !c.isVoiceBased());
const resolveChannel = (spec?: string) => {
  const want = (spec || POST_CHANNEL || "").replace(/^#/, "").toLowerCase();
  if (!want) return null;
  return textChannels().find((c: any) => c.id === want || c.name?.toLowerCase() === want) ?? null;
};
let postsThisMinute = 0;
setInterval(() => (postsThisMinute = 0), 60_000);

function startSayServer() {
  Bun.serve({
    hostname: "127.0.0.1",
    port: Number(env("SAY_PORT", "3790")),
    async fetch(req) {
      const url = new URL(req.url);
      const json = (o: unknown, status = 200) => Response.json(o, { status });
      if (url.pathname === "/channels") {
        return json({ default: POST_CHANNEL ?? null, channels: textChannels().filter((c: any) => !c.isThread()).map((c: any) => ({ id: c.id, name: c.name })) });
      }
      if (url.pathname !== "/post" || req.method !== "POST") return json({ error: "POST /post or GET /channels" }, 404);
      const body = (await req.json().catch(() => null)) as { channel?: string; text?: string; files?: string[] } | null;
      if (!body || (!body.text?.trim() && !body.files?.length)) return json({ error: "need text or files" }, 400);
      if (++postsThisMinute > 20) return json({ error: "rate limit: 20 posts per minute" }, 429);
      const ch: any = resolveChannel(body.channel);
      if (!ch) return json({ error: `unknown channel ${body.channel ?? "(default)"}; GET /channels lists them` }, 404);
      const files: string[] = [];
      const skipped: string[] = [];
      for (const f of (body.files ?? []).slice(0, 5)) {
        const real = checkFile(f);
        if (real) files.push(real);
        else skipped.push(f);
      }
      try {
        const parts = chunk(body.text ?? "");
        const ids: string[] = [];
        for (const [i, part] of parts.entries()) {
          const m = await ch.send({ content: part || undefined, allowedMentions: { parse: ["users", "roles", "everyone"] }, ...(i === parts.length - 1 && files.length ? { files } : {}) });
          ids.push(m.id);
        }
        return json({ ok: true, channel: ch.name ?? ch.id, messages: ids, skippedFiles: skipped });
      } catch (e: any) {
        return json({ error: String(e?.message ?? e).slice(0, 300) }, 502);
      }
    },
  });
  console.log(`say endpoint on 127.0.0.1:${env("SAY_PORT", "3790")}; default channel ${resolveChannel()?.name ?? "(none)"}`);
}

client.once(Events.ClientReady, async (c) => {
  startSayServer();
  console.log(`logged in as ${c.user.tag}; project ${project.title}; ${convs.keys().length} conversations restored`);
  for (const key of convs.keys()) {
    const ch = await c.channels.fetch(key).catch(() => null);
    if (ch?.isThread()) convs.attach(key, posterFor(ch));
  }
});

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild || !client.user) return;
  const mentioned = isMentioned(msg);
  const thread = msg.channel.isThread() ? msg.channel : null;
  const bound = thread !== null && convs.has(thread.id);
  if (!bound && !mentioned) return log(msg, "ignored (not mentioned, not a bot thread)");
  if (!allowed(msg)) {
    log(msg, "denied (not on allowlist)");
    if (mentioned) await msg.reply({ content: "You are not on this bot's allowlist.", allowedMentions: { repliedUser: false } });
    return;
  }
  const parent = thread ? thread.parentId : msg.channelId;
  if (!bound && channelIds.size > 0 && !(parent && channelIds.has(parent))) return log(msg, "ignored (channel not enabled)");
  const plain = strip(msg);
  const nfiles = msg.attachments.size;
  log(msg, bound ? "reply in bot thread" : plain || nfiles ? "new conversation" : "empty mention");
  try {
    const files = nfiles ? await saveAttachments(msg) : [];
    const text = withFiles(plain, files);
    if (bound) {
      const res = await convs.handle(thread!.id, text);
      if (typeof res === "string") await posterFor(thread!).post(res);
      else await msg.react(res.react);
      return;
    }
    if (!text || /^!(help|models)\b/.test(text)) return void (await msg.reply(text.startsWith("!models") ? await convs.listModels() : HELP));
    if (msg.channel.type !== ChannelType.GuildText && !thread) return void (await msg.reply("Tag me in a text channel or in a thread."));
    const title = (plain || "files").replace(/model=\S+/, "").replace(/\s+/g, " ").trim();
    const target = thread ?? (await msg.startThread({ name: title.slice(0, 90) || "conversation", autoArchiveDuration: 1440 }));
    await msg.react("👀");
    await convs.start(target.id, posterFor(target), text, title);
  } catch (e: any) {
    console.error(e);
    await msg.reply({ content: `⚠ ${String(e?.message ?? e).slice(0, 400)}`, allowedMentions: { repliedUser: false } }).catch(() => {});
  }
});

await client.login(env("DISCORD_TOKEN"));
